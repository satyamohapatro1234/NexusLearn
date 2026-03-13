/**
 * NexusLearn — Pyodide Web Worker
 *
 * Runs CPython (WebAssembly) in a background thread.
 * Receives { id, code, stdin } messages.
 * Sends back  { id, stdout, stderr, exitCode, elapsedMs } messages.
 *
 * Pyodide loads once and stays warm — subsequent runs are instant.
 */

/* global loadPyodide, importScripts */

let pyodide = null;
let loading = false;
let loadQueue = [];

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function initPyodide() {
  if (pyodide) return pyodide;
  if (loading) {
    return new Promise((resolve) => loadQueue.push(resolve));
  }
  loading = true;

  importScripts("https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js");

  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/",
  });

  // Pre-load commonly needed packages so first run is faster
  await pyodide.loadPackagesFromImports(`
import sys, math, random, collections, itertools, json, re, datetime
  `).catch(() => {});

  loading = false;
  loadQueue.forEach((resolve) => resolve(pyodide));
  loadQueue = [];
  return pyodide;
}

// ── Message handler ──────────────────────────────────────────────────────────
self.onmessage = async function (event) {
  const { id, code, stdin, packages } = event.data;

  // Special init ping — preload Pyodide before user clicks Run
  if (id === "__init__") {
    try {
      await initPyodide();
      self.postMessage({ id: "__init__", ready: true });
    } catch (err) {
      self.postMessage({ id: "__init__", ready: false, error: err.message });
    }
    return;
  }

  const t0 = performance.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const py = await initPyodide();

    // Redirect stdout/stderr to JS strings
    py.runPython(`
import sys, io
_stdout_capture = io.StringIO()
_stderr_capture = io.StringIO()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
`);

    // Install any extra packages the user imports (micropip)
    if (packages && packages.length > 0) {
      await py.loadPackagesFromImports(code).catch(() => {});
    } else {
      // Auto-detect imports and load matching Pyodide packages
      try {
        await py.loadPackagesFromImports(code);
      } catch (_) {
        // Non-fatal — standard library is always available
      }
    }

    // Provide stdin as a readable StringIO if given
    if (stdin) {
      py.runPython(`
import io as _io
sys.stdin = _io.StringIO(${JSON.stringify(stdin)})
`);
    }

    // Execute student code
    py.runPython(code);

    // Collect output
    stdout = py.runPython("_stdout_capture.getvalue()");
    stderr = py.runPython("_stderr_capture.getvalue()");

  } catch (err) {
    // Python exceptions come through here
    try {
      if (pyodide) {
        stderr = pyodide.runPython("_stderr_capture.getvalue()") || "";
      }
    } catch (_) {}

    // Append the actual Python traceback
    const tb = err.message || String(err);
    stderr = (stderr ? stderr + "\n" : "") + tb;
    exitCode = 1;
  } finally {
    // Always restore stdout/stderr so Pyodide internals still work
    try {
      if (pyodide) {
        pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
      }
    } catch (_) {}
  }

  const elapsedMs = Math.round(performance.now() - t0);

  self.postMessage({ id, stdout, stderr, exitCode, elapsedMs });
};
