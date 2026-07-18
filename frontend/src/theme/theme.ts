// src/theme/theme.ts
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  typography: {
    fontFamily: 'Lato, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    h1: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 700,
    },
    h2: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 700,
    },
    h3: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 700,
    },
    h4: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 700,
    },
    h5: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 600,
    },
    h6: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 600,
    },
    subtitle1: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 400,
    },
    subtitle2: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 400,
    },
    body1: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 400,
    },
    body2: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 400,
    },
    button: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 600,
      textTransform: 'none',
    },
    caption: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 400,
    },
    overline: {
      fontFamily: 'Lato, sans-serif',
      fontWeight: 400,
    },
  },
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#dc004e',
      light: '#ff4081',
      dark: '#9a0036',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
    },
    background: {
      default: '#f5f7fa',
      paper: '#ffffff',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          fontFamily: 'Lato, sans-serif',
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          fontFamily: 'Lato, sans-serif',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputLabel-root': {
            fontFamily: 'Lato, sans-serif',
          },
          '& .MuiInputBase-root': {
            fontFamily: 'Lato, sans-serif',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

export default theme;