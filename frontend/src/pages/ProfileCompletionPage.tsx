import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Chip,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { getEmployeeRoles, authApi, type ProfileCompleteRequest } from '../api/edoApi';

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    '& fieldset': {
      borderColor: '#d6d6df',
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
    fontSize: '14px',
    '&.Mui-focused': {
      color: '#4c6ef5',
    },
    '& .MuiFormLabel-asterisk': {
      color: '#d32f2f',
    },
  },
  '& .MuiInputBase-input': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '15px',
    padding: '14px 16px',
  },
  '& .MuiFormHelperText-root': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '12px',
    marginLeft: 0,
  },
});

const CategoryChip = styled(Chip)({
  fontFamily: 'Lato, sans-serif',
  fontWeight: 600,
  fontSize: '13px',
  height: '44px',
  padding: '0 16px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  borderRadius: '8px',
});

const StyledButton = styled(Button)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 32px',
  borderRadius: '8px',
  textTransform: 'none',
  boxShadow: 'none !important',
  '&:hover': {
    boxShadow: 'none !important',
  },
});

const ROLE_CATEGORIES = [
  {
    key: 'executor',
    label: 'Исполнитель',
    color: '#f1f8e9',
    textColor: '#33691e',
    bgColor: '#66bb6a',
    locked: true,
    description: 'Базовые права',
    roles: [
      'archive_access', 'document_initiator', 'task_initiator', 'task_executor',
      'controller', 'observer', 'doc_review', 'citizen_appeals',
      'approver', 'task_creator', 'recurring_task_creator', 'co_executor',
    ],
  },
  {
    key: 'clerk',
    label: 'Делопроизводитель',
    color: '#fff3e0',
    textColor: '#e65100',
    bgColor: '#ff9800',
    description: 'Работа с документами',
    roles: ['archivist', 'clerk', 'citizen_appeals_registrar', 'dictionary_editor'],
  },
  {
    key: 'manager',
    label: 'Руководитель',
    color: '#e3f2fd',
    textColor: '#0d47a1',
    bgColor: '#2196f3',
    description: 'Управление и утверждение',
    roles: ['department_head', 'final_approver'],
  },
  {
    key: 'admin',
    label: 'Администратор',
    color: '#f3e5f5',
    textColor: '#4a148c',
    bgColor: '#9c27b0',
    locked: true,
    description: 'Административные права',
    roles: ['user_substitution_editor', 'org_admin'],
  },
];

const ProfileCompletionPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['admin', 'executor']);
  const [birthday, setBirthday] = useState<Dayjs | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    middleName: '',
    position: '',
    department: '',
    phone: '',
    email: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getEmployeeRoles().catch(() => {});
  }, []);

  const handleFormChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0) {
      if (!formData.lastName.trim()) newErrors.lastName = 'Пожалуйста, укажите фамилию';
      if (!formData.firstName.trim()) newErrors.firstName = 'Пожалуйста, укажите имя';
    }

    if (step === 1) {
      if (selectedCategories.length === 0) {
        newErrors.roles = 'Выберите хотя бы одну роль';
      }
    }

    if (step === 2) {
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Введите корректный email';
      }
      if (formData.phone && !/^[\+\d\s()-]{10,20}$/.test(formData.phone)) {
        newErrors.phone = 'Введите корректный номер телефона';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!validateStep(2)) {
      setLoading(false);
      return;
    }

    const allRoles: string[] = [];
    selectedCategories.forEach((catKey) => {
      const category = ROLE_CATEGORIES.find((c) => c.key === catKey);
      if (category) allRoles.push(...category.roles);
    });

    const data: ProfileCompleteRequest = {
      last_name: formData.lastName,
      first_name: formData.firstName,
      middle_name: formData.middleName || undefined,
      position: formData.position || undefined,
      department: formData.department || undefined,
      roles: allRoles,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      birthday: birthday ? birthday.format('YYYY-MM-DD') : undefined,
      notes: formData.notes || undefined,
    };

    try {
      await authApi.completeProfile(data);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/about';
      }, 1500);
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      let msg = 'Ошибка при заполнении профиля';
      if (typeof d === 'string') {
        msg = d;
      } else if (Array.isArray(d)) {
        // Ошибки валидации FastAPI (422): массив {loc, msg, ...}
        msg = d
          .map((e: any) => {
            const field = Array.isArray(e.loc) ? e.loc.filter((x: any) => x !== 'body').join('.') : '';
            return `${field ? field + ': ' : ''}${e.msg}`;
          })
          .filter(Boolean)
          .join('; ') || 'Проверьте корректность заполнения полей';
      }
      setError(msg);
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = (categoryKey: string) => {
    const category = ROLE_CATEGORIES.find((c) => c.key === categoryKey);
    if (category?.locked) return;
    setSelectedCategories((prev) => {
      if (prev.includes(categoryKey)) {
        return prev.filter((k) => k !== categoryKey);
      }
      return [...prev, categoryKey];
    });
    setErrors(prev => ({ ...prev, roles: '' }));
  };

  const getSelectedCount = () => {
    let count = 0;
    selectedCategories.forEach((catKey) => {
      const category = ROLE_CATEGORIES.find((c) => c.key === catKey);
      if (category) count += category.roles.length;
    });
    return count;
  };

  const steps = [
    {
      label: 'Основные данные',
      description: 'Укажите ваши ФИО и должность',
    },
    {
      label: 'Права доступа',
      description: 'Выберите роли в системе',
    },
    {
      label: 'Контактная информация',
      description: 'Дополнительные данные',
    },
  ];

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ru">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f9',
          py: 4,
          px: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            maxWidth: 720,
            width: '100%',
            p: { xs: 3, sm: 5 },
            borderRadius: 3,
            backgroundColor: '#ffffff',
            border: '1px solid #e8e8ee',
          }}
        >
          <Box sx={{ mb: 4 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#1a1a2e',
                fontFamily: 'Lato, sans-serif',
                mb: 0.5,
                fontSize: { xs: '20px', sm: '24px' },
              }}
            >
              Завершите настройку профиля
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#87879b',
                fontFamily: 'Lato, sans-serif',
                fontSize: '14px',
              }}
            >
              Заполните данные для работы с системой ЭДО
            </Typography>
          </Box>

          {success && (
            <Alert 
              severity="success" 
              sx={{ 
                mb: 3, 
                borderRadius: 2,
                fontFamily: 'Lato, sans-serif',
              }}
            >
              Перенаправление...
            </Alert>
          )}

          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                mb: 3, 
                borderRadius: 2,
                fontFamily: 'Lato, sans-serif',
              }}
            >
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stepper 
              activeStep={activeStep} 
              orientation="vertical" 
              sx={{ 
                mb: 3,
                '& .MuiStepConnector-line': {
                  borderColor: '#e8e8ee',
                },
              }}
            >
              {steps.map((step, index) => (
                <Step key={step.label}>
                  <StepLabel 
                    sx={{
                      '& .MuiStepLabel-label': {
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#1a1a2e',
                      },
                      '& .MuiSvgIcon-root': {
                        fontSize: '22px',
                      },
                    }}
                  >
                    {step.label}
                  </StepLabel>
                  <StepContent>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: '#87879b', 
                        display: 'block', 
                        mb: 3,
                        fontSize: '13px',
                      }}
                    >
                      {step.description}
                    </Typography>

                    {index === 0 && (
                      <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <StyledTextField
                            name="last_name"
                            label="Фамилия"
                            fullWidth
                            required
                            placeholder="Введите фамилию"
                            value={formData.lastName}
                            onChange={handleFormChange('lastName')}
                            error={!!errors.lastName}
                            helperText={errors.lastName}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <StyledTextField
                            name="first_name"
                            label="Имя"
                            fullWidth
                            required
                            placeholder="Введите имя"
                            value={formData.firstName}
                            onChange={handleFormChange('firstName')}
                            error={!!errors.firstName}
                            helperText={errors.firstName}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <StyledTextField
                            name="middle_name"
                            label="Отчество"
                            fullWidth
                            placeholder="Введите отчество"
                            value={formData.middleName}
                            onChange={handleFormChange('middleName')}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <StyledTextField
                            name="position"
                            label="Должность"
                            fullWidth
                            placeholder="Введите должность"
                            value={formData.position}
                            onChange={handleFormChange('position')}
                          />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <StyledTextField
                            name="department"
                            label="Подразделение"
                            fullWidth
                            placeholder="Введите подразделение"
                            value={formData.department}
                            onChange={handleFormChange('department')}
                          />
                        </Grid>
                      </Grid>
                    )}

                    {index === 1 && (
                      <Box>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 600,
                            color: '#1a1a2e',
                            fontFamily: 'Lato, sans-serif',
                            mb: 2,
                            fontSize: '14px',
                          }}
                        >
                          Выберите роли в системе
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                          {ROLE_CATEGORIES.map((category) => {
                            const isSelected = selectedCategories.includes(category.key);
                            const isLocked = category.locked || false;
                            return (
                              <CategoryChip
                                key={category.key}
                                label={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {category.label}
                                    {isLocked && (
                                      <Typography 
                                        component="span" 
                                        sx={{ 
                                          fontSize: '10px', 
                                          opacity: 0.7,
                                          fontWeight: 400,
                                        }}
                                      >
                                        🔒
                                      </Typography>
                                    )}
                                  </Box>
                                }
                                onClick={() => handleCategoryToggle(category.key)}
                                sx={{
                                  backgroundColor: isSelected ? category.color : '#f8f8fa',
                                  color: isSelected ? category.textColor : '#5a5a72',
                                  border: `2px solid ${isLocked ? '#9c27b0' : isSelected ? category.bgColor : '#e8e8ee'}`,
                                  opacity: isLocked ? 0.9 : 1,
                                  '&:hover': {
                                    backgroundColor: isSelected ? category.color : '#f0f0f4',
                                    borderColor: isLocked ? '#9c27b0' : isSelected ? category.bgColor : '#c8c8d4',
                                  },
                                }}
                              />
                            );
                          })}
                        </Box>
                        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#87879b',
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '13px',
                            }}
                          >
                            Выбрано прав: <strong style={{ color: '#1a1a2e' }}>{getSelectedCount()}</strong>
                          </Typography>
                          {errors.roles && (
                            <Typography color="error" variant="caption" sx={{ fontSize: '13px' }}>
                              {errors.roles}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ mt: 2, p: 2.5, bgcolor: '#f8f8fa', borderRadius: 2, border: '1px solid #e8e8ee' }}>
                          <Typography variant="caption" sx={{ color: '#5a5a72', fontSize: '13px', fontFamily: 'Lato, sans-serif', display: 'block', mb: 1 }}>
                            <strong>Базовые права</strong> (Исполнитель) и <strong>Полный доступ</strong> (Администратор) назначены по умолчанию и не могут быть отключены.
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#5a5a72', fontSize: '13px', fontFamily: 'Lato, sans-serif' }}>
                            Для получения всех прав доступа дополнительно выберите <strong>Делопроизводителя</strong> и/или <strong>Руководителя</strong>.
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    {index === 2 && (
                      <Grid container spacing={2.5}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <StyledTextField
                            name="phone"
                            label="Телефон"
                            fullWidth
                            type="tel"
                            placeholder="+7 999 999-99-99"
                            value={formData.phone}
                            onChange={handleFormChange('phone')}
                            error={!!errors.phone}
                            helperText={errors.phone}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <StyledTextField
                            name="email"
                            label="Электронная почта"
                            fullWidth
                            type="email"
                            placeholder="ivanov@company.ru"
                            value={formData.email}
                            onChange={handleFormChange('email')}
                            error={!!errors.email}
                            helperText={errors.email}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <DatePicker
                            label="Дата рождения"
                            value={birthday}
                            onChange={(date: Dayjs | null) => setBirthday(date)}
                            format="DD.MM.YYYY"
                            slotProps={{
                              textField: {
                                fullWidth: true,
                                sx: {
                                  '& .MuiOutlinedInput-root': {
                                    backgroundColor: '#fafafa',
                                    borderRadius: '8px',
                                    '& fieldset': {
                                      borderColor: '#d6d6df',
                                    },
                                    '&:hover fieldset': {
                                      borderColor: '#b0b3c3',
                                    },
                                    '&.Mui-focused fieldset': {
                                      borderColor: '#4c6ef5',
                                      borderWidth: '2px',
                                    },
                                  },
                                  '& .MuiInputBase-input::placeholder': {
                                    color: '#b0b3c3',
                                    opacity: 1,
                                  },
                                },
                              },
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <StyledTextField
                            name="notes"
                            label="Дополнительная информация"
                            fullWidth
                            multiline
                            rows={3}
                            placeholder="Любые комментарии или заметки"
                            value={formData.notes}
                            onChange={handleFormChange('notes')}
                          />
                        </Grid>
                      </Grid>
                    )}

                    <Box sx={{ mt: 3, display: 'flex', gap: 1.5 }}>
                      <StyledButton
                        variant="outlined"
                        onClick={handleBack}
                        disabled={index === 0}
                        sx={{
                          color: '#5a5a72',
                          borderColor: '#d6d6df',
                          '&:hover': {
                            borderColor: '#b0b3c3',
                            backgroundColor: '#f5f5f9',
                          },
                          '&:disabled': {
                            borderColor: '#e8e8ee',
                            color: '#c8c8d4',
                          },
                        }}
                      >
                        Назад
                      </StyledButton>
                      <StyledButton
                        variant="contained"
                        onClick={handleNext}
                        sx={{
                          backgroundColor: '#4c6ef5',
                          color: '#ffffff',
                          '&:hover': {
                            backgroundColor: '#3a5bd9',
                          },
                          '&:disabled': {
                            backgroundColor: '#d6d6df',
                            color: '#87879b',
                          },
                        }}
                      >
                        {index === steps.length - 1 ? 'Завершить' : 'Далее →'}
                      </StyledButton>
                    </Box>
                  </StepContent>
                </Step>
              ))}
            </Stepper>

            {activeStep === steps.length && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <StyledButton
                    variant="outlined"
                    onClick={() => navigate('/login')}
                    disabled={loading}
                    sx={{
                      color: '#5a5a72',
                      borderColor: '#d6d6df',
                      '&:hover': {
                        borderColor: '#b0b3c3',
                        backgroundColor: '#f5f5f9',
                      },
                    }}
                  >
                    Отмена
                  </StyledButton>
                  <StyledButton
                    type="submit"
                    variant="contained"
                    disabled={loading}
                    sx={{
                      backgroundColor: '#4c6ef5',
                      color: '#ffffff',
                      minWidth: '160px',
                      '&:hover': {
                        backgroundColor: '#3a5bd9',
                      },
                      '&:disabled': {
                        backgroundColor: '#d6d6df',
                        color: '#87879b',
                      },
                    }}
                  >
                    {loading ? <CircularProgress size={24} sx={{ color: '#ffffff' }} /> : 'Сохранить'}
                  </StyledButton>
                </Box>
              </Box>
            )}
          </form>
        </Paper>
      </Box>
    </LocalizationProvider>
  );
};

export default ProfileCompletionPage;