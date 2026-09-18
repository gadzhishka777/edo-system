import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

import KndLogo from '../components/KndLogo';
import { authApi, rememberAuthReturn } from '../api/edoApi';
import {
  KND_ACCENT,
  KND_ACCENT_HOVER,
  KND_BG,
  KND_HOME_PATH,
  KND_LOGIN_PATH,
  KND_TEXT,
  KND_TEXT_MUTED,
} from '../theme/knd';

// ===== СТИЛИ =====

const PageWrapper = styled(Box)({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
  boxSizing: 'border-box',
  backgroundColor: KND_BG,
  fontFamily: 'Lato, sans-serif',
});

const Content = styled(Box)({
  width: '100%',
  maxWidth: '560px',
});

const BrandRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '28px',
});

const BrandTitle = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '40px',
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: '-0.5px',
});

const BrandRule = styled(Box)({
  height: '2px',
  width: '100%',
  marginTop: '6px',
  backgroundColor: KND_TEXT,
});

const BrandSubtitle = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '17px',
  fontWeight: 400,
  lineHeight: 1.5,
  marginTop: '18px',
  maxWidth: '520px',
});

const AuthBlock = styled(Box)({
  marginTop: '48px',
});

const AuthTitle = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '22px',
  fontWeight: 700,
  lineHeight: 1.3,
});

const AuthHint = styled(Typography)({
  color: KND_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: 1.5,
  marginTop: '8px',
  maxWidth: '520px',
});

const EisButton = styled(Button)({
  width: '100%',
  height: '64px',
  marginTop: '56px',
  backgroundColor: KND_ACCENT,
  borderRadius: '4px',
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '17px',
  fontWeight: 600,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: KND_ACCENT_HOVER,
    boxShadow: 'none',
  },
  '&:disabled': {
    backgroundColor: 'rgba(11, 99, 246, 0.4)',
    color: 'rgba(255, 255, 255, 0.6)',
  },
});

// ===== КОМПОНЕНТ =====

// Пропсов нет: вход всегда уводит на ЕИС полностраничным редиректом, а
// авторизацию в App помечает обработчик возврата /auth/eis/success.
const KndLoginPage: React.FC = () => {
  const [redirecting, setRedirecting] = useState(false);
  // null — статус ещё не получен: кнопку не блокируем, чтобы недоступность
  // /eis/status не мешала входу.
  const [eisEnabled, setEisEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getEisStatus()
      .then((status) => {
        if (!cancelled) setEisEnabled(!!status.enabled);
      })
      .catch(() => {
        if (!cancelled) setEisEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEisLogin = () => {
    if (redirecting) return;
    setRedirecting(true);
    // ЕИС вернёт нас на общую /auth/eis/success, поэтому точку возврата
    // запоминаем заранее — обработчик уведёт в модуль, а не в ТОР ЭДО.
    rememberAuthReturn(KND_LOGIN_PATH, KND_HOME_PATH);
    window.location.assign('/api/auth/eis/login');
  };

  return (
    <PageWrapper>
      <Content>
        <BrandRow>
          <KndLogo size={92} />
          <BrandTitle>ТОР Контроль</BrandTitle>
        </BrandRow>
        <BrandRule />
        <BrandSubtitle>
          Типовое облачное решение по осуществлению контрольной деятельности
        </BrandSubtitle>

        <AuthBlock>
          <AuthTitle>Вход в информационную систему</AuthTitle>
          <AuthHint>
            Вход осуществляется с помощью учётной записи Единой информационной системы
          </AuthHint>

          {eisEnabled === false && (
            <Alert
              severity="warning"
              sx={{
                mt: 3,
                borderRadius: '4px',
                fontFamily: 'Lato, sans-serif',
                backgroundColor: 'rgba(255, 193, 7, 0.12)',
                color: '#ffd666',
                '& .MuiAlert-icon': { color: '#ffd666' },
              }}
            >
              Вход через ЕИС временно недоступен: интеграция не настроена.
              Обратитесь к администратору системы.
            </Alert>
          )}

          <EisButton
            variant="contained"
            disableElevation
            onClick={handleEisLogin}
            disabled={redirecting || eisEnabled === false}
            startIcon={
              redirecting ? (
                <CircularProgress size={20} sx={{ color: '#ffffff' }} />
              ) : undefined
            }
          >
            {redirecting ? 'Переход на ЕИС…' : 'Вход через ЕИС'}
          </EisButton>
        </AuthBlock>
      </Content>
    </PageWrapper>
  );
};

export default KndLoginPage;
