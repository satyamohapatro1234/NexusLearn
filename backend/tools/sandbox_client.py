"""
NexusLearn Local Sandbox
========================
Replaces the DifySandbox Docker container.

Python: RestrictedPython v8 + SIGALRM timeout + rlimit memory cap.
Others: Handled in-browser via Wandbox API.

Zero Docker. Zero extra services.
Install: pip install RestrictedPython
"""

import io, os, sys, signal, resource, contextlib, logging, traceback, builtins as _builtins
from typing import Tuple

logger = logging.getLogger("LocalSandbox")

ALLOWED_IMPORTS = frozenset({
    "math", "random", "statistics",
    "collections", "itertools", "functools", "operator",
    "string", "re", "json", "datetime", "time",
    "typing", "dataclasses", "enum", "abc",
    "decimal", "fractions", "numbers",
    "heapq", "bisect", "array", "queue",
    "copy", "pprint", "textwrap",
})

TIMEOUT_SECS  = 10
MAX_MEMORY_MB = 128


# ── timeout ──────────────────────────────────────────────────────────────────

def _timeout_handler(signum, frame):
    raise TimeoutError("Code execution timed out")


# ── restricted globals ────────────────────────────────────────────────────────

def _make_restricted_globals(stdout_buf: io.StringIO) -> dict:
    try:
        from RestrictedPython import (
            safe_globals, safe_builtins, limited_builtins, utility_builtins,
        )
        from RestrictedPython.Guards import (
            safer_getattr, guarded_iter_unpack_sequence, guarded_unpack_sequence,
        )
    except ImportError:
        raise RuntimeError("RestrictedPython not installed — run: pip install RestrictedPython")

    # _print_ must be a CLASS; instantiated per exec call with _print_(globs['_getattr_'])
    class BufPrintCollector:
        def __init__(self, _getattr_=None):
            self._getattr_ = _getattr_

        def _call_print(self, *args, sep=" ", end="\n", file=None, **kwargs):
            _builtins.print(*args, sep=sep, end=end, file=stdout_buf)

        def __call__(self):
            return stdout_buf.getvalue()

    def _safe_import(name, *args, **kwargs):
        if name not in ALLOWED_IMPORTS:
            raise ImportError(f"Import of '{name}' is not allowed")
        return _builtins.__import__(name, *args, **kwargs)

    safe_bi = dict(safe_builtins)
    safe_bi.update(limited_builtins)
    safe_bi.update(utility_builtins)
    safe_bi["__import__"] = _safe_import
    safe_bi["print"] = None          # shadowed by _print_ machinery

    globs = dict(safe_globals)
    globs.update({
        "__builtins__":            safe_bi,
        "_print_":                 BufPrintCollector,
        "_getiter_":               iter,
        "_getattr_":               safer_getattr,
        "_getitem_":               lambda obj, key: obj[key],
        "_write_":                 lambda obj: obj,
        "_iter_unpack_sequence_":  guarded_iter_unpack_sequence,
        "_unpack_sequence_":       guarded_unpack_sequence,
        "_inplacevar_":            lambda op, x, y: x,   # simple no-op guard
    })
    return globs


# ── main executor ─────────────────────────────────────────────────────────────

def _run_python(code: str) -> Tuple[str, str, int]:
    """Returns (stdout, stderr, exit_code)."""
    try:
        from RestrictedPython import compile_restricted
    except ImportError:
        return "", "RestrictedPython not installed", 1

    # 1. compile
    try:
        byte_code = compile_restricted(code, filename="<student>", mode="exec")
    except SyntaxError as exc:
        return "", f"SyntaxError: {exc}", 1

    # 2. resource limits (Unix only)
    try:
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_MB * 1024 * 1024, hard))
    except Exception:
        pass

    # 3. timeout
    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(TIMEOUT_SECS)

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    exit_code  = 0

    try:
        globs = _make_restricted_globals(stdout_buf)
        exec(byte_code, globs)                          # noqa: S102
    except TimeoutError:
        stderr_buf.write(f"TimeoutError: exceeded {TIMEOUT_SECS}s limit\n")
        exit_code = 1
    except ImportError as exc:
        stderr_buf.write(f"ImportError: {exc}\n")
        exit_code = 1
    except Exception as exc:
        tb = traceback.format_exc()
        # Strip RestrictedPython internals from traceback
        lines = [l for l in tb.splitlines() if "RestrictedPython" not in l]
        stderr_buf.write("\n".join(lines) + "\n")
        exit_code = 1
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
        try:
            resource.setrlimit(resource.RLIMIT_AS, (soft, hard))
        except Exception:
            pass

    return stdout_buf.getvalue(), stderr_buf.getvalue(), exit_code


# ── public API ────────────────────────────────────────────────────────────────

def execute_code(language: str, code: str, stdin: str = "") -> dict:
    """
    Execute code in the local sandbox.
    Returns dict: {stdout, stderr, exit_code, language}
    """
    lang = language.lower()

    if lang == "python" or lang == "python3":
        stdout, stderr, exit_code = _run_python(code)
        return {
            "stdout":    stdout,
            "stderr":    stderr,
            "exit_code": exit_code,
            "language":  "python",
        }

    # Non-Python: caller should route to Wandbox or Pyodide (browser-side)
    return {
        "stdout":    "",
        "stderr":    f"Language '{language}' is handled client-side (Wandbox/Pyodide).",
        "exit_code": 0,
        "language":  language,
    }


# ── quick self-test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        ("hello world",         "print('hello world')",                         "hello world\n", ""),
        ("arithmetic",          "print(2 + 2)",                                  "4\n",           ""),
        ("multiline",           "x = 10\ny = 20\nprint(x + y)",                 "30\n",          ""),
        ("loop",                "for i in range(3):\n    print(i)",              "0\n1\n2\n",     ""),
        ("math import",         "import math\nprint(math.pi > 3)",               "True\n",        ""),
        ("os blocked",          "import os\nprint(os.getcwd())",                 "",              "ImportError"),
        ("subprocess blocked",  "import subprocess\nsubprocess.run(['ls'])",     "",              "ImportError"),
        ("syntax error",        "def foo(\n",                                     "",              "SyntaxError"),
        ("exception",           "raise ValueError('oops')",                      "",              "ValueError"),
        ("list comp",           "print([x*2 for x in range(4)])",               "[0, 2, 4, 6]\n",""),
        ("dict",                "d={'a':1}\nprint(d['a'])",                      "1\n",           ""),
        ("string ops",          "s='hello'\nprint(s.upper())",                   "HELLO\n",       ""),
    ]

    passed = 0
    for name, code, exp_out, exp_err_contains in tests:
        r = execute_code("python", code)
        ok_out = r["stdout"] == exp_out
        ok_err = exp_err_contains in r["stderr"] if exp_err_contains else True
        ok = ok_out and ok_err
        passed += ok
        status = "✅" if ok else "❌"
        print(f"{status} {name}")
        if not ok:
            print(f"   got stdout={r['stdout']!r}  stderr={r['stderr']!r}")

    print(f"\n{passed}/{len(tests)} tests passed")
