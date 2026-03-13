"use client";

/**
 * VisualPanel — Agent-generated simulation + step-by-step explanation + YouTube embed
 * Uses POST /api/nexus/visual to call the backend VisualAgent (Ollama).
 * The simulation is rendered in a sandboxed iframe (no external network, no XSS).
 */

import { useState, useRef } from "react";
import {
  Sparkles, Loader2, RotateCcw, PlayCircle,
  ChevronRight, AlertCircle, Youtube, MonitorPlay,
  ListOrdered,
} from "lucide-react";

interface Step {
  n: number;
  title: string;
  body: string;
  canvas_note: string;
}

interface VisualResult {
  topic: string;
  steps: Step[];
  simulation_html: string;
  video_id: string | null;
}

interface VisualPanelProps {
  /** Pre-filled topic (from URL param or chat deep-link) */
  initialTopic?: string;
}

export default function VisualPanel({ initialTopic = "" }: VisualPanelProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [result, setResult] = useState<VisualResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const simRef = useRef<HTMLIFrameElement>(null);

  // Auto-generate if initialTopic was passed in
  const hasAutoFired = useRef(false);
  if (initialTopic && !hasAutoFired.current && !result && !isLoading) {
    hasAutoFired.current = true;
    // Defer to next tick so component is fully mounted
    setTimeout(() => generate(initialTopic), 100);
  }

  async function generate(topicOverride?: string) {
    const q = (topicOverride ?? topic).trim();
    if (!q) return;
    setTopic(q);
    setIsLoading(true);
    setError(null);
    setResult(null);
    setActiveStep(0);
    setShowVideo(false);

    try {
      const resp = await fetch("/api/nexus/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: q }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e.message ?? "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* ── Search bar ── */}
      <div className="flex gap-2 flex-shrink-0">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="Enter a topic to visualise… e.g. gravity, recursion, photosynthesis"
          className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
        />
        <button
          onClick={() => generate()}
          disabled={isLoading || !topic.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isLoading ? "Generating…" : "Generate"}
        </button>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex-shrink-0">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Could not generate visual</p>
            <p className="mt-1 text-red-600 dark:text-red-400">{error}</p>
            {error.includes("LLM") && (
              <p className="mt-2 text-xs">Make sure Ollama is running and you have connected it in Settings.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 dark:text-slate-400">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <MonitorPlay className="w-8 h-8 text-indigo-500 animate-pulse" />
            </div>
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin absolute -bottom-1 -right-1" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">VisualAgent is generating…</p>
            <p className="text-xs mt-1 text-slate-400">Building simulation + step-by-step breakdown (this takes ~20s)</p>
          </div>
          {/* Skeleton shimmer blocks */}
          <div className="w-full max-w-2xl space-y-3 px-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result && !isLoading && (
        <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr] gap-3 overflow-hidden">

          {/* LEFT — Step-by-step */}
          <div className="flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-shrink-0">
              <ListOrdered className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Step-by-step
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {result.steps.map((step, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    activeStep === i
                      ? "bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      activeStep === i
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"
                    }`}>
                      {step.n}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${
                        activeStep === i
                          ? "text-indigo-700 dark:text-indigo-300"
                          : "text-slate-700 dark:text-slate-300"
                      }`}>
                        {step.title}
                      </p>
                      {activeStep === i && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                          {step.body}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Canvas note for active step */}
            {result.steps[activeStep] && (
              <div className="px-3 pb-3 flex-shrink-0">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    {result.steps[activeStep].canvas_note}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Simulation + Video toggle */}
          <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* Sub-tab: Simulation / Video */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl p-1 flex-shrink-0 self-start">
              <button
                onClick={() => setShowVideo(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  !showVideo
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                Simulation
              </button>
              <button
                onClick={() => setShowVideo(true)}
                disabled={!result.video_id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${
                  showVideo
                    ? "bg-white dark:bg-slate-700 text-red-500 dark:text-red-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <Youtube className="w-3.5 h-3.5" />
                Video {!result.video_id && "(unavailable)"}
              </button>
            </div>

            {/* Simulation iframe */}
            {!showVideo && (
              <div className="flex-1 min-h-0 bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 relative">
                {result.simulation_html ? (
                  <>
                    <iframe
                      ref={simRef}
                      key={result.topic + activeStep} // re-render when step changes forces animation restart
                      srcDoc={result.simulation_html}
                      sandbox="allow-scripts"
                      className="w-full h-full border-0"
                      title={`Simulation: ${result.topic}`}
                    />
                    <button
                      onClick={() => generate()}
                      title="Regenerate simulation"
                      className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 text-white rounded-lg transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    No simulation was generated for this topic.
                  </div>
                )}
              </div>
            )}

            {/* YouTube embed */}
            {showVideo && result.video_id && (
              <div className="flex-1 min-h-0 bg-black rounded-2xl overflow-hidden border border-slate-700">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${result.video_id}?autoplay=1&rel=0`}
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title={`Video: ${result.topic}`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !isLoading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-slate-400">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
            <MonitorPlay className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Visual Learning Studio</p>
            <p className="text-xs mt-1 max-w-xs">
              Type any topic above and the AI will build a live animation, step-by-step breakdown, and find a relevant video.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {["Gravity", "Recursion", "Photosynthesis", "Sorting algorithms", "Newton's laws", "DNA replication", "Binary search", "Plate tectonics"].map((t) => (
              <button
                key={t}
                onClick={() => { setTopic(t); generate(t); }}
                className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 transition-all"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
