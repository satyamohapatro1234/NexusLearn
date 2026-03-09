"use client";

/**
 * CodeStudio - Multi-language IDE with live terminal output
 * - Code editor with syntax highlighting
 * - xterm.js terminal for live output display
 * - Piston API for execution (free, no key, 80+ languages)
 * - BKT mastery tracking per language/topic
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Square,
  Terminal,
  Code2,
  ChevronDown,
  RotateCcw,
  Copy,
  Check,
  Loader2,
  Cpu,
} from "lucide-react";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_CODE,
  executeCode,
  type CodeRunResult,
} from "@/lib/piston";
import { recordAttempt, loadSkills, getMasteryPercent, getMasteryColor, getMasteryLabel } from "@/lib/bkt";

interface OutputLine {
  type: "stdout" | "stderr" | "info" | "success" | "error";
  text: string;
  ts: number;
}

interface CodeStudioProps {
  initialCode?: string;
  initialLanguage?: string;
  topicContext?: string;
  onRunComplete?: (result: CodeRunResult) => void;
}

export default function CodeStudio({
  initialCode,
  initialLanguage = "python",
  topicContext = "coding",
  onRunComplete,
}: CodeStudioProps) {
  const [selectedLang, setSelectedLang] = useState(
    SUPPORTED_LANGUAGES.find((l) => l.id === initialLanguage) || SUPPORTED_LANGUAGES[0]
  );
  const [code, setCode] = useState(initialCode || DEFAULT_CODE[initialLanguage] || DEFAULT_CODE.python);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [skills, setSkills] = useState(() => loadSkills());
  const [stdinVal, setStdinVal] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef(false);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Update code when language changes
  const switchLanguage = (lang: typeof SUPPORTED_LANGUAGES[0]) => {
    setSelectedLang(lang);
    setCode(DEFAULT_CODE[lang.id] || `// ${lang.label} code here`);
    setOutput([]);
    setShowLangMenu(false);
  };

  const addOutput = (type: OutputLine["type"], text: string) => {
    setOutput((prev) => [...prev, { type, text, ts: Date.now() }]);
  };

  const runCode = useCallback(async () => {
    if (isRunning || !code.trim()) return;
    abortRef.current = false;
    setIsRunning(true);
    setOutput([]);

    addOutput("info", `▶ Running ${selectedLang.label}...`);
    addOutput("info", `─────────────────────────────────`);

    const startMs = performance.now();

    try {
      const result = await executeCode({
        language: selectedLang.id,
        code,
        stdin: stdinVal || undefined,
      });

      const elapsed = ((performance.now() - startMs) / 1000).toFixed(2);

      if (result.compileError) {
        result.compileError.split("\n").forEach((line: string) => {
          if (line !== "") addOutput("stderr", line);
        });
      }

      if (result.stdout) {
        result.stdout.split("\n").forEach((line: string) => {
          if (line !== "") addOutput("stdout", line);
        });
      }

      if (result.stderr) {
        result.stderr.split("\n").forEach((line: string) => {
          if (line !== "") addOutput("stderr", line);
        });
      }
      const isSuccess = result.exitCode === 0;
      addOutput(
        isSuccess ? "success" : "error",
        `${isSuccess ? "✓" : "✗"} Exited with code ${result.exitCode} · ${elapsed}s`
      );

      // Update BKT mastery
      const skillId = `code_${selectedLang.id}`;
      const updated = recordAttempt(skills, skillId, `${selectedLang.label} Programming`, isSuccess);
      setSkills(updated);

      onRunComplete?.(result);
    } catch (err: any) {
      addOutput("error", `✗ Execution failed: ${err.message}`);
      addOutput("info", "  Check your internet connection (Wandbox API required)");
    } finally {
      setIsRunning(false);
    }
  }, [code, selectedLang, stdinVal, isRunning, skills, onRunComplete]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const skill = skills[`code_${selectedLang.id}`];
  const masteryPct = skill ? getMasteryPercent(skill.model) : null;
  const masteryColor = skill ? getMasteryColor(skill.model) : "#94a3b8";
  const masteryLabel = skill ? getMasteryLabel(skill.model) : null;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-slate-700/50">
        {/* Window dots */}
        <div className="flex gap-1.5 mr-1">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>

        {/* Language selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-all border border-slate-600/30"
          >
            <span>{selectedLang.icon}</span>
            <span>{selectedLang.label}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {showLangMenu && (
            <div className="absolute top-9 left-0 z-50 bg-[#161b22] border border-slate-700 rounded-xl shadow-2xl overflow-hidden w-48 max-h-72 overflow-y-auto">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => switchLanguage(lang)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    selectedLang.id === lang.id
                      ? "bg-indigo-600 text-white"
                      : "text-slate-300 hover:bg-slate-700/50"
                  }`}
                >
                  <span>{lang.icon}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mastery badge */}
        {masteryPct !== null && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border"
            style={{
              backgroundColor: masteryColor + "20",
              borderColor: masteryColor + "40",
              color: masteryColor,
            }}
          >
            <Cpu className="w-3 h-3" />
            <span>{masteryLabel}</span>
            <span className="opacity-70">{masteryPct}%</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Stdin toggle */}
        <button
          onClick={() => setShowStdin(!showStdin)}
          className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${
            showStdin
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "bg-slate-700/30 border-slate-600/30 text-slate-400 hover:text-slate-300"
          }`}
        >
          stdin
        </button>

        {/* Copy */}
        <button
          onClick={copyCode}
          className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-700/50"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>

        {/* Reset */}
        <button
          onClick={() => setCode(DEFAULT_CODE[selectedLang.id] || "")}
          className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-700/50"
          title="Reset code"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Run button */}
        <button
          onClick={isRunning ? () => { abortRef.current = true; setIsRunning(false); } : runCode}
          disabled={!code.trim()}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isRunning
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
          }`}
        >
          {isRunning ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Stop</>
          ) : (
            <><Play className="w-3.5 h-3.5" /> Run</>
          )}
        </button>
      </div>

      {/* Stdin input (optional) */}
      {showStdin && (
        <div className="px-3 py-2 bg-[#161b22] border-b border-slate-700/50">
          <label className="block text-xs text-amber-400 mb-1 font-medium">Standard Input (stdin)</label>
          <textarea
            value={stdinVal}
            onChange={(e) => setStdinVal(e.target.value)}
            placeholder="Enter program input here..."
            rows={2}
            className="w-full bg-slate-800/50 border border-slate-600/30 rounded-lg text-sm text-slate-300 px-3 py-2 font-mono resize-none focus:outline-none focus:border-amber-500/50"
          />
        </div>
      )}

      {/* Editor + Terminal split */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Code editor */}
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: "200px" }}>
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-[#0d1117] border-r border-slate-700/30 flex flex-col pt-2 select-none">
            {code.split("\n").map((_, i) => (
              <div
                key={i}
                className="text-right pr-3 text-slate-600 text-xs leading-6 font-mono"
              >
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="absolute inset-0 w-full h-full bg-transparent text-slate-100 font-mono text-sm leading-6 resize-none focus:outline-none pl-12 pr-4 pt-2"
            style={{ caretColor: "#6366f1", tabSize: 2 }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const start = e.currentTarget.selectionStart;
                const end = e.currentTarget.selectionEnd;
                const newCode = code.substring(0, start) + "  " + code.substring(end);
                setCode(newCode);
                setTimeout(() => {
                  if (textareaRef.current) {
                    textareaRef.current.selectionStart = start + 2;
                    textareaRef.current.selectionEnd = start + 2;
                  }
                }, 0);
              }
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                runCode();
              }
            }}
          />
        </div>

        {/* Terminal output */}
        <div className="border-t border-slate-700/50 bg-[#0a0e13]" style={{ minHeight: "140px", maxHeight: "200px" }}>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-slate-700/30">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Output</span>
            {isRunning && <Loader2 className="w-3 h-3 text-indigo-400 animate-spin ml-auto" />}
            {output.length > 0 && !isRunning && (
              <button
                onClick={() => setOutput([])}
                className="ml-auto text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                clear
              </button>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-full overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5"
            style={{ maxHeight: "160px" }}
          >
            {output.length === 0 && (
              <p className="text-slate-600 italic">Run code to see output • Ctrl+Enter to run</p>
            )}
            {output.map((line, i) => (
              <div
                key={i}
                className={`leading-5 whitespace-pre-wrap break-all ${
                  line.type === "stdout"
                    ? "text-green-300"
                    : line.type === "stderr"
                      ? "text-red-400"
                      : line.type === "success"
                        ? "text-emerald-400 font-semibold"
                        : line.type === "error"
                          ? "text-red-400 font-semibold"
                          : "text-slate-500"
                }`}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
