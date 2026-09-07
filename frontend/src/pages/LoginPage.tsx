import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Snackbar,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import Footer from '../components/Layout/Footer';
import CertBanner from '../components/Layout/CertBanner';
import { authApi } from '../api/edoApi';
import { getApiErrorMessage } from '../api/edoApi';

// ===== СТИЛИЗОВАННЫЕ КОМПОНЕНТЫ =====

const PageWrapper = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
});

const LoginBackground = styled(Box)({
  flex: '1 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 20px',
  position: 'relative',
  overflow: 'hidden',
  background: 'linear-gradient(90deg, #0c71ca, #64bce2)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'url(https://dnevnik.edurb.ru/static/media/bg-pattern.1b14caff.png)',
    backgroundSize: 'contain',
    opacity: 0.5,
    pointerEvents: 'none',
  },
});

const LoginContainer = styled(Box)({
  position: 'relative',
  zIndex: 2,
  width: '100%',
  maxWidth: '520px',
  margin: '0 auto',
});

const LoginCard = styled(Paper)({
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '40px 32px',
  boxShadow: '0 4px 6px -2px rgba(41, 41, 64, 0.04), 0 10px 15px -3px rgba(41, 41, 64, 0.08)',
});

const TitleWrapper = styled(Box)({
  marginBottom: '32px',
  textAlign: 'center',
});

const MainTitle = styled(Typography)({
  color: '#070717',
  fontFamily: 'Lato, sans-serif',
  fontSize: '28px',
  fontWeight: 700,
  margin: 0,
});

const Subtitle = styled(Typography)({
  color: '#5f3dc4',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  textAlign: 'center',
  marginBottom: '28px',
  fontFamily: 'Lato, sans-serif',
});

const StyledTextField = styled(TextField)({
  marginBottom: '24px',
  '& .MuiOutlinedInput-root': {
    height: '56px',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    fontFamily: 'Lato, sans-serif',
    fontSize: '16px',
    '& fieldset': {
      borderColor: '#d6d6df',
      borderWidth: '1px',
    },
    '&:hover fieldset': {
      borderColor: '#d6d6df',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#7950f2',
      borderWidth: '2px',
    },
    '&.Mui-error fieldset': {
      borderColor: '#ee3f58',
      borderWidth: '2px',
    },
    '& input': {
      padding: '0 40px 0 12px',
      height: '56px',
      fontFamily: 'Lato, sans-serif',
      fontSize: '16px',
    },
  },
  '& .MuiInputLabel-root': {
    color: '#87879b',
    fontFamily: 'Lato, sans-serif',
    fontSize: '16px',
    fontWeight: 400,
    transform: 'translate(12px, 18px) scale(1)',
    '&.Mui-focused': {
      color: '#7950f2',
      transform: 'translate(10px, -6px) scale(0.85)',
      backgroundColor: '#ffffff',
      padding: '0 4px',
    },
    '&.MuiFormLabel-filled': {
      transform: 'translate(10px, -6px) scale(0.85)',
      backgroundColor: '#ffffff',
      padding: '0 4px',
    },
    '&.Mui-error': {
      color: '#ee3f58',
    },
  },
  '& .MuiFormHelperText-root': {
    color: '#ee3f58',
    fontSize: '12px',
    fontFamily: 'Lato, sans-serif',
    marginLeft: '12px',
    marginTop: '4px',
  },
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
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  transition: 'background 0.2s',
  '&:hover': {
    backgroundColor: 'rgba(121, 80, 242, 0.8)',
  },
  '&:disabled': {
    backgroundColor: 'rgba(121, 80, 242, 0.24)',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  '& svg': {
    fill: '#ffffff',
    transform: 'rotate(180deg)',
  },
});

// ===== СТИЛИ ДЛЯ РАЗДЕЛИТЕЛЯ =====
const StyledDivider = styled(Divider)({
  margin: '24px 0 24px 0',
  '&::before, &::after': {
    borderColor: '#d6d6df',
    borderWidth: '1px',
  },
  '& .MuiDivider-wrapper': {
    color: '#87879b',
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
    fontWeight: 400,
    padding: '0 16px',
  },
});

// ===== КАЧЕСТВЕННАЯ КНОПКА-КАРТИНКА ПЕД.ID =====
const PedIdImageButton = styled('img')({
  width: '100%',
  maxWidth: '360px', // Чуть больше для лучшего отображения
  height: '48px', // Немного увеличил высоту
  display: 'block',
  margin: '0 auto',
  borderRadius: '8px',
  border: '1px solid #e0e0e0', // Очень тонкая, едва заметная обводка
  cursor: 'pointer',
  transition: 'opacity 0.2s ease',
  objectFit: 'contain',
  backgroundColor: 'transparent',
  padding: '4px 12px',
  // Убираем всякие эффекты, делаем как в Figma
  '&:hover': {
    opacity: 0.85, // Только легкое затемнение при наведении
  },
});

// ===== КОНТЕЙНЕР ДЛЯ ЦЕНТРИРОВАНИЯ КАРТИНКИ =====
const PedIdWrapper = styled(Box)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
  padding: '4px 0',
});

// ===== ЭКРАН ПРИВЕТСТВИЯ (ВХОД ЧЕРЕЗ ЕИС) =====
const WelcomeWrapper = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '32px',
  textAlign: 'center',
});

const WelcomeTextBlock = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '24px',
});

const WelcomeText = styled(Typography)({
  color: '#5a5a72',
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: 0,
});

const EisButton = styled(Button)({
  width: '100%',
  height: '52px',
  backgroundColor: '#7950f2',
  borderRadius: '12px',
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  fontWeight: 600,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: 'rgba(121, 80, 242, 0.8)',
    boxShadow: 'none',
  },
});

const BottomActions = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  width: '100%',
  marginTop: '72px',
});

const CredentialsLinkButton = styled(Button)({
  width: 'fit-content',
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 500,
  textTransform: 'none',
  color: '#7950f2',
  background: 'none',
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: 'rgba(121, 80, 242, 0.1)',
    boxShadow: 'none',
  },
});

const BackButton = styled(Button)({
  width: 'fit-content',
  marginTop: '16px',
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  fontWeight: 500,
  textTransform: 'none',
  color: '#87879b',
  background: 'none',
  boxShadow: 'none',
  '&:hover': {
    color: '#7950f2',
    backgroundColor: 'transparent',
    boxShadow: 'none',
  },
});

// ===== ПРОПСЫ ДЛЯ КОМПОНЕНТА =====
interface LoginPageProps {
  onLogin: () => void;
}

// ===== КОМПОНЕНТ СТРАНИЦЫ =====
const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Экран приветствия с входом через ЕИС показан по умолчанию,
  // форма логина/пароля открывается по кнопке «Вход по логину и паролю».
  const [showCredentials, setShowCredentials] = useState(false);
  const [eisLoading, setEisLoading] = useState(false);
  const [eisError, setEisError] = useState<string | null>(null);
  const eisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (eisTimerRef.current) clearTimeout(eisTimerRef.current);
  }, []);

  const validateForm = () => {
    const newErrors: { login?: string; password?: string } = {};
    if (!login.trim()) newErrors.login = 'Пожалуйста, введите логин';
    if (!password.trim()) newErrors.password = 'Пожалуйста, введите пароль';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result = await authApi.login(login.trim(), password);
      onLogin();
      // Если профиль не заполнен И нет ФИО — переходим на страницу завершения
      // Сотрудники, созданные администратором с ФИО, не должны сюда попадать
      if (!result.profile_completed && !result.employee_name) {
        navigate('/profile-complete');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setAuthError(getApiErrorMessage(err, 'Невозможно осуществить вход в систему.'));
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogin(e.target.value);
    if (errors.login) setErrors({ ...errors, login: '' });
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (errors.password) setErrors({ ...errors, password: '' });
  };

  // Заглушка входа через ЕИС: реальная интеграция пока не подключена.
  // Показываем лоадер, затем — ошибку во всплывающем уведомлении (тосте).
  const handleEisLogin = () => {
    if (eisLoading) return;
    setEisError(null);
    setEisLoading(true);
    eisTimerRef.current = setTimeout(() => {
      setEisLoading(false);
      setEisError(
        'Не удалось войти через ЕИС «Образовательный портал». Войдите по логину и паролю.',
      );
    }, 1200);
  };

  const closeEisToast = () => setEisError(null);

  const handlePedIdLogin = () => {
    // Здесь логика входа через Пед.ID
    console.log('Вход через Пед.ID');
    // Например: window.location.href = 'https://ped-id.ru/auth';
  };

  return (
    <PageWrapper>
      <CertBanner />
      <LoginBackground>
        <LoginContainer>
          <LoginCard elevation={0}>
            {!showCredentials ? (
              <WelcomeWrapper>
                <MainTitle variant="h1">ТОР ЭДО</MainTitle>

                <WelcomeTextBlock>
                  <WelcomeText>
                    Чтобы зайти в подсистему электронного документооборота, авторизуйтесь через ЕИС
                  </WelcomeText>
                  <EisButton
                    variant="contained"
                    disableElevation
                    onClick={handleEisLogin}
                    disabled={eisLoading}
                    startIcon={eisLoading ? <CircularProgress size={20} sx={{ color: '#ffffff' }} /> : undefined}
                  >
                    {eisLoading ? 'Вход через ЕИС…' : 'Войти через ЕИС'}
                  </EisButton>
                </WelcomeTextBlock>

                <BottomActions>
                  <Divider sx={{ width: '100%' }} />
                  <CredentialsLinkButton
                    disableRipple
                    onClick={() => {
                      setEisError(null);
                      setShowCredentials(true);
                    }}
                  >
                    Вход по логину и паролю
                  </CredentialsLinkButton>
                </BottomActions>
              </WelcomeWrapper>
            ) : (
              <>
            <TitleWrapper>
              <MainTitle variant="h1">ТОР ЭДО</MainTitle>
            </TitleWrapper>

            <form onSubmit={handleSubmit}>
              <Subtitle variant="subtitle1">Вход по логину и паролю</Subtitle>

              {authError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: '12px', fontFamily: 'Lato, sans-serif' }}>
                  {authError}
                </Alert>
              )}

              <StyledTextField
                fullWidth
                id="login"
                label="Логин"
                variant="outlined"
                value={login}
                onChange={handleLoginChange}
                error={!!errors.login}
                helperText={errors.login}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end" />
                    ),
                  },
                }}
              />

              <StyledTextField
                fullWidth
                id="password"
                label="Пароль"
                type={showPassword ? 'text' : 'password'}
                variant="outlined"
                value={password}
                onChange={handlePasswordChange}
                error={!!errors.password}
                helperText={errors.password}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={togglePasswordVisibility}
                          edge="end"
                          sx={{
                            color: '#87879b',
                            '&:hover': { color: '#7950f2' },
                          }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <SubmitButton
                type="submit"
                disabled={!login.trim() || !password.trim() || loading}
                endIcon={loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M19 10.9999H7.135L10.768 6.63991C11.122 6.21591 11.064 5.58491 10.64 5.23191C10.215 4.87791 9.585 4.93591 9.232 5.35991L4.232 11.3599C4.193 11.4069 4.173 11.4619 4.144 11.5139C4.12 11.5559 4.091 11.5919 4.073 11.6379C4.028 11.7529 4.001 11.8739 4.001 11.9959C4.001 11.9969 4 11.9989 4 11.9999C4 12.0009 4.001 12.0029 4.001 12.0039C4.001 12.1259 4.028 12.2469 4.073 12.3619C4.091 12.4079 4.12 12.4439 4.144 12.4859C4.173 12.5379 4.193 12.5929 4.232 12.6399L9.232 18.6399C9.43 18.8769 9.714 18.9999 10 18.9999C10.226 18.9999 10.453 18.9239 10.64 18.7679C11.064 18.4149 11.122 17.7839 10.768 17.3599L7.135 12.9999H19C19.552 12.9999 20 12.5519 20 11.9999C20 11.4479 19.552 10.9999 19 10.9999Z" fill="white"/>
                  </svg>}
              >
                <span>{loading ? 'Вход...' : 'Войти'}</span>
              </SubmitButton>
            </form>

            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <BackButton
                disableRipple
                onClick={() => {
                  setAuthError(null);
                  setShowCredentials(false);
                }}
              >
                Другие способы входа
              </BackButton>
            </Box>
              </>
            )}
          </LoginCard>
        </LoginContainer>
      </LoginBackground>
      <Footer />

      {/* Ошибка входа через ЕИС — всплывающее уведомление */}
      <Snackbar
        open={!!eisError}
        autoHideDuration={6000}
        onClose={closeEisToast}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: '96px' }}
      >
        <Alert
          onClose={closeEisToast}
          severity="error"
          sx={{
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            minWidth: '300px',
            maxWidth: '420px',
            fontFamily: 'Lato, sans-serif',
          }}
        >
          {eisError}
        </Alert>
      </Snackbar>
    </PageWrapper>
  );
};

export default LoginPage;