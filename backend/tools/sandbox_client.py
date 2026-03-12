"""
NexusLearn Sandbox Client
Replaces bare subprocess.run() with isolated DifySandbox execution.

DifySandbox runs as a Docker container on port 8194.
Uses Linux Seccomp whitelist — blocks all unauthorized syscalls.
Students cannot escape the container, touch the host filesystem, or
make network calls.

Start sandbox:
    docker run -d --name nexuslearn-sandbox -p 8194:8194 \\
        --privileged langgenius/dify-sandbox:latest
"""

import requests
import logging
from typing import Tuple

logger = logging.getLogger("SandboxClient")

SANDBOX_URL = "http://localhost:8194/v1/sandbox/run"
SANDBOX_TIMEOUT = 20  # HTTP request timeout (sandbox itself enforces code timeout)

# Language name normalization
LANG_MAP = {
    "python": "python3",
    "python3": "python3",
    "py": "python3",
    "javascript": "nodejs",
    "js": "nodejs",
    "nodejs": "nodejs",
    "node": "nodejs",
}


def run_code(
    code: str,
    language: str = "python3",
    timeout: int = 10,
) -> Tuple[str, str, int]:
    """
    Execute code in the isolated DifySandbox container.

    Args:
        code: Source code to execute
        language: Language identifier (python3, nodejs)
        timeout: Max execution time in seconds

    Returns:
        (stdout, stderr, exit_code)
    """
    lang = LANG_MAP.get(language.lower(), "python3")

    payload = {
        "language": lang,
        "code": code,
        "enable_network": False,
        "timeout": timeout,
    }

    try:
        resp = requests.post(SANDBOX_URL, json=payload, timeout=SANDBOX_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return (
            data.get("stdout", ""),
            data.get("stderr", ""),
            data.get("exit_code", 0),
        )
    except requests.exceptions.ConnectionError:
        msg = (
            "⚠️ Sandbox unavailable. Start it with:\n"
            "docker run -d --name nexuslearn-sandbox -p 8194:8194 "
            "--privileged langgenius/dify-sandbox:latest"
        )
        logger.error(msg)
        return "", msg, -1
    except requests.exceptions.Timeout:
        return "", "Sandbox request timed out", -1
    except Exception as e:
        logger.error(f"Sandbox error: {e}")
        return "", f"Sandbox error: {e}", -1


def is_available() -> bool:
    """Check if the sandbox service is reachable."""
    try:
        resp = requests.get("http://localhost:8194/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False
