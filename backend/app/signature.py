"""
Модуль проверки электронной подписи
Поддерживает как демо-режим, так и реальную проверку
"""

import hashlib
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization
from cryptography.x509 import load_pem_x509_certificate
from cryptography.hazmat.backends import default_backend

from app.config import DEMO_MODE

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def verify_signature(document_content: bytes, signature_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Основная функция проверки электронной подписи
    
    Args:
        document_content: содержимое документа в байтах
        signature_data: словарь с данными подписи
        
    Returns:
        Dict с результатами проверки
    """
    
    if DEMO_MODE:
        logger.info("Работаем в ДЕМО-режиме проверки подписи")
        return _demo_verification(document_content, signature_data)
    else:
        logger.info("Работаем в РЕАЛЬНОМ режиме проверки подписи")
        return _real_verification(document_content, signature_data)


def _demo_verification(document_content: bytes, signature_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Демо-режим проверки подписи (для тестирования)
    """
    # Имитация задержки проверки
    import time
    time.sleep(0.5)
    
    # Извлекаем данные из запроса
    is_valid = signature_data.get("valid", False)
    signer_name = signature_data.get("signer", "Иванов И.И.")
    signer_inn = signature_data.get("inn", "1234567890")
    sign_date = signature_data.get("sign_date", datetime.now().isoformat())
    cert_serial = signature_data.get("cert_serial", "12:34:56:78:90:AB")
    
    # Вычисляем хэш документа (для лога)
    doc_hash = hashlib.sha256(document_content).hexdigest()
    logger.info(f"Хэш документа: {doc_hash[:16]}...")
    
    # Формируем результат
    result = {
        "signature_valid": is_valid,
        "signer_name": signer_name,
        "signer_inn": signer_inn,
        "signature_date": sign_date,
        "certificate_serial": cert_serial,
        "hash_algorithm": "GOST R 34.11-2012 (имитация)" if is_valid else "SHA-256",
        "verification_details": "Подпись успешно проверена (демо-режим)" if is_valid else "Ошибка проверки подписи (демо-режим)"
    }
    
    logger.info(f"Результат проверки: {result['signature_valid']}")
    return result


def _real_verification(document_content: bytes, signature_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Реальная проверка ЭП (используется для production)
    
    Ожидается, что в signature_data будет:
    - certificate: сертификат в формате PEM
    - signature: подпись в формате base64
    - timestamp: временная метка
    """
    
    try:
        # 1. Извлекаем сертификат
        certificate_pem = signature_data.get("certificate")
        if not certificate_pem:
            raise ValueError("Не найден сертификат в данных подписи")
        
        # 2. Загружаем сертификат
        cert_bytes = certificate_pem.encode('utf-8')
        certificate = load_pem_x509_certificate(cert_bytes, default_backend())
        
        # 3. Извлекаем публичный ключ
        public_key = certificate.public_key()
        
        # 4. Извлекаем подпись
        signature_b64 = signature_data.get("signature")
        if not signature_b64:
            raise ValueError("Не найдена подпись в данных")
        
        import base64
        signature_bytes = base64.b64decode(signature_b64)
        
        # 5. Проверяем подпись
        try:
            public_key.verify(
                signature_bytes,
                document_content,
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            is_valid = True
            details = "Подпись успешно проверена"
        except Exception as e:
            is_valid = False
            details = f"Ошибка проверки подписи: {str(e)}"
        
        # 6. Извлекаем данные из сертификата
        subject = certificate.subject
        signer_name = _get_certificate_field(subject, 'CN')
        signer_inn = _get_certificate_field(subject, 'INN')
        cert_serial = hex(certificate.serial_number)[2:].upper()
        
        # 7. Добавляем информацию о времени
        sign_date = signature_data.get("timestamp", datetime.now().isoformat())
        
        result = {
            "signature_valid": is_valid,
            "signer_name": signer_name or "Неизвестно",
            "signer_inn": signer_inn or "Не указан",
            "signature_date": sign_date,
            "certificate_serial": cert_serial,
            "hash_algorithm": "SHA-256",
            "verification_details": details
        }
        
        logger.info(f"Реальная проверка: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Ошибка при проверке подписи: {str(e)}")
        return {
            "signature_valid": False,
            "signer_name": "Ошибка проверки",
            "signer_inn": "",
            "signature_date": datetime.now().isoformat(),
            "certificate_serial": "НЕДОСТУПЕН",
            "hash_algorithm": "Ошибка",
            "verification_details": f"Ошибка при проверке: {str(e)}"
        }


def _get_certificate_field(subject, field_name: str) -> Optional[str]:
    """
    Извлекает поле из сертификата
    """
    from cryptography.x509.oid import NameOID
    
    field_map = {
        'CN': NameOID.COMMON_NAME,
        'INN': NameOID.STATE_OR_PROVINCE_NAME,
        'SN': NameOID.SURNAME,
        'GN': NameOID.GIVEN_NAME,
    }
    
    try:
        oid = field_map.get(field_name)
        if oid:
            attributes = subject.get_attributes_for_oid(oid)
            if attributes:
                return attributes[0].value
    except Exception:
        pass
    
    return None