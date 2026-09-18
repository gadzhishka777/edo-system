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
  Class as ClassIcon,
} from '@mui/icons-material';
import {
  getClasses,
  getClassOptions,
  getClassTeachers,
  createClass,
  updateClass,
  deleteClass,
  getApiErrorMessage,
  type SchoolClass,
  type SchoolClassOptions,
  type SchoolClassTeacher,
} from '../api/edoApi';

// ===== СТИЛИ (соответствуют «Сотрудникам» и «Вакансиям») =====
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

const FilterBar = styled(Paper)({
  padding: '10px 20px',
  borderRadius: '12px',
  border: '1px solid #eaebf0',
  boxShadow: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
  marginBottom: '24px',
});

const FilterLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: 500,
  color: '#87879b',
});

/** Метка выпускного класса (9 или 11) в таблице */
const GraduatingBadge = styled(Box)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  color: '#b26a00',
  backgroundColor: '#fff4e5',
  borderRadius: '4px',
  padding: '2px 6px',
  whiteSpace: 'nowrap',
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

const SelectLabelSx = { fontFamily: 'Lato, sans-serif' } as const;

// ===== ФОРМА =====

interface ClassFormData {
  parallel: string;      // держим строкой: '' = «не выбрано»
  letter: string;
  name: string;
  preprofile: string;
  profile: string;
  teacher_employee_id: string;  // '' = «не назначен»
  shift: string;
  academic_year: string;
}

const LETTER_PATTERN = /^[А-ЯЁA-Z]{1,2}$/;

const emptyForm: ClassFormData = {
  parallel: '',
  letter: '',
  name: '',
  preprofile: '',
  profile: '',
  teacher_employee_id: '',
  shift: 'first',
  academic_year: '',
};

const ClassesPage: React.FC = () => {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Фильтры списка. Пустая строка = «не фильтруем»
  const [filterYear, setFilterYear] = useState('');
  const [filterParallel, setFilterParallel] = useState('');
  const [onlyGraduating, setOnlyGraduating] = useState(false);
  const [filterShift, setFilterShift] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editClass, setEditClass] = useState<SchoolClass | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuClass, setRowMenuClass] = useState<SchoolClass | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  const [options, setOptions] = useState<SchoolClassOptions | null>(null);
  const [teachers, setTeachers] = useState<SchoolClassTeacher[]>([]);
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);

  // Параллель из формы числом (или null, если ещё не выбрана)
  const parallelNumber = formData.parallel ? Number(formData.parallel) : null;

  // Какие профильные поля показывать: 1–4 — никаких, 5–9 — предпрофиль,
  // 10–11 — профиль. Бэкенд отдаёт ПОЛНЫЙ список параллелей
  // (preprofile_parallels = [5,6,7,8,9]), поэтому проверяем через includes.
  const showPreprofile = !!options && parallelNumber !== null &&
    options.preprofile_parallels.includes(parallelNumber);
  const showProfile = !!options && parallelNumber !== null &&
    options.profile_parallels.includes(parallelNumber);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getClasses(page, pageSize, {
        search: debouncedSearch || undefined,
        academic_year: filterYear || undefined,
        parallel: filterParallel ? Number(filterParallel) : undefined,
        // false/undefined — фильтр выключен, показываем все классы
        graduating: onlyGraduating || undefined,
        shift: filterShift || undefined,
      });
      startTransition(() => {
        setClasses(res.items);
        setTotal(res.total);
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки классов'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, filterYear, filterParallel, onlyGraduating, filterShift]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Справочники и список сотрудников — один раз при открытии раздела
  useEffect(() => {
    let active = true;
    getClassOptions()
      .then((res) => {
        if (active) setOptions(res);
      })
      .catch((err) => {
        if (active) setError(getApiErrorMessage(err, 'Ошибка загрузки справочников'));
      });
    getClassTeachers()
      .then((res) => {
        if (active) setTeachers(res);
      })
      .catch(() => {
        // список не критичен — руководителя можно назначить позже
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

  // Любое изменение фильтров или поиска — с первой страницы
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterYear, filterParallel, onlyGraduating, filterShift]);

  const filtersActive = !!filterYear || !!filterParallel || onlyGraduating || !!filterShift;

  const resetFilters = () => {
    setFilterYear('');
    setFilterParallel('');
    setOnlyGraduating(false);
    setFilterShift('');
  };

  const handleOpenModal = (cls?: SchoolClass) => {
    if (cls) {
      setEditClass(cls);
      setFormData({
        parallel: String(cls.parallel),
        letter: cls.letter || '',
        name: cls.name || '',
        preprofile: cls.preprofile || '',
        profile: cls.profile || '',
        teacher_employee_id:
          cls.teacher_employee_id != null ? String(cls.teacher_employee_id) : '',
        shift: cls.shift || 'first',
        academic_year: cls.academic_year || options?.current_academic_year || '',
      });
    } else {
      setEditClass(null);
      setFormData({
        ...emptyForm,
        academic_year: options?.current_academic_year || '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditClass(null);
  };

  // Смена параллели: профильные поля, которые стали неприменимы, очищаем сразу
  const handleParallelChange = (value: string) => {
    const num = value ? Number(value) : null;
    const inPre = !!options && num !== null && options.preprofile_parallels.includes(num);
    const inProf = !!options && num !== null && options.profile_parallels.includes(num);
    setFormData(prev => ({
      ...prev,
      parallel: value,
      preprofile: inPre ? prev.preprofile : '',
      profile: inProf ? prev.profile : '',
    }));
  };

  const handleLetterChange = (raw: string) => {
    // Оставляем только буквы, максимум две, в верхнем регистре
    const cleaned = raw.replace(/[^А-Яа-яЁёA-Za-z]/g, '').slice(0, 2).toUpperCase();
    setFormData(prev => ({ ...prev, letter: cleaned }));
  };

  // Руководитель мог быть деактивирован — тогда в общем списке его нет,
  // но текущее значение в форме показываем.
  const teacherOptions = React.useMemo(() => {
    const list = [...teachers];
    const currentId = formData.teacher_employee_id;
    if (currentId && !list.some(t => String(t.id) === currentId)) {
      list.unshift({
        id: Number(currentId),
        uuid: editClass?.uuid || '',
        fio: editClass?.teacher_fio || 'Текущий классный руководитель',
        position: editClass?.teacher_position ?? null,
      });
    }
    return list;
  }, [teachers, formData.teacher_employee_id, editClass]);

  const validate = (): string | null => {
    if (!formData.parallel) return 'Выберите параллель';
    if (!formData.letter.trim()) return 'Укажите литеру класса';
    if (!LETTER_PATTERN.test(formData.letter.trim())) {
      return 'Литера — одна-две буквы, например «А» или «Б»';
    }
    if (showPreprofile && !formData.preprofile) {
      return 'Для параллелей 5–9 выберите предпрофиль';
    }
    if (showProfile && !formData.profile) {
      return 'Для параллелей 10–11 выберите профиль';
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      parallel: Number(formData.parallel),
      letter: formData.letter.trim(),
      name: formData.name.trim() || null,
      // Профильные поля отправляем только те, что применимы к параллели
      preprofile: showPreprofile ? formData.preprofile : null,
      profile: showProfile ? formData.profile : null,
      teacher_employee_id: formData.teacher_employee_id
        ? Number(formData.teacher_employee_id)
        : null,
      shift: formData.shift,
      academic_year: formData.academic_year || options?.current_academic_year,
    };

    setSaving(true);
    try {
      if (editClass) {
        await updateClass(editClass.uuid, payload);
        setSuccess('Класс обновлён');
      } else {
        await createClass(payload);
        setSuccess('Класс добавлен');
      }
      setIsModalOpen(false);
      setEditClass(null);
      await loadClasses();
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
        await deleteClass(uuid);
      }
      setSelected([]);
      setSuccess(
        deleteTarget.length === 1 ? 'Класс удалён' : `Удалено классов: ${deleteTarget.length}`
      );
      await loadClasses();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка удаления'));
    }
  };

  const handleSelectAll = () => {
    const allIds = classes.map(c => c.uuid);
    if (selected.length === allIds.length && allIds.length > 0) {
      setSelected([]);
    } else {
      setSelected(allIds);
    }
  };

  const isAllSelected = classes.length > 0 && selected.length === classes.length;

  const shiftLabel = (value: string): string =>
    options?.shifts.find(s => s.value === value)?.label ?? value;

  // «9 и 11» — берём с бэкенда, чтобы не хардкодить выпускные параллели
  const graduatingLabel = (options?.graduating_parallels ?? [9, 11]).join(' и ');

  if (loading && classes.length === 0) {
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
        Классы
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
            <ToolbarButton size="small" onClick={loadClasses}>
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
                const cls = classes.find(x => x.uuid === selected[0]);
                if (cls) handleOpenModal(cls);
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
            placeholder="Поиск: класс, профиль, классный руководитель…"
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
            sx={{ width: '340px' }}
          />
        </ToolbarLeft>
        <ToolbarRight>
          <StyledChip label={`Всего: ${total}`} size="small" />
        </ToolbarRight>
      </ToolbarContainer>

      {/* Фильтры: учебный год, параллель, сменность, выпускные классы */}
      <FilterBar>
        <FilterLabel>Фильтры:</FilterLabel>

        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel sx={SelectLabelSx}>Учебный год</InputLabel>
          <Select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            label="Учебный год"
            sx={{ borderRadius: '8px', fontFamily: 'Lato, sans-serif', fontSize: '14px' }}
          >
            <MenuItem value="">Все годы</MenuItem>
            {(options?.academic_years ?? []).map((y) => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel sx={SelectLabelSx}>Параллель</InputLabel>
          <Select
            value={filterParallel}
            onChange={(e) => setFilterParallel(e.target.value)}
            label="Параллель"
            sx={{ borderRadius: '8px', fontFamily: 'Lato, sans-serif', fontSize: '14px' }}
          >
            <MenuItem value="">Все параллели</MenuItem>
            {(options?.parallels ?? []).map((p) => (
              <MenuItem key={p} value={String(p)}>{p}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Справочник сменности приходит с бэкенда — подписи не дублируем */}
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel sx={SelectLabelSx}>Сменность</InputLabel>
          <Select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
            label="Сменность"
            sx={{ borderRadius: '8px', fontFamily: 'Lato, sans-serif', fontSize: '14px' }}
          >
            <MenuItem value="">Все смены</MenuItem>
            {(options?.shifts ?? []).map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* label — чтобы клик по подписи тоже переключал флажок */}
        <Box
          component="label"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none' }}
        >
          <Checkbox
            size="small"
            checked={onlyGraduating}
            onChange={(e) => setOnlyGraduating(e.target.checked)}
            sx={{ color: '#b0b3c3', '&.Mui-checked': { color: '#4c6ef5' } }}
          />
          <FilterLabel>Только выпускные ({graduatingLabel})</FilterLabel>
        </Box>

        {filtersActive && (
          <Button
            onClick={resetFilters}
            sx={{
              textTransform: 'none',
              fontFamily: 'Lato, sans-serif',
              fontWeight: 500,
              fontSize: '13px',
              color: '#4c6ef5',
              padding: '4px 10px',
              borderRadius: '8px',
              '&:hover': { backgroundColor: 'rgba(76, 110, 245, 0.08)' },
            }}
          >
            Сбросить
          </Button>
        )}
      </FilterBar>

      {/* Список */}
      <Fade in={!isPending} timeout={300}>
        <Box>
          {classes.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon><ClassIcon /></EmptyStateIcon>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '18px', color: '#101025', mb: 1 }}>
                {debouncedSearch || filtersActive ? 'Ничего не найдено' : 'Список классов пуст'}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', fontSize: '14px', mb: 3 }}>
                {debouncedSearch || filtersActive
                  ? 'Попробуйте изменить условия поиска или фильтры'
                  : 'Добавьте классы вашей школы, чтобы начать работу'}
              </Typography>
              {!debouncedSearch && !filtersActive && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenModal()}
                  sx={{ backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, padding: '10px 24px', '&:hover': { backgroundColor: '#364fc7' } }}>
                  Добавить класс
                </Button>
              )}
              {(debouncedSearch || filtersActive) && (
                <Button variant="outlined" onClick={() => { setSearchQuery(''); resetFilters(); }}
                  sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, padding: '10px 24px', color: '#4c6ef5', borderColor: '#4c6ef5', '&:hover': { borderColor: '#364fc7', backgroundColor: 'rgba(76, 110, 245, 0.08)' } }}>
                  Сбросить фильтры
                </Button>
              )}
            </EmptyStateContainer>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', overflowX: 'auto', width: '100%' }}>
              <Table sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        sx={{ color: '#b0b3c3' }}
                      />
                    </TableCell>
                    <TableCell>Класс</TableCell>
                    <TableCell>Название</TableCell>
                    <TableCell>Профиль / предпрофиль</TableCell>
                    <TableCell>Программа</TableCell>
                    <TableCell>Классный руководитель</TableCell>
                    <TableCell>Сменность</TableCell>
                    <TableCell>Учебный год</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {classes.map((cls) => {
                    const isSelected = selected.includes(cls.uuid);
                    return (
                      <TableRow
                        key={cls.uuid}
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
                                prev.includes(cls.uuid)
                                  ? prev.filter(id => id !== cls.uuid)
                                  : [...prev, cls.uuid]
                              );
                            }}
                            sx={{ color: '#b0b3c3' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 600, color: '#101025' }}>
                              {cls.parallel}{cls.letter}
                            </Typography>
                            {cls.is_graduating && (
                              <Tooltip title="Выпускной класс">
                                <GraduatingBadge>выпускной</GraduatingBadge>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ maxWidth: '220px' }}>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '13px',
                              color: cls.name ? '#101025' : '#87879b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {cls.name || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {cls.profile || cls.preprofile ? (
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                              <Box component="span" sx={{ color: '#87879b' }}>
                                {cls.profile ? 'Профиль: ' : 'Предпрофиль: '}
                              </Box>
                              {cls.profile || cls.preprofile}
                            </Typography>
                          ) : (
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ maxWidth: '220px' }}>
                          <Tooltip title={cls.program_kind || ''} disableHoverListener={!cls.program_kind}>
                            <Typography
                              sx={{
                                fontFamily: 'Lato, sans-serif',
                                fontSize: '13px',
                                color: cls.program_short_name ? '#101025' : '#87879b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {cls.program_short_name || '—'}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: cls.teacher_fio ? '#101025' : '#87879b' }}>
                            {cls.teacher_fio || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                            {shiftLabel(cls.shift)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                            {cls.academic_year}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Ещё">
                            <IconButton size="small" sx={{ color: '#87879b' }} onClick={(e) => {
                              e.stopPropagation();
                              setRowMenuAnchor(e.currentTarget);
                              setRowMenuClass(cls);
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
        onClose={() => { setRowMenuAnchor(null); setRowMenuClass(null); }}
      >
        <MenuItem onClick={() => {
          if (rowMenuClass) handleOpenModal(rowMenuClass);
          setRowMenuAnchor(null);
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Редактировать</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (rowMenuClass) {
            setDeleteTarget([rowMenuClass.uuid]);
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
                Удалить класс(ы)?
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

      {/* Модалка создания/редактирования */}
      <Modal open={isModalOpen} onClose={handleCloseModal} closeAfterTransition>
        <Fade in={isModalOpen}>
          <ModalContainer>
            <ModalHeader>
              <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '20px', color: '#101025', letterSpacing: '-0.2px' }}>
                {editClass ? 'Редактирование класса' : 'Добавление класса'}
              </Typography>
              <IconButton onClick={handleCloseModal} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>

            <ModalBody>
              <FieldRow>
                <FieldLabel>Параллель *</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={SelectLabelSx}>Выберите параллель</InputLabel>
                    <Select
                      value={formData.parallel}
                      onChange={(e) => handleParallelChange(e.target.value)}
                      label="Выберите параллель"
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      {(options?.parallels ?? []).map((p) => (
                        <MenuItem key={p} value={String(p)}>{p}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Литера *</FieldLabel>
                <FieldValue>
                  <StyledTextField
                    fullWidth
                    placeholder="А"
                    value={formData.letter}
                    onChange={(e) => handleLetterChange(e.target.value)}
                    size="small"
                    helperText="Одна-две буквы, например «А» или «Б»"
                    slotProps={{
                      htmlInput: { maxLength: 2 },
                      formHelperText: { sx: { fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' } },
                    }}
                  />
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Название</FieldLabel>
                <FieldValue>
                  <StyledTextField
                    fullWidth
                    placeholder="Необязательно"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    size="small"
                  />
                </FieldValue>
              </FieldRow>

              {/* Предпрофиль — только 5–9 */}
              {showPreprofile && (
                <FieldRow>
                  <FieldLabel>Предпрофиль *</FieldLabel>
                  <FieldValue>
                    <FormControl fullWidth size="small">
                      <InputLabel sx={SelectLabelSx}>Выберите предпрофиль</InputLabel>
                      <Select
                        value={formData.preprofile}
                        onChange={(e) => setFormData(prev => ({ ...prev, preprofile: e.target.value }))}
                        label="Выберите предпрофиль"
                        sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                      >
                        {(options?.preprofiles ?? []).map((p) => (
                          <MenuItem key={p} value={p}>{p}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </FieldValue>
                </FieldRow>
              )}

              {/* Профиль — только 10–11 */}
              {showProfile && (
                <FieldRow>
                  <FieldLabel>Профиль *</FieldLabel>
                  <FieldValue>
                    <FormControl fullWidth size="small">
                      <InputLabel sx={SelectLabelSx}>Выберите профиль</InputLabel>
                      <Select
                        value={formData.profile}
                        onChange={(e) => setFormData(prev => ({ ...prev, profile: e.target.value }))}
                        label="Выберите профиль"
                        sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                      >
                        {(options?.profiles ?? []).map((p) => (
                          <MenuItem key={p} value={p}>{p}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </FieldValue>
                </FieldRow>
              )}

              <FieldRow>
                <FieldLabel>Классный руководитель</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={SelectLabelSx}>Выберите сотрудника</InputLabel>
                    <Select
                      value={formData.teacher_employee_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, teacher_employee_id: e.target.value }))}
                      label="Выберите сотрудника"
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      <MenuItem value="">
                        <em>Не назначен</em>
                      </MenuItem>
                      {teacherOptions.map((t) => (
                        <MenuItem key={t.id} value={String(t.id)}>
                          {t.fio}{t.position ? ` — ${t.position}` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Сменность обучения *</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={SelectLabelSx}>Выберите смену</InputLabel>
                    <Select
                      value={formData.shift}
                      onChange={(e) => setFormData(prev => ({ ...prev, shift: e.target.value }))}
                      label="Выберите смену"
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      {(options?.shifts ?? []).map((s) => (
                        <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Учебный год</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small" disabled>
                    <InputLabel sx={SelectLabelSx}>Учебный год</InputLabel>
                    <Select
                      value={formData.academic_year || options?.current_academic_year || ''}
                      label="Учебный год"
                      readOnly
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      {(options?.academic_years ?? []).map((y) => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={handleCloseModal}>Отменить</CancelButton>
              <SaveButton
                onClick={handleSave}
                disabled={saving || !formData.parallel || !formData.letter.trim()}
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

export default ClassesPage;
