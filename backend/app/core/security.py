# backend/app/core/security.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import secrets
import re

from app.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password,
    )


def get_password_hash(password: str) -> str:
    """Хэширование пароля"""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание access токена (короткоживущий)"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_admin_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание admin access токена"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "admin"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Создание refresh токена (долгоживущий)"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Декодирование токена. Возвращает payload или None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# ===================== ХЕЛПЕРЫ ДЛЯ СОТРУДНИКОВ =====================


def generate_employee_password(length: int = 10) -> str:
    """
    Генерация надёжного пароля (минимум 8 символов).
    Содержит заглавные, строчные буквы, цифры и спецсимволы.
    """
    if length < 8:
        length = 8

    upper = secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    lower = secrets.choice("abcdefghijklmnopqrstuvwxyz")
    digit = secrets.choice("0123456789")
    special = secrets.choice("!@#$%^&*")

    all_chars = upper + lower + lower + digit + special
    while len(all_chars) < length:
        all_chars += secrets.choice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*")

    # Перемешиваем
    password_list = list(all_chars)
    secrets.SystemRandom().shuffle(password_list)
    return "".join(password_list)


def generate_employee_login(org_id: int, last_name: str) -> str:
    """
    Генерация логина сотрудника по маске: {org_id}_{ФамилияИ}
    Пример: 01_IvanovAI
    """
    # Очищаем фамилию: только латиница, убираем пробелы и спецсимволы
    clean_surname = re.sub(r'[^a-zA-Zа-яА-ЯёЁ]', '', last_name)

    # Транслитерация русской фамилии
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    }

    translit_surname = ''
    for char in clean_surname.lower():
        translit_surname += translit_map.get(char, '')

    # Делаем первую букву заглавной, остальные строчные
    translit_surname = translit_surname.capitalize()

    # Берём первые 4 буквы имени (если есть)
    # Имя берём из логина, который уже передан

    login = f"{org_id:02d}_{translit_surname}"

    # Убедимся что логин не слишком длинный
    if len(login) > 100:
        login = login[:100]

    return login
