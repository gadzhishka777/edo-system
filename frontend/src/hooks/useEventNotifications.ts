// src/hooks/useEventNotifications.ts
import { useEvents } from '../context/EventContext';

export const useEventNotifications = () => {
  const { addSuccess, addError, addWarning, addInfo } = useEvents();

  return {
    notifyDocumentUploaded: (documentName: string, documentUrl?: string) => {
      addSuccess(
        'Документ загружен успешно',
        `Документ "${documentName}" успешно загружен в систему`,
        documentUrl ? {
          label: 'Открыть',
          handler: () => window.open(documentUrl, '_blank'),
        } : undefined
      );
    },

    notifyDocumentSigned: (documentName: string) => {
      addSuccess(
        'Документ подписан',
        `Документ "${documentName}" успешно подписан`
      );
    },

    notifyLicenseActivated: (licenseType: string, expireDate: string) => {
      addSuccess(
        'Лицензия активирована успешно',
        `Лицензия "${licenseType}" активирована до ${expireDate}`
      );
    },

    notifyLicenseExpiring: (daysLeft: number) => {
      addWarning(
        `Лицензия истекает через ${daysLeft} дней`,
        `Продлите лицензию, чтобы продолжить работу с системой`,
        {
          label: 'Продлить',
          handler: () => window.location.href = '/license',
        }
      );
    },

    notifyMailReceived: (sender: string, subject: string) => {
      addInfo(
        'Новое письмо',
        `От: ${sender}. Тема: ${subject}`,
        {
          label: 'Открыть',
          handler: () => window.location.href = '/mail',
        }
      );
    },

    notifySignatureVerified: (documentName: string) => {
      addSuccess(
        'Подпись успешно проверена',
        `Электронная подпись документа "${documentName}" подтверждена`
      );
    },

    notifyError: (title: string, description: string) => {
      addError(title, description);
    },

    notifySystemUpdate: (version: string) => {
      addInfo(
        'Доступно обновление системы',
        `Версия ${version} доступна для установки`,
        {
          label: 'Обновить',
          handler: () => window.location.reload(),
        }
      );
    },
  };
};