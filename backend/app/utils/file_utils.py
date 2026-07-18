import os
import shutil
from pathlib import Path
from fastapi import UploadFile

async def save_upload_file(file: UploadFile, upload_dir: str, doc_uuid: str) -> str:
    """Сохранение загруженного файла"""
    
    # Создаём папку если нет
    Path(upload_dir).mkdir(parents=True, exist_ok=True)
    
    # Формируем имя файла
    ext = Path(file.filename).suffix
    file_path = Path(upload_dir) / f"{doc_uuid}{ext}"
    
    # Сохраняем
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return str(file_path)

def delete_file(file_path: str) -> bool:
    """Удаление файла"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
    except Exception:
        pass
    return False