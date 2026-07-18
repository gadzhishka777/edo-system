import { styled } from '@mui/material/styles';
import { Box, Button, Typography, Paper } from '@mui/material';

// Обёртка страницы
export const PageWrapper = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: '#f4f4f8',
});

export const LoginPageWrapper = styled(Box)({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 20px',
});

export const LoginContainer = styled(Box)({
  width: '100%',
  maxWidth: '460px',
});

export const LoginCard = styled(Paper)({
  padding: '40px 32px 48px',
  borderRadius: '16px',
  backgroundColor: '#ffffff',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
  position: 'relative',
});

// Кнопка "Назад"
export const BackButton = styled(Button)({
  position: 'absolute',
  top: '16px',
  left: '16px',
  minWidth: 0,
  padding: '8px',
  borderRadius: '8px',
  color: '#292940',
  '&:hover': {
    backgroundColor: '#f0f0f5',
  },
});

// Заголовок
export const MainTitle = styled(Typography)({
  fontSize: '24px',
  fontWeight: 600,
  color: '#101025',
  textAlign: 'center',
  marginBottom: '8px',
  fontFamily: 'Inter, sans-serif',
  lineHeight: 1.3,
});

export const Subtitle = styled(Typography)({
  fontSize: '16px',
  color: '#87879b',
  textAlign: 'center',
  marginBottom: '32px',
  fontFamily: 'Inter, sans-serif',
});

// Группа инпутов
export const InputGroup = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'error',
})<{ error?: boolean }>(({ error }) => ({
  position: 'relative',
  marginBottom: '24px',
  '&:last-of-type': {
    marginBottom: '32px',
  },
  '& input': {
    width: '100%',
    height: '56px',
    padding: '16px 16px 0 16px',
    fontSize: '16px',
    fontFamily: 'Inter, sans-serif',
    color: '#101025',
    backgroundColor: '#f4f4f8',
    border: `2px solid ${error ? '#e74c3c' : 'transparent'}`,
    borderRadius: '8px',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
    '&:focus': {
      borderColor: error ? '#e74c3c' : '#4c6ef5',
      backgroundColor: '#ffffff',
      boxShadow: error ? '0 0 0 4px rgba(231, 76, 60, 0.1)' : '0 0 0 4px rgba(76, 110, 245, 0.08)',
    },
    '&:hover': {
      backgroundColor: '#ffffff',
    },
    '&.filled': {
      backgroundColor: '#ffffff',
    },
  },
  '& label': {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '16px',
    fontFamily: 'Inter, sans-serif',
    color: error ? '#e74c3c' : '#87879b',
    pointerEvents: 'none',
    transition: 'all 0.2s ease',
    backgroundColor: 'transparent',
    padding: '0 4px',
  },
  // ✅ Объединяем одинаковые селекторы в один блок
  '& input:focus ~ label, & input.filled ~ label': {
    top: '8px',
    transform: 'translateY(0)',
    fontSize: '12px',
    color: error ? '#e74c3c' : '#4c6ef5',
    backgroundColor: '#ffffff',
    padding: '0 4px',
  },
}));

export const ErrorMessage = styled(Typography)({
  position: 'absolute',
  bottom: '-20px',
  left: '0',
  fontSize: '12px',
  color: '#e74c3c',
  fontFamily: 'Inter, sans-serif',
});

// Кнопка показа пароля
export const PasswordToggle = styled(Button)({
  position: 'absolute',
  right: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  minWidth: 0,
  padding: '4px',
  color: '#87879b',
  '&:hover': {
    backgroundColor: 'transparent',
    color: '#4c6ef5',
  },
});

// Кнопка входа
export const SubmitButton = styled(Button)({
  width: '100%',
  height: '56px',
  backgroundColor: '#4c6ef5',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  borderRadius: '8px',
  textTransform: 'none',
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: '#364fc7',
  },
  '&:disabled': {
    backgroundColor: '#d6d6df',
    color: '#87879b',
    cursor: 'not-allowed',
  },
});