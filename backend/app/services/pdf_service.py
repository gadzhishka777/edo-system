import os
import logging
from io import BytesIO
from pathlib import Path
from typing import Optional
from datetime import datetime

from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import httpx

from app.config import BASE_DIR
from app.core.time import now_naive

logger = logging.getLogger(__name__)

# Регистрируем шрифт с поддержкой кириллицы
try:
    font_paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        'C:/Windows/Fonts/arial.ttf',
    ]
    for path in font_paths:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont('DejaVu', path))
            break
except Exception:
    pass


def generate_signed_copy(
    original_pdf: bytes,
    verification_data: dict,
    signature_type,
    stamp_x: int = 100,
    stamp_y: int = 50,
    stamp_size: int = 100,
    stamp_url: Optional[str] = None,
    stamp_page: int = 1,
    preview_width: int = 600,
) -> bytes:
    """
    Генерация PDF-копии со штампом.

    Координаты stamp_x / stamp_y — пиксели в превью фронтенда.
    preview_width — ширина отрендеренной страницы в превью (в пикселях).
    stamp_page — номер страницы (1-based).
    """

    # Получаем размер страницы оригинального PDF
    reader = PdfReader(BytesIO(original_pdf))
    page_index = min(stamp_page - 1, len(reader.pages) - 1)
    page = reader.pages[page_index]
    page_width_pt = float(page.mediabox.width)
    page_height_pt = float(page.mediabox.height)

    stamp_buffer = create_stamp_pdf(
        verification_data,
        signature_type,
        stamp_x,
        stamp_y,
        stamp_size,
        stamp_url,
        page_width_pt,
        page_height_pt,
        preview_width,
    )
    result = overlay_stamp_on_pdf(original_pdf, stamp_buffer, page_index)
    return result


def _validate_stamp_url(stamp_url: str) -> bool:
    """
    SSRF-защита: URL штампа разрешён только если
      - схема http/https;
      - нет userinfo (user@host);
      - хост в allowlist STAMP_URL_ALLOWED_HOSTS (если задан);
      - ВСЕ IP-адреса хоста — публичные (приватные/loopback/link-local запрещены).
    """
    from urllib.parse import urlparse
    import ipaddress
    import socket

    try:
        parsed = urlparse(stamp_url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname or len(stamp_url) > 500:
        return False
    if parsed.username or parsed.password:
        return False

    allowlist = [h.strip().lower() for h in os.getenv("STAMP_URL_ALLOWED_HOSTS", "").split(",") if h.strip()]
    host = parsed.hostname.lower()
    if allowlist and host not in allowlist:
        return False

    # Хост-литерал IP проверяем напрямую, доменное имя — по всем A/AAAA записям.
    try:
        addr_candidates = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, None)
        except OSError:
            return False
        addr_candidates = []
        for info in infos:
            try:
                addr_candidates.append(ipaddress.ip_address(info[4][0]))
            except ValueError:
                return False

    for addr in addr_candidates:
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
            or addr.is_unspecified
        ):
            return False
    return True


def _load_stamp_image(stamp_url: str):
    """Загружает изображение штампа из разрешённого URL или из каталога штампов."""
    if stamp_url.startswith('http'):
        if not _validate_stamp_url(stamp_url):
            logger.warning("SSRF-защита: отказ загрузки штампа с URL %s", stamp_url[:200])
            return None
        try:
            with httpx.get(stamp_url, timeout=10, follow_redirects=False) as response:
                if response.status_code != 200:
                    logger.warning("Штамп недоступен: HTTP %s от %s", response.status_code, stamp_url[:200])
                    return None
                content_type = response.headers.get("content-type", "")
                if not content_type.startswith("image/") or len(response.content) > 5 * 1024 * 1024:
                    logger.warning("Штамп отклонён: content-type=%s, size=%s", content_type, len(response.content))
                    return None
                return ImageReader(BytesIO(response.content))
        except httpx.HTTPError as e:
            logger.warning("Ошибка загрузки штампа %s: %s", stamp_url[:200], e)
            return None

    # Локальный путь — ТОЛЬКО внутри каталога штампов frontend/public.
    # Чтение произвольных файлов по абсолютному пути запрещено.
    img_path = stamp_url.lstrip('/')
    public_root = (Path(BASE_DIR).parent / 'frontend' / 'public').resolve()
    public_path = (public_root / img_path).resolve()
    if str(public_path).startswith(str(public_root) + os.sep) and public_path.is_file():
        return ImageReader(str(public_path))

    logger.warning(f"Изображение штампа не найдено или вне каталога штампов: {stamp_url} (корень: {public_root})")
    return None


def create_stamp_pdf(
    verification_data: dict,
    signature_type,
    stamp_x_px: int = 100,
    stamp_y_px: int = 50,
    stamp_size: int = 100,
    stamp_url: Optional[str] = None,
    page_width_pt: float = 595.0,
    page_height_pt: float = 842.0,
    preview_width_px: int = 600,
) -> BytesIO:
    """
    Создание PDF со штампом (кастомный или текстовый).

    Создаёт canvas того же размера, что и страница оригинала,
    конвертирует пиксели превью в точки PDF.
    """

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(page_width_pt, page_height_pt))

    # Масштаб: соотношение между превью и реальным PDF
    scale = preview_width_px / page_width_pt if preview_width_px > 0 else 1.0

    # Конвертируем пиксели превью в точки PDF
    x_pt = stamp_x_px / scale
    # PDF Y считается снизу, веб Y — сверху → инвертируем и вычитаем высоту штампа
    scale_factor = stamp_size / 100.0
    stamp_width_pt = 150 * mm * scale_factor
    stamp_height_pt = 80 * mm * scale_factor
    y_pt = page_height_pt - (stamp_y_px / scale) - stamp_height_pt

    # --- Кастомный штамп (изображение) ---
    if stamp_url:
        try:
            img = _load_stamp_image(stamp_url)
            if img:
                c.drawImage(
                    img, x_pt, y_pt,
                    width=stamp_width_pt, height=stamp_height_pt,
                    preserveAspectRatio=True, mask='auto',
                )
                c.save()
                buffer.seek(0)
                logger.info(f"Кастомный штамп наложен: позиция ({x_pt:.1f}, {y_pt:.1f}) pt")
                return buffer
        except Exception as e:
            logger.warning(f"Ошибка загрузки кастомного штампа: {e}, используется текстовый")

    # --- Текстовый штамп ---
    # Фон
    c.setFillColorRGB(1, 1, 0.9, alpha=0.92)
    c.roundRect(x_pt, y_pt, stamp_width_pt, stamp_height_pt, 4, fill=1, stroke=0)

    # Рамка
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1)
    c.roundRect(x_pt, y_pt, stamp_width_pt, stamp_height_pt, 4, fill=0, stroke=1)

    # Заголовок
    try:
        c.setFont('DejaVu', 11 * scale_factor)
    except Exception:
        c.setFont('Helvetica', 11 * scale_factor)

    c.setFillColorRGB(0, 0, 0)
    c.drawString(x_pt + 10, y_pt + stamp_height_pt - 15, "Документ подписан электронной подписью")

    # Тип подписи
    try:
        c.setFont('DejaVu', 9 * scale_factor)
    except Exception:
        c.setFont('Helvetica', 9 * scale_factor)

    type_labels = {
        "PEP": "ПЭП (простая ЭП)",
        "UNEP": "УНЭП (усиленная неквалифицированная)",
        "UKEP": "УКЭП (усиленная квалифицированная)",
        "none": "Без подписи",
    }
    type_label = type_labels.get(str(signature_type), "Неизвестно")
    c.drawString(x_pt + 10, y_pt + stamp_height_pt - 30, f"Тип: {type_label}")

    # Подписант
    signer_name = verification_data.get('signer_name', 'Неизвестно')
    c.drawString(x_pt + 10, y_pt + stamp_height_pt - 44, f"Подписант: {signer_name}")

    # ИНН
    signer_inn = verification_data.get('signer_inn', '')
    if signer_inn:
        c.drawString(x_pt + 10, y_pt + stamp_height_pt - 58, f"ИНН: {signer_inn}")

    # Статус
    is_valid = verification_data.get('signature_valid', False)
    if is_valid:
        c.setFillColorRGB(0, 0.6, 0)  # зелёный
    else:
        c.setFillColorRGB(0.8, 0, 0)  # красный
    c.setFont('Helvetica-Bold', 10 * scale_factor)
    status_text = "ДЕЙСТВИТЕЛЬНА" if is_valid else "НЕДЕЙСТВИТЕЛЬНА"
    c.drawString(x_pt + stamp_width_pt - 90, y_pt + 12, status_text)

    # Дата создания
    c.setFont('Helvetica', 7 * scale_factor)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawString(x_pt + 10, y_pt + 10, f"Создана: {now_naive().strftime('%d.%m.%Y %H:%M')}")

    c.save()
    buffer.seek(0)
    logger.info(f"Текстовый штамп создан: позиция ({x_pt:.1f}, {y_pt:.1f}) pt, страница {page_width_pt}x{page_height_pt}")
    return buffer


def overlay_stamp_on_pdf(
    original_pdf: bytes,
    stamp_buffer: BytesIO,
    target_page: int = 0,
) -> bytes:
    """Наложение штампа на указанную страницу PDF (0-based)."""

    reader = PdfReader(BytesIO(original_pdf))
    writer = PdfWriter()

    stamp_reader = PdfReader(stamp_buffer)
    stamp_page = stamp_reader.pages[0]

    page_idx = min(target_page, len(reader.pages) - 1)

    for i, page in enumerate(reader.pages):
        if i == page_idx:
            page.merge_page(stamp_page)
        writer.add_page(page)

    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output.getvalue()