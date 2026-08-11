import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Alert,
  CircularProgress,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Lock as LockIcon } from '@mui/icons-material';

// ===================== API =====================

const API_BASE = process.env.REACT_APP_API_URL || '';

const adminApi = {
  login: async (login: string, password: string) => {
    const r = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка входа' }));
      throw new Error(err.detail || 'Ошибка входа');
    }
    return r.json();
  },

  logout: async (token: string) => {
    const r = await fetch(`${API_BASE}/api/admin/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return r.json();
  },

  getCurrentAdmin: async (token: string) => {
    const r = await fetch(`${API_BASE}/api/admin/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) throw new Error('Ошибка загрузки данных');
    return r.json();
  },
};

// ===================== СТИЛИ =====================

const PageContainer = styled(Box)({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: '20px',
});

const LoginCard = styled(Paper)({
  padding: '40px',
  maxWidth: '420px',
  width: '100%',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
});

const IconWrapper = styled(Box)({
  width: '72px',
  height: '72px',
  borderRadius: '50%',
  backgroundColor: '#667eea',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 24px',
});

// ===================== СТРАНИЦА =====================

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!login.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      return;
    }

    setLoading(true);
    try {
      const data = await adminApi.login(login.trim(), password);
      // Сохраняем токены
      localStorage.setItem('admin_access_token', data.access_token);
      localStorage.setItem('admin_refresh_token', data.refresh_token);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <LoginCard elevation={0}>
        <IconWrapper>
          <LockIcon sx={{ fontSize: '36px', color: 'white' }} />
        </IconWrapper>

        <Typography variant="h4" align="center" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, mb: 1, color: '#101025' }}>
          Админ-панель
        </Typography>
        <Typography variant="subtitle1" align="center" sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', mb: 4 }}>
          Вход в систему управления
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, fontFamily: 'Lato, sans-serif' }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <TextField
            fullWidth
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <Button
            fullWidth
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              py: 1.5,
              borderRadius: '8px',
              backgroundColor: '#667eea',
              fontFamily: 'Lato, sans-serif',
              fontWeight: 600,
              fontSize: '16px',
              '&:hover': { backgroundColor: '#5568d3' },
            }}
          >
            {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Войти'}
          </Button>
        </form>

        <Typography variant="caption" align="center" sx={{ display: 'block', mt: 3, color: '#87879b', fontFamily: 'Lato, sans-serif' }}>
          По умолчанию: admin / admin123
        </Typography>
      </LoginCard>
    </PageContainer>
  );
};

export default AdminLoginPage;
