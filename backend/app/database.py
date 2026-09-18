import re

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings


def _uni_lower(value):
    """Юникодный lower() — встроенный lower() в SQLite не обрабатывает кириллицу."""
    return value.lower() if isinstance(value, str) else value


def _reg_number(value):
    """Ключ сортировки документов по регистрационному номеру.

    Берём ВСЕ числовые группы номера, добиваем каждую нулями до одинаковой
    ширины и склеиваем через «/». Сравнение таких строк совпадает с числовым
    сравнением по группам, поэтому «100-ОД» встаёт выше «99-ОД»
    (лексикографика дала бы наоборот), а «01-10/48-2026» выше «01-10/47-2026».

    Номера без цифр получают пустую строку и в DESC-сортировке уезжают в конец.

    Раньше брались только ВЕДУЩИЕ цифры (`re.match`), из-за чего весь ряд
    «01-10/NN-2026» получал один и тот же ключ 1 (от «01») — номер не
    участвовал в сортировке вообще, и порядок решала дата создания.
    """
    if value is None:
        return ""
    groups = re.findall(r"\d+", str(value))
    if not groups:
        return ""
    # Ограничиваем разрядностью SQLite (знаковое 64-битное целое) и добиваем
    # нулями: строка «000…099» сравнивается как число 99.
    return "/".join(f"{min(int(g), 2 ** 62):019d}" for g in groups)


def _register_sqlite_functions(dbapi_connection, connection_record):
    target = getattr(dbapi_connection, "_conn", dbapi_connection)
    try:
        target.create_function("unilower", 1, _uni_lower)
        target.create_function("reg_number", 1, _reg_number)
        # Продакшен-настройки: WAL снижает блокировки на запись,
        # busy_timeout ждёт освобождения блокировки вместо мгновенной ошибки
        target.execute("PRAGMA journal_mode=WAL")
        target.execute("PRAGMA busy_timeout=5000")
    except Exception:
        pass  # не SQLite или функция уже зарегистрирована


# Синхронный движок (для миграций)
engine = create_engine(settings.DATABASE_URL.replace("+aiosqlite", ""))
event.listen(engine, "connect", _register_sqlite_functions)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Асинхронный движок
async_engine = create_async_engine(settings.DATABASE_URL, echo=False)
event.listen(async_engine.sync_engine, "connect", _register_sqlite_functions)
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_async_db():
    async with AsyncSessionLocal() as session:
        yield session