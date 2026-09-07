# backend/app/services/appeal_email.py
"""Красивые HTML-письма заявителю по обращениям.

Один общий шаблон: шапка ТОР ЭДО, блоки «Кому/От», формулировка события,
таблица реквизитов обращения и подвал. Текстовая версия формируется автоматически
для почтовых клиентов, которые не показывают HTML.
"""
import html as html_lib
import logging
from datetime import datetime
from typing import Optional

from app.services.email_service import send_email

logger = logging.getLogger("edo.appeal_email")

APPEAL_SITE_URL = "https://toredo.mroo-snpm.ru/appeal"
PLATFORM_NAME = "Единый цифровой портал обратной связи"

_MONTHS_GEN = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def esc(value) -> str:
    return html_lib.escape(str(value if value is not None else ""), quote=True)


def date_words(d: Optional[datetime]) -> str:
    """7 сентября 2026 г."""
    if not d:
        return "—"
    return f"{d.day} {_MONTHS_GEN[d.month - 1]} {d.year} г."


def date_short(d: Optional[datetime]) -> str:
    """07.09.2026"""
    return d.strftime("%d.%m.%Y") if d else "—"


def nl2br(text: str) -> str:
    return esc(text).replace("\n", "<br />")


# ===== Шаблон письма =====
# Плейсхолдеры вместо f-строк: в CSS много фигурных скобок.
_TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0; padding:0; background:#f4f6fb;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f6fb; padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; font-family:'Segoe UI',Roboto,Arial,sans-serif; border:1px solid #e6e9f2;">

          <tr>
            <td style="background:#2b3858; padding:20px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color:#ffffff; font-size:18px; font-weight:700; letter-spacing:0.3px;">ТОР ЭДО</td>
                  <td align="right" style="color:#a9b6d4; font-size:11px;">__PLATFORM__</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="height:4px; background:#4794ff; font-size:0; line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <div style="color:#101025; font-size:20px; font-weight:700; line-height:1.3;">__HEADING__</div>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 0 32px;">
              <div style="color:#5a5a72; font-size:13px; line-height:1.7;">
                <div><span style="color:#87879b;">Кому:</span> <span style="color:#101025;">__TO_NAME__</span></div>
                <div><span style="color:#87879b;">От:</span> <span style="color:#101025;">__ORG_NAME__</span></div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;">
              <div style="color:#101025; font-size:15px; line-height:1.6;">__LEAD__</div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f8fc; border:1px solid #e6e9f2; border-radius:10px;">
__ROWS__
              </table>
            </td>
          </tr>

__BODY__

          <tr>
            <td style="padding:24px 32px 28px 32px;">
              <div style="border-top:1px solid #e6e9f2; padding-top:16px; color:#87879b; font-size:12px; line-height:1.6;">
                Не отвечайте на это письмо — оно отправлено автоматически.<br />
                Для формирования нового обращения перейдите на сайт:
                <a href="__SITE__" style="color:#4794ff; text-decoration:none;">__SITE__</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

_ROW = """                <tr>
                  <td style="padding:10px 16px; color:#87879b; font-size:13px; white-space:nowrap; vertical-align:top; width:1%;">__LABEL__</td>
                  <td style="padding:10px 16px; color:#101025; font-size:14px; font-weight:600; vertical-align:top;">__VALUE__</td>
                </tr>"""

_BODY_BLOCK = """          <tr>
            <td style="padding:20px 32px 0 32px;">
              <div style="border-left:3px solid #4794ff; background:#f7f8fc; padding:14px 16px; border-radius:0 8px 8px 0; color:#101025; font-size:14px; line-height:1.65;">
__TEXT__
              </div>
            </td>
          </tr>"""


def render_appeal_email(
    *,
    heading: str,
    to_name: str,
    org_name: str,
    lead: str,
    rows: list[tuple[str, str]],
    body_text: Optional[str] = None,
) -> str:
    """Собирает HTML письма. rows — список («подпись», «значение»)."""
    rows_html = "\n".join(
        _ROW.replace("__LABEL__", esc(label)).replace("__VALUE__", esc(value))
        for label, value in rows if value not in (None, "")
    )
    body_html = (
        _BODY_BLOCK.replace("__TEXT__", nl2br(body_text)) if body_text else ""
    )
    return (
        _TEMPLATE
        .replace("__PLATFORM__", esc(PLATFORM_NAME))
        .replace("__HEADING__", esc(heading))
        .replace("__TO_NAME__", esc(to_name))
        .replace("__ORG_NAME__", esc(org_name))
        .replace("__LEAD__", nl2br(lead))
        .replace("__ROWS__", rows_html)
        .replace("__BODY__", body_html)
        .replace("__SITE__", APPEAL_SITE_URL)
    )


def plain_text(
    *,
    heading: str,
    to_name: str,
    org_name: str,
    lead: str,
    rows: list[tuple[str, str]],
    body_text: Optional[str] = None,
) -> str:
    """Текстовая версия того же письма (fallback для клиентов без HTML)."""
    lines = [
        heading,
        "",
        f"Кому: {to_name}",
        f"От: {org_name}",
        "",
        lead,
        "",
    ]
    lines += [f"{label}: {value}" for label, value in rows if value not in (None, "")]
    if body_text:
        lines += ["", body_text]
    lines += [
        "",
        "Не отвечайте на это письмо — оно отправлено автоматически.",
        f"Для формирования нового обращения перейдите на сайт: {APPEAL_SITE_URL}",
    ]
    return "\n".join(lines)


async def send_appeal_email(
    *,
    to_email: str,
    subject: str,
    heading: str,
    to_name: str,
    org_name: str,
    lead: str,
    rows: list[tuple[str, str]],
    body_text: Optional[str] = None,
    attachments: list[tuple[str, bytes]] | None = None,
) -> bool:
    """Отправляет письмо заявителю. Сбой почты не должен ломать процесс."""
    text = plain_text(
        heading=heading, to_name=to_name, org_name=org_name,
        lead=lead, rows=rows, body_text=body_text,
    )
    html = render_appeal_email(
        heading=heading, to_name=to_name, org_name=org_name,
        lead=lead, rows=rows, body_text=body_text,
    )
    return await send_email(
        to_email=to_email,
        subject=subject,
        body=text,
        attachments=attachments,
        html=html,
    )
