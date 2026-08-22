# backend/app/core/stdio_utf8.py
"""Гарантирует UTF-8 для stdout/stderr независимо от локали окружения.

На проде (systemd/docker без LANG) stdout может быть в ASCII/cp1251 — тогда
любой print с кириллицей или эмодзи роняет процесс с UnicodeEncodeError
и приложение не поднимается (502 за nginx). Вызовите fix() до первого print().
"""
import io
import sys


def fix() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        encoding = (getattr(stream, "encoding", "") or "").lower()
        if encoding.replace("-", "") != "utf8":
            try:
                buffered = getattr(stream, "buffer", None)
                if buffered is not None:
                    setattr(
                        sys,
                        stream_name,
                        io.TextIOWrapper(buffered, encoding="utf-8", errors="replace"),
                    )
            except Exception:
                # Если обернуть не удалось — просто не падаем на печати:
                pass
