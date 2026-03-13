"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "sv", name: "Svenska", flag: "🇸🇪" },
  { code: "da", name: "Dansk", flag: "🇩🇰" },
  { code: "fi", name: "Suomi", flag: "🇫🇮" },
  { code: "no", name: "Norsk", flag: "🇳🇴" },
  { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩" },
];

const LLM_PROVIDERS = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic / Claude" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
];

export default function SetupPage() {
  const router = useRouter();
  const { user, updateProfile, markSetupDone } = useAuth();

  const [step, setStep] = useState(0);

  // Step 0: LLM config
  const [llmProvider, setLlmProvider] = useState("ollama");
  const [llmModel, setLlmModel] = useState("qwen2.5-coder:7b");
  const [llmBaseUrl, setLlmBaseUrl] = useState("http://localhost:11434");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Step 1: Language
  const [language, setLanguage] = useState(user?.language ?? "en");

  // Step 2: Confirm
  const [finishing, setFinishing] = useState(false);

  const autoDetect = async () => {
    setDetecting(true);
    setDetectStatus(null);
    try {
      const r = await fetch("http://localhost:8001/api/v1/config/detect");
      if (r.ok) {
        const d = await r.json();
        // Backend returns { detected: [{provider, base_url, models, running}] }
        const list: Array<{provider: string; base_url: string; models: string[]; running: boolean}> =
          d.detected ?? (d.provider ? [d] : []);
        if (list.length > 0 && list[0].models?.length > 0) {
          const hit = list[0];
          const providerName = hit.provider === "lm_studio" ? "openai" : hit.provider;
          setLlmProvider(providerName);
          setLlmModel(hit.models[0]);
          // base_url from detect is /v1 path; keep as-is for OpenAI-compat, strip for ollama display
          setLlmBaseUrl(hit.base_url.replace(/\/v1$/, ""));
          setDetectStatus(`Detected: ${hit.provider} — ${hit.models[0]}`);
        } else {
          setDetectStatus("No local LLM detected. Please configure manually.");
        }
      } else {
        setDetectStatus("Detection failed — configure manually.");
      }
    } catch {
      setDetectStatus("Could not connect to backend.");
    } finally {
      setDetecting(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("http://localhost:8001/api/v1/config/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: llmProvider, model: llmModel, base_url: llmBaseUrl, api_key: llmApiKey }),
      });
      const d = await r.json();
      setTestResult(r.ok ? `✅ Connected — ${d.message ?? "OK"}` : `❌ ${d.detail ?? "Connection failed"}`);
    } catch {
      setTestResult("❌ Could not reach backend");
    } finally {
      setTesting(false);
    }
  };

  const goNext = async () => {
    if (step === 0) {
      // Save LLM config
      await updateProfile({ llm_provider: llmProvider, llm_model: llmModel, llm_base_url: llmBaseUrl, llm_api_key: llmApiKey });
      setStep(1);
    } else if (step === 1) {
      await updateProfile({ language });
      setStep(2);
    }
  };

  const launch = async () => {
    setFinishing(true);
    await markSetupDone();
    router.push("/nexus");
  };

  const STEPS = ["Configure AI", "Choose Language", "Launch"];

  return (
    <div className="w-full max-w-2xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
          NexusLearn Setup
        </div>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Let's get you ready in 3 quick steps
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                i === step
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900"
                  : i < step
                  ? "bg-green-500 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span
              className={`text-sm hidden sm:block ${
                i === step ? "text-slate-900 dark:text-white font-medium" : "text-slate-400"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${i < step ? "bg-green-400" : "bg-slate-200 dark:bg-slate-700"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">

        {/* Step 0: LLM Config */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Configure Your AI</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                NexusLearn works with Ollama, OpenAI, Anthropic, and more.
              </p>
            </div>

            <button
              onClick={autoDetect}
              disabled={detecting}
              className="w-full py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-600 dark:text-indigo-400 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-sm font-medium disabled:opacity-60"
            >
              {detecting ? "Detecting…" : "⚡ Auto-detect local LLM"}
            </button>

            {detectStatus && (
              <p className={`text-xs px-3 py-2 rounded-lg ${detectStatus.startsWith("Detected") ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"}`}>
                {detectStatus}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Model</label>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="e.g. gpt-4o, llama3.2"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Base URL (optional for cloud)</label>
              <input
                type="text"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {llmProvider !== "ollama" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={testConnection}
                disabled={testing}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-60"
              >
                {testing ? "Testing…" : "Test Connection"}
              </button>
              {testResult && (
                <span className="text-sm self-center text-slate-600 dark:text-slate-400">{testResult}</span>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Language */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Choose Your Language</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                NexusLearn will teach you in this language.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition-all ${
                    language === lang.code
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="text-xs font-medium">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Ready to Launch!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Here's your configuration summary.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                <span className="text-2xl">🤖</span>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">AI Provider</div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {LLM_PROVIDERS.find(p => p.value === llmProvider)?.label ?? llmProvider} — {llmModel}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                <span className="text-2xl">
                  {LANGUAGES.find(l => l.code === language)?.flag ?? "🌐"}
                </span>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Teaching Language</div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {LANGUAGES.find(l => l.code === language)?.name ?? language}
                  </div>
                </div>
              </div>

              {user && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                  <span className="text-2xl">👤</span>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Account</div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <button
              onClick={goNext}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all text-sm"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={finishing}
              className="px-8 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all text-sm shadow-lg shadow-green-200 dark:shadow-green-900 disabled:opacity-60"
            >
              {finishing ? "Launching…" : "🚀 Launch NexusLearn"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
