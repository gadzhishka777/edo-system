import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: any;
}

/** Ловит любые ошибки рендера React и показывает понятный экран
 *  вместо белой страницы. */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: any): State {
    return { error };
  }

  componentDidCatch(error: any, info: React.ErrorInfo) {
    // Пишем в консоль для диагностики
    console.error('Ошибка интерфейса:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg =
        this.state.error?.message ||
        (typeof this.state.error === 'string' ? this.state.error : 'Неизвестная ошибка интерфейса');
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f5f5f9',
            p: 3,
          }}
        >
          <Paper elevation={0} sx={{ maxWidth: 520, width: '100%', p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: 20, color: '#101025', mb: 1 }}>
              Произошла ошибка
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: 13.5, color: '#87879b', mb: 3, wordBreak: 'break-word' }}>
              {msg}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => this.setState({ error: null })}>
                Попробовать снова
              </Button>
              <Button
                variant="contained"
                onClick={() => window.location.reload()}
                sx={{ backgroundColor: '#4c6ef5' }}
              >
                Перезагрузить страницу
              </Button>
            </Box>
          </Paper>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
