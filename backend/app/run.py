#!/usr/bin/env python
"""
Скрипт для локального запуска приложения (dev).
"""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True,
        log_level="info",
        workers=1,
        # Не раскрываем версию сервера в заголовке Server
        server_header=False,
    )
