"use client";

import { useState } from "react";
import {
  Brain,
  Database,
  Volume2,
  Search,
  Check,
  AlertCircle,
  Server,
  RefreshCw,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  ArrowRight,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { FullStatus, PortsInfo, ConfigType } from "../types";

interface OverviewTabProps {
  status: FullStatus | null;
  ports: PortsInfo | null;
  onRefresh: () => void;
  onTabChange?: (tab: ConfigType) => void;
  t: (key: string) => string;
}

// Which services can be auto-detected vs need manual API-key setup
const AUTO_DETECTABLE = new Set<ConfigType>(["llm", "embedding"]);
const MANUAL_HINTS: Partial<Record<ConfigType, string>> = {
  tts:    "Default: Browser TTS (built-in). Add a provider in the TTS tab for voice synthesis.",
  search: "Default: DuckDuckGo (no key). Add a provider in the Search tab for richer results.",
};

interface DetectedProvider {
  provider: string;
  base_url: string;
  models: string[];
  running: boolean;
}

const services: { key: ConfigType; label: string; icon: typeof Brain; color: string }[] = [
  { key: "llm",       label: "LLM",       icon: Brain,     color: "purple" },
  { key: "embedding", label: "Embedding", icon: Database,  color: "indigo" },
  { key: "tts",       label: "TTS",       icon: Volume2,   color: "emerald" },
  { key: "search",    label: "Search",    icon: Search,    color: "amber" },
];

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
};

export default function OverviewTab({ status, ports, onRefresh, onTabChange, t }: OverviewTabProps) {
  const [detecting, setDetecting]       = useState(false);
  const [detected, setDetected]         = useState<DetectedProvider[] | null>(null);
  const [applying, setApplying]         = useState<string | null>(null);
  const [applyResult, setApplyResult]   = useState<Record<string, string>>({});
  const [expanded, setExpanded]         = useState<Record<string, boolean>>({});

  const runDetect = async () => {
    setDetecting(true);
    setDetected(null);
    setApplyResult({});
    try {
      const res = await fetch(apiUrl("/api/v1/config/detect"));
      if (res.ok) {
        const data = await res.json();
        setDetected(data.detected ?? []);
      }
    } catch {
      setDetected([]);
    } finally {
      setDetecting(false);
    }
  };

  const applyProvider = async (p: DetectedProvider) => {
    setApplying(p.provider);
    try {
      const res = await fetch(apiUrl("/api/v1/config/detect/apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.provider, base_url: p.base_url, models: p.models }),
      });
      const data = await res.json();
      const llmCount = data.created_llm ?? data.created ?? 0;
      const embCount = data.created_emb ?? 0;
      const parts: string[] = [];
      if (llmCount > 0) parts.push(`${llmCount} LLM config(s)`);
      if (embCount > 0) parts.push(`${embCount} Embedding config(s)`);
      const summary = parts.length > 0
        ? `Added ${parts.join(" + ")} from ${PROVIDER_LABELS[p.provider] ?? p.provider}`
        : `All ${p.models.length} model(s) already loaded`;
      setApplyResult((prev) => ({ ...prev, [p.provider]: summary }));
      onRefresh();
    } catch {
      setApplyResult((prev) => ({ ...prev, [p.provider]: "Failed to apply" }));
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top row: Refresh + Auto-detect */}
      <div className="flex items-center justify-between">
        <button
          onClick={runDetect}
          disabled={detecting}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {detecting ? t("Scanning…") : t("Auto-detect local providers")}
        </button>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t("Refresh")}
        </button>
      </div>

      {/* Auto-detect results */}
      {detected !== null && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-semibold text-sm">
            <Zap className="w-4 h-4" />
            {detected.length === 0
              ? t("No local providers detected (Ollama / LM Studio not running)")
              : `${detected.length} provider(s) detected — LLM & Embedding configs will be created`}
          </div>

          {detected.map((p) => (
            <div key={p.provider} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {PROVIDER_LABELS[p.provider] ?? p.provider}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{p.base_url}</span>
                  <span className="ml-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {p.models.length} model{p.models.length !== 1 ? "s" : ""} available
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [p.provider]: !e[p.provider] }))}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                  >
                    {expanded[p.provider] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded[p.provider] ? "Hide" : "Show"} models
                  </button>
                  <button
                    onClick={() => applyProvider(p)}
                    disabled={applying === p.provider}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {applying === p.provider ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {t("Auto-load all")}
                  </button>
                </div>
              </div>

              {expanded[p.provider] && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.models.map((m) => (
                    <span key={m} className="px-2 py-0.5 text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                      {m}
                    </span>
                  ))}
                </div>
              )}

              {applyResult[p.provider] && (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{applyResult[p.provider]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((service) => {
          const s = status?.[service.key];
          const Icon = service.icon;
          const isConfigured = s?.configured;
          const manualHint = MANUAL_HINTS[service.key];
          const canAutoDetect = AUTO_DETECTABLE.has(service.key);

          return (
            <div
              key={service.key}
              className={`p-4 rounded-xl border ${
                isConfigured
                  ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                  : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isConfigured ? "bg-green-100 dark:bg-green-800/50" : "bg-slate-100 dark:bg-slate-700"}`}>
                    <Icon className={`w-5 h-5 ${isConfigured ? "text-green-600 dark:text-green-400" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{service.label}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {s?.active_config_name || t("Not configured")}
                    </p>
                  </div>
                </div>
                {isConfigured ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-slate-400" />}
              </div>

              {/* Active model info */}
              {s?.model && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t("Model")}:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{s.model}</span>
                  </div>
                  {s.provider && (
                    <div className="flex items-center gap-2 text-sm mt-1">
                      <span className="text-slate-500 dark:text-slate-400">{t("Provider")}:</span>
                      <span className="text-slate-700 dark:text-slate-300">{s.provider}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manual setup hint for non-auto-detectable services */}
              {manualHint && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{manualHint}</p>
                  {onTabChange && (
                    <button
                      onClick={() => onTabChange(service.key)}
                      className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                    >
                      Configure {service.label}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Auto-detectable but not yet configured nudge */}
              {!isConfigured && canAutoDetect && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Use <span className="font-medium text-indigo-600 dark:text-indigo-400">Auto-detect local providers</span> above to configure automatically.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Port Information */}
      {ports && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t("Port Configuration")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-slate-500 dark:text-slate-400">{t("Backend Port")}</span>
              <p className="font-mono text-lg text-slate-700 dark:text-slate-300">{ports.backend_port}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500 dark:text-slate-400">{t("Frontend Port")}</span>
              <p className="font-mono text-lg text-slate-700 dark:text-slate-300">{ports.frontend_port}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


