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
  Autocomplete,
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
  Campaign as CampaignIcon,
  MenuBook as MenuBookIcon,
  OpenInNew as OpenInNewIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import {
  getPrograms,
  getProgramOptions,
  getOrderDocuments,
  orderDocumentLabel,
  downloadSignedCopy,
  downloadOriginal,
  createProgram,
  updateProgram,
  deleteProgram,
  getProgramClasses,
  assignProgramClasses,
  getApiErrorMessage,
  type Program,
  type ProgramOptions,
  type ProgramClassItem,
} from '../api/edoApi';

// ===== СТИЛИ (соответствуют «Сотрудникам», «Вакансиям» и «Классам») =====
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

/** Счётчик назначенных классов */
const CountChip = styled(Chip)<{ filled: boolean }>(({ filled }) => ({
  backgroundColor: filled ? '#e7f0ff' : '#f4f4f8',
  color: filled ? '#3b5bdb' : '#87879b',
  fontSize: '12px',
  fontWeight: 600,
  height: '26px',
  '& .MuiChip-label': {
    padding: '0 10px',
  },
}));

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

/**
 * Баннер-ссылка на федеральный ресурс «Единое содержание общего образования».
 * Открывается в новой вкладке — работа в реестре не прерывается.
 */
const EsooBanner = styled('a')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '20px',
  flexWrap: 'wrap',
  padding: '14px 20px',
  marginBottom: '20px',
  border: '1px solid #eaebf0',
  borderRadius: '12px',
  backgroundColor: '#ffffff',
  textDecoration: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  '&:hover': {
    borderColor: '#4c6ef5',
    boxShadow: '0 4px 16px rgba(76, 110, 245, 0.10)',
  },
});

/** Обрезка длинной подписи приказа до двух строк. */
const OrderLabelSx = {
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
} as const;

/**
 * Кликабельная подпись приказа в таблице: нажатие сразу скачивает файл,
 * уходить в раздел «Документы» не нужно.
 */
const OrderDownloadButton = styled('button')({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  margin: '-4px -6px',
  padding: '4px 6px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.15s ease',
  '&:hover': {
    backgroundColor: '#f0f3ff',
  },
  '&:hover .order-download-icon': {
    color: '#4c6ef5',
  },
});

/** Подсказка, что именно скачается по приказу. */
const orderDownloadHint = (kind?: 'signed' | 'original' | null): string => {
  if (kind === 'signed') return 'Скачать копию со штампом ЭП';
  if (kind === 'original') return 'Скачать файл приказа';
  return 'Файл приказа недоступен';
};

/** Строка класса в окне назначения */
const ClassRow = styled(Box)<{ assigned: boolean }>(({ assigned }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  border: `1px solid ${assigned ? '#c7d7fb' : 'transparent'}`,
  backgroundColor: assigned ? '#f5f8ff' : 'transparent',
  '&:hover': {
    backgroundColor: assigned ? '#eef3ff' : '#f8f8fb',
  },
}));

// ===== ФОРМА =====

/** Вариант в выпадающем списке «Приказ, утверждающий». */
interface OrderOption {
  id: number;
  label: string;
}

interface ProgramFormData {
  kind: string;
  clarification: string;
  clarificationOther: string;
  shortName: string;
  orderDocumentId: number | null;   // null = приказ не выбран
}

const emptyForm: ProgramFormData = {
  kind: '',
  clarification: '',
  clarificationOther: '',
  shortName: '',
  orderDocumentId: null,
};

/** Сколько приказов подгружаем в выпадающий список за раз. */
const ORDER_PAGE_SIZE = 20;

const ProgramsPage: React.FC = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuProgram, setRowMenuProgram] = useState<Program | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  const [options, setOptions] = useState<ProgramOptions | null>(null);
  const [formData, setFormData] = useState<ProgramFormData>(emptyForm);

  // ===== Автокомплит «Приказ, утверждающий» =====
  // Приказов может быть много, поэтому список ищется на сервере,
  // а в памяти держим только последнюю порцию вариантов.
  const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
  const [orderValue, setOrderValue] = useState<OrderOption | null>(null);
  const [orderInput, setOrderInput] = useState('');         // текст в поле
  const [orderQuery, setOrderQuery] = useState('');         // набранное пользователем (до дебаунса)
  const [orderSearch, setOrderSearch] = useState('');       // то же после дебаунса
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderLoaded, setOrderLoaded] = useState(false);    // был ли уже ответ сервера

  // Окно назначения классов (кнопка с рупором)
  const [assignProgram, setAssignProgram] = useState<Program | null>(null);
  const [assignItems, setAssignItems] = useState<ProgramClassItem[]>([]);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');

  // Показывать ли поле произвольного текста: только для пункта «иное…»
  const showClarificationOther = !!options &&
    !!formData.clarification &&
    formData.clarification === options.clarification_other;

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPrograms(page, pageSize, debouncedSearch || undefined);
      startTransition(() => {
        setPrograms(res.items);
        setTotal(res.total);
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки программ'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  // Справочники — один раз при открытии раздела
  useEffect(() => {
    let active = true;
    getProgramOptions()
      .then((res) => {
        if (active) setOptions(res);
      })
      .catch((err) => {
        if (active) setError(getApiErrorMessage(err, 'Ошибка загрузки справочников'));
      });
    return () => {
      active = false;
    };
  }, []);

  // Приказы: грузим при открытии окна и при каждом изменении поисковой строки
  useEffect(() => {
    if (!isModalOpen) return;
    let active = true;
    setOrderLoading(true);
    getOrderDocuments(orderSearch || undefined, ORDER_PAGE_SIZE)
      .then((res) => {
        if (!active) return;
        setOrderOptions(res.map((doc) => ({ id: doc.id, label: orderDocumentLabel(doc) })));
      })
      .catch(() => {
        // Папка «Приказы» может быть пуста — поле просто остаётся пустым
        if (active) setOrderOptions([]);
      })
      .finally(() => {
        if (!active) return;
        setOrderLoading(false);
        setOrderLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [isModalOpen, orderSearch]);

  // Дебаунс поиска по приказам
  useEffect(() => {
    const t = setTimeout(() => setOrderSearch(orderQuery), 400);
    return () => clearTimeout(t);
  }, [orderQuery]);

  // Дебаунс поиска
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleOpenModal = (program?: Program) => {
    // Поиск по приказам сбрасывается при каждом открытии окна
    setOrderQuery('');
    setOrderSearch('');
    setOrderLoaded(false);

    if (program) {
      setEditProgram(program);
      setFormData({
        kind: program.kind || '',
        clarification: program.clarification || '',
        clarificationOther: program.clarification_other || '',
        shortName: program.short_name || '',
        orderDocumentId: program.order_document_id ?? null,
      });
      // Уже выбранный приказ показываем сразу, не дожидаясь загрузки списка
      const label = program.order_label || 'Приказ не найден в системе';
      setOrderValue(
        program.order_document_id != null ? { id: program.order_document_id, label } : null
      );
      setOrderInput(program.order_document_id != null ? label : '');
    } else {
      setEditProgram(null);
      setFormData(emptyForm);
      setOrderValue(null);
      setOrderInput('');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditProgram(null);
  };

  // Смена вида программы: официальное наименование подставляется автоматически
  const handleKindChange = (value: string) => {
    setFormData(prev => ({ ...prev, kind: value }));
  };

  // Смена уточнения: текст имеет смысл только для пункта «иное…»
  const handleClarificationChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      clarification: value,
      clarificationOther: value === options?.clarification_other ? prev.clarificationOther : '',
    }));
  };

  const validate = (): string | null => {
    if (!formData.kind) return 'Выберите вид программы';
    if (showClarificationOther && !formData.clarificationOther.trim()) {
      return 'Укажите уточняющий текст для пункта «иное…»';
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
      kind: formData.kind,
      clarification: formData.clarification || null,
      clarification_other: showClarificationOther
        ? formData.clarificationOther.trim() || null
        : null,
      short_name: formData.shortName.trim() || null,
      order_document_id: formData.orderDocumentId,
    };

    setSaving(true);
    try {
      if (editProgram) {
        await updateProgram(editProgram.uuid, payload);
        setSuccess('Программа обновлена');
      } else {
        await createProgram(payload);
        setSuccess('Программа добавлена');
      }
      setIsModalOpen(false);
      setEditProgram(null);
      await loadPrograms();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      let detached = 0;
      for (const uuid of deleteTarget) {
        const res = await deleteProgram(uuid);
        detached += res.detached_classes || 0;
      }
      setSelected([]);
      const base = deleteTarget.length === 1
        ? 'Программа удалена'
        : `Удалено программ: ${deleteTarget.length}`;
      setSuccess(detached > 0 ? `${base}. Снята с классов: ${detached}` : base);
      await loadPrograms();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка удаления'));
    }
  };

  // ===== Скачивание приказа прямо из реестра =====

  /**
   * Сервер решает, что отдавать: копию со штампом ЭП (УНЭП/УКЭП)
   * или сам файл (собственноручная подпись). См. order_download_kind.
   */
  const handleDownloadOrder = (program: Program) => {
    const orderUuid = program.order_document_uuid;
    if (!orderUuid || !program.order_download_kind) return;
    const url = program.order_download_kind === 'signed'
      ? downloadSignedCopy(orderUuid)
      : downloadOriginal(orderUuid);
    window.open(url, '_blank');
    setSuccess(`Приказ «${program.order_label || ''}» скачивается`);
  };

  // ===== Назначение программы классам =====

  const handleOpenAssign = async (program: Program) => {
    setAssignProgram(program);
    setAssignSearch('');
    setAssignItems([]);
    setAssignSelected([]);
    setAssignLoading(true);
    try {
      const res = await getProgramClasses(program.uuid);
      setAssignItems(res.items);
      setAssignSelected(res.items.filter(i => i.assigned).map(i => i.uuid));
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки классов'));
      setAssignProgram(null);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCloseAssign = () => {
    setAssignProgram(null);
    setAssignItems([]);
    setAssignSelected([]);
  };

  const handleSaveAssign = async () => {
    if (!assignProgram) return;
    setAssignSaving(true);
    try {
      await assignProgramClasses(assignProgram.uuid, assignSelected);
      setSuccess(
        assignSelected.length === 0
          ? 'Программа снята со всех классов'
          : `Программа назначена классам: ${assignSelected.length}`
      );
      handleCloseAssign();
      await loadPrograms();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка назначения'));
    } finally {
      setAssignSaving(false);
    }
  };

  const toggleAssign = (uuid: string) => {
    setAssignSelected(prev =>
      prev.includes(uuid) ? prev.filter(id => id !== uuid) : [...prev, uuid]
    );
  };

  const visibleAssignItems = React.useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return assignItems;
    return assignItems.filter(i =>
      `${i.label} ${i.name || ''}`.toLowerCase().includes(q)
    );
  }, [assignItems, assignSearch]);

  const handleSelectAll = () => {
    const allIds = programs.map(p => p.uuid);
    if (selected.length === allIds.length && allIds.length > 0) {
      setSelected([]);
    } else {
      setSelected(allIds);
    }
  };

  const isAllSelected = programs.length > 0 && selected.length === programs.length;

  const formatClarification = (program: Program): string =>
    program.clarification_other || program.clarification || '—';

  if (loading && programs.length === 0) {
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
        Образовательные программы
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
            <ToolbarButton size="small" onClick={loadPrograms}>
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
                const program = programs.find(x => x.uuid === selected[0]);
                if (program) handleOpenModal(program);
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
            placeholder="Поиск по наименованию, уточнению или краткому названию…"
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

      {/* Ссылка на федеральный ресурс с рабочими программами */}
      <EsooBanner
        href="https://edsoo.ru/"
        target="_blank"
        rel="noopener noreferrer"
        title="Перейти на edsoo.ru"
      >
        <Box
          component="img"
          src={`${process.env.PUBLIC_URL}/esoo.jpg`}
          alt="Единое содержание общего образования"
          sx={{ height: 44, maxWidth: '100%', objectFit: 'contain', display: 'block' }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 600, color: '#101025', lineHeight: 1.3 }}>
              Конструктор рабочих программ
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b', lineHeight: 1.3 }}>
              edsoo.ru
            </Typography>
          </Box>
          <OpenInNewIcon sx={{ fontSize: 18, color: '#4c6ef5' }} />
        </Box>
      </EsooBanner>

      {/* Список */}
      <Fade in={!isPending} timeout={300}>
        <Box>
          {programs.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon><MenuBookIcon /></EmptyStateIcon>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '18px', color: '#101025', mb: 1 }}>
                {debouncedSearch ? 'Ничего не найдено' : 'Список программ пуст'}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', fontSize: '14px', mb: 3 }}>
                {debouncedSearch
                  ? 'Попробуйте изменить условия поиска'
                  : 'Добавьте образовательные программы вашей школы, чтобы начать работу'}
              </Typography>
              {!debouncedSearch && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenModal()}
                  sx={{ backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, padding: '10px 24px', '&:hover': { backgroundColor: '#364fc7' } }}>
                  Добавить программу
                </Button>
              )}
            </EmptyStateContainer>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', overflowX: 'auto', width: '100%' }}>
              <Table sx={{ minWidth: 1000 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        sx={{ color: '#b0b3c3' }}
                      />
                    </TableCell>
                    <TableCell>Официальное наименование</TableCell>
                    <TableCell>Уточняющая информация</TableCell>
                    <TableCell>Краткое название</TableCell>
                    <TableCell>Приказ, утверждающий</TableCell>
                    <TableCell align="center">Классов</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {programs.map((program) => {
                    const isSelected = selected.includes(program.uuid);
                    return (
                      <TableRow
                        key={program.uuid}
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
                                prev.includes(program.uuid)
                                  ? prev.filter(id => id !== program.uuid)
                                  : [...prev, program.uuid]
                              );
                            }}
                            sx={{ color: '#b0b3c3' }}
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: '320px' }}>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '13px',
                              fontWeight: 500,
                              color: '#101025',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {program.official_name || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: '260px' }}>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '13px',
                              color: program.clarification || program.clarification_other ? '#101025' : '#87879b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {formatClarification(program)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: '180px' }}>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '13px',
                              color: program.short_name ? '#101025' : '#87879b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {program.short_name || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: '260px' }}>
                          {program.order_document_uuid && program.order_download_kind ? (
                            <Tooltip title={orderDownloadHint(program.order_download_kind)}>
                              <OrderDownloadButton onClick={() => handleDownloadOrder(program)}>
                                <Typography sx={{ ...OrderLabelSx, color: '#101025' }}>
                                  {program.order_label || 'Приказ'}
                                </Typography>
                                <DownloadIcon
                                  className="order-download-icon"
                                  sx={{
                                    fontSize: 15,
                                    color: '#b0b3c3',
                                    flexShrink: 0,
                                    transition: 'color 0.15s ease',
                                  }}
                                />
                              </OrderDownloadButton>
                            </Tooltip>
                          ) : (
                            <Typography
                              sx={{
                                ...OrderLabelSx,
                                color: program.order_label ? '#101025' : '#87879b',
                              }}
                            >
                              {program.order_label || '—'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <CountChip
                            label={String(program.classes_count)}
                            size="small"
                            filled={program.classes_count > 0}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Назначить классам">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); handleOpenAssign(program); }}
                              sx={{
                                color: '#4c6ef5',
                                '&:hover': { backgroundColor: 'rgba(76, 110, 245, 0.08)' },
                              }}
                            >
                              <CampaignIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Ещё">
                            <IconButton size="small" sx={{ color: '#87879b' }} onClick={(e) => {
                              e.stopPropagation();
                              setRowMenuAnchor(e.currentTarget);
                              setRowMenuProgram(program);
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
        onClose={() => { setRowMenuAnchor(null); setRowMenuProgram(null); }}
      >
        <MenuItem onClick={() => {
          if (rowMenuProgram) handleOpenAssign(rowMenuProgram);
          setRowMenuAnchor(null);
        }}>
          <ListItemIcon><CampaignIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Назначить классам</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (rowMenuProgram) handleOpenModal(rowMenuProgram);
          setRowMenuAnchor(null);
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Редактировать</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (rowMenuProgram) {
            setDeleteTarget([rowMenuProgram.uuid]);
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
            width: '90%', maxWidth: '460px', backgroundColor: '#ffffff', borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
          }}>
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <DeleteIcon sx={{ fontSize: 36, color: '#e53935' }} />
              </Box>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '18px', fontWeight: 700, color: '#101025', mb: 1 }}>
                Удалить программу(ы)?
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                Будет удалено: {deleteTarget.length}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mt: 1 }}>
                Программа будет снята с классов, в которых она назначена. Сами классы останутся.
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
                {editProgram ? 'Редактирование программы' : 'Добавление программы'}
              </Typography>
              <IconButton onClick={handleCloseModal} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>

            <ModalBody>
              <FieldRow>
                <FieldLabel>Вид программы *</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={SelectLabelSx}>Выберите вид программы</InputLabel>
                    <Select
                      value={formData.kind}
                      onChange={(e) => handleKindChange(e.target.value)}
                      label="Выберите вид программы"
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      {(options?.kinds ?? []).map((k) => (
                        <MenuItem key={k} value={k}>{k}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Официальное наименование</FieldLabel>
                <FieldValue>
                  <StyledTextField
                    fullWidth
                    size="small"
                    value={formData.kind}
                    disabled
                    placeholder="Заполнится после выбора вида программы"
                    helperText="Заполняется автоматически по виду программы"
                    slotProps={{
                      formHelperText: { sx: { fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' } },
                    }}
                  />
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Уточняющая информация</FieldLabel>
                <FieldValue>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={SelectLabelSx}>Выберите пункт</InputLabel>
                    <Select
                      value={formData.clarification}
                      onChange={(e) => handleClarificationChange(e.target.value)}
                      label="Выберите пункт"
                      sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                    >
                      <MenuItem value="">
                        <em>Не указано</em>
                      </MenuItem>
                      {(options?.clarifications ?? []).map((c) => (
                        <MenuItem key={c} value={c}>{c}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </FieldValue>
              </FieldRow>

              {/* Произвольный текст — только для пункта «иное…» */}
              {showClarificationOther && (
                <FieldRow>
                  <FieldLabel>Уточняющий текст *</FieldLabel>
                  <FieldValue>
                    <StyledTextField
                      fullWidth
                      size="small"
                      value={formData.clarificationOther}
                      onChange={(e) => setFormData(prev => ({ ...prev, clarificationOther: e.target.value }))}
                      placeholder="Например: программа для кадетского класса"
                      helperText="Обязательно для пункта «иное…»"
                      slotProps={{
                        formHelperText: { sx: { fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' } },
                      }}
                    />
                  </FieldValue>
                </FieldRow>
              )}

              <FieldRow>
                <FieldLabel>Краткое название</FieldLabel>
                <FieldValue>
                  <StyledTextField
                    fullWidth
                    size="small"
                    value={formData.shortName}
                    onChange={(e) => setFormData(prev => ({ ...prev, shortName: e.target.value }))}
                    placeholder="Аббревиатура или принятое в организации название"
                    helperText="Для удобства дальнейшей работы"
                    slotProps={{
                      formHelperText: { sx: { fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' } },
                    }}
                  />
                </FieldValue>
              </FieldRow>

              <FieldRow>
                <FieldLabel>Приказ, утверждающий</FieldLabel>
                <FieldValue>
                  <Autocomplete
                    fullWidth
                    size="small"
                    options={orderOptions}
                    value={orderValue}
                    inputValue={orderInput}
                    loading={orderLoading}
                    // Список фильтрует сервер, клиентская фильтрация только мешала бы
                    filterOptions={(x) => x}
                    getOptionLabel={(option) => option.label}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_, value) => {
                      setOrderValue(value);
                      setFormData(prev => ({ ...prev, orderDocumentId: value ? value.id : null }));
                    }}
                    onInputChange={(_, value, reason) => {
                      setOrderInput(value);
                      // Ищем только когда пользователь сам набирает текст,
                      // а не когда MUI подставляет подпись выбранного приказа
                      if (reason === 'input') setOrderQuery(value);
                    }}
                    noOptionsText={
                      orderLoaded && !orderSearch
                        ? 'В системе пока нет документов в папке «Приказы»'
                        : 'Ничего не найдено'
                    }
                    loadingText="Поиск…"
                    renderInput={(params) => (
                      <StyledTextField
                        {...params}
                        placeholder="Начните вводить номер или название"
                        helperText="Поиск по номеру и названию приказа"
                        slotProps={{
                          ...params.slotProps,
                          formHelperText: {
                            sx: { fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' },
                          },
                        }}
                      />
                    )}
                  />
                </FieldValue>
              </FieldRow>
            </ModalBody>

            <ModalFooter>
              <CancelButton onClick={handleCloseModal}>Отменить</CancelButton>
              <SaveButton
                onClick={handleSave}
                disabled={saving || !formData.kind}
              >
                {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Сохранить'}
              </SaveButton>
            </ModalFooter>
          </ModalContainer>
        </Fade>
      </Modal>

      {/* Окно назначения программы классам (рупор) */}
      <Modal open={!!assignProgram} onClose={handleCloseAssign} closeAfterTransition>
        <Fade in={!!assignProgram}>
          <ModalContainer>
            <ModalHeader>
              <Box>
                <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '20px', color: '#101025', letterSpacing: '-0.2px' }}>
                  Назначение программы классам
                </Typography>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mt: 0.5 }}>
                  {assignProgram?.short_name || assignProgram?.official_name}
                </Typography>
              </Box>
              <IconButton onClick={handleCloseAssign} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>

            <ModalBody>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2 }}>
                Отметьте классы, в которых используется эта программа. У класса может быть
                только одна программа — назначение этой заменит прежнюю.
              </Typography>

              {assignLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress />
                </Box>
              ) : assignItems.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                    В реестре «Классы» пока нет ни одного класса.
                    Добавьте классы, чтобы назначить им программу.
                  </Typography>
                </Box>
              ) : (
                <>
                  <SearchField
                    placeholder="Поиск класса…"
                    size="small"
                    fullWidth
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: '18px', color: '#b0b3c3' }} />
                          </InputAdornment>
                        ),
                      },
                    }}
                    sx={{ mb: 2 }}
                  />

                  <Box sx={{ maxHeight: '40vh', overflowY: 'auto', pr: 0.5 }}>
                    {visibleAssignItems.map((item) => {
                      const checked = assignSelected.includes(item.uuid);
                      const hasOther = !checked && item.current_program_id != null;
                      return (
                        <ClassRow
                          key={item.uuid}
                          assigned={checked}
                          onClick={() => toggleAssign(item.uuid)}
                        >
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={() => toggleAssign(item.uuid)}
                            sx={{ color: '#b0b3c3', '&.Mui-checked': { color: '#4c6ef5' }, p: 0.5 }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 600, color: '#101025' }}>
                              {item.label}
                              {item.name ? (
                                <Box component="span" sx={{ fontWeight: 400, color: '#5b5b6e' }}>
                                  {` — ${item.name}`}
                                </Box>
                              ) : null}
                            </Typography>
                            {hasOther && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#b26a00' }}>
                                Сейчас: {item.current_program_short_name || 'другая программа'} — будет заменена
                              </Typography>
                            )}
                          </Box>
                        </ClassRow>
                      );
                    })}
                    {visibleAssignItems.length === 0 && (
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', textAlign: 'center', py: 3 }}>
                        Классы не найдены
                      </Typography>
                    )}
                  </Box>
                </>
              )}
            </ModalBody>

            <ModalFooter>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mr: 'auto', alignSelf: 'center' }}>
                Выбрано: {assignSelected.length}
              </Typography>
              <CancelButton onClick={handleCloseAssign}>Отменить</CancelButton>
              <SaveButton
                onClick={handleSaveAssign}
                disabled={assignSaving || assignLoading}
              >
                {assignSaving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Сохранить'}
              </SaveButton>
            </ModalFooter>
          </ModalContainer>
        </Fade>
      </Modal>
    </PageContainer>
  );
};

export default ProgramsPage;
