# backend/app/services/signature_service.py
import httpx
import json
import os
from typing import Dict, Any, Optional
from datetime import datetime

# Настройки Go GOST
GOST_API_URL = os.getenv("GOST_API_URL", "http://localhost:8080")
GOST_API_KEY = os.getenv("GOST_API_KEY", "")
GOST_TIMEOUT = int(os.getenv("GOST_TIMEOUT", "30"))

async def verify_signature(
    document_content: bytes,
    signature_content: Optional[bytes],
    signature_type: str,
) -> Dict[str, Any]:
    """
    Проверка ЭП через Go GOST
    
    Args:
        document_content: содержимое документа в байтах
        signature_content: содержимое подписи в байтах (.sig)
        signature_type: тип подписи (UNEP, UKEP, PEP, none)
    
    Returns:
        Dict с результатами проверки
    """
    
    # Для ПЭП и Без ЭП проверка не требуется
    if signature_type in ["PEP", "none"]:
        return {
            "signature_valid": signature_type == "PEP",
            "signer_name": "",
            "signer_inn": "",
            "signature_date": "",
            "certificate_serial": "",
            "hash_algorithm": "",
            "verification_details": "Для данного типа подписи проверка не требуется",
            "ocsp_status": None,
        }
    
    # Для УНЭП/УКЭП требуется .sig файл
    if not signature_content:
        return {
            "signature_valid": False,
            "signer_name": "",
            "signer_inn": "",
            "signature_date": "",
            "certificate_serial": "",
            "hash_algorithm": "",
            "verification_details": "Отсутствует файл подписи (.sig)",
            "ocsp_status": None,
        }
    
    # Отправляем запрос в Go GOST
    try:
        async with httpx.AsyncClient(timeout=GOST_TIMEOUT) as client:
            # Формируем multipart/form-data запрос
            files = {
                "document": ("document.pdf", document_content, "application/pdf"),
                "signature": ("signature.sig", signature_content, "application/octet-stream"),
            }
            
            headers = {}
            if GOST_API_KEY:
                headers["Authorization"] = GOST_API_KEY
            
            response = await client.post(
                f"{GOST_API_URL}/vfile",
                files=files,
                headers=headers,
            )
            
            if response.status_code != 200:
                error_data = response.json() if response.text else {}
                error_msg = error_data.get("error", {}).get("message", response.text)
                return {
                    "signature_valid": False,
                    "signer_name": "",
                    "signer_inn": "",
                    "signature_date": "",
                    "certificate_serial": "",
                    "hash_algorithm": "",
                    "verification_details": f"Ошибка проверки: {error_msg}",
                    "ocsp_status": None,
                }
            
            data = response.json()
            payload = data.get("payload", {})
            
            # Извлекаем данные из ответа Go GOST
            signer = payload.get("Signer", {})
            certificate = payload.get("Certificate", {})
            
            return {
                "signature_valid": payload.get("Validity", False),
                "signer_name": signer.get("CommonName", ""),
                "signer_inn": signer.get("StateOrProvinceName", ""),
                "signature_date": payload.get("SigningTime", ""),
                "certificate_serial": certificate.get("SerialNumber", ""),
                "hash_algorithm": certificate.get("DigestAlgorithm", ""),
                "verification_details": "Подпись проверена через сервер ГОСТ" if payload.get("Validity") else "Подпись недействительна",
                "ocsp_status": "Действителен" if payload.get("Validity") else "Недействителен",
            }
            
    except httpx.ConnectError:
        return {
            "signature_valid": False,
            "signer_name": "",
            "signer_inn": "",
            "signature_date": "",
            "certificate_serial": "",
            "hash_algorithm": "",
            "verification_details": "Не удалось подключиться к сервису проверки подписей (Go GOST)",
            "ocsp_status": None,
        }
    except httpx.TimeoutException:
        return {
            "signature_valid": False,
            "signer_name": "",
            "signer_inn": "",
            "signature_date": "",
            "certificate_serial": "",
            "hash_algorithm": "",
            "verification_details": "Превышено время ожидания ответа от сервиса проверки",
            "ocsp_status": None,
        }
    except Exception as e:
        return {
            "signature_valid": False,
            "signer_name": "",
            "signer_inn": "",
            "signature_date": "",
            "certificate_serial": "",
            "hash_algorithm": "",
            "verification_details": f"Ошибка при проверке подписи: {str(e)}",
            "ocsp_status": None,
        }