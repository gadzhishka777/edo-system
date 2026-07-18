# backend/app/routers/signatures.py
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.signature_service import verify_signature

router = APIRouter(prefix="/signatures", tags=["signatures"])

@router.post("/verify")
async def verify(
    document: UploadFile = File(...),
    signature: UploadFile = File(...),
):
    """Проверка ЭП через Go GOST"""
    
    # Читаем файлы
    doc_content = await document.read()
    sig_content = await signature.read()
    
    # Вызываем Go GOST
    result = await verify_signature(doc_content, sig_content, "UNEP")
    
    return result