"use client";
/* eslint-disable @typescript-eslint/ban-ts-comment */

import dynamic from "next/dynamic";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export const AVATARS = [
  { id: "coach",     label: "The Coach",     file: "/avatars/The Coach.glb",     emoji: "🎯" },
  { id: "mentor",    label: "The Mentor",    file: "/avatars/The Mentor.glb",    emoji: "🧑‍🏫" },
  { id: "scholar",   label: "The Scholar",   file: "/avatars/The Scholar.glb",   emoji: "🎓" },
  { id: "innovator", label: "The Innovator", file: "/avatars/The Innovator.glb", emoji: "💡" },
];

// Dynamically import the scene to keep Three.js out of SSR bundle
const AvatarScene = dynamic(() => import("./three/AvatarScene"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-20 h-20 rounded-full bg-indigo-500/20 animate-pulse flex items-center justify-center text-4xl">
        🎓
      </div>
    </div>
  ),
});

interface AvatarPanelProps {
  isSpeaking: boolean;
  message?: string;
  className?: string;
}

export default function AvatarPanel({ isSpeaking, message = "", className = "" }: AvatarPanelProps) {
  const [selected, setSelected] = useState(AVATARS[0]);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className={`relative flex flex-col bg-gradient-to-b from-slate-900 to-indigo-950 rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{selected.emoji}</span>
          <span className="text-white text-sm font-semibold">{selected.label}</span>
          {isSpeaking && (
            <span className="flex gap-0.5 items-end h-4">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 bg-indigo-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s`, height: `${8 + i * 4}px` }} />
              ))}
            </span>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1 text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-all">
            Change <ChevronDown className="w-3 h-3" />
          </button>
          {showPicker && (
            <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[150px]">
              {AVATARS.map((av) => (
                <button key={av.id} onClick={() => { setSelected(av); setShowPicker(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    selected.id === av.id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-700"
                  }`}>
                  <span>{av.emoji}</span><span>{av.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scene - lazy loaded */}
      <div className="flex-1 min-h-[200px]">
        <AvatarScene avatarFile={selected.file} isSpeaking={isSpeaking} message={message} />
      </div>

      <div className={`h-1 flex-shrink-0 transition-all duration-300 ${
        isSpeaking ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse" : "bg-slate-800"
      }`} />
    </div>
  );
}
