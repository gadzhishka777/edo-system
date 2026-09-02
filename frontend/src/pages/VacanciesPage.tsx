import React, { useState, useEffect, useCallback, useTransition } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Checkbox,
  Tooltip,
  TextField,
  InputAdornment,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Modal,
  Fade,
  Pagination,
  CircularProgress,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Work as WorkIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import {
  getVacancies,
  getVacancyPositions,
  createVacancy,
  updateVacancy,
  deactivateVacancy,
  type Vacancy,
  type VacancyPosition,
} from '../api/edoApi';
// Примечание: функция edoApi.deactivateVacancy выполняет DELETE-запрос к
// /api/vacancies/{uuid}; бэкенд теперь удаляет запись физически (hard delete).
import { getApiErrorMessage } from '../api/edoApi';

// ===== СТИЛИ (соответствуют «Сотрудникам») =====
const PageContainer = styled(Box)(({ theme }) => ({
  padding: '24px 32px',
  maxWidth: '1200px',
  margin: '0 auto',
  [theme.breakpoints.down('sm')]: {
    padding: '16px',
  },
}));

const ToolbarContainer = styled(Paper)({
  padding: '12px 20px',
  borderRadius: '12px',
  border: '1px solid #eaebf0',
  boxShadow: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '12px',
  marginBottom: '24px',
});

const ToolbarLeft = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

const ToolbarRight = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

const ToolbarButton = styled(IconButton)({
  color: '#87879b',
  padding: '6px',
  borderRadius: '8px',
  '&:hover': {
    backgroundColor: '#f4f4f8',
    color: '#101025',
  },
});

const SearchField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    height: '36px',
    borderRadius: '8px',
    backgroundColor: '#f4f4f8',
    '& fieldset': {
      border: 'none',
    },
    '&:hover fieldset': {
      border: 'none',
    },
    '&.Mui-focused fieldset': {
      border: '2px solid #4c6ef5',
    },
  },
  '& .MuiInputBase-input': {
    fontSize: '14px',
    fontFamily: 'Lato, sans-serif',
    padding: '8px 12px',
  },
});

const EmptyStateContainer = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '80px 20px',
  backgroundColor: '#fafafa',
  borderRadius: '12px',
  border: '1px solid #eaebf0',
});

const EmptyStateIcon = styled(Box)({
  width: '80px',
  height: '80px',
  borderRadius: '50%',
  backgroundColor: '#f4f4f8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '24px',
  '& svg': {
    fontSize: '40px',
    color: '#b0b3c3',
  },
});

const StyledChip = styled(Chip)({
  backgroundColor: '#f4f4f8',
  color: '#87879b',
  fontSize: '12px',
  fontWeight: 500,
  height: '28px',
  '& .MuiChip-label': {
    padding: '0 12px',
  },
});

const ModalContainer = styled(Box)({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '90%',
  maxWidth: '720px',
  maxHeight: '90vh',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  '@media (max-width: 600px)': {
    width: 'calc(100% - 16px)',
    maxWidth: 'calc(100% - 16px)',
    maxHeight: 'calc(100vh - 16px)',
    borderRadius: '12px',
  },
});

const ModalHeader = styled(Box)({
  padding: '22px 32px',
  borderBottom: '1px solid #eaebf0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
});

const ModalBody = styled(Box)({
  padding: '24px 32px 20px',
  overflowY: 'auto',
  flex: 1,
});

const ModalFooter = styled(Box)({
  padding: '18px 32px',
  borderTop: '1px solid #eaebf0',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  backgroundColor: '#fafafa',
  flexShrink: 0,
});

const FieldRow = styled(Box)({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '20px',
  padding: '14px 0',
  minHeight: '52px',
  borderBottom: '1px solid #f1f1f5',
  '&:first-of-type': {
    paddingTop: '4px',
  },
  '&:last-child': {
    borderBottom: 'none',
    paddingBottom: '4px',
  },
});

const FieldLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  color: '#5b5b6e',
  fontWeight: 600,
  width: '210px',
  flexShrink: 0,
  paddingTop: '11px',
  lineHeight: 1.4,
});

const FieldValue = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease',
    '& fieldset': {
      borderColor: '#d6d6df',
      borderWidth: '1px',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    },
    '&:hover fieldset': {
      borderColor: '#b0b3c3',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#4c6ef5',
      borderWidth: '2px',
      boxShadow: '0 0 0 4px rgba(76, 110, 245, 0.08)',
    },
  },
  '& .MuiInputLabel-root': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
    color: '#87879b',
    transition: 'all 0.2s ease',
    '&.Mui-focused': {
      color: '#4c6ef5',
    },
  },
  '& .MuiInputBase-input': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
    padding: '12px 14px',
  },
  '& .MuiSelect-select': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
    paddingTop: '12px',
    paddingBottom: '12px',
  },
});

const CancelButton = styled(Button)({
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 500,
  color: '#87879b',
  padding: '9px 22px',
  borderRadius: '8px',
  fontSize: '14px',
  '&:hover': {
    backgroundColor: '#f4f4f8',
  },
});

const SaveButton = styled(Button)({
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 600,
  backgroundColor: '#4c6ef5',
  color: '#ffffff',
  padding: '9px 30px',
  borderRadius: '8px',
  fontSize: '14px',
  '&:hover': {
    backgroundColor: '#364fc7',
  },
});

const StatusChip = styled(Chip)<{ active: boolean }>(({ active }) => ({
  backgroundColor: active ? '#e8f5e9' : '#f5f5f5',
  color: active ? '#2e7d32' : '#9e9e9e',
  fontWeight: 600,
  fontSize: '11px',
  height: '24px',
}));

// Максимальная учебная нагрузка (часов в неделю) — как на бэкенде
const MAX_TEACHING_LOAD = 35;

interface VacancyFormData {
  name: string;
  position: string;
  teaching_load: string; // поле ввода — строка, валидируем число
  description: string;
}

const emptyForm: VacancyFormData = {
  name: '',
  position: '',
  teaching_load: '',
  description: '',
};

const VacanciesPage: React.FC = () => {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editVacancy, setEditVacancy] = useState<Vacancy | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuVacancy, setRowMenuVacancy] = useState<Vacancy | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);
  const [isEisModalOpen, setIsEisModalOpen] = useState(false);

  const [positions, setPositions] = useState<VacancyPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const [formData, setFormData] = useState<VacancyFormData>(emptyForm);

  const isTeacher = (position: string): boolean =>
    !!position && position.trim().toLowerCase().startsWith('учитель');

  // Загружаем вакансии
  const loadVacancies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getVacancies(page, pageSize, debouncedSearch || undefined);
      startTransition(() => {
        setVacancies(res.items);
        setTotal(res.total);
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки вакансий'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    loadVacancies();
  }, [loadVacancies]);

  // Классификатор должностей (для выпадающего списка)
  useEffect(() => {
    let active = true;
    setPositionsLoading(true);
    getVacancyPositions()
      .then((res) => {
        if (active) setPositions(res.positions);
      })
      .catch(() => {
        // список не критичен — поле всё равно можно заполнить
      })
      .finally(() => {
        if (active) setPositionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Дебаунс поиска
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleOpenModal = (vacancy?: Vacancy) => {
    if (vacancy) {
      setEditVacancy(vacancy);
      setFormData({
        name: vacancy.name || '',
        position: vacancy.position || '',
        teaching_load: vacancy.teaching_load != null ? String(vacancy.teaching_load) : '',
        description: vacancy.description || '',
      });
    } else {
      setEditVacancy(null);
      setFormData(emptyForm);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditVacancy(null);
  };

  const handleFormChange = (field: keyof VacancyFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData(prev => ({ ...prev, [field]: e.target.value }));
    };

  const teacherSelected = isTeacher(formData.position);

  // Локальная валидация перед отправкой
  const validate = (): string | null => {
    if (!formData.name.trim()) return 'Наименование обязательно';
    if (!formData.position) return 'Выберите должность по классификатору';
    if (teacherSelected) {
      const load = Number(formData.teaching_load);
      if (!formData.teaching_load.trim() || Number.isNaN(load)) {
        return 'Для учительской должности укажите учебную нагрузку (часов в неделю)';
      }
      if (!Number.isInteger(load) || load < 1 || load > MAX_TEACHING_LOAD) {
        return `Учебная нагрузка должна быть целым числом от 1 до ${MAX_TEACHING_LOAD}`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: {
      name: string;
      position: string;
      teaching_load?: number | null;
      description?: string | null;
    } = {
      name: formData.name.trim(),
      position: formData.position,
      description: formData.description.trim() || null,
    };

    // Учебная нагрузка — только для учительских должностей
    if (teacherSelected && formData.teaching_load.trim()) {
      payload.teaching_load = Number(formData.teaching_load);
    } else {
      payload.teaching_load = null;
    }

    setSaving(true);
    try {
      if (editVacancy) {
        await updateVacancy(editVacancy.uuid, payload);
        setSuccess('Вакансия обновлена');
      } else {
        await createVacancy(payload);
        setSuccess('Вакансия создана');
      }
      setIsModalOpen(false);
      await loadVacancies();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      for (const uuid of deleteTarget) {
        await deactivateVacancy(uuid);
      }
      setSelected([]);
      setSuccess(deleteTarget.length === 1 ? 'Вакансия удалена' : `Удалено ${deleteTarget.length} вакансий`);
      await loadVacancies();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка удаления'));
    }
  };

  const handleSelectAll = () => {
    const allIds = vacancies.map(v => v.uuid);
    if (selected.length === allIds.length && allIds.length > 0) {
      setSelected([]);
    } else {
      setSelected(allIds);
    }
  };

  const isAllSelected = vacancies.length > 0 &&
    selected.length === vacancies.length;

  if (loading && vacancies.length === 0) {
    return (
      <PageContainer>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Typography variant="h4" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '24px', color: '#101025', mb: 3 }}>
        Вакансии
      </Typography>

      <Snackbar
        open={!!error || !!success}
        autoHideDuration={5000}
        onClose={() => { setError(null); setSuccess(null); }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={error ? 'error' : 'success'} onClose={() => { setError(null); setSuccess(null); }}>
          {error || success}
        </Alert>
      </Snackbar>

      {/* Панель инструментов */}
      <ToolbarContainer>
        <ToolbarLeft>
          <Tooltip title="Обновить">
            <ToolbarButton size="small" onClick={loadVacancies}>
              <RefreshIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Добавить">
            <ToolbarButton size="small" onClick={() => handleOpenModal()}>
              <AddIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Tooltip title="Редактировать">
            <ToolbarButton size="small" disabled={selected.length !== 1}
              onClick={() => {
                const v = vacancies.find(x => x.uuid === selected[0]);
                if (v) handleOpenModal(v);
              }}>
              <EditIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Удалить">
            <ToolbarButton size="small" disabled={selected.length === 0}
              onClick={() => { setDeleteTarget(selected); setIsDeleteModalOpen(true); }}>
              <DeleteIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <SearchField
            placeholder="Поиск по наименованию или должности..."
            size="small"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: '18px', color: '#b0b3c3' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>✕</IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: '300px' }}
          />
        </ToolbarLeft>
        <ToolbarRight>
          {/* Кнопка выгрузки в ЕИС — открывает подтверждение (функция в разработке) */}
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setIsEisModalOpen(true)}
            sx={{
              textTransform: 'none',
              fontFamily: 'Lato, sans-serif',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              color: '#4c6ef5',
              borderColor: '#4c6ef5',
              '&:hover': {
                backgroundColor: 'rgba(76, 110, 245, 0.08)',
                borderColor: '#364fc7',
              },
            }}
          >
            Выгрузка в ЕИС
          </Button>
          <StyledChip label={`Всего: ${total}`} size="small" />
        </ToolbarRight>
      </ToolbarContainer>

      {/* Список */}
      <Fade in={!isPending} timeout={300}>
        <Box>
          {vacancies.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon><WorkIcon /></EmptyStateIcon>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '18px', color: '#101025', mb: 1 }}>
                Список вакансий пуст
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', fontSize: '14px', mb: 3 }}>
                Добавьте вакансию, чтобы начать работу
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenModal()}
                sx={{ backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, padding: '10px 24px', '&:hover': { backgroundColor: '#364fc7' } }}>
                Добавить вакансию
              </Button>
            </EmptyStateContainer>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', overflowX: 'auto', width: '100%' }}>
              <Table sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        sx={{ color: '#b0b3c3' }}
                      />
                    </TableCell>
                    <TableCell>Наименование</TableCell>
                    <TableCell>Должность по классификатору</TableCell>
                    <TableCell>Учебная нагрузка</TableCell>
                    <TableCell>Описание</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vacancies.map((v) => {
                    const isSelected = selected.includes(v.uuid);
                    return (
                      <TableRow
                        key={v.uuid}
                        hover
                        selected={isSelected}
                        sx={{
                          '&:hover': { backgroundColor: '#f9fafe' },
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => {
                              setSelected(prev =>
                                prev.includes(v.uuid)
                                  ? prev.filter(id => id !== v.uuid)
                                  : [...prev, v.uuid]
                              );
                            }}
                            sx={{ color: '#b0b3c3' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500, color: '#101025' }}>
                            {v.name || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                            {v.position || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: v.teaching_load != null ? '#101025' : '#87879b' }}>
                            {v.teaching_load != null ? `${v.teaching_load} ч/нед` : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: '320px' }}>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '13px',
                              color: '#87879b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {v.description || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <StatusChip
                            label={v.is_active ? 'Активна' : 'Неактивна'}
                            size="small"
                            active={v.is_active}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Ещё">
                            <IconButton size="small" sx={{ color: '#87879b' }} onClick={(e) => {
                              e.stopPropagation();
                              setRowMenuAnchor(e.currentTarget);
                              setRowMenuVacancy(v);
                            }}>
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Fade>

      {/* Пагинация */}
      {total > pageSize && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 3, mb: 2 }}>
          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
            Всего: {total}
          </Typography>
          <Pagination
            count={Math.ceil(total / pageSize)}
            page={page}
            onChange={(_, v) => setPage(v)}
            color="primary"
            shape="rounded"
            sx={{ '& .MuiPaginationItem-root': { fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500 } }}
          />
        </Box>
      )}

      {/* Меню строки */}
      <Menu
        anchorEl={rowMenuAnchor}
        open={Boolean(rowMenuAnchor)}
        onClose={() => { setRowMenuAnchor(null); setRowMenuVacancy(null); }}
      >
        <MenuItem onClick={() => {
          if (rowMenuVacancy) handleOpenModal(rowMenuVacancy);
          setRowMenuAnchor(null);
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Редактировать</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (rowMenuVacancy) {
            setDeleteTarget([rowMenuVacancy.uuid]);
            setIsDeleteModalOpen(true);
          }
          setRowMenuAnchor(null);
        }}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Удалить</ListItemText>
        </MenuItem>
      </Menu>

      {/* Модалка удаления */}
      <Modal open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} closeAfterTransition>
        <Fade in={isDeleteModalOpen}>
          <Box sx={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '90%', maxWidth: '440px', backgroundColor: '#ffffff', borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
          }}>
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <DeleteIcon sx={{ fontSize: 36, color: '#e53935' }} />
              </Box>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '18px', fontWeight: 700, color: '#101025', mb: 1 }}>
                Удалить вакансию(и)?
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                Будет удалено: {deleteTarget.length}
              </Typography>
            </Box>
            <Box sx={{ p: 2, backgroundColor: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setIsDeleteModalOpen(false)} sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, color: '#87879b', '&:hover': { backgroundColor: '#f4f4f8' } }}>Отмена</Button>
              <Button onClick={handleDelete} sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, backgroundColor: '#e53935', color: '#ffffff', borderRadius: '8px', '&:hover': { backgroundColor: '#c62828' } }}>Удалить</Button>
            </Box>
          </Box>
        </Fade>
      </Modal>

      {/* Модалка «Выгрузка в ЕИС» */}
      <Modal open={isEisModalOpen} onClose={() => setIsEisModalOpen(false)} closeAfterTransition>
        <Fade in={isEisModalOpen}>
          <Box sx={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '90%', maxWidth: '440px', backgroundColor: '#ffffff', borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
          }}>
            <ModalHeader>
              <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025' }}>
                Обновление сведений в ЕИС
              </Typography>
              <IconButton onClick={() => setIsEisModalOpen(false)} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '15px', color: '#101025', lineHeight: 1.5 }}>
                Вы действительно хотите начать синхронизацию данных с ЕИС?
              </Typography>
            </Box>
            <Box sx={{ p: 2, backgroundColor: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setIsEisModalOpen(false)} sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, color: '#87879b', '&:hover': { backgroundColor: '#f4f4f8' } }}>Нет</Button>
              <Button onClick={() => {
                setIsEisModalOpen(false);
                setError('Данная функция временно недоступна');
              }} sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, backgroundColor: '#4c6ef5', color: '#ffffff', borderRadius: '8px', '&:hover': { backgroundColor: '#364fc7' } }}>Да</Button>
            </Box>
          </Box>
        </Fade>
      </Modal>

      {/* Модалка создания/редактирования */}
      <Modal open={isModalOpen} onClose={handleCloseModal} closeAfterTransition>
        <Fade in={isModalOpen}>
          <ModalContainer>
            <ModalHeader>
              <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '20px', color: '#101025', letterSpacing: '-0.2px' }}>
                {editVacancy ? 'Редактирование вакансии' : 'Добавление вакансии'}
              </Typography>
              <IconButton onClick={handleCloseModal} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>

            <ModalBody>
              <FieldRow>
                <FieldLabel>Наименование *</FieldLabel>
                <FieldValue>
                  <StyledTextField
                    fullWidth
                    placeholder="Например: Учитель математики (основная ставка)"
                    value={formData.name}
                    onChange={handleFormChange('name')}
                    size="small"
                  />
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Должность по классификатору *</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontFamily: 'Lato, sans-serif' }}>Выберите должность</InputLabel>
                    <Select
                      value={formData.position}
                      onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                      label="Выберите должность"
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      {positionsLoading && (
                        <MenuItem disabled value="">
                          Загрузка классификатора…
                        </MenuItem>
                      )}
                      {positions.map((p) => (
                        <MenuItem key={p.value} value={p.value}>
                          {p.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>

              {teacherSelected && (
                <FieldRow>
                  <FieldLabel>Учебная нагрузка (ч/нед) *</FieldLabel>
                  <FieldValue>
                    <StyledTextField
                      fullWidth
                      type="number"
                      placeholder={`Не более ${MAX_TEACHING_LOAD} часов в неделю`}
                      value={formData.teaching_load}
                      onChange={handleFormChange('teaching_load')}
                      size="small"
                      helperText={`Обязательно для должностей «Учитель…», максимум ${MAX_TEACHING_LOAD} ч`}
                      slotProps={{ formHelperText: { sx: { fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' } } }}
                    />
                  </FieldValue>
                </FieldRow>
              )}

              <FieldRow>
                <FieldLabel>Описание</FieldLabel>
                <FieldValue>
                  <StyledTextField
                    fullWidth
                    multiline
                    minRows={4}
                    maxRows={10}
                    placeholder="Опишите требования, условия, зону ответственности…"
                    value={formData.description}
                    onChange={handleFormChange('description')}
                    size="small"
                  />
                </FieldValue>
              </FieldRow>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={handleCloseModal}>Отменить</CancelButton>
              <SaveButton
                onClick={handleSave}
                disabled={saving || !formData.name.trim() || !formData.position}
              >
                {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Сохранить'}
              </SaveButton>
            </ModalFooter>
          </ModalContainer>
        </Fade>
      </Modal>
    </PageContainer>
  );
};

export default VacanciesPage;
