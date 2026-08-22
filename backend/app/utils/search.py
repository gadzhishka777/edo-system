# backend/app/utils/search.py
"""Умный поиск по текстовым полям.

Возможности:
- регистр не важен, в том числе для кириллицы (SQL-функция unilower,
  регистрируется в app.database);
- запрос разбивается на слова: каждое слово должно найтись хотя бы
  в одном из полей (AND между словами, OR между полями), поэтому
  «петров иван» найдёт «Иван Петров», а «иван петрович» — полное ФИО.
"""
import re
from typing import Sequence

from sqlalchemy import and_, func, or_


def build_smart_search(fields: Sequence, search: str):
    """Возвращает SQLAlchemy-условие для умного поиска или None, если запрос пуст."""
    words = [w for w in re.split(r"\s+", (search or "").strip()) if w]
    if not words or not fields:
        return None

    conditions = []
    for word in words:
        pattern = f"%{word.lower()}%"
        conditions.append(or_(*(func.unilower(field).like(pattern) for field in fields)))
    return and_(*conditions)
