// src/hooks/useLicenseCheck.ts
import { useEffect, useState, useCallback } from 'react';
import { useEvents } from '../context/EventContext';
import { authApi } from '../api/edoApi';
import dayjs from 'dayjs';

interface LicenseInfo {
  license_key: string;
  product: string;
  valid: boolean;
  expire_date: string;
  max_organizations: number;
  max_documents: number;
  current_organizations: number;
  current_documents: number;
  days_until_expire?: number;
}

export const useLicenseCheck = () => {
  const { addWarning, addSuccess, addError, addInfo } = useEvents();
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notified, setNotified] = useState(false);

  const checkLicense = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authApi.getLicense();
      const info = response as LicenseInfo;
      setLicenseInfo(info);
      
      if (info.valid && info.expire_date) {
        const daysUntilExpire = dayjs(info.expire_date).diff(dayjs(), 'day');
        const daysLeft = Math.max(0, daysUntilExpire);
        info.days_until_expire = daysLeft;
        
        // Проверяем разные сценарии только если еще не уведомляли
        if (!notified) {
          if (daysLeft === 0) {
            addWarning(
              'Внимание! Лицензия истекает сегодня!',
              `Лицензия "${info.product}" истекает сегодня. Продлите лицензию для продолжения работы.`,
              {
                label: 'Продлить лицензию',
                handler: () => window.location.href = '/license',
              }
            );
          } else if (daysLeft <= 3) {
            addWarning(
              `Внимание! Лицензия истекает через ${daysLeft} дня`,
              `Лицензия "${info.product}" истекает через ${daysLeft} дня. Продлите лицензию для продолжения работы.`,
              {
                label: 'Продлить лицензию',
                handler: () => window.location.href = '/license',
              }
            );
          } else if (daysLeft <= 7) {
            addWarning(
              `Внимание! Лицензия истекает через ${daysLeft} дней`,
              `Лицензия "${info.product}" истекает через ${daysLeft} дней. Рекомендуем продлить лицензию.`,
              {
                label: 'Продлить лицензию',
                handler: () => window.location.href = '/license',
              }
            );
          } else if (daysLeft <= 14) {
            addInfo(
              `Внимание! Лицензия истекает через ${daysLeft} дней`,
              `Лицензия "${info.product}" истекает через ${daysLeft} дней. Планируйте продление.`,
              {
                label: 'Подробнее',
                handler: () => window.location.href = '/license',
              }
            );
          } 
          setNotified(true);
        }
      } else {
        // Лицензия недействительна
        addError(
          'Лицензия недействительна',
          'Лицензия неактивна или истекла. Активируйте лицензию для доступа к функциям системы.'
        );
      }
      
      return info;
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Ошибка проверки лицензии';
      setError(errorMsg);
      // Не показываем ошибку пользователю, если это просто нет лицензии
      if (err.response?.status !== 404) {
        addError('Ошибка проверки лицензии', errorMsg);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [addWarning, addSuccess, addError, addInfo, notified]);

  // Проверяем лицензию при монтировании
  useEffect(() => {
    checkLicense();
  }, [checkLicense]);

  return {
    licenseInfo,
    loading,
    error,
    checkLicense,
    isExpiringSoon: licenseInfo?.days_until_expire !== undefined && licenseInfo.days_until_expire <= 7,
    daysUntilExpire: licenseInfo?.days_until_expire || 0,
    isLicenseValid: licenseInfo?.valid || false,
  };
};