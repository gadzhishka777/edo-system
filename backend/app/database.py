from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings


def _uni_lower(value):
    """Юникодный lower() — встроенный lower() в SQLite не обрабатывает кириллицу."""
    return value.lower() if isinstance(value, str) else value


def _register_sqlite_functions(dbapi_connection, connection_record):
    target = getattr(dbapi_connection, "_conn", dbapi_connection)
    try:
        target.create_function("unilower", 1, _uni_lower)
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