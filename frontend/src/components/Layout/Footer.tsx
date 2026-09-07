import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Link,
  Modal,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

// ===== КОНТАКТЫ =====
const SUPPORT_EMAIL = 'obrazovanieo7@mail.ru';
const VK_URL = 'https://vk.ru/mroosnpm';

// ===== ВАРИАНТЫ ОФОРМЛЕНИЯ =====
// dark  — тёмно-синий, используется на странице входа
// light — светлый, как был раньше, для внутренних страниц приложения
type FooterVariant = 'dark' | 'light';

const getPalette = (variant: FooterVariant) =>
  variant === 'light'
    ? {
        bg: '#f4f4f8',
        text: '#101025',
        muted: '#87879b',
        label: '#53546e',
        btnBorder: '#aeaebc',
        hoverBg: '#e8e8ef',
        hoverText: '#4c6ef5',
        // лёгкий верхний бордер, чтобы светлый футер не сливался с фоном страницы
        borderTop: '1px solid #d6d6df',
      }
    : {
        bg: '#2b3858',
        text: '#ebebeb',
        muted: '#aeaebc',
        label: '#aeaebc',
        btnBorder: '#aeaebc',
        hoverBg: '#333336',
        hoverText: '#ffffff',
        borderTop: 'none',
      };

// ===== ИКОНКИ =====

const CopyrightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" style={{ flex: '0 0 auto', marginTop: '3px', marginRight: '8px' }} aria-hidden="true">
    <path
      fill="#87879B"
      d="M7 1.1c2.4 0 4.6 1.4 5.5 3.7s.4 4.8-1.3 6.5c-1.5 1.5-3.7 2.1-5.8 1.6-2.1-.5-3.7-2.2-4.2-4.2-.5-2.2.1-4.4 1.6-5.9C3.9 1.7 5.4 1.1 7 1.1zM7 0C3.1 0 0 3.1 0 7s3.1 7 7 7 7-3.1 7-7c0-1.9-.7-3.6-2.1-4.9C10.6.7 8.9 0 7 0zm2.2 8.8c-.8.9-2 1.3-3.2.9C4.9 9.3 4.2 8.2 4.2 7S5 4.7 6.1 4.3c1.1-.4 2.4 0 3.2.9l.7-.6C9 3.3 7.3 2.8 5.7 3.3c-1.6.6-2.6 2-2.6 3.7 0 1.7 1 3.1 2.6 3.7 1.6.5 3.3 0 4.3-1.3l-.8-.6z"
    />
  </svg>
);

const VkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.938 18.446c-7.175 0-11.267-4.504-11.438-12h3.594c.118 5.502 2.768 7.832 4.866 8.313V6.446h3.384v4.745c2.073-.204 4.25-2.366 4.985-4.745h3.384c-.564 2.931-2.925 5.093-4.604 5.982 1.679.721 4.368 2.607 5.391 6.018h-3.725c-.8-2.282-2.794-4.048-5.43-4.288v4.288h-.407z" />
  </svg>
);

// ===== КОМПОНЕНТ =====

const Footer: React.FC<{ variant?: FooterVariant }> = ({ variant = 'dark' }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const p = getPalette(variant);

  const handleWriteUs = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  return (
    <>
      <footer
        style={{
          display: 'block',
          width: '100%',
          marginTop: 'auto',
          backgroundColor: p.bg,
          color: p.text,
          borderTop: p.borderTop,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <Container maxWidth={false} sx={{ py: { xs: 3, md: 4 }, px: { xs: 2, sm: 3, md: 4 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '24px',
              flexDirection: { xs: 'column', md: 'row' },
            }}
          >
            {/* Левая колонка: навигация + копирайт */}
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: '20px',
                  mb: '20px',
                  flexWrap: 'wrap',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { sm: 'center' },
                }}
              >
                <Link
                  href={VK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: p.text,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    lineHeight: '20px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                    '&:hover': { color: p.hoverText, textDecoration: 'underline' },
                  }}
                >
                  О проекте
                </Link>
                <Link
                  href={VK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: p.text,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    lineHeight: '20px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                    '&:hover': { color: p.hoverText, textDecoration: 'underline' },
                  }}
                >
                  Пользовательское соглашение
                </Link>
              </Box>

              <Box sx={{ display: 'inline-flex', alignItems: 'flex-start' }}>
                <CopyrightIcon />
                <Typography
                  variant="body2"
                  sx={{
                    color: p.muted,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    lineHeight: '20px',
                    maxWidth: '420px',
                  }}
                >
                  Межрегиональная общественная организация «Содружество наставников, педагогов и молодежи»
                </Typography>
              </Box>
            </Box>

            {/* Поддержка + ВК */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography
                variant="body2"
                sx={{
                  color: p.label,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  lineHeight: '20px',
                  mb: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                Техподдержка
              </Typography>
              <Link
                href={`mailto:${SUPPORT_EMAIL}`}
                sx={{
                  color: p.text,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  lineHeight: '20px',
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                  '&:hover': { color: p.hoverText, textDecoration: 'underline' },
                }}
              >
                {SUPPORT_EMAIL}
              </Link>
              <Link
                href={VK_URL}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  mt: '8px',
                  color: p.text,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  lineHeight: '20px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                  '& svg': { width: '24px', height: '24px', mr: '8px', fill: 'currentColor' },
                  '&:hover': { color: p.hoverText },
                }}
              >
                <VkIcon />
                ВКонтакте
              </Link>
            </Box>

            {/* Кнопка обратной связи */}
            <Box sx={{ ml: { md: 'auto' }, width: { xs: '100%', md: 'auto' } }}>
              <Button
                onClick={handleWriteUs}
                sx={{
                  alignSelf: 'flex-start',
                  backgroundColor: 'transparent',
                  border: `1px solid ${p.btnBorder}`,
                  borderRadius: '8px',
                  color: p.text,
                  padding: '9px 24px',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  fontWeight: 500,
                  textTransform: 'none',
                  width: { xs: '100%', md: 'auto' },
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: p.hoverBg,
                    borderColor: p.hoverBg,
                    color: p.hoverText,
                  },
                }}
              >
                Написать нам
              </Button>
            </Box>
          </Box>

          {/* Версия */}
          <Box sx={{ width: '100%', pt: '16px' }}>
            <Typography
              variant="caption"
              sx={{
                color: p.muted,
                fontFamily: 'Inter, sans-serif',
                fontSize: '12px',
                lineHeight: '16px',
              }}
            >
              Версия 0.5
            </Typography>
          </Box>
        </Container>
      </footer>

      {/* Модальное окно */}
      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        aria-labelledby="modal-title"
      >
        <Paper
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: { xs: '90%', sm: 480 },
            maxWidth: 480,
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '32px 32px 24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            outline: 'none',
          }}
        >
          <IconButton
            onClick={handleCloseModal}
            sx={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              color: '#87879b',
            }}
          >
            <CloseIcon />
          </IconButton>

          <Typography
            id="modal-title"
            variant="h6"
            sx={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#181920',
              fontFamily: 'Lato, sans-serif',
              mb: 1,
              pr: 4,
            }}
          >
            Форма обратной связи не подключена
          </Typography>

          <Typography
            variant="body2"
            sx={{
              fontSize: '16px',
              color: '#7b819b',
              fontFamily: 'Lato, sans-serif',
              mb: 3,
              lineHeight: 1.5,
            }}
          >
            К сожалению, форма обратной связи пока не подключена к данному сервису.
            Вы можете оставить обращение по номеру горячей линии.
          </Typography>

          <Button
            variant="contained"
            fullWidth
            onClick={handleCloseModal}
            sx={{
              backgroundColor: '#0055cb',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '16px',
              fontWeight: 700,
              fontFamily: 'Lato, sans-serif',
              textTransform: 'none',
              '&:hover': {
                backgroundColor: '#0046a8',
              },
            }}
          >
            Понятно
          </Button>
        </Paper>
      </Modal>
    </>
  );
};

export default Footer;
