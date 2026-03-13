"""
NexusLearn Voice Teacher Agent
================================
Full-duplex voice session: student talks → teacher listens → responds → speaks.

Architecture:
    LiveKit WebRTC session (manages audio transport)
        ↓ student audio
    Whisper STT (local, via faster-whisper if available, else vosk)
        ↓ text
    Superintendent Agent (routing + mastery gates)
        ↓ AgentResponse
    VibeVoice TTS (ws://localhost:8195/tts/stream)
        ↓ 24kHz audio chunks
    LiveKit audio track (back to student)

Voice persona changes automatically as Superintendent routes between agents.
Emma teaches → Grace quizzes → Carter codes → Frank researches.

Start this from start_all.sh when LiveKit server is available.
LiveKit dev server: docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev
"""

import asyncio
import logging
import os
import sys
import json
import wave
import io
from pathlib import Path
from typing import Optional, AsyncGenerator

logger = logging.getLogger("VoiceTeacher")

# ── Config ────────────────────────────────────────────────────────────────────
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "secret")
VIBEVOICE_WS = os.environ.get("VIBEVOICE_WS", "ws://localhost:8195/tts/stream")
SAMPLE_RATE = 24000

# Add project root so backend is importable
_root = str(Path(__file__).parent.parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)


# ── STT: Whisper-based speech-to-text ────────────────────────────────────────
class WhisperSTT:
    """
    Local STT using faster-whisper (GPU-accelerated on RTX 3060).
    Falls back to a simple VAD-triggered silence detector if not installed.
    """
    def __init__(self):
        self._model = None
        self._available = False
        try:
            from faster_whisper import WhisperModel
            self._model = WhisperModel("small", device="cuda", compute_type="float16")
            self._available = True
            logger.info("✅ faster-whisper loaded (GPU)")
        except ImportError:
            logger.warning("faster-whisper not installed. Run: pip install faster-whisper")
        except Exception as e:
            logger.warning(f"Whisper init failed: {e}")

    def transcribe(self, audio_bytes: bytes, sample_rate: int = 16000) -> str:
        """Transcribe raw PCM bytes to text."""
        if not self._available or not self._model:
            return ""
        try:
            # Write to WAV buffer
            buf = io.BytesIO()
            with wave.open(buf, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # int16
                wf.setframerate(sample_rate)
                wf.writeframes(audio_bytes)
            buf.seek(0)

            segments, _ = self._model.transcribe(buf, language="en", vad_filter=True)
            text = " ".join(seg.text for seg in segments).strip()
            return text
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return ""

    @property
    def available(self) -> bool:
        return self._available


# ── VibeVoice TTS client (for the agent, not frontend) ────────────────────────
async def vibevoice_stream(text: str, voice: str) -> AsyncGenerator[bytes, None]:
    """
    Connect to VibeVoice TTS service and yield audio chunks.
    Used by the teacher agent to produce speech.
    """
    import websockets
    try:
        async with websockets.connect(VIBEVOICE_WS, ping_interval=None) as ws:
            await ws.send(json.dumps({"text": text, "voice": voice}))
            while True:
                chunk = await ws.recv()
                if isinstance(chunk, bytes):
                    # Check for END signal
                    if len(chunk) == 3 and chunk == b'END':
                        break
                    yield chunk
                elif isinstance(chunk, str):
                    msg = json.loads(chunk)
                    if msg.get("error"):
                        logger.error(f"VibeVoice error: {msg['error']}")
                        break
    except Exception as e:
        logger.error(f"VibeVoice stream error: {e}")


# ── Voice Teacher Session ─────────────────────────────────────────────────────
class VoiceTeacherSession:
    """
    Manages one student's voice session.
    Handles the full loop: listen → STT → Superintendent → TTS → speak.
    """

    def __init__(self, student_id: str, session_id: str):
        self.student_id = student_id
        self.session_id = session_id
        self.stt = WhisperSTT()
        self.current_voice = "emma"
        self.is_speaking = False
        self._audio_buffer = bytearray()
        self._silence_frames = 0
        self._SILENCE_THRESHOLD = 30  # frames of silence before processing

    async def on_audio_frame(self, audio_data: bytes) -> Optional[str]:
        """
        Called for each incoming audio frame from the student.
        Returns transcribed text when a complete utterance is detected.
        """
        # Simple VAD: detect silence by energy level
        import struct
        try:
            samples = struct.unpack(f'{len(audio_data)//2}h', audio_data)
            energy = sum(abs(s) for s in samples) / len(samples) if samples else 0
        except Exception:
            energy = 0

        if energy > 500:  # student speaking
            self._audio_buffer.extend(audio_data)
            self._silence_frames = 0
        elif self._audio_buffer:
            self._silence_frames += 1
            if self._silence_frames >= self._SILENCE_THRESHOLD:
                # Utterance complete — transcribe
                raw = bytes(self._audio_buffer)
                self._audio_buffer.clear()
                self._silence_frames = 0

                if self.stt.available:
                    text = self.stt.transcribe(raw)
                    if text.strip():
                        logger.info(f"STT: '{text}'")
                        return text
        return None

    async def respond(self, student_message: str) -> AsyncGenerator[bytes, None]:
        """
        Route student message through Superintendent and yield TTS audio chunks.
        """
        try:
            from backend.agents.superintendent import superintendent_agent

            response = await superintendent_agent.route(
                student_id=self.student_id,
                session_id=self.session_id,
                message=student_message,
            )

            # Update voice for this agent
            self.current_voice = response.voice_persona
            speak_text = response.speak_text or response.content

            logger.info(f"Agent: {response.agent_name}, Voice: {self.current_voice}, Text: {speak_text[:60]}...")

            # Stream VibeVoice audio
            async for chunk in vibevoice_stream(speak_text, self.current_voice):
                yield chunk

        except Exception as e:
            logger.error(f"VoiceTeacher respond error: {e}")
            # Fallback spoken message
            fallback = "I'm sorry, I had trouble processing that. Could you try again?"
            async for chunk in vibevoice_stream(fallback, self.current_voice):
                yield chunk


# ── LiveKit Agent Entry Point ─────────────────────────────────────────────────
async def run_voice_agent(room_name: str, student_id: str):
    """
    Connect to a LiveKit room as the teacher agent.
    Runs the full voice loop until the room closes.
    
    Requires: livekit-agents >= 1.0
    """
    try:
        from livekit import api, rtc
    except ImportError:
        logger.error("LiveKit not installed. Run: pip install livekit-agents")
        return

    session = VoiceTeacherSession(student_id, f"voice_{room_name}")

    logger.info(f"Connecting to LiveKit room: {room_name}")

    # Create a LiveKit room connection
    room = rtc.Room()
    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity("teacher-agent")
        .with_name("NexusLearn Teacher")
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .to_jwt()
    )

    await room.connect(LIVEKIT_URL, token)
    logger.info(f"✅ Teacher agent connected to room: {room_name}")

    # Publish audio source (what teacher says)
    audio_source = rtc.AudioSource(sample_rate=SAMPLE_RATE, num_channels=1)
    track = rtc.LocalAudioTrack.create_audio_track("teacher-voice", audio_source)
    opts = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    await room.local_participant.publish_track(track, opts)

    # Greeting
    logger.info("Sending greeting...")
    greeting = "Hello! I'm your NexusLearn teacher. What would you like to learn today?"
    async for chunk in vibevoice_stream(greeting, "emma"):
        frame = rtc.AudioFrame(
            data=chunk,
            sample_rate=SAMPLE_RATE,
            num_channels=1,
            samples_per_channel=len(chunk) // 4,  # float32
        )
        await audio_source.capture_frame(frame)

    # Listen for student audio
    @room.on("track_subscribed")
    def on_track(track, publication, participant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            asyncio.ensure_future(_handle_student_audio(track, session, audio_source))

    # Keep running until room closes
    @room.on("disconnected")
    def on_disconnect(reason):
        logger.info(f"Room disconnected: {reason}")

    # Wait indefinitely
    await asyncio.get_event_loop().create_future()


async def _handle_student_audio(
    track: "rtc.RemoteAudioTrack",
    session: VoiceTeacherSession,
    audio_source: "rtc.AudioSource",
):
    """Consume student audio frames, detect speech, route through teacher."""
    from livekit import rtc
    stream = rtc.AudioStream(track)
    async for event in stream:
        frame: rtc.AudioFrame = event.frame
        text = await session.on_audio_frame(bytes(frame.data))
        if text:
            logger.info(f"Student said: {text}")
            # Stream teacher response back to room
            async for chunk in session.respond(text):
                out_frame = rtc.AudioFrame(
                    data=chunk,
                    sample_rate=SAMPLE_RATE,
                    num_channels=1,
                    samples_per_channel=len(chunk) // 4,
                )
                await audio_source.capture_frame(out_frame)


# ── REST endpoint for room token generation ───────────────────────────────────
def create_room_token(room_name: str, identity: str, is_agent: bool = False) -> str:
    """Generate a LiveKit access token for frontend connection."""
    try:
        from livekit import api
        grants = api.VideoGrants(room_join=True, room=room_name)
        token = (
            api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_name(identity)
            .with_grants(grants)
            .to_jwt()
        )
        return token
    except Exception as e:
        logger.error(f"Token creation error: {e}")
        return ""


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--room", default="nexuslearn-room-001")
    parser.add_argument("--student", default="student_001")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_voice_agent(args.room, args.student))
