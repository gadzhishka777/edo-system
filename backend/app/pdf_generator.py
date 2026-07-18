"""
Модуль генерации PDF с наложением штампа электронной подписи
Поддерживает произвольное позиционирование штампа
"""

import os
import logging
from io import BytesIO
from datetime import datetime
from typing import Optional, Tuple, List

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, A3, letter, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color, black, white, red, blue, green, yellow
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from PyPDF2 import PdfReader, PdfWriter

from app.config import DEFAULT_STAMP_X, DEFAULT_STAMP_Y

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Пути к шрифтам (поддержка кириллицы)
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
    "C:/Windows/Fonts/arial.ttf",  # Windows
    "C:/Windows/Fonts/times.ttf",  # Windows
    "/System/Library/Fonts/Helvetica.ttc",  # macOS
]

# Регистрация шрифта
_REGISTERED_FONT = None


def register_font() -> str:
    """
    Регистрирует шрифт с поддержкой кириллицы
    """
    global _REGISTERED_FONT
    
    if _REGISTERED_FONT:
        return _REGISTERED_FONT
    
    for font_path in FONT_PATHS:
        try:
            if os.path.exists(font_path):
                font_name = os.path.splitext(os.path.basename(font_path))[0]
                pdfmetrics.registerFont(TTFont(font_name, font_path))
                _REGISTERED_FONT = font_name
                logger.info(f"Шрифт зарегистрирован: {font_name} из {font_path}")
                return font_name
        except Exception as e:
            logger.warning(f"Не удалось загрузить шрифт {font_path}: {e}")
            continue
    
    # Fallback
    _REGISTERED_FONT = 'Helvetica'
    logger.warning("Используется стандартный шрифт Helvetica (без поддержки кириллицы)")
    return _REGISTERED_FONT


def create_stamp_pdf(
    verification_data: dict,
    position_x: int = DEFAULT_STAMP_X,
    position_y: int = DEFAULT_STAMP_Y,
    page_size: str = "A4",
    stamp_width_mm: int = 150,
    stamp_height_mm: int = 65,
    opacity: float = 0.92,
    language: str = "ru"
) -> BytesIO:
    """
    Создаёт PDF-файл только со штампом для последующего наложения
    
    Args:
        verification_data: данные проверки подписи
        position_x: координата X в мм
        position_y: координата Y в мм
        page_size: размер страницы (A4, A3, Letter)
        stamp_width_mm: ширина штампа в мм
        stamp_height_mm: высота штампа в мм
        opacity: прозрачность (0-1)
        language: язык (ru/en)
    
    Returns:
        BytesIO с PDF-файлом штампа
    """
    
    # Регистрируем шрифт
    font_name = register_font()
    
    # Определяем размер страницы
    page_sizes = {
        "A4": A4,
        "A4_LANDSCAPE": landscape(A4),
        "A3": A3,
        "A3_LANDSCAPE": landscape(A3),
        "LETTER": letter,
    }
    width, height = page_sizes.get(page_size.upper(), A4)
    
    # Создаём буфер для PDF
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width, height))
    
    # Переводим мм в точки (1 мм = 2.83465 pt)
    x_pt = position_x * 2.83465
    y_pt = position_y * 2.83465
    stamp_width_pt = stamp_width_mm * 2.83465
    stamp_height_pt = stamp_height_mm * 2.83465
    
    # --- Рисуем фон штампа (полупрозрачный) ---
    if opacity < 1.0:
        # Прозрачный фон
        c.setFillColorRGB(1.0, 1.0, 0.85, alpha=opacity)
    else:
        c.setFillColorRGB(1.0, 1.0, 0.85)
    
    # Закруглённые углы
    corner_radius = 5
    
    # Рисуем прямоугольник с закруглёнными углами
    c.roundRect(
        x_pt, y_pt,
        stamp_width_pt, stamp_height_pt,
        corner_radius,
        fill=1, stroke=0
    )
    
    # --- Рисуем рамку ---
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.5)
    c.roundRect(
        x_pt, y_pt,
        stamp_width_pt, stamp_height_pt,
        corner_radius,
        fill=0, stroke=1
    )
    
    # --- Двойная рамка (для красоты) ---
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(0.5)
    c.roundRect(
        x_pt + 4, y_pt + 4,
        stamp_width_pt - 8, stamp_height_pt - 8,
        corner_radius - 1,
        fill=0, stroke=1
    )
    
    # --- Текст штампа ---
    c.setFillColorRGB(0, 0, 0)
    c.setFont(font_name, 11)
    
    # Определяем тексты в зависимости от языка
    if language == "en":
        title_text = "DOCUMENT SIGNED"
        subtitle_text = "WITH ELECTRONIC SIGNATURE"
        status_valid = "VALID"
        status_invalid = "INVALID"
        signed_by = "Signed by:"
        date_label = "Date:"
        inn_label = "INN:"
        status_label = "Status:"
        cert_label = "Certificate:"
        generated_label = "Generated:"
    else:
        title_text = "Документ подписан"
        subtitle_text = "электронной подписью"
        status_valid = "ДЕЙСТВИТЕЛЬНА"
        status_invalid = "НЕДЕЙСТВИТЕЛЬНА"
        signed_by = "Подписал:"
        date_label = "Дата:"
        inn_label = "ИНН:"
        status_label = "Статус:"
        cert_label = "Сертификат:"
        generated_label = "Создан:"
    
    # Основной заголовок
    c.setFont(font_name, 13)
    c.drawString(x_pt + 10, y_pt + stamp_height_pt - 12, title_text)
    
    c.setFont(font_name, 10)
    c.drawString(x_pt + 10, y_pt + stamp_height_pt - 26, subtitle_text)
    
    # Горизонтальная разделительная линия
    c.setStrokeColorRGB(0.5, 0.5, 0.5)
    c.setLineWidth(0.5)
    c.line(
        x_pt + 10,
        y_pt + stamp_height_pt - 30,
        x_pt + stamp_width_pt - 10,
        y_pt + stamp_height_pt - 30
    )
    
    # Информация о подписанте
    y_offset = y_pt + stamp_height_pt - 40
    c.setFont(font_name, 9)
    c.setFillColorRGB(0, 0, 0)
    
    signer_name = verification_data.get('signer_name', 'Неизвестно')
    signer_inn = verification_data.get('signer_inn', '')
    sign_date = verification_data.get('signature_date', '')
    if len(sign_date) > 10:
        sign_date = sign_date[:10]
    
    is_valid = verification_data.get('signature_valid', False)
    status_text = status_valid if is_valid else status_invalid
    
    # Выводим информацию
    c.drawString(x_pt + 10, y_offset, f"{signed_by} {signer_name}")
    y_offset -= 14
    
    c.drawString(x_pt + 10, y_offset, f"{inn_label} {signer_inn}")
    y_offset -= 14
    
    c.drawString(x_pt + 10, y_offset, f"{date_label} {sign_date}")
    y_offset -= 14
    
    # Статус (цветной)
    if is_valid:
        c.setFillColorRGB(0, 0.6, 0)  # зелёный
    else:
        c.setFillColorRGB(0.8, 0, 0)  # красный
    
    c.setFont(font_name, 10)
    c.drawString(x_pt + 10, y_offset, f"{status_label} {status_text}")
    
    # --- Нижняя часть штампа ---
    y_offset -= 10
    c.setFont(font_name, 7)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    
    cert_serial = verification_data.get('certificate_serial', '')
    c.drawString(x_pt + 10, y_offset, f"{cert_label} {cert_serial[:20]}")
    
    # Время создания визуализации
    created_time = datetime.now().strftime('%d.%m.%Y %H:%M')
    c.drawRightString(
        x_pt + stamp_width_pt - 10,
        y_offset,
        f"{generated_label} {created_time}"
    )
    
    # --- Иконка (галочка или крестик) ---
    icon_x = x_pt + stamp_width_pt - 25
    icon_y = y_pt + stamp_height_pt - 22
    icon_size = 14
    
    if is_valid:
        # Зелёная галочка
        c.setFillColorRGB(0, 0.7, 0)
        c.setFont(font_name, 16)
        c.drawString(icon_x, icon_y, "✓")
    else:
        # Красный крестик
        c.setFillColorRGB(0.8, 0, 0)
        c.setFont(font_name, 16)
        c.drawString(icon_x, icon_y, "✗")
    
    # Завершаем PDF
    c.save()
    buffer.seek(0)
    
    logger.info(f"Штамп создан: позиция ({position_x}, {position_y}), статус: {is_valid}")
    return buffer


def overlay_stamp_on_pdf(
    original_pdf_bytes: bytes,
    stamp_pdf_buffer: BytesIO,
    page_number: int = 0,
    stamp_page_only: bool = False
) -> bytes:
    """
    Накладывает штамп на указанную страницу исходного PDF
    
    Args:
        original_pdf_bytes: исходный PDF в байтах
        stamp_pdf_buffer: PDF со штампом
        page_number: номер страницы (0 - первая, -1 - последняя)
        stamp_page_only: если True, заменяет страницу, а не накладывает
    
    Returns:
        bytes: готовый PDF с наложенным штампом
    """
    
    try:
        # Открываем исходный PDF
        reader = PdfReader(BytesIO(original_pdf_bytes))
        writer = PdfWriter()
        
        # Открываем PDF со штампом
        stamp_reader = PdfReader(stamp_pdf_buffer)
        stamp_page = stamp_reader.pages[0]
        
        # Определяем номер страницы
        total_pages = len(reader.pages)
        if page_number == -1:
            target_page = total_pages - 1
        else:
            target_page = min(page_number, total_pages - 1)
        
        logger.info(f"Наложение штампа на страницу {target_page + 1} из {total_pages}")
        
        # Обрабатываем каждую страницу
        for i, page in enumerate(reader.pages):
            if i == target_page:
                if stamp_page_only:
                    # Заменяем страницу
                    writer.add_page(stamp_page)
                else:
                    # Накладываем штамп на страницу
                    page.merge_page(stamp_page)
                    writer.add_page(page)
            else:
                writer.add_page(page)
        
        # Сохраняем результат
        output_buffer = BytesIO()
        writer.write(output_buffer)
        output_buffer.seek(0)
        
        logger.info(f"PDF успешно создан, страниц: {total_pages}")
        return output_buffer.getvalue()
        
    except Exception as e:
        logger.error(f"Ошибка при наложении штампа: {str(e)}")
        raise


def generate_visualized_pdf(
    original_document: bytes,
    verification_data: dict,
    stamp_position: Tuple[int, int] = (DEFAULT_STAMP_X, DEFAULT_STAMP_Y),
    page_number: int = 0,
    stamp_width: int = 150,
    stamp_height: int = 65,
    opacity: float = 0.92,
    language: str = "ru"
) -> bytes:
    """
    Основная функция: генерирует PDF с визуализацией ЭП
    
    Args:
        original_document: исходный PDF в байтах
        verification_data: данные проверки подписи
        stamp_position: (x, y) координаты в мм
        page_number: номер страницы
        stamp_width: ширина штампа в мм
        stamp_height: высота штампа в мм
        opacity: прозрачность
        language: язык
    
    Returns:
        bytes: готовый PDF с наложенным штампом
    """
    
    logger.info(f"Генерация PDF с визуализацией: позиция {stamp_position}, страница {page_number}")
    
    # 1. Создаём штамп
    stamp_buffer = create_stamp_pdf(
        verification_data=verification_data,
        position_x=stamp_position[0],
        position_y=stamp_position[1],
        stamp_width_mm=stamp_width,
        stamp_height_mm=stamp_height,
        opacity=opacity,
        language=language
    )
    
    # 2. Накладываем на оригинал
    result_pdf = overlay_stamp_on_pdf(
        original_pdf_bytes=original_document,
        stamp_pdf_buffer=stamp_buffer,
        page_number=page_number
    )
    
    logger.info(f"PDF с визуализацией создан успешно")
    return result_pdf


def get_pdf_info(pdf_bytes: bytes) -> dict:
    """
    Получает информацию о PDF: количество страниц, размер, метаданные
    """
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        info = {
            "pages": len(reader.pages),
            "metadata": reader.metadata,
            "size": len(pdf_bytes),
            "is_encrypted": reader.is_encrypted,
        }
        return info
    except Exception as e:
        logger.error(f"Ошибка получения информации о PDF: {str(e)}")
        return {"error": str(e)}