// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { ruRU } from '@mui/x-date-pickers/locales';
import { Global } from '@emotion/react';
import 'dayjs/locale/ru';
import App from './App';
import theme from './theme/theme';
import { latoFonts } from './styles/fonts';
import './index.css';

// Русская локализация полей даты MUI X: маска ввода «ДД.ММ.ГГГГ» вместо «DD.MM.YYYY»,
// русские названия месяцев и подписи в календаре.
// ВАЖНО: localeText наследуется вложенными LocalizationProvider, поэтому задаём его один раз здесь.
const ruDateLocaleText = ruRU.components.MuiLocalizationProvider.defaultProps.localeText;

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <Global styles={latoFonts} />
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale="ru"
        localeText={ruDateLocaleText}
      >
        <App />
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>
);