import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';

import Footer from '../components/Layout/Footer';
import CertBanner from '../components/Layout/CertBanner';
import { authApi, EisEmployeeCandidate, EmployeeLoginResponse, persistLogin } from '../api/edoApi';

// ===== СТИЛИ =====

const PageWrapper = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
});

const Background = styled(Box)({
  flex: '1 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 20px',
  background: 'linear-gradient(90deg, #0c71ca, #64bce2)',
});

const Card = styled(Paper)({
  width: '100%',
  maxWidth: '600px',
  margin: '0 auto',
  padding: '32px',
  borderRadius: '16px',
  backgroundColor: '#ffffff',
  boxShadow: '0 4px 6px -2px rgba(41, 41, 64, 0.04), 0 10px 15px -3px rgba(41, 41, 64, 0.08)',
});

const Title = styled(Typography)({
  color: '#070717',
  fontFamily: 'Lato, sans-serif',
  fontSize: '22px',
  fontWeight: 700,
  textAlign: 'center',
  marginBottom: '16px',
});

const Subtitle = styled(Typography)({
  color: '#5a5a72',
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  textAlign: 'center',
  marginBottom: '24px',
});

const CandidateCard = styled(Paper, {
  shouldForwardProp: (p) => p !== 'selected',
})<{ selected: boolean }>(({ selected }) => ({
  padding: '14px 16px',
  borderRadius: '12px',
  border: selected ? '2px solid #7950f2' : '1px solid #d6d6df',
  marginBottom: '10px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
  backgroundColor: selected ? 'rgba(121, 80, 242, 0.06)' : '#ffffff',
}));

const CandidateTitle = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  fontWeight: 600,
  color: '#070717',
});

const CandidateMeta = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  color: '#5a5a72',
});

const SubmitButton = styled(Button)({
  width: '100%',
  height: '52px',
  backgroundColor: '#7950f2',
  borderRadius: '12px',
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  fontWeight: 600,
  textTransform: 'none',
  marginTop: '16px',
  '&:hover': { backgroundColor: 'rgba(121, 80, 242, 0.85)' },
  '&:disabled': { backgroundColor: 'rgba(121, 80, 242, 0.24)', color: 'rgba(255,255,255,0.7)' },
});

// Маппинг известных ESA-ошибок на человеческое сообщение.
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Вы отказались от входа через ЕИС на стороне портала. Попробуйте снова или войдите по логину и паролю.',
  invalid_state: 'Сессия входа истекла или была подменена. Попробуйте войти через ЕИС ещё раз.',
  invalid_request: 'ЕИС прислал некорректный ответ. Попробуйте войти ещё раз.',
  token_exchange_failed: 'ЕИС не выдал токен доступа. Возможно, код уже использован. Попробуйте войти ещё раз.',
  userinfo_failed: 'Не удалось получить ваши данные из ЕИС. Попробуйте войти ещё раз.',
  no_profile: 'Для вашей учётной записи ЕИС не найдено ни одной организации в ТОР ЭДО. Обратитесь к администратору.',
};

function describeError(code: string, description?: string | null): string {
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (description) return description;
  return `Не удалось войти через ЕИС (код: ${code}). Попробуйте войти по логину и паролю.`;
}

const EisCallbackPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const code = searchParams.get('code');
  const errorCode = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const [phase, setPhase] = useState<'exchanging' | 'choose' | 'submitting' | 'error'>('exchanging');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<EisEmployeeCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Захватываем параметры один раз — ДО того, как эффект очистки удалит ?code из
  // адресной строки. Иначе повторный рендер после очистки передаст code=null,
  // эффект обмена перезапустится и выдаст «Не задан код обмена» (хотя код был).
  const initialRef = useRef<{
    code: string | null;
    error: string | null;
    desc: string | null;
  } | null>(null);
  if (initialRef.current === null) {
    initialRef.current = {
      code: searchParams.get('code'),
      error: searchParams.get('error'),
      desc: searchParams.get('error_description'),
    };
  }

  // Чистим URL от ?code сразу после чтения, чтобы F5 не делал повторный exchange.
  useEffect(() => {
    if (searchParams.toString()) {
      const next = new URLSearchParams(searchParams);
      next.delete('code');
      next.delete('error');
      next.delete('error_description');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Читаем параметры из захваченного рефа, а не из реактивного searchParams,
    // чтобы очистка URL ниже не перезапустила эффект с code=null.
    const code = initialRef.current?.code ?? null;
    const errorCode = initialRef.current?.error ?? null;
    const errorDescription = initialRef.current?.desc ?? null;

    if (errorCode) {
      setPhase('error');
      setErrorMessage(describeError(errorCode, errorDescription));
      return;
    }
    if (!code) {
      setPhase('error');
      setErrorMessage('Не задан код обмена. Попробуйте войти через ЕИС ещё раз.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await authApi.exchangeEis(code);
        if (cancelled) return;

        if (result.kind === 'tokens') {
          const tokens = result as EmployeeLoginResponse & { kind: 'tokens' };
          persistLogin(tokens);
          // Если профиль сотрудника не заполнен — отправляем дозаполнить.
          if (!tokens.profile_completed && !tokens.employee_name) {
            navigate('/profile-complete', { replace: true });
          } else {
            navigate('/', { replace: true });
          }
          return;
        }

        if (result.kind === 'choose') {
          setCandidates(result.candidates);
          setSelectedId(result.candidates[0]?.employee_id ?? null);
          setPhase('choose');
          return;
        }

        console.error('[ESA] Неожиданный ответ сервера при обмене кода:', result);
        setPhase('error');
        setErrorMessage('Неожиданный ответ сервера. Попробуйте войти ещё раз.');
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        const detail =
          err?.response?.data?.detail ||
          err?.message ||
          'Не удалось завершить вход через ЕИС.';
        if (status === 410) {
          setErrorMessage(
            'Время обмена истекло (ссылка действует 60 секунд). Попробуйте войти через ЕИС ещё раз.',
          );
        } else {
          setErrorMessage(detail);
        }
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChoose = async () => {
    // Берём код из захваченного рефа, т.к. после очистки URL реактивный code === null.
    const code = initialRef.current?.code ?? null;
    if (!code || !selectedId) return;
    setPhase('submitting');
    try {
      const result = await authApi.exchangeEis(code, selectedId);
      if (result.kind === 'tokens') {
        persistLogin(result);
        if (!result.profile_completed && !result.employee_name) {
          navigate('/profile-complete', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
        return;
      }
      setPhase('error');
      setErrorMessage('Сервер вернул неожиданный ответ.');
    } catch (err: any) {
      setPhase('error');
      setErrorMessage(
        err?.response?.data?.detail ||
          err?.message ||
          'Не удалось войти с выбранным профилем.',
      );
    }
  };

  return (
    <PageWrapper>
      <CertBanner />
      <Background>
        <Card elevation={0}>
          {phase === 'exchanging' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
              <CircularProgress sx={{ color: '#7950f2' }} />
              <Title>Завершаем вход через ЕИС…</Title>
              <Subtitle>Обмениваем код авторизации на токен ТОР ЭДО.</Subtitle>
            </Box>
          )}

          {phase === 'submitting' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
              <CircularProgress sx={{ color: '#7950f2' }} />
              <Title>Входим в выбранную организацию…</Title>
            </Box>
          )}

          {phase === 'choose' && (
            <Box>
              <Title>Выберите организацию для входа</Title>
              <Subtitle>
                С вашей учётной записью ЕИС найдено несколько профилей в ТОР ЭДО.
                Выберите тот, от имени которого хотите продолжить работу.
              </Subtitle>

              <RadioGroup
                value={selectedId !== null ? String(selectedId) : ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {candidates.map((c) => (
                  <CandidateCard
                    key={c.employee_id}
                    selected={selectedId === c.employee_id}
                    onClick={() => setSelectedId(c.employee_id)}
                    elevation={0}
                  >
                    <FormControlLabel
                      value={String(c.employee_id)}
                      control={<Radio sx={{ color: '#7950f2', '&.Mui-checked': { color: '#7950f2' } }} />}
                      label={
                        <Box>
                          <CandidateTitle>{c.employee_name || `Сотрудник #${c.employee_id}`}</CandidateTitle>
                          <CandidateMeta>
                            {c.position ? `${c.position}` : ''}
                            {c.position && c.org_name ? ' · ' : ''}
                            {c.org_name}
                            {c.profile_completed ? '' : ' · профиль не заполнен'}
                          </CandidateMeta>
                        </Box>
                      }
                      sx={{ alignItems: 'flex-start', m: 0, width: '100%' }}
                    />
                  </CandidateCard>
                ))}
              </RadioGroup>

              <SubmitButton
                variant="contained"
                disableElevation
                disabled={selectedId === null}
                onClick={handleChoose}
              >
                Войти
              </SubmitButton>
            </Box>
          )}

          {phase === 'error' && (
            <Box>
              <Title>Не удалось войти через ЕИС</Title>
              <Alert severity="error" sx={{ borderRadius: '12px', mb: 3, fontFamily: 'Lato, sans-serif' }}>
                {errorMessage}
              </Alert>
              <SubmitButton
                variant="contained"
                disableElevation
                onClick={() => navigate('/login', { replace: true })}
              >
                Назад к странице входа
              </SubmitButton>
            </Box>
          )}
        </Card>
      </Background>
      <Footer />
    </PageWrapper>
  );
};

export default EisCallbackPage;