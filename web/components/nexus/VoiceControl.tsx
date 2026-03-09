"use client";

/**
 * VoiceControl - Free voice input/output using browser built-in APIs
 * - Speech Input: Web Speech API (SpeechRecognition) - Chrome/Edge built-in, zero cost
 * - Speech Output: SpeechSynthesis API - all browsers, zero cost
 * No API keys. No servers. Completely free.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from "lucide-react";

interface VoiceControlProps {
  onTranscript: (text: string) => void;
  speakText?: string | null;
  disabled?: boolean;
  avatarSpeaking?: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
}

export default function VoiceControl({
  onTranscript,
  speakText,
  disabled = false,
  onSpeakingChange,
}: VoiceControlProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [supported, setSupported] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check browser support
  useEffect(() => {
    const hasSpeechRecognition =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    const hasSpeechSynthesis =
      typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(hasSpeechRecognition && hasSpeechSynthesis);
  }, []);

  // Auto-speak when new text arrives
  useEffect(() => {
    if (speakText && voiceEnabled && supported) {
      speak(speakText);
    }
  }, [speakText]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !voiceEnabled) return;

      window.speechSynthesis.cancel();
      const clean = text
        .replace(/[#*`_~\[\]]/g, "")
        .replace(/\$\$[\s\S]*?\$\$/g, "formula")
        .replace(/\$[^$]*\$/g, "formula")
        .replace(/```[\s\S]*?```/g, "code block")
        .substring(0, 500);

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Pick a pleasant voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.name.includes("Google") ||
          v.name.includes("Samantha") ||
          v.name.includes("Karen") ||
          v.name.includes("Daniel")
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        setIsSpeaking(true);
        onSpeakingChange?.(true);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      };

      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [supported, voiceEnabled, onSpeakingChange]
  );

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    onSpeakingChange?.(false);
  };

  const startListening = useCallback(() => {
    if (!supported || isListening) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim || final);
      if (final) {
        onTranscript(final.trim());
        setInterimText("");
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimText("");
    };
    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    stopSpeaking();
  }, [supported, isListening, onTranscript]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText("");
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-1 text-xs text-slate-400 px-2">
        <MicOff className="w-3 h-3" />
        <span>Voice requires Chrome/Edge</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Interim transcript preview */}
      {interimText && (
        <div className="text-xs text-slate-500 italic max-w-[120px] truncate bg-slate-100 px-2 py-1 rounded-full">
          "{interimText}"
        </div>
      )}

      {/* Mic button */}
      <button
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        title={isListening ? "Stop listening" : "Speak your question"}
        className={`p-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          isListening
            ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
            : "bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600"
        }`}
      >
        {isListening ? (
          <Mic className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>

      {/* Speaker toggle */}
      <button
        onClick={() => {
          if (isSpeaking) stopSpeaking();
          else setVoiceEnabled(!voiceEnabled);
        }}
        title={
          isSpeaking
            ? "Stop speaking"
            : voiceEnabled
              ? "Disable voice"
              : "Enable voice"
        }
        className={`p-2.5 rounded-xl transition-all ${
          isSpeaking
            ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 animate-pulse"
            : voiceEnabled
              ? "bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600"
              : "bg-slate-100 text-slate-400"
        }`}
      >
        {isSpeaking ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : voiceEnabled ? (
          <Volume2 className="w-4 h-4" />
        ) : (
          <VolumeX className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
