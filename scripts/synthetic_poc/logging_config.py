"""Structured, redacting logger.

Emits one JSON object per line. A redaction filter scrubs anything that looks
like a bearer token or a Databricks PAT (dapi...) so secrets never reach logs.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime, timezone

_SECRET_PATTERNS = [
    re.compile(r"dapi[0-9a-f]{16,}", re.I),
    re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.I),
    re.compile(r"(?i)(token|secret|password|authorization)\s*[=:]\s*\S+"),
]


def _redact(text: str) -> str:
    out = text
    for pat in _SECRET_PATTERNS:
        out = pat.sub("<REDACTED_SECRET>", out)
    return out


class _JsonRedactingFormatter(logging.Formatter):
    def __init__(self, run_id: str):
        super().__init__()
        self.run_id = run_id

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "run_id": self.run_id,
            "logger": record.name,
            "msg": _redact(record.getMessage()),
        }
        if record.exc_info:
            payload["exc"] = _redact(self.formatException(record.exc_info))
        for k, v in getattr(record, "extra_fields", {}).items():
            payload[k] = _redact(v) if isinstance(v, str) else v
        return json.dumps(payload, ensure_ascii=False)


def get_logger(run_id: str, level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("synthetic_poc")
    logger.setLevel(level)
    logger.handlers.clear()
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(_JsonRedactingFormatter(run_id))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


def log(logger: logging.Logger, level: int, msg: str, **fields) -> None:
    logger.log(level, msg, extra={"extra_fields": fields})
