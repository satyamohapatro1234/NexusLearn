"use client";

/**
 * NexusLearn - Enhanced Learning Studio
 * Combines all 8 features:
 * 1. 3D Avatar (Three.js)
 * 2. Voice Input (Web Speech API)
 * 3. Voice Output (VibeVoice TTS with SpeechSynthesis fallback)
 * 4. Multi-language Code Studio (Pyodide WASM + Piston API)
 * 5. BKT Mastery Tracking (OATutor)
 * 6. AI Chat with DeepTutor backend (WebSocket streaming, 6 agents)
 * 7. Visual/Simulation tab (VisualPanel + iframe sandbox)
 * 8. Voice Teacher (LiveKit full-duplex voice session)
 */

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VisualPanel from "@/components/nexus/VisualPanel";
import type { LessonConfig } from "@/lib/lessonConfig";
import { usePageActions, type PageAction } from "@/lib/pageActions";
import {
  GraduationCap, Code2, Brain, Mic, Sparkles,
  ChevronLeft, ChevronRight, Send, Loader2,
  BookOpen, Terminal, Lightbulb, MessageSquare,
  BarChart3, X, Menu, MonitorPlay,
} from "lucide-react";
import VoiceControl from "@/components/nexus/VoiceControl";
import MasteryDashboard from "@/components/nexus/MasteryDashboard";
import { recordAttempt, loadSkills } from "@/lib/bkt";
import { useAuth } from "@/context/AuthContext";

// Dynamically import heavy components
const LessonVideo = dynamic(() => import("@/components/nexus/LessonVideo"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-32 bg-slate-900 rounded-2xl">
      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
    </div>
  ),
});

const VoiceTeacher = dynamic(() => import("@/components/nexus/VoiceTeacher"), {
  ssr: false,
});

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
  agent?: string;
  isStreaming?: boolean;
  ts: number;
}

type Tab = "chat" | "code" | "visual" | "mastery";

// Helper: derive WebSocket URL from current window location
function wsUrl(path: string): string {
  if (typeof window === "undefined") return `ws://localhost:8001${path}`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//localhost:8001${path}`;
}

// Extract a clean skill name from a user message for BKT tracking
function extractSkillId(text: string): { id: string; label: string } {
  const stop = new Set(["what","how","why","when","where","who","is","are","the","a","an",
    "about","explain","teach","me","tell","can","you","do","does","with","and","for",
    "to","in","of","i","want","learn","understand","show","please","give"]);
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>3&&!stop.has(w));
  if (!words.length) return { id: "general_learning", label: "General Learning" };
  const label = words.slice(0,3).map(w=>w[0].toUpperCase()+w.slice(1)).join(" ");
  return { id: words.slice(0,3).join("_"), label };
}

// ─── Main Component ───────────────────────────────────────
function NexusLearnContent() {
  const { user } = useAuth();
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
  const tabFromUrl = useSearchParams().get("tab") as Tab | null;
  const [lastAIText, setLastAIText] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [skills, setSkills] = useState(() => loadSkills());
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [dynamicTopics, setDynamicTopics] = useState([
    "Explain binary search",
    "Python list comprehensions",
    "What is recursion?",
    "Teach me about sorting algorithms",
    "Explain Newton's laws",
    "What is a neural network?",
  ]);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nexusSessionId = useRef<string>(crypto.randomUUID());
  const chatWsRef = useRef<WebSocket | null>(null);
  const searchParams = useSearchParams();
  const topicAutoFiredRef = useRef(false);
  const [lessonConfig, setLessonConfig] = useState<LessonConfig | null>(null);
  const [activeLessonTopic, setActiveLessonTopic] = useState<string | null>(null);
  const [voicePersona, setVoicePersona] = useState<string>("guide");
  const [agentName, setAgentName] = useState<string>("chat");
  const { execute: executePageActions, isExecuting: isPageActing } = usePageActions();

  // Auto-load topic when arriving from Home chat deep-link
  useEffect(() => {
    // If a specific tab was requested via URL, switch to it
    if (tabFromUrl && ["chat", "code", "visual", "mastery"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
    if (topicAutoFiredRef.current) return;
    const topic = searchParams.get("topic");
    if (!topic) return;
    topicAutoFiredRef.current = true;
    // If tab=visual, let VisualPanel handle it; otherwise send to chat
    if (tabFromUrl === "visual") return;
    const t = setTimeout(() => sendMessage(topic), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Send message via WebSocket → backend chat_ws_main (full agent routing)
  const sendMessage = useCallback(
    (text: string) => {
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
      setCurrentStage("Connecting…");

      // Close any existing socket
      if (chatWsRef.current) chatWsRef.current.close();

      const ws = new WebSocket(wsUrl("/api/v1/chat"));
      chatWsRef.current = ws;
      let assistantText = "";

      ws.onopen = () => {
        const history = messages
          .filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));
        ws.send(JSON.stringify({
          message: text.trim(),
          session_id: nexusSessionId.current,
          history,
          student_id: user?.id ?? "guest",
          language: user?.language ?? "en",
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "session") {
          nexusSessionId.current = data.session_id;
        } else if (data.type === "status") {
          setCurrentStage(data.stage || data.message);
        } else if (data.type === "stream") {
          assistantText += data.content;
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant" && last?.isStreaming) {
              msgs[msgs.length - 1] = { ...last, content: assistantText };
            } else {
              msgs.push({ id: (Date.now()+1).toString(), role: "assistant", content: assistantText, isStreaming: true, ts: Date.now() });
            }
            return msgs;
          });
        } else if (data.type === "result") {
          const agent = data.agent as string | undefined;
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = { ...last, content: data.content || assistantText, isStreaming: false, agent };
            }
            return msgs;
          });
          setLastAIText(data.content || assistantText);
          setCurrentStage(null);
          setIsLoading(false);

          // Update voice persona per agent
          if (data.voice) setVoicePersona(data.voice);
          if (agent) setAgentName(agent);

          // Execute PageAgent teacher UI control (types code, clicks run, etc.)
          if (data.page_actions?.length) {
            executePageActions(data.page_actions as PageAction[]);
          }

          // Remotion lesson video
          if (data.remotion_config || data.content_type === "remotion" || data.content_type === "html_lesson") {
            if (data.remotion_config) setLessonConfig(data.remotion_config as LessonConfig);
            const topic = data.remotion_config?.topic || text.substring(0, 40);
            setActiveLessonTopic(topic);
          }

          // Phase 5 — track real topic in BKT
          const { id: skillId, label: skillLabel } = extractSkillId(text);
          setSkills((prev) => recordAttempt(prev, skillId, skillLabel, true));

          // Dynamic follow-up topics
          const kw = skillId.replace(/_/g, " ");
          setDynamicTopics([
            `Go deeper into ${kw}`,
            `Give me a ${kw} example in Python`,
            `What are common mistakes with ${kw}?`,
            `How is ${kw} used in real projects?`,
            `Quiz me on ${kw}`,
            `Compare ${kw} with alternatives`,
          ]);
        }
      };

      ws.onerror = () => {
        setMessages((prev) => [...prev, {
          id: (Date.now()+2).toString(), role: "system",
          content: "⚠️ **Connection error** — make sure the DeepTutor backend is running.",
          ts: Date.now(),
        }]);
        setIsLoading(false);
        setCurrentStage(null);
      };

      ws.onclose = () => {
        if (isLoading) {
          setIsLoading(false);
          setCurrentStage(null);
        }
      };
    },
    [messages, isLoading]
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
    { id: "visual",  label: "Visual",  icon: MonitorPlay,   color: "fuchsia" },
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
            <AvatarPanel isSpeaking={isSpeaking} message={lastAIText ?? ""} className="h-64 flex-shrink-0" />

            {/* Quick topic suggestions */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> Quick Topics
              </p>
              <div className="flex flex-col gap-1.5">
                {dynamicTopics.map((topic) => (
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
            voicePersona={voicePersona as any}
            disabled={isLoading}
            onSpeakingChange={setIsSpeaking}
          />
          {/* LiveKit voice session — graceful fallback if LiveKit not running */}
          <VoiceTeacher
            studentId={user?.id ?? "guest"}
            onTranscript={handleVoiceTranscript}
            className="hidden sm:flex"
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
                      {/* Agent badge */}
                      {msg.agent && (
                        <div className="mb-1.5">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 tracking-wide">
                            ❆ {msg.agent}
                          </span>
                        </div>
                      )}
                      <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}

                {(isLoading || currentStage) && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mr-2 flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                      {currentStage && (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 italic mb-2">{currentStage}</p>
                      )}
                      <div className="flex gap-1.5 items-center">
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Remotion Lesson Video — shown when agent returns a lesson */}
                {activeLessonTopic && (
                  <div className="px-2 py-1">
                    <LessonVideo
                      topic={activeLessonTopic}
                      title={lessonConfig?.title || activeLessonTopic}
                      config={lessonConfig}
                      onEnd={() => sendMessage("Give me a quiz question about " + activeLessonTopic)}
                      onSkip={() => {
                        setActiveLessonTopic(null);
                        setLessonConfig(null);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                {/* PageAgent status — shown when teacher is controlling the editor */}
                {isPageActing && (
                  <div className="mx-1 mb-1 flex items-center gap-2 text-xs text-indigo-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Teacher is controlling the editor...
                  </div>
                )}
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

          {/* VISUAL TAB */}
          {activeTab === "visual" && (
            <div className="h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden p-4">
              <VisualPanel initialTopic={searchParams.get("topic") ?? ""} />
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

export default function NexusLearnPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-950"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <NexusLearnContent />
    </Suspense>
  );
}
