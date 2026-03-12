"use client";

/**
 * VoiceControl — NexusLearn Teacher Voice
 * 
 * Output: VibeVoice TTS (ws://localhost:8195) → expressive, human-sounding
 *         Falls back to browser SpeechSynthesis if VibeVoice unavailable
 * Input:  Web Speech API (SpeechRecognition) — Chrome/Edge, zero cost
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles } from "lucide-react";
import { getTTSClient, type AgentVoice } from "@/lib/ttsClient";

interface VoiceControlProps {
  onTranscript: (text: string) => void;
  speakText?: string | null;
  voicePersona?: AgentVoice;
  disabled?: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
}

export default function VoiceControl({
  onTranscript,
  speakText,
  voicePersona = "guide",
  disabled = false,
  onSpeakingChange,
}: VoiceControlProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [usingVibeVoice, setUsingVibeVoice] = useState<boolean | null>(null);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const ttsRef = useRef(getTTSClient());

  useEffect(() => {
    fetch("http://localhost:8195/health", { signal: AbortSignal.timeout(2000) })
      .then((r) => r.json())
      .then((d) => setUsingVibeVoice(d.status === "ready"))
      .catch(() => setUsingVibeVoice(false));
  }, []);

  useEffect(() => {
    if (speakText && voiceEnabled) handleSpeak(speakText);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakText]);

  const handleSpeak = useCallback(async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;
    const clean = text
      .replace(/[#*`_~[\]]/g, "")
      .replace(/\$\$[\s\S]*?\$\$/g, "formula")
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/\*(Note:.*?)\*/g, "")
      .substring(0, 500);

    setIsSpeaking(true);
    onSpeakingChange?.(true);
    await ttsRef.current.speak(clean, voicePersona, {
      onEnd: () => { setIsSpeaking(false); onSpeakingChange?.(false); },
      onFallback: () => setUsingVibeVoice(false),
      onError: () => { setIsSpeaking(false); onSpeakingChange?.(false); },
    });
    setIsSpeaking(false);
    onSpeakingChange?.(false);
  }, [voiceEnabled, voicePersona, onSpeakingChange]);

  const stopSpeaking = () => {
    ttsRef.current.stop();
    setIsSpeaking(false);
    onSpeakingChange?.(false);
  };

  const startListening = useCallback(() => {
    if (isListening) return;
    const hasSR = typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    if (!hasSR) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let interim = "", final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      setInterimText(interim || final);
      if (final) { onTranscript(final.trim()); setInterimText(""); }
    };
    recognition.onerror = () => { setIsListening(false); setInterimText(""); };
    recognition.onend = () => { setIsListening(false); setInterimText(""); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    stopSpeaking();
  }, [isListening, onTranscript]);

  return (
    <div className="flex items-center gap-2">
      {usingVibeVoice === true && (
        <div title="VibeVoice TTS active — expressive AI voice"
          className="flex items-center gap-1 text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded-full">
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">VibeVoice</span>
        </div>
      )}
      {interimText && (
        <div className="text-xs text-slate-500 italic max-w-[120px] truncate bg-slate-100 px-2 py-1 rounded-full">
          &ldquo;{interimText}&rdquo;
        </div>
      )}
      <button onClick={isListening ? () => { recognitionRef.current?.stop(); setIsListening(false); setInterimText(""); } : startListening}
        disabled={disabled} title={isListening ? "Stop listening" : "Speak your question"}
        className={`p-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          isListening ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
                      : "bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600"}`}>
        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
      <button onClick={() => { if (isSpeaking) stopSpeaking(); else setVoiceEnabled(v => !v); }}
        title={isSpeaking ? "Stop speaking" : voiceEnabled ? "Disable voice" : "Enable voice"}
        className={`p-2.5 rounded-xl transition-all ${
          isSpeaking ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 animate-pulse"
          : voiceEnabled ? "bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600"
          : "bg-slate-100 text-slate-400"}`}>
        {isSpeaking ? <Loader2 className="w-4 h-4 animate-spin" />
         : voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>
    </div>
  );
}
