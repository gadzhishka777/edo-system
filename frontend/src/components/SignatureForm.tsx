import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  FormControlLabel,
  Switch,
  Button,
  Alert,
  Stack,
  Typography,
  Divider,
  Chip,
  InputAdornment,
} from '@mui/material';
import {
  Person as PersonIcon,
  Numbers as NumbersIcon,
  VpnKey as VpnKeyIcon,
  CalendarToday as CalendarIcon,
  Verified as VerifiedIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';

interface SignatureFormData {
  signer: string;
  inn: string;
  signDate: string;
  certSerial: string;
  isValid: boolean;
}

interface SignatureFormProps {
  onSubmit: (data: SignatureFormData) => void;
  loading?: boolean;
  initialValues?: Partial<SignatureFormData>;
}

export const SignatureForm: React.FC<SignatureFormProps> = ({
  onSubmit,
  loading = false,
  initialValues,
}) => {
  const [formData, setFormData] = useState<SignatureFormData>({
    signer: initialValues?.signer || '',
    inn: initialValues?.inn || '',
    signDate: initialValues?.signDate || dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    certSerial: initialValues?.certSerial || '',
    isValid: initialValues?.isValid ?? true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(dayjs());

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.signer.trim()) {
      newErrors.signer = 'Введите ФИО подписанта';
    }

    if (!formData.inn.trim()) {
      newErrors.inn = 'Введите ИНН';
    } else if (!/^\d{10}$|^\d{12}$/.test(formData.inn)) {
      newErrors.inn = 'ИНН должен содержать 10 или 12 цифр';
    }

    if (!formData.certSerial.trim()) {
      newErrors.certSerial = 'Введите серийный номер сертификата';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <VerifiedIcon color="primary" />
          Данные электронной подписи
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={3}>
          <TextField
            fullWidth
            label="Подписант (ФИО)"
            placeholder="Иванов Иван Иванович"
            value={formData.signer}
            onChange={(e) => setFormData((prev) => ({ ...prev, signer: e.target.value }))}
            error={!!errors.signer}
            helperText={errors.signer}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            fullWidth
            label="ИНН подписанта"
            placeholder="1234567890"
            value={formData.inn}
            onChange={(e) => setFormData((prev) => ({ ...prev, inn: e.target.value }))}
            error={!!errors.inn}
            helperText={errors.inn}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <NumbersIcon color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            fullWidth
            label="Серийный номер сертификата"
            placeholder="AB:CD:EF:12:34:56"
            value={formData.certSerial}
            onChange={(e) => setFormData((prev) => ({ ...prev, certSerial: e.target.value }))}
            error={!!errors.certSerial}
            helperText={errors.certSerial}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <VpnKeyIcon color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <DatePicker
            label="Дата подписания"
            value={selectedDate}
            onChange={(date) => {
              if (date) {
                setSelectedDate(date);
                setFormData((prev) => ({
                  ...prev,
                  signDate: date.format('YYYY-MM-DDTHH:mm:ss'),
                }));
              }
            }}
            slotProps={{
              textField: {
                fullWidth: true,
              },
            }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isValid}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, isValid: e.target.checked }))
                  }
                  color={formData.isValid ? 'success' : 'error'}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" component="span">
                    Статус подписи:
                  </Typography>
                  <Chip
                    label={formData.isValid ? 'Действительна' : 'Недействительна'}
                    color={formData.isValid ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
              }
            />
          </Box>

          <Alert severity="info" icon={<VerifiedIcon />}>
            <Typography variant="body2">
              В демо-режиме вы можете управлять статусом подписи.
            </Typography>
          </Alert>

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSubmit}
            disabled={loading}
            sx={{ height: 52 }}
          >
            {loading ? 'Проверка подписи...' : 'Отправить на проверку'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};