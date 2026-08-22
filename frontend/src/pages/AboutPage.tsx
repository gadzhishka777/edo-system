import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Checkbox,
  FormControlLabel,
  IconButton,
  Tooltip,
  Link,
  Stack,
  Modal,
  Fade,
  Button,
  TextField,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  VpnKey as VpnKeyIcon,
  Close as CloseIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { authApi } from '../api/edoApi';
import { getApiErrorMessage } from '../api/edoApi';

const PageContainer = styled(Box)({
  padding: '24px 32px',
  maxWidth: '900px',
  margin: '0 auto',
});

const StyledAccordion = styled(Accordion)({
  border: '1px solid #eaebf0',
  borderRadius: '12px !important',
  marginBottom: '16px',
  boxShadow: 'none',
  '&:before': {
    display: 'none',
  },
  '& .MuiAccordionSummary-root': {
    padding: '16px 20px',
    borderRadius: '12px',
    '&:hover': {
      backgroundColor: '#f9fafe',
    },
  },
  '& .MuiAccordionSummary-content': {
    fontFamily: 'Lato, sans-serif',
    fontWeight: 600,
    fontSize: '16px',
    color: '#101025',
  },
  '& .MuiAccordionDetails-root': {
    padding: '20px 24px 24px',
    borderTop: '1px solid #eaebf0',
  },
});

const InfoRow = styled(Box)({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid #f4f4f8',
  '&:last-child': {
    borderBottom: 'none',
  },
});

const InfoLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  color: '#87879b',
  fontWeight: 400,
});

const InfoValue = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  color: '#101025',
  fontWeight: 500,
});

const StyledLink = styled(Link)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  color: '#4c6ef5',
  fontWeight: 500,
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': {
    textDecoration: 'underline',
  },
});

const LicenseChip = styled(Chip, { shouldForwardProp: (prop) => prop !== 'valid' })<{ valid: boolean }>(({ valid }) => ({
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '12px',
  height: '28px',
  backgroundColor: valid ? '#e8f5e9' : '#ffebee',
  color: valid ? '#2e7d32' : '#c62828',
  '& .MuiChip-icon': {
    fontSize: '16px',
    color: valid ? '#2e7d32' : '#c62828',
  },
}));

// ===== СТИЛИ ДЛЯ МОДАЛЬНОГО ОКНА =====
const ModalContainer = styled(Box)({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '90%',
  maxWidth: '500px',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
  overflow: 'hidden',
});

const ModalHeader = styled(Box)({
  padding: '20px 28px',
  borderBottom: '1px solid #eaebf0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const ModalBody = styled(Box)({
  padding: '24px 28px 32px',
});

const ModalFooter = styled(Box)({
  padding: '16px 28px',
  borderTop: '1px solid #eaebf0',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  backgroundColor: '#fafafa',
});

const CancelButton = styled(Button)({
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 500,
  color: '#87879b',
  padding: '8px 24px',
  borderRadius: '8px',
  fontSize: '14px',
  '&:hover': {
    backgroundColor: '#f4f4f8',
  },
});

const ApplyButton = styled(Button)({
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 600,
  backgroundColor: '#4c6ef5',
  color: '#ffffff',
  padding: '8px 32px',
  borderRadius: '8px',
  fontSize: '14px',
  '&:hover': {
    backgroundColor: '#364fc7',
  },
  '&:disabled': {
    backgroundColor: '#d6d6df',
    color: '#87879b',
  },
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    '& fieldset': {
      borderColor: '#d6d6df',
      borderWidth: '1px',
    },
    '&:hover fieldset': {
      borderColor: '#b0b3c3',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#4c6ef5',
      borderWidth: '2px',
    },
  },
  '& .MuiInputLabel-root': {
    fontFamily: 'Lato, sans-serif',
    color: '#87879b',
    '&.Mui-focused': {
      color: '#4c6ef5',
    },
  },
  '& .MuiInputBase-input': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
    padding: '14px 16px',
    textAlign: 'center',
    letterSpacing: '1px',
  },
});

// Интерфейсы для данных из API
interface OrgInfo {
  id: number;
  uuid: string;
  name: string;
  inn?: string;
  is_active: boolean;
  license_status: string;
  license_expire: string;
  license_max_docs: number;
  license_max_orgs: number;
}

interface LicenseInfo {
  license_key: string;
  product: string;
  valid: boolean;
  expire_date: string;
  max_organizations: number;
  max_documents: number;
  current_organizations: number;
  current_documents: number;
}

const AboutPage: React.FC = () => {
  const [useGost, setUseGost] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Активировать лицензию может только администратор организации
  const isOrgAdmin = React.useMemo(() => {
    try {
      const roles: string[] = JSON.parse(localStorage.getItem('employee_roles') || '[]');
      return roles.includes('org_admin');
    } catch {
      return false;
    }
  }, []);

  // Состояния для данных из БД
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);

  // Загрузка данных организации и лицензии
  useEffect(() => {
    loadOrgData();
  }, []);

  const loadOrgData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgData, licenseData] = await Promise.all([
        authApi.getCurrentOrg(),
        authApi.getLicense(),
      ]);
      setOrgInfo(orgData);
      setLicenseInfo(licenseData);
    } catch (err: any) {
      setError('Ошибка загрузки данных');
      console.error('Ошибка загрузки:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLicenseModal = () => {
    setIsLicenseModalOpen(true);
    setLicenseKey('');
  };

  const handleCloseLicenseModal = () => {
    setIsLicenseModalOpen(false);
    setLicenseKey('');
  };

  const handleApplyLicense = async () => {
    if (!licenseKey.trim()) return;
    
    setActivationLoading(true);
    try {
      const result = await authApi.activateLicense(licenseKey);
      setToastMessage(result.message || 'Лицензия успешно активирована');
      setToastOpen(true);
      handleCloseLicenseModal();
      
      // Перезагружаем данные
      await loadOrgData();
    } catch (err: any) {
      const errorMessage = getApiErrorMessage(err) || err?.message || 'Ошибка активации лицензии';
      setToastMessage(errorMessage);
      setToastOpen(true);
    } finally {
      setActivationLoading(false);
    }
  };

  const handleGostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setUseGost(checked);
    setToastMessage(checked ? 'Опция включена' : 'Опция выключена');
    setToastOpen(true);
  };

  // Форматирование даты
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}.${month}.${year}`;
    } catch {
      return dateStr;
    }
  };

  // Вычисление оставшихся дней
  const getDaysRemaining = (expireDate: string): number => {
    if (!expireDate) return 0;
    try {
      const expire = new Date(expireDate);
      const now = new Date();
      const diffTime = expire.getTime() - now.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  // Маскировка ключа для отображения
  const maskLicenseKey = (key: string): string => {
    if (!key || key.length < 10) return key;
    const parts = key.split('-');
    if (parts.length >= 7) {
      return `${parts[0]}-${parts[1]}-*****-${parts[5]}-${parts[6]}`;
    }
    return key.substring(0, 10) + '...';
  };

  if (loading) {
    return (
      <PageContainer>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </PageContainer>
    );
  }

  const daysRemaining = licenseInfo?.expire_date ? getDaysRemaining(licenseInfo.expire_date) : 0;

  return (
    <PageContainer>
      {/* Заголовок */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: '12px',
          border: '1px solid #eaebf0',
          mb: 4,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'Lato, sans-serif',
                fontWeight: 700,
                fontSize: '20px',
                color: '#101025',
              }}
            >
              Типовое облачное решение для ведения электронного документооборота
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'Lato, sans-serif',
                color: '#87879b',
                fontSize: '13px',
                mt: 0.5,
              }}
            >
              © МРОО "СНПМ"
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} sx={{ mt: { xs: 2, sm: 0 }, alignItems: 'center' }}>
            <StyledLink href="https://mroo-snpm.ru" target="_blank">
              mroo-snpm.ru
            </StyledLink>
            <StyledLink href="mailto:info@mroo-snpm.ru">
              info@mroo-snpm.ru
            </StyledLink>
          </Stack>
        </Box>
      </Paper>

      {/* Сведения об организации */}
      <StyledAccordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          Сведения об организации
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <InfoRow>
              <InfoLabel>Наименование</InfoLabel>
              <InfoValue>{orgInfo?.name || '—'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Сокращенное наименование</InfoLabel>
              <InfoValue>{orgInfo?.name || '—'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>UUID организации</InfoLabel>
              <InfoValue sx={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {orgInfo?.uuid || '—'}
              </InfoValue>
            </InfoRow>
          </Box>
        </AccordionDetails>
      </StyledAccordion>

      {/* Лицензия */}
      <StyledAccordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', flexWrap: 'wrap' }}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '16px', color: '#101025' }}>
              Лицензия ТОР ЭДО
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, ml: { xs: 0, sm: 'auto' } }}>
              <Tooltip 
                title={licenseInfo?.valid 
                  ? `Осталось ${daysRemaining} дн. (до ${formatDate(licenseInfo.expire_date)})` 
                  : 'Лицензия недействительна'
                } 
                arrow
              >
                <LicenseChip
                  icon={licenseInfo?.valid ? <CheckCircleIcon /> : <ErrorIcon />}
                  label={licenseInfo?.valid ? 'Действительна' : 'Недействительна'}
                  size="small"
                  valid={licenseInfo?.valid || false}
                />
              </Tooltip>
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <InfoRow>
              <InfoLabel>Продукт</InfoLabel>
              <InfoValue>{licenseInfo?.product || 'ТОР ЭДО'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Тип решения</InfoLabel>
              <InfoValue>Типовое облачное решение</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Подсистема</InfoLabel>
              <InfoValue>Электронный документооборот (ЭДО)</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Версия</InfoLabel>
              <InfoValue>0.4</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Статус лицензии</InfoLabel>
              <InfoValue sx={{ color: licenseInfo?.valid ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                {licenseInfo?.valid ? 'Активна' : 'Истекла / Не активирована'}
              </InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Срок действия</InfoLabel>
              <InfoValue>{licenseInfo?.expire_date ? formatDate(licenseInfo.expire_date) : '—'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Лицензионный ключ</InfoLabel>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#101025' }}>
                  {licenseInfo?.license_key ? maskLicenseKey(licenseInfo.license_key) : '—'}
                </Typography>
                {isOrgAdmin && (
                  <Tooltip title="Активировать лицензию">
                    <IconButton
                      size="small"
                      sx={{ color: '#4c6ef5' }}
                      onClick={handleOpenLicenseModal}
                    >
                      <VpnKeyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </InfoRow>
          </Box>
        </AccordionDetails>
      </StyledAccordion>

      {/* Дополнительные настройки */}
      <StyledAccordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          Дополнительные настройки
        </AccordionSummary>
        <AccordionDetails>
          <FormControlLabel
            control={
              <Checkbox
                checked={useGost}
                onChange={handleGostChange}
                sx={{
                  '&.Mui-checked': {
                    color: '#4c6ef5',
                  },
                }}
              />
            }
            label={
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#101025' }}>
                Использовать только набор алгоритмов ГОСТ для подключений по API
              </Typography>
            }
          />
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              ml: 4,
              fontFamily: 'Lato, sans-serif',
              color: '#87879b',
              fontSize: '12px',
            }}
          >
            При включении этой опции все API-запросы будут использовать только ГОСТ-алгоритмы шифрования
          </Typography>
        </AccordionDetails>
      </StyledAccordion>

      {/* ===== МОДАЛЬНОЕ ОКНО ДЛЯ АКТИВАЦИИ ЛИЦЕНЗИИ ===== */}
      <Modal
        open={isLicenseModalOpen}
        onClose={handleCloseLicenseModal}
        closeAfterTransition
        aria-labelledby="license-modal-title"
      >
        <Fade in={isLicenseModalOpen}>
          <ModalContainer>
            <ModalHeader>
              <Typography
                id="license-modal-title"
                variant="h6"
                sx={{
                  fontFamily: 'Lato, sans-serif',
                  fontWeight: 700,
                  fontSize: '18px',
                  color: '#101025',
                }}
              >
                Лицензия МИС Пед.ID: Подсистема ЭДО
              </Typography>
              <IconButton onClick={handleCloseLicenseModal} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>

            <ModalBody>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'Lato, sans-serif',
                  color: '#87879b',
                  fontSize: '14px',
                  mb: 3,
                }}
              >
                Введите лицензионный ключ для активации
              </Typography>

              <StyledTextField
                fullWidth
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                variant="outlined"
                size="medium"
                disabled={activationLoading}
                slotProps={{
                  input: {
                    sx: {
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      letterSpacing: '1px',
                      fontSize: '14px',
                    },
                  },
                }}
              />
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={handleCloseLicenseModal} disabled={activationLoading}>
                Отмена
              </CancelButton>
              <ApplyButton 
                onClick={handleApplyLicense} 
                disabled={!licenseKey.trim() || activationLoading}
              >
                {activationLoading ? <CircularProgress size={20} /> : 'Активировать'}
              </ApplyButton>
            </ModalFooter>
          </ModalContainer>
        </Fade>
      </Modal>

      {/* ===== TOAST УВЕДОМЛЕНИЕ ===== */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setToastOpen(false)} 
          severity="info" 
          sx={{ width: '100%' }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </PageContainer>
  );
};

export default AboutPage;