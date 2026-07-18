import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Modal,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Close as CloseIcon } from '@mui/icons-material';

// ===== СТИЛИЗОВАННЫЕ КОМПОНЕНТЫ =====

const FooterLine = styled(Box)({
  height: '1px',
  backgroundColor: '#d6d6df',
  width: '100%',
});

const FooterWrapper = styled(Box)({
  width: '100%',
  backgroundColor: '#f4f4f8',
  marginTop: 'auto',
});

const FooterContent = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

const FooterRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  [theme.breakpoints.down('md')]: {
    flexDirection: 'column',
  },
}));

const FooterLogos = styled(Box)(({ theme }) => ({
  display: 'flex',
  flex: 1,
  [theme.breakpoints.down('md')]: {
    flexDirection: 'column',
  },
}));

const FooterItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  marginRight: '34px',
  [theme.breakpoints.down('md')]: {
    marginRight: 0,
    marginBottom: '16px',
  },
  '&:last-child': {
    marginRight: 0,
  },
}));

const FooterText = styled(Typography)({
  fontFamily: 'Inter, sans-serif',
  fontSize: '12px',
  lineHeight: '16px',
  maxWidth: '304px',
  color: '#101025',
});

const FooterButtonWrap = styled(Box)(({ theme }) => ({
  marginLeft: '24px',
  [theme.breakpoints.down('md')]: {
    marginLeft: 0,
    marginTop: '16px',
    width: '100%',
  },
}));

// ✅ Убираем useMediaQuery из styled компонента
const StyledFooterButton = styled(Button)({
  alignSelf: 'flex-start',
  backgroundColor: 'transparent',
  border: '1px solid #aeaebc',
  borderRadius: '8px',
  color: '#101025',
  padding: '9px 24px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '12px',
  textTransform: 'none',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: '#e8e8ef',
    borderColor: '#e8e8ef',
  },
});

const FooterBottom = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: '16px',
  width: '100%',
  [theme.breakpoints.down('md')]: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
  },
}));

const FooterVersionText = styled(Typography)({
  color: '#87879b',
  fontFamily: 'Inter, sans-serif',
  fontSize: '12px',
});

const FooterCreator = styled(Typography)({
  color: '#87879b',
  fontFamily: 'Inter, sans-serif',
  fontSize: '12px',
});

const FooterCreatorLink = styled('span')({
  color: '#4c6ef5',
  cursor: 'pointer',
  transition: 'color 0.2s ease',
  '&:hover': {
    color: '#364fc7',
    textDecoration: 'underline',
  },
});

// ===== КОМПОНЕНТ =====

const Footer: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleWriteUs = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  return (
    <>
      <FooterLine />
      <FooterWrapper>
        <Container maxWidth="lg" sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
          <FooterContent>
            <FooterRow>
              <FooterLogos>
                <FooterItem>
                  <FooterText variant="caption">
                    Администрация МРОО "СНПМ"
                  </FooterText>
                </FooterItem>
                <FooterItem>
                  <FooterText variant="caption">
                    Департамент информационных технологий
                  </FooterText>
                </FooterItem>
              </FooterLogos>
              <FooterButtonWrap>
                <StyledFooterButton
                  onClick={handleWriteUs}
                  sx={{
                    width: isMobile ? '100%' : 'auto',
                    textAlign: isMobile ? 'center' : 'left',
                    justifyContent: isMobile ? 'center' : 'flex-start',
                  }}
                >
                  Написать нам
                </StyledFooterButton>
              </FooterButtonWrap>
            </FooterRow>

            <FooterBottom>
              <FooterVersionText variant="caption">
                Версия 0.0.3
              </FooterVersionText>
            </FooterBottom>
          </FooterContent>
        </Container>
      </FooterWrapper>

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