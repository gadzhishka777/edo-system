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


def _load_stamp_image(stamp_url: str):
    """Загружает изображение штампа из URL или локального пути."""
    if stamp_url.startswith('http'):
        response = httpx.get(stamp_url, timeout=10)
        return ImageReader(BytesIO(response.content))

    # Локальный путь — ищем относительно frontend/public
    img_path = stamp_url.lstrip('/')
    # BASE_DIR = backend/, parent = корень проекта
    public_path = Path(BASE_DIR).parent / 'frontend' / 'public' / img_path
    if public_path.exists():
        return ImageReader(str(public_path))

    # Также пробуем как абсолютный путь
    if os.path.exists(stamp_url):
        return ImageReader(stamp_url)

    logger.warning(f"Изображение штампа не найдено: {stamp_url} (искали в {public_path})")
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
    c.drawString(x_pt + 10, y_pt + 10, f"Создана: {datetime.now().strftime('%d.%m.%Y %H:%M')}")

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