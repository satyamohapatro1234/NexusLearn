"use client";

/**
 * NexusLearn - Enhanced Learning Studio
 * Combines all 6 features:
 * 1. 3D Avatar (Three.js)
 * 2. Voice Input (Web Speech API)
 * 3. Voice Output (Speech Synthesis)
 * 4. Multi-language Code Studio (Piston API)
 * 5. BKT Mastery Tracking (OATutor)
 * 6. AI Chat with DeepTutor backend
 */

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import {
  GraduationCap, Code2, Brain, Mic, Sparkles,
  ChevronLeft, ChevronRight, Send, Loader2,
  BookOpen, Terminal, Lightbulb, MessageSquare,
  BarChart3, X, Menu
} from "lucide-react";
import VoiceControl from "@/components/nexus/VoiceControl";
import MasteryDashboard from "@/components/nexus/MasteryDashboard";
import { recordAttempt, loadSkills } from "@/lib/bkt";

// Dynamically import heavy 3D components
const AvatarPanel = dynamic(() => import("@/components/nexus/AvatarPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gradient-to-b from-slate-900 to-indigo-950 rounded-2xl">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-indigo-500/20 animate-pulse mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Loading avatar...</p>
      </div>
    </div>
  ),
});

const CodeStudio = dynamic(() => import("@/components/nexus/CodeStudio"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#0d1117] rounded-2xl">
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
    </div>
  ),
});

// ─── Types ───────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

type Tab = "chat" | "code" | "mastery";

// ─── Main Component ───────────────────────────────────────
export default function NexusLearnPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "👋 Welcome to **NexusLearn**! I'm your AI tutor — I can explain concepts, answer questions, write and run code in 12+ languages, and track your learning progress.\n\nTry asking me anything: *\"Explain recursion with Python examples\"* or *\"Teach me about Newton's laws\"*. You can also speak your question using the mic button!",
      ts: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [lastAIText, setLastAIText] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [skills, setSkills] = useState(() => loadSkills());
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Voice transcript handler
  const handleVoiceTranscript = useCallback((text: string) => {
    setInputText(text);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  // Send message to DeepTutor backend
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      setIsLoading(true);

      try {
        // Build message history for context
        const history = messages
          .filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/nexus/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history,
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const aiText = data.response || data.content || "I couldn't process that. Please try again.";

        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: aiText,
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        setLastAIText(aiText);

        // Update mastery for the topic discussed
        const topicId = `chat_${text.substring(0, 20).replace(/\s+/g, "_").toLowerCase()}`;
        const updated = recordAttempt(skills, "general_learning", "General Learning", true);
        setSkills(updated);
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "system",
          content: `⚠️ **Connection issue**: ${err.message}\n\nMake sure the DeepTutor backend is running at localhost:8000.`,
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, skills]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  const tabConfig: { id: Tab; label: string; icon: React.ElementType; color: string }[] = [
    { id: "chat",    label: "Chat",    icon: MessageSquare, color: "indigo" },
    { id: "code",    label: "Code",    icon: Code2,         color: "violet" },
    { id: "mastery", label: "Mastery", icon: Brain,         color: "emerald" },
  ];

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* ── LEFT PANEL: Avatar + Chat Controls ── */}
      <div
        className={`flex flex-col gap-3 p-3 transition-all duration-300 flex-shrink-0 ${
          showLeftPanel ? "w-72" : "w-0 overflow-hidden p-0"
        }`}
      >
        {showLeftPanel && (
          <>
            {/* Avatar */}
            <AvatarPanel isSpeaking={isSpeaking} className="h-64 flex-shrink-0" />

            {/* Quick topic suggestions */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> Quick Topics
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  "Explain binary search",
                  "Python list comprehensions",
                  "What is recursion?",
                  "Teach me about sorting algorithms",
                  "Explain Newton's laws",
                  "What is a neural network?",
                ].map((topic) => (
                  <button
                    key={topic}
                    onClick={() => sendMessage(topic)}
                    disabled={isLoading}
                    className="text-left text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 px-2 py-1.5 rounded-lg transition-all truncate disabled:opacity-40"
                  >
                    → {topic}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── MAIN PANEL ── */}
      <div className="flex-1 flex flex-col min-w-0 p-3 gap-3">
        {/* Header bar */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 flex-shrink-0">
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Menu className="w-4 h-4 text-slate-500" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800 dark:text-white">NexusLearn</span>
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
              AI Tutor
            </span>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl p-1 ml-2">
            {tabConfig.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Voice controls in header */}
          <VoiceControl
            onTranscript={handleVoiceTranscript}
            speakText={lastAIText}
            disabled={isLoading}
            onSpeakingChange={setIsSpeaking}
          />
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* CHAT TAB */}
          {activeTab === "chat" && (
            <div className="h-full flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Messages */}
              <div
                ref={chatRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-800/50"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {(msg.role === "assistant" || msg.role === "system") && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                        <GraduationCap className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-none"
                          : msg.role === "system"
                            ? "bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-tl-none"
                            : "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-tl-none shadow-sm"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mr-2 flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                      <div className="flex gap-1.5 items-center">
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything — type or speak your question..."
                    disabled={isLoading}
                    className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
                  />
                  <VoiceControl
                    onTranscript={handleVoiceTranscript}
                    disabled={isLoading}
                    onSpeakingChange={setIsSpeaking}
                  />
                  <button
                    onClick={() => sendMessage(inputText)}
                    disabled={!inputText.trim() || isLoading}
                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CODE TAB */}
          {activeTab === "code" && (
            <div className="h-full">
              <CodeStudio
                topicContext="programming"
                onRunComplete={(result) => {
                  const isSuccess = result.exitCode === 0;
                  const updated = recordAttempt(
                    loadSkills(),
                    "code_execution",
                    "Code Execution",
                    isSuccess
                  );
                  setSkills(updated);
                }}
              />
            </div>
          )}

          {/* MASTERY TAB */}
          {activeTab === "mastery" && (
            <div className="h-full overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <MasteryDashboard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
