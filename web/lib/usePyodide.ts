"use client";

/**
 * usePyodide — React hook for running Python in a Web Worker via Pyodide WASM.
 *
 * Usage:
 *   const { runPython, status } = usePyodide();
 *   const result = await runPython(code, stdin);
 *
 * status: "loading" | "ready" | "running" | "error"
 *
 * The worker is a singleton — created once, reused for all runs.
 * Pyodide loads once on first use (or eagerly on mount).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { CodeRunResult } from "@/lib/piston";

export type PyodideStatus = "loading" | "ready" | "running" | "error";

interface PendingRun {
  resolve: (result: CodeRunResult) => void;
  reject: (err: Error) => void;
}

// Singleton worker shared across all hook instances
let sharedWorker: Worker | null = null;
let workerReady = false;
const pendingMap = new Map<string, PendingRun>();
let readyCallbacks: Array<() => void> = [];

function getWorker(): Worker {
  if (sharedWorker) return sharedWorker;

  if (typeof window === "undefined") {
    throw new Error("Pyodide worker only available in browser");
  }

  sharedWorker = new Worker("/pyodide-worker.js");

  sharedWorker.onmessage = (event) => {
    const { id, stdout, stderr, exitCode, elapsedMs, ready, error } =
      event.data;

    if (id === "__init__") {
      workerReady = ready;
      if (ready) {
        readyCallbacks.forEach((cb) => cb());
        readyCallbacks = [];
      }
      return;
    }

    const pending = pendingMap.get(id);
    if (!pending) return;
    pendingMap.delete(id);

    pending.resolve({
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      compileError: "",
      exitCode: exitCode ?? 0,
      elapsedMs: elapsedMs ?? 0,
    });
  };

  sharedWorker.onerror = (err) => {
    // Reject all pending
    pendingMap.forEach(({ reject }) =>
      reject(new Error(err.message || "Worker error"))
    );
    pendingMap.clear();
    workerReady = false;
    sharedWorker = null;
  };

  // Kick off Pyodide initialisation immediately
  sharedWorker.postMessage({ id: "__init__" });

  return sharedWorker;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePyodide() {
  const [status, setStatus] = useState<PyodideStatus>("loading");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Eagerly warm up the worker
    if (typeof window !== "undefined") {
      try {
        const worker = getWorker();

        if (workerReady) {
          setStatus("ready");
        } else {
          const onReady = () => {
            if (mountedRef.current) setStatus("ready");
          };
          readyCallbacks.push(onReady);

          // Also listen for error state
          const origError = worker.onerror;
          worker.onerror = (err) => {
            if (mountedRef.current) setStatus("error");
            if (origError) origError.call(worker, err);
          };
        }
      } catch (err) {
        setStatus("error");
      }
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runPython = useCallback(
    async (code: string, stdin?: string): Promise<CodeRunResult> => {
      if (status !== "ready" && status !== "running") {
        // Wait for ready if still loading
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Pyodide load timeout")),
            30_000
          );
          readyCallbacks.push(() => {
            clearTimeout(timeout);
            resolve();
          });
          if (workerReady) {
            clearTimeout(timeout);
            resolve();
          }
        });
      }

      if (mountedRef.current) setStatus("running");

      const id = `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const worker = getWorker();

      return new Promise<CodeRunResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingMap.delete(id);
          if (mountedRef.current) setStatus("ready");
          resolve({
            stdout: "",
            stderr: "⏱ Execution timed out (15s limit)",
            compileError: "",
            exitCode: 1,
            elapsedMs: 15_000,
          });
        }, 15_000);

        pendingMap.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            if (mountedRef.current) setStatus("ready");
            resolve(result);
          },
          reject: (err) => {
            clearTimeout(timeout);
            if (mountedRef.current) setStatus("error");
            reject(err);
          },
        });

        worker.postMessage({ id, code, stdin });
      });
    },
    [status]
  );

  return { runPython, status };
}
