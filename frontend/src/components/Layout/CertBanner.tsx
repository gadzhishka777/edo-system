import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Link,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import LaunchIcon from '@mui/icons-material/Launch';
import CloseIcon from '@mui/icons-material/Close';

// Ссылка на инструкцию по установке корневых сертификатов Минцифры России
const INSTRUCTION_URL = 'https://www.gosuslugi.ru/crt';

// ===== СТИЛИЗОВАННЫЕ КОМПОНЕНТЫ =====

const BannerWrapper = styled(Box)({
  position: 'sticky',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1200,
  width: '100%',
  minHeight: '80px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '12px 28px',
  boxSizing: 'border-box',
  backgroundColor: '#cf2c2c',
  fontFamily: 'Lato, sans-serif',
  overflow: 'hidden',
});

const BannerText = styled(Typography)({
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  maxWidth: '1400px',
});

const InlineLink = styled(Link)({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  marginLeft: '6px',
  verticalAlign: 'middle',
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
  '& svg': {
    fontSize: '20px',
    flexShrink: 0,
  },
  '&:hover': {
    color: '#ffffff',
    textDecoration: 'underline',
  },
});

const ActionButton = styled('a')({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '40px',
  padding: '0 20px',
  flexShrink: 0,
  borderRadius: '8px',
  backgroundColor: 'rgba(255, 255, 255, 0.17)',
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
});

const CloseButton = styled(IconButton)({
  width: '40px',
  height: '40px',
  flexShrink: 0,
  borderRadius: '8px',
  backgroundColor: 'rgba(255, 255, 255, 0.17)',
  color: '#ffffff',
  '& svg': {
    fontSize: '24px',
  },
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
});

// ===== КОМПОНЕНТ БАННЕРА =====
const CertBanner: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!visible) return null;

  return (
    <BannerWrapper
      role="alert"
      sx={{
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
      }}
    >
      <BannerText>
        Для безопасного защищённого соединения и корректной работы с системой установите корневые сертификаты Минцифры России на все используемые
        устройства. Подробная инструкция размещена по ссылке:
        <InlineLink href={INSTRUCTION_URL} target="_blank" rel="noopener noreferrer">
          {INSTRUCTION_URL}
          <LaunchIcon />
        </InlineLink>
      </BannerText>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
          justifyContent: isMobile ? 'flex-end' : 'flex-start',
        }}
      >
        <ActionButton href={INSTRUCTION_URL} target="_blank" rel="noopener noreferrer">
          Открыть инструкцию
        </ActionButton>
        <CloseButton onClick={() => setVisible(false)} aria-label="Закрыть баннер">
          <CloseIcon />
        </CloseButton>
      </Box>
    </BannerWrapper>
  );
};

export default CertBanner;
