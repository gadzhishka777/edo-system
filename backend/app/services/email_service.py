# backend/app/services/email_service.py
"""Отправка писем по обращениям через SMTP (smtplib + asyncio.to_thread)."""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

from app.config import settings

logger = logging.getLogger("edo.email")


class EmailSendError(Exception):
    pass


def _build_message(
    to_email: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, bytes]] | None = None,
) -> EmailMessage:
    from_addr = settings.SMTP_FROM or settings.SMTP_USER
    msg = EmailMessage()
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, from_addr))
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    for file_name, data in (attachments or []):
        maintype, _, subtype = "application", "", "octet-stream"
        suffix = Path(file_name).suffix.lower()
        known = {
            ".pdf": ("application", "pdf"),
            ".png": ("image", "png"),
            ".jpg": ("image", "jpeg"),
            ".jpeg": ("image", "jpeg"),
            ".gif": ("image", "gif"),
            ".txt": ("text", "plain"),
            ".doc": ("application", "msword"),
            ".docx": ("application", "vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ".xls": ("application", "vnd.ms-excel"),
            ".xlsx": ("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        }
        if suffix in known:
            maintype, subtype = known[suffix]
        msg.add_attachment(
            data, maintype=maintype, subtype=subtype, filename=file_name,
        )
    return msg


def _send_sync(to_email: str, subject: str, body: str, attachments) -> None:
    msg = _build_message(to_email, subject, body, attachments)

    if settings.SMTP_PORT == 465:
        # Implicit SSL/TLS (SMTPS)
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30, context=context) as server:
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
    elif settings.SMTP_USE_TLS:
        # STARTTLS
        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
    else:
        # Без шифрования (не рекомендуется)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    attachments: list[tuple[str, bytes]] | None = None,
) -> bool:
    """Отправляет письмо. Возвращает True при успехе; False — если SMTP не настроен;
    бросает EmailSendError при ошибке отправки."""
    if not settings.smtp_configured:
        logger.warning("SMTP не настроен — письмо на %s не отправлено: %s", to_email, subject)
        return False

    try:
        await asyncio.to_thread(_send_sync, to_email, subject, body, attachments)
        return True
    except Exception as e:
        logger.error("Ошибка отправки письма на %s: %s", to_email, e)
        raise EmailSendError(str(e)) from e


def read_file_bytes(path: str | None) -> tuple[str, bytes] | None:
    """Читает файл для вложения. Возвращает (имя, байты) или None."""
    if not path or not Path(path).exists():
        return None
    p = Path(path)
    try:
        return (p.name, p.read_bytes())
    except OSError as e:
        logger.error("Не удалось прочитать файл %s: %s", path, e)
        return None
