"""
NexusLearn VibeVoice TTS Service
=================================
FastAPI WebSocket server that wraps VibeVoice-Realtime-0.5B.
Streams 24kHz audio chunks to clients as they are generated.

Hardware target: RTX 3060 12GB VRAM (~1.5GB used by this service)
Model: microsoft/VibeVoice-Realtime-0.5B (HuggingFace)

Start via start_all.sh or:
    python3 -m uvicorn backend.services.vibevoice_service:app --port 8195

WebSocket API:
    ws://localhost:8195/tts/stream
    → send: {"text": "...", "voice": "emma"}
    → recv: binary audio chunks (float32, 24kHz)

Available voices: emma, grace, carter, frank, davis, mike, samuel

REST API:
    POST /tts/generate  {"text": "...", "voice": "emma"}
    → returns: audio/wav file

    GET  /voices        → list of available voice names
    GET  /health        → service status + VRAM usage
"""

import asyncio
import copy
import logging
import os
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

logger = logging.getLogger("VibeVoiceTTS")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="NexusLearn VibeVoice TTS", version="1.0.0")

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = os.environ.get("VIBEVOICE_MODEL", "microsoft/VibeVoice-Realtime-0.5B")
VOICES_DIR = Path(__file__).parent.parent.parent / "vibevoice" / "voices" / "streaming_model"
SAMPLE_RATE = 24000
CFG_SCALE = float(os.environ.get("VIBEVOICE_CFG_SCALE", "1.5"))
DDPM_STEPS = int(os.environ.get("VIBEVOICE_DDPM_STEPS", "5"))  # Lower = faster

# Voice → agent mapping (Superintendent injects this)
AGENT_VOICE_MAP = {
    "guide":    "emma",
    "question": "grace",
    "solve":    "carter",
    "research": "frank",
    "chat":     "davis",
    "ideagen":  "grace",
    "co_writer":"mike",
    "default":  "emma",
}

# ── State (loaded once at startup) ────────────────────────────────────────────
_model = None
_processor = None
_voice_embeddings: dict = {}  # voice_name → cached .pt tensors
_model_loaded = False
_device = "cuda" if torch.cuda.is_available() else "cpu"


def _load_model():
    """Load the streaming 0.5B model once into VRAM. Called at startup."""
    global _model, _processor, _model_loaded

    if _model_loaded:
        return

    logger.info(f"Loading VibeVoice-Realtime-0.5B on {_device}...")

    try:
        import sys
        # Add project root to path so vibevoice package is importable
        project_root = str(Path(__file__).parent.parent.parent)
        if project_root not in sys.path:
            sys.path.insert(0, project_root)

        from vibevoice.modular.modeling_vibevoice_streaming_inference import (
            VibeVoiceStreamingForConditionalGenerationInference,
        )
        from vibevoice.processor.vibevoice_streaming_processor import VibeVoiceStreamingProcessor

        _processor = VibeVoiceStreamingProcessor.from_pretrained(MODEL_PATH)

        load_kwargs = {
            "torch_dtype": torch.bfloat16 if _device == "cuda" else torch.float32,
            "device_map": _device,
        }
        if _device == "cuda":
            load_kwargs["attn_implementation"] = "flash_attention_2"

        _model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
            MODEL_PATH, **load_kwargs
        )
        _model.eval()
        _model.set_ddpm_inference_steps(num_steps=DDPM_STEPS)

        _load_voice_embeddings()
        _model_loaded = True

        vram_used = torch.cuda.memory_allocated() / 1e9 if _device == "cuda" else 0
        logger.info(f"✅ VibeVoice loaded. VRAM used: {vram_used:.1f}GB")

    except Exception as e:
        logger.error(f"❌ Failed to load VibeVoice: {e}")
        logger.warning("TTS service will return silence. Install deps: pip install transformers accelerate diffusers numba librosa")


def _load_voice_embeddings():
    """Pre-load all .pt voice embedding files. Loading is instant at call time."""
    global _voice_embeddings

    if not VOICES_DIR.exists():
        logger.warning(f"Voice embeddings directory not found: {VOICES_DIR}")
        return

    for pt_file in VOICES_DIR.glob("*.pt"):
        # "en-Emma_woman.pt" → "emma"
        raw = pt_file.stem  # "en-Emma_woman"
        name = raw.split("-")[-1].split("_")[0].lower()  # "emma"
        try:
            _voice_embeddings[name] = torch.load(
                str(pt_file), map_location=_device, weights_only=False
            )
            logger.info(f"  Voice loaded: {name} ({pt_file.name})")
        except Exception as e:
            logger.warning(f"  Failed to load voice {pt_file.name}: {e}")

    logger.info(f"✅ {len(_voice_embeddings)} voices ready: {list(_voice_embeddings.keys())}")


def _get_voice_cache(voice_name: str) -> dict:
    """Get a deep copy of voice embeddings (model mutates them during generation)."""
    name = voice_name.lower()
    if name not in _voice_embeddings:
        logger.warning(f"Voice '{name}' not found, using 'emma'")
        name = "emma"
    if name not in _voice_embeddings:
        # Absolute fallback: first available
        name = next(iter(_voice_embeddings))
    return copy.deepcopy(_voice_embeddings[name])


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    """Load model in background so the service starts fast."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_model)


# ── WebSocket Streaming TTS ───────────────────────────────────────────────────
@app.websocket("/tts/stream")
async def stream_tts(ws: WebSocket):
    """
    Stream teacher speech to the frontend.

    Protocol:
        Client sends: {"text": "Recursion is when...", "voice": "emma"}
        Server sends: binary float32 audio chunks at 24kHz
        Server sends: b"END" when done

    Voice can be: emma, grace, carter, frank, davis, mike, samuel
    Or an agent name: guide, solve, question, research, chat, ideagen
    """
    await ws.accept()

    try:
        data = await ws.receive_json()
        text = data.get("text", "").strip()
        voice_input = data.get("voice", "emma").lower()

        # Accept agent names as aliases
        voice = AGENT_VOICE_MAP.get(voice_input, voice_input)

        if not text:
            await ws.send_bytes(b"END")
            return

        if not _model_loaded:
            # Service not ready — send silence signal
            await ws.send_json({"error": "TTS model not loaded", "fallback": "browser"})
            await ws.close()
            return

        logger.info(f"TTS: voice={voice}, text_len={len(text)}")

        voice_cache = _get_voice_cache(voice)

        # Prepare inputs
        inputs = _processor.process_input_with_cached_prompt(
            text=text,
            cached_prompt=voice_cache,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )
        inputs = {k: v.to(_device) for k, v in inputs.items() if torch.is_tensor(v)}

        from vibevoice.modular.streamer import AsyncAudioStreamer

        audio_streamer = AsyncAudioStreamer(batch_size=1)

        # Run generation in a background thread (torch is not async-native)
        async def run_gen():
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: _model.generate(
                    **inputs,
                    cfg_scale=CFG_SCALE,
                    tokenizer=_processor.tokenizer,
                    audio_streamer=audio_streamer,
                    all_prefilled_outputs=copy.deepcopy(voice_cache),
                    generation_config={"do_sample": False},
                    show_progress_bar=False,
                ),
            )

        gen_task = asyncio.create_task(run_gen())

        # Stream audio chunks as they arrive
        chunks_sent = 0
        async for chunk in audio_streamer.get_stream(0):
            # chunk: float32 tensor at 24kHz
            audio_bytes = chunk.float().numpy().tobytes()
            await ws.send_bytes(audio_bytes)
            chunks_sent += 1

        await gen_task
        await ws.send_bytes(b"END")
        logger.info(f"TTS complete: {chunks_sent} chunks sent")

    except WebSocketDisconnect:
        logger.info("Client disconnected during TTS")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        try:
            await ws.send_json({"error": str(e)})
        except Exception:
            pass


# ── REST: Generate full WAV ───────────────────────────────────────────────────
@app.post("/tts/generate")
async def generate_tts(body: dict):
    """
    Generate complete audio as WAV. For lesson recordings, not real-time.
    Returns audio/wav bytes.
    """
    text = body.get("text", "").strip()
    voice = AGENT_VOICE_MAP.get(body.get("voice", "emma").lower(), body.get("voice", "emma").lower())

    if not text or not _model_loaded:
        return Response(content=b"", media_type="audio/wav", status_code=503)

    voice_cache = _get_voice_cache(voice)
    inputs = _processor.process_input_with_cached_prompt(
        text=text, cached_prompt=voice_cache, return_tensors="pt"
    )
    inputs = {k: v.to(_device) for k, v in inputs.items() if torch.is_tensor(v)}

    with torch.no_grad():
        outputs = _model.generate(
            **inputs,
            cfg_scale=CFG_SCALE,
            tokenizer=_processor.tokenizer,
            all_prefilled_outputs=copy.deepcopy(voice_cache),
            generation_config={"do_sample": False},
            show_progress_bar=False,
        )

    audio_tensor = outputs.speech_outputs[0]

    # Convert to WAV bytes
    import io
    import scipy.io.wavfile as wavfile
    import numpy as np

    buf = io.BytesIO()
    audio_np = audio_tensor.float().cpu().numpy()
    if audio_np.ndim > 1:
        audio_np = audio_np.squeeze()
    audio_int16 = (audio_np * 32767).astype(np.int16)
    wavfile.write(buf, SAMPLE_RATE, audio_int16)
    wav_bytes = buf.getvalue()

    return Response(content=wav_bytes, media_type="audio/wav")


# ── Utility endpoints ─────────────────────────────────────────────────────────
@app.get("/voices")
async def list_voices():
    """Return available voice names."""
    return {
        "voices": list(_voice_embeddings.keys()),
        "agent_map": AGENT_VOICE_MAP,
    }


@app.get("/health")
async def health():
    """Service health + VRAM status."""
    vram_used = torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0
    return {
        "status": "ready" if _model_loaded else "loading",
        "model": MODEL_PATH,
        "device": _device,
        "voices_loaded": len(_voice_embeddings),
        "vram_used_gb": round(vram_used, 2),
        "vram_total_gb": round(vram_total, 2),
        "cfg_scale": CFG_SCALE,
        "ddpm_steps": DDPM_STEPS,
    }
