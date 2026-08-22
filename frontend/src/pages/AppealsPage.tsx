import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  TextField,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  MenuItem,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Snackbar,
  Fade,
  Modal,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  AttachFile as AttachFileIcon,
  Download as DownloadIcon,
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Gavel as GavelIcon,
  Assignment as AssignmentIcon,
  Lightbulb as LightbulbIcon,
  History as HistoryIcon,
  Send as SendIcon,
  Redo as RedoIcon,
} from '@mui/icons-material';
import {
  getAppeals,
  getAppealCard,
  registerAppeal,
  takeAppealToWork,
  redirectAppeal,
  replyToAppeal,
  linkDocumentToAppeal,
  unlinkDocumentFromAppeal,
  downloadAppealAttachment,
  getDocuments,
  getDocumentEmployees,
  getOrganizations,
  type AppealListItem,
  type AppealCard,
  type AppealStatus,
  type DocumentEmployee,
  type Organization,
  type Document,
} from '../api/edoApi';
import { useEvents } from '../context/EventContext';

dayjs.locale('ru');

// ===== СЛОВАРИ =====
const KIND_LABELS: Record<string, string> = {
  complaint: 'Жалоба',
  application: 'Заявление',
  suggestion: 'Предложение',
};

const APPLICANT_LABELS: Record<string, string> = {
  citizen: 'Обращение физлица',
  organization: 'Обращение организации',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Поступило',
  registered: 'Зарегистрировано',
  on_execution: 'На исполнении',
  answered: 'Ответ направлен',
  redirected: 'Перенаправлено',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new: { bg: '#fff3e0', color: '#e65100' },
  registered: { bg: '#e3f2fd', color: '#0d47a1' },
  on_execution: { bg: '#ede7f6', color: '#4527a0' },
  answered: { bg: '#e8f5e9', color: '#2e7d32' },
  redirected: { bg: '#eceff1', color: '#546e7a' },
};

const STATUS_TABS: { value: AppealStatus | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'registered', label: 'Зарегистрированные' },
  { value: 'on_execution', label: 'На исполнении' },
  { value: 'answered', label: 'Ответ направлен' },
  { value: 'redirected', label: 'Перенаправленные' },
];

// ===== СТИЛИ =====
const PageContainer = styled(Box)({
  padding: '24px 32px',
  maxWidth: '1400px',
  margin: '0 auto',
});

const StatusChip = styled(Chip)<{ st: string }>(({ st }) => {
  const c = STATUS_COLORS[st] || STATUS_COLORS.new;
  return {
    backgroundColor: c.bg,
    color: c.color,
    fontWeight: 600,
    fontSize: '11px',
    height: '24px',
    fontFamily: 'Lato, sans-serif',
  };
});

const DetailLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  color: '#87879b',
});

const DetailValue = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  fontWeight: 600,
  color: '#101025',
  wordBreak: 'break-word',
});

const CardModalContainer = styled(Paper)({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '92%',
  maxWidth: '1150px',
  // Фиксированная высота: модалка не «прыгает» при переключении табов,
  // при коротком содержимом снизу остаётся пустое пространство
  height: '88vh',
  borderRadius: '16px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

const DialogPaper = styled(Paper)({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '92%',
  maxWidth: '520px',
  maxHeight: '85vh',
  borderRadius: '14px',
  padding: '28px',
  overflowY: 'auto',
});

const StyledField = styled(TextField)({
  '& .MuiOutlinedInput-root': { borderRadius: '8px', backgroundColor: '#fafafa' },
  '& .MuiInputLabel-root': { fontFamily: 'Lato, sans-serif' },
});

const fmtDate = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY') : '—');
const fmtDateTime = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—');

// ===== КОМПОНЕНТ =====
const AppealsPage: React.FC = () => {
  const { addSuccess, addError, addWarning, addInfo } = useEvents();

  // Список
  const [items, setItems] = useState<AppealListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [statusTab, setStatusTab] = useState<AppealStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Карточка
  const [cardOpen, setCardOpen] = useState(false);
  const [card, setCard] = useState<AppealCard | null>(null);
  const [cardTab, setCardTab] = useState(0);
  const [cardLoading, setCardLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Диалоги
  const [registerDialog, setRegisterDialog] = useState(false);
  const [regNumber, setRegNumber] = useState('');

  const [takeWorkDialog, setTakeWorkDialog] = useState(false);
  const [executorId, setExecutorId] = useState<number | ''>('');
  const [takeWorkComment, setTakeWorkComment] = useState('');
  const [employeesList, setEmployeesList] = useState<DocumentEmployee[]>([]);

  const [redirectDialog, setRedirectDialog] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState<number | ''>('');
  const [redirectComment, setRedirectComment] = useState('');
  const [orgsList, setOrgsList] = useState<Organization[]>([]);

  const [replyDialog, setReplyDialog] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyDocIds, setReplyDocIds] = useState<number[]>([]);

  // Связывание документов
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<Document[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  // ===== ЗАГРУЗКА СПИСКА =====
  const loadAppeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAppeals({
        page,
        size: pageSize,
        status: statusTab || undefined,
        overdue: overdueOnly || undefined,
        search: debouncedSearch || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: any) {
      addError('Ошибка загрузки обращений', err?.response?.data?.detail || '');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusTab, overdueOnly, debouncedSearch]);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ===== СПРАВОЧНИКИ ДЛЯ ДИАЛОГОВ =====
  useEffect(() => {
    if (takeWorkDialog && employeesList.length === 0) {
      getDocumentEmployees().then(setEmployeesList).catch(() => {});
    }
  }, [takeWorkDialog, employeesList.length]);

  useEffect(() => {
    if (redirectDialog && orgsList.length === 0) {
      getOrganizations()
        .then(setOrgsList)
        .catch(() => {});
    }
  }, [redirectDialog, orgsList.length]);

  // ===== КАРТОЧКА =====
  const openCard = async (uuid: string) => {
    setCardLoading(true);
    setCardOpen(true);
    setCardTab(0);
    try {
      const data = await getAppealCard(uuid);
      setCard(data);
    } catch (err: any) {
      addError('Ошибка загрузки обращения', err?.response?.data?.detail || '');
      setCardOpen(false);
    } finally {
      setCardLoading(false);
    }
  };

  const reloadCardAndList = async () => {
    await loadAppeals();
    if (card) {
      try {
        setCard(await getAppealCard(card.uuid));
      } catch {
        /* ignore */
      }
    }
  };

  const runAction = async (fn: () => Promise<any>) => {
    setActionLoading(true);
    try {
      const res = await fn();
      const msg = res?.message || 'Готово';
      if (res?.warning) {
        addWarning('Внимание', res.warning);
        setSnack({ msg: res.warning, severity: 'warning' });
      } else {
        addSuccess(msg, '');
        setSnack({ msg, severity: 'success' });
      }
      return res;
    } catch (err: any) {
      const detail =
        typeof err?.response?.data?.detail === 'string'
          ? err.response.data.detail
          : 'Ошибка выполнения действия';
      setSnack({ msg: detail, severity: 'error' });
      addError('Ошибка', detail);
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  // ===== ДЕЙСТВИЯ =====
  const handleRegister = async () => {
    if (!card || !regNumber.trim()) return;
    const res = await runAction(() => registerAppeal(card.uuid, regNumber.trim()));
    if (res) {
      setRegisterDialog(false);
      setRegNumber('');
      await reloadCardAndList();
    }
  };

  const handleTakeWork = async () => {
    if (!card || !executorId) return;
    const emp = employeesList.find(e => e.id === executorId);
    const res = await runAction(() =>
      takeAppealToWork(card!.uuid, Number(executorId), takeWorkComment),
    );
    if (res) {
      addInfo('Исполнитель назначен', emp ? emp.full_name : '');
      setTakeWorkDialog(false);
      setExecutorId('');
      setTakeWorkComment('');
      await reloadCardAndList();
    }
  };

  const handleRedirect = async () => {
    if (!card || !targetOrgId) return;
    const orgName = orgsList.find(o => o.id === targetOrgId)?.name || '';
    const res = await runAction(() =>
      redirectAppeal(card!.uuid, Number(targetOrgId), redirectComment),
    );
    if (res) {
      setRedirectDialog(false);
      setTargetOrgId('');
      setRedirectComment('');
      setCardOpen(false);
      await loadAppeals();
    }
  };

  // Шаблоны ответа
  const buildTemplate = (variant: 'considered' | 'acknowledged'): string => {
    if (!card) return '';
    const parts = card.applicant.full_name.split(' ');
    const nameOtch = parts.slice(1).join(' ') || card.applicant.full_name;
    const dateStr = card.created_at ? dayjs(card.created_at).format('DD.MM.YYYY') : '___';
    const header = `Уважаемый(ая) ${nameOtch}!`;
    const intro = `Ваше обращение, поступившее в Единую цифровую платформу обратной связи от ${dateStr} № ${card.system_number}`;
    if (variant === 'considered') {
      return (
        `${header}\n\n${intro} рассмотрено. По существу вопроса сообщаем следующее.\n\n` +
        `\n\nБлагодарим за использование Единого цифрового портала обратной связи!`
      );
    }
    return `${header}\n\n${intro} рассмотрено. Изложенная информация принята к сведению.\n\nБлагодарим за использование Единого цифрового портала обратной связи!`;
  };

  const handleReply = async () => {
    if (!card || !replyText.trim()) return;
    const res = await runAction(() => replyToAppeal(card!.uuid, replyText.trim(), replyDocIds));
    if (res) {
      setReplyDialog(false);
      setReplyText('');
      setReplyDocIds([]);
      await reloadCardAndList();
    }
  };

  // ===== СВЯЗАННЫЕ ДОКУМЕНТЫ =====
  const openLinkDialog = async (search?: string) => {
    setLinkDialogOpen(true);
    setLinkLoading(true);
    try {
      const res = await getDocuments(1, 50, undefined, search || undefined);
      const linkedUuids = new Set((card?.linked_documents || []).map(d => d.document_uuid));
      setLinkCandidates(res.items.filter(d => !linkedUuids.has(d.uuid)));
    } catch {
      setLinkCandidates([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleLinkDoc = async (docUuid: string, docName: string) => {
    if (!card) return;
    const res = await runAction(() => linkDocumentToAppeal(card.uuid, docUuid));
    if (res) {
      addInfo('Документ связан', docName);
      setLinkDialogOpen(false);
      await reloadCardAndList();
    }
  };

  const handleUnlinkDoc = async (docUuid: string, docName: string) => {
    if (!card) return;
    const res = await runAction(() => unlinkDocumentFromAppeal(card.uuid, docUuid));
    if (res) {
      addInfo('Связь удалена', docName);
      await reloadCardAndList();
    }
  };

  const deadlineInfo = (
    item: { deadline?: string | null; days_left?: number | null; overdue: boolean; status: string },
  ): React.ReactNode => {
    if (['answered', 'redirected'].includes(item.status)) {
      return <span style={{ color: '#87879b' }}>Завершено</span>;
    }
    if (item.overdue) {
      return <span style={{ color: '#c62828', fontWeight: 700 }}>Просрочено</span>;
    }
    if (item.days_left !== null && item.days_left !== undefined) {
      const color = item.days_left <= 3 ? '#e65100' : '#2e7d32';
      return <span style={{ color, fontWeight: 600 }}>Осталось {item.days_left} дн.</span>;
    }
    return <span>—</span>;
  };

  const kindIcon = (kind: string): React.ReactNode => {
    if (kind === 'complaint') return <GavelIcon fontSize="small" sx={{ color: '#c62828' }} />;
    if (kind === 'suggestion') return <LightbulbIcon fontSize="small" sx={{ color: '#e65100' }} />;
    return <AssignmentIcon fontSize="small" sx={{ color: '#0d47a1' }} />;
  };

  // ===== РЕНДЕР =====
  return (
    <PageContainer>
      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '24px', color: '#101025', mb: 3 }}>
        Обращения
      </Typography>

      {/* Табы статусов */}
      <Box sx={{ mb: 2 }}>
        <Tabs
          value={statusTab}
          onChange={(_, v: AppealStatus | '') => {
            setStatusTab(v);
            setPage(1);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              fontFamily: 'Lato, sans-serif',
              textTransform: 'none',
              fontSize: '14px',
              minHeight: '40px',
              color: '#87879b',
              '&.Mui-selected': { color: '#4c6ef5' },
            },
            '& .MuiTabs-indicator': { backgroundColor: '#4c6ef5', height: '3px' },
          }}
        >
          {STATUS_TABS.map(t => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      </Box>

      <Snackbar
        open={!!snack}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={snack?.severity || 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>

      {/* Тулбар */}
      <Paper
        sx={{
          p: '12px 20px',
          borderRadius: '12px',
          border: '1px solid #eaebf0',
          boxShadow: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Обновить">
            <IconButton size="small" onClick={loadAppeals} sx={{ color: '#87879b' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <TextField
            placeholder="Поиск по номеру, ФИО или тексту"
            size="small"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            sx={{
              width: 300,
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                backgroundColor: '#f4f4f8',
                '& fieldset': { border: 'none' },
                '&.Mui-focused fieldset': { border: '2px solid #4c6ef5' },
              },
              '& input': { fontSize: '14px', padding: '8px 12px' },
            }}
            slotProps={{
              input: {
                startAdornment: <SearchIcon sx={{ fontSize: 18, color: '#b0b3c3', mr: 1 }} />,
              },
            }}
          />
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={overdueOnly}
              onChange={e => {
                setOverdueOnly(e.target.checked);
                setPage(1);
              }}
              sx={{ color: '#c62828', '&.Mui-checked': { color: '#c62828' } }}
            />
          }
          label={
            <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: '#5a5a72' }}>
              Только просроченные
            </span>
          }
        />
      </Paper>

      {/* Таблица */}
      <Fade in={!loading}>
        <Box>
          {items.length === 0 ? (
            <Paper
              sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: '12px',
                border: '1px solid #eaebf0',
                boxShadow: 'none',
                bgcolor: '#fafafa',
              }}
            >
              <HistoryIcon sx={{ fontSize: 56, color: '#d6d6df', mb: 2 }} />
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: 17, color: '#101025', mb: 0.5 }}>
                Обращений нет
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: '#87879b' }}>
                Обращения граждан и организаций появятся здесь после подачи через интернет-приёмную
              </Typography>
            </Paper>
          ) : (
            <TableContainer
              component={Paper}
              sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none' }}
            >
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Вид</TableCell>
                    <TableCell>Номер / Дата поступления</TableCell>
                    <TableCell>Тема</TableCell>
                    <TableCell>Содержание</TableCell>
                    <TableCell>Статус / Срок</TableCell>
                    <TableCell align="center">Вложения</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map(item => (
                    <TableRow
                      key={item.uuid}
                      hover
                      onClick={() => openCard(item.uuid)}
                      sx={{ cursor: 'pointer', '&:hover': { backgroundColor: '#f9fafe' } }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {item.applicant_type === 'organization' ? (
                            <BusinessIcon fontSize="small" sx={{ color: '#4c6ef5' }} />
                          ) : (
                            <PersonIcon fontSize="small" sx={{ color: '#87879b' }} />
                          )}
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#5a5a72' }}>
                            {APPLICANT_LABELS[item.applicant_type]}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', fontWeight: 600, color: '#101025' }}>
                          № {item.system_number}
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                          {fmtDate(item.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {kindIcon(item.kind)}
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                            {KIND_LABELS[item.kind]}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 340 }}>
                        <Typography
                          sx={{
                            fontFamily: 'Lato, sans-serif',
                            fontSize: '13px',
                            color: '#5a5a72',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.content_preview}…
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusChip st={item.status} label={STATUS_LABELS[item.status]} size="small" />
                        <Typography component="div" sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', mt: 0.5 }}>
                          {deadlineInfo(item)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {item.has_attachments ? (
                          <Tooltip title="Показать вложения">
                            <IconButton
                              size="small"
                              onClick={e => {
                                e.stopPropagation();
                                openCard(item.uuid);
                              }}
                            >
                              <AttachFileIcon fontSize="small" sx={{ color: '#4c6ef5' }} />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <span style={{ color: '#d6d6df' }}>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Fade>

      {total > pageSize && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={Math.ceil(total / pageSize)}
            page={page}
            onChange={(_, v) => setPage(v)}
            color="primary"
            shape="rounded"
          />
        </Box>
      )}

      {/* ===================== КАРТОЧКА ОБРАЩЕНИЯ ===================== */}
      <Modal open={cardOpen} onClose={() => setCardOpen(false)} closeAfterTransition>
        <Fade in={cardOpen}>
          <CardModalContainer elevation={8}>
            {/* Заголовок */}
            <Box
              sx={{
                p: '16px 26px',
                borderBottom: '1px solid #eaebf0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '17px', color: '#101025' }}>
                {card
                  ? `${APPLICANT_LABELS[card.applicant_type]} № ${card.reg_number || card.system_number}`
                  : 'Загрузка…'}
              </Typography>
              <IconButton onClick={() => setCardOpen(false)} size="small" sx={{ color: '#87879b' }}>
                ✕
              </IconButton>
            </Box>

            {cardLoading || !card ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {/* Табы */}
                <Box sx={{ px: 2, borderBottom: '1px solid #eaebf0' }}>
                  <Tabs
                    value={cardTab}
                    onChange={(_, v: number) => setCardTab(v)}
                    sx={{
                      '& .MuiTab-root': {
                        fontFamily: 'Lato, sans-serif',
                        textTransform: 'none',
                        fontSize: '14px',
                        minHeight: '44px',
                        '&.Mui-selected': { color: '#4c6ef5' },
                      },
                      '& .MuiTabs-indicator': { backgroundColor: '#4c6ef5' },
                    }}
                  >
                    <Tab label="Детали" />
                    <Tab label={`Вложения (${card.attachments.length})`} />
                    <Tab label={`Связанные документы (${card.linked_documents.length})`} />
                  </Tabs>
                </Box>

                <Box sx={{ overflowY: 'auto', flex: 1, p: 3 }}>
                  {/* ---------- ДЕТАЛИ ---------- */}
                  {cardTab === 0 && (
                    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {/* Левая колонка */}
                      <Box sx={{ flex: '1 1 640px', minWidth: 320 }}>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                            gap: 2,
                          }}
                        >
                          <Box>
                            <DetailLabel>Регистрационный номер</DetailLabel>
                            <DetailValue>{card.reg_number || 'Не зарегистрировано'}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Дата регистрации</DetailLabel>
                            <DetailValue>{fmtDate(card.registered_at)}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Системный номер</DetailLabel>
                            <DetailValue>{card.system_number}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Дата поступления</DetailLabel>
                            <DetailValue>{fmtDate(card.created_at)}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Вид</DetailLabel>
                            <DetailValue>{APPLICANT_LABELS[card.applicant_type]}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Тема обращения</DetailLabel>
                            <DetailValue>{KIND_LABELS[card.kind]}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Текущий процесс</DetailLabel>
                            <Box sx={{ mt: 0.25 }}>
                              <StatusChip st={card.status} label={STATUS_LABELS[card.status]} size="small" />
                            </Box>
                          </Box>
                          <Box>
                            <DetailLabel>Состояние (срок)</DetailLabel>
                            <DetailValue>{deadlineInfo(card)}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Кратность поступления</DetailLabel>
                            <DetailValue>
                              {card.is_redirected_in
                                ? <>Перенаправлено из «{card.redirect_from_org_name}»</>
                                : 'Первичное'}
                            </DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Исполнитель</DetailLabel>
                            <DetailValue>{card.executor_name || 'Не назначен'}</DetailValue>
                          </Box>
                        </Box>

                        <Divider sx={{ my: 2.5 }} />

                        <DetailLabel>Содержание обращения</DetailLabel>
                        <Paper
                          variant="outlined"
                          sx={{ p: 1.5, mt: 0.5, borderRadius: '8px', bgcolor: '#fafafa', maxHeight: 180, overflowY: 'auto' }}
                        >
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13.5px', lineHeight: 1.6, whiteSpace: 'pre-line', color: '#3a3a52' }}>
                            {card.content}
                          </Typography>
                        </Paper>

                        <Divider sx={{ my: 2.5 }} />

                        <DetailLabel>Данные заявителя</DetailLabel>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: 2,
                            mt: 0.5,
                          }}
                        >
                          <Box>
                            <DetailLabel>ФИО</DetailLabel>
                            <DetailValue>{card.applicant.full_name}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Эл. почта</DetailLabel>
                            <DetailValue>{card.applicant.email}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Контактный телефон</DetailLabel>
                            <DetailValue>{card.applicant.phone || '—'}</DetailValue>
                          </Box>
                          {card.applicant_type === 'organization' && (
                            <>
                              <Box>
                                <DetailLabel>Полное наименование организации</DetailLabel>
                                <DetailValue>{card.applicant.org_full_name || '—'}</DetailValue>
                              </Box>
                              <Box>
                                <DetailLabel>Краткое наименование организации</DetailLabel>
                                <DetailValue>{card.applicant.org_short_name || '—'}</DetailValue>
                              </Box>
                              <Box>
                                <DetailLabel>ФИО руководителя</DetailLabel>
                                <DetailValue>{card.applicant.org_director || '—'}</DetailValue>
                              </Box>
                            </>
                          )}
                        </Box>

                        {card.internal_comment && (
                          <>
                            <Divider sx={{ my: 2.5 }} />
                            <DetailLabel>Внутренний комментарий</DetailLabel>
                            <Alert severity="info" sx={{ mt: 0.5, borderRadius: '8px', fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                              {card.internal_comment}
                            </Alert>
                          </>
                        )}

                        {card.reply_text && (
                          <>
                            <Divider sx={{ my: 2.5 }} />
                            <DetailLabel>Направленный ответ ({fmtDate(card.answered_at)})</DetailLabel>
                            <Paper
                              variant="outlined"
                              sx={{ p: 1.5, mt: 0.5, borderRadius: '8px', bgcolor: '#f1f8e9', maxHeight: 200, overflowY: 'auto' }}
                            >
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13.5px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                                {card.reply_text}
                              </Typography>
                            </Paper>
                          </>
                        )}

                        {/* Журнал действий */}
                        <Divider sx={{ my: 2.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                          <HistoryIcon sx={{ fontSize: 18, color: '#87879b' }} />
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '14px', color: '#101025' }}>
                            Журнал действий
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                          {card.history.map(h => (
                            <Box key={h.id} sx={{ display: 'flex', gap: 1.5 }}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4c6ef5', mt: '6px', flexShrink: 0 }} />
                              <Box>
                                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                                  {h.action}
                                </Typography>
                                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                                  {h.employee_name} · {fmtDateTime(h.created_at)}
                                  {h.comment ? ` · ${h.comment}` : ''}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>

                      {/* Правая колонка — действия */}
                      <Box sx={{ flex: '0 0 240px', minWidth: 240 }}>
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '14px', color: '#101025' }}>
                            Действия
                          </Typography>

                          {card.status === 'new' && (
                            <Button
                              fullWidth
                              variant="contained"
                              startIcon={<AssignmentIcon />}
                              disabled={actionLoading}
                              onClick={() => {
                                setRegNumber('');
                                setRegisterDialog(true);
                              }}
                              sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', bgcolor: '#4c6ef5' }}
                            >
                              Зарегистрировать
                            </Button>
                          )}

                          {card.status === 'registered' && (
                            <Button
                              fullWidth
                              variant="contained"
                              startIcon={<PersonIcon />}
                              disabled={actionLoading}
                              onClick={() => {
                                setExecutorId('');
                                setTakeWorkComment('');
                                setTakeWorkDialog(true);
                              }}
                              sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', bgcolor: '#4c6ef5' }}
                            >
                              Взять в работу
                            </Button>
                          )}

                          {card.status === 'on_execution' && (
                            <Button
                              fullWidth
                              variant="contained"
                              startIcon={<SendIcon />}
                              disabled={actionLoading}
                              onClick={() => {
                                setReplyText(buildTemplate('considered'));
                                setReplyDocIds([]);
                                setReplyDialog(true);
                              }}
                              sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', bgcolor: '#2e7d32' }}
                            >
                              Направить ответ
                            </Button>
                          )}

                          {card.status === 'registered' && (
                            <Button
                              fullWidth
                              variant="outlined"
                              startIcon={<RedoIcon />}
                              disabled={actionLoading}
                              onClick={() => {
                                setTargetOrgId('');
                                setRedirectComment('');
                                setRedirectDialog(true);
                              }}
                              sx={{
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontFamily: 'Lato, sans-serif',
                                borderColor: '#d6d6df',
                                color: '#5a5a72',
                              }}
                            >
                              Перенаправить
                            </Button>
                          )}

                          {['answered', 'redirected'].includes(card.status) && (
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                              Обращение завершено. Действия недоступны.
                            </Typography>
                          )}
                        </Paper>
                      </Box>
                    </Box>
                  )}

                  {/* ---------- ВЛОЖЕНИЯ ---------- */}
                  {cardTab === 1 && (
                    <>
                      {card.attachments.length === 0 ? (
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', textAlign: 'center', py: 6 }}>
                          Вложений нет
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {card.attachments.map(at => (
                            <Paper
                              key={at.id}
                              variant="outlined"
                              sx={{ p: 1.25, px: 2, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                              <DescriptionIcon sx={{ color: '#e53935' }} />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#101025', wordBreak: 'break-all' }}>
                                  {at.file_name}
                                </Typography>
                                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                                  {(at.file_size / 1024).toFixed(1)} КБ · {fmtDate(at.uploaded_at)}
                                </Typography>
                              </Box>
                              <Tooltip title="Скачать / открыть">
                                <IconButton
                                  size="small"
                                  onClick={() => window.open(downloadAppealAttachment(at.id), '_blank')}
                                  sx={{ color: '#4c6ef5' }}
                                >
                                  <DownloadIcon />
                                </IconButton>
                              </Tooltip>
                            </Paper>
                          ))}
                        </Box>
                      )}
                    </>
                  )}

                  {/* ---------- СВЯЗАННЫЕ ДОКУМЕНТЫ ---------- */}
                  {cardTab === 2 && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', flex: 1 }}>
                          Связанные документы можно приложить к ответу заявителю.
                          Для связывания выберите документ из вашей системы.
                        </Typography>
                        <Button
                          variant="outlined"
                          startIcon={<LinkIcon />}
                          onClick={() => openLinkDialog()}
                          sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', borderColor: '#4c6ef5', color: '#4c6ef5' }}
                        >
                          Связать документ
                        </Button>
                      </Box>

                      {card.linked_documents.length === 0 ? (
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13.5px', color: '#87879b' }}>
                          С обращением пока не связаны документы.
                        </Typography>
                      ) : (
                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Документ</TableCell>
                                <TableCell>Рег. номер</TableCell>
                                <TableCell>Файл</TableCell>
                                <TableCell align="right">Отвязать</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {card.linked_documents.map(d => (
                                <TableRow key={d.document_uuid}>
                                  <TableCell sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>{d.name}</TableCell>
                                  <TableCell sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                                    {d.registration_number || '—'}
                                  </TableCell>
                                  <TableCell sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                                    {d.original_file_name}
                                    {d.has_signed_copy && (
                                      <Chip
                                        label="есть подписанная копия"
                                        size="small"
                                        sx={{ ml: 1, height: 20, fontSize: '10px', bgcolor: '#e8f5e9', color: '#2e7d32' }}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell align="right">
                                    <IconButton size="small" onClick={() => handleUnlinkDoc(d.document_uuid, d.name)}>
                                      <LinkOffIcon fontSize="small" sx={{ color: '#c62828' }} />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  )}
                </Box>
              </>
            )}
          </CardModalContainer>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: РЕГИСТРАЦИЯ ===================== */}
      <Modal open={registerDialog} onClose={() => setRegisterDialog(false)} closeAfterTransition>
        <Fade in={registerDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Регистрация обращения
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              Введите регистрационный номер. Дата регистрации фиксируется сегодняшним числом ({fmtDate(dayjs().toISOString())}).
              После регистрации начнёт отсчитываться срок ответа — 30 календарных дней.
            </Typography>
            <StyledField
              fullWidth
              size="small"
              label="Регистрационный номер *"
              placeholder="Например: 1234-об"
              value={regNumber}
              onChange={e => setRegNumber(e.target.value)}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
              <Button onClick={() => setRegisterDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={!regNumber.trim() || actionLoading}
                onClick={handleRegister}
                sx={{ bgcolor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Зарегистрировать
              </Button>
            </Box>
          </DialogPaper>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: ВЗЯТЬ В РАБОТУ ===================== */}
      <Modal open={takeWorkDialog} onClose={() => setTakeWorkDialog(false)} closeAfterTransition>
        <Fade in={takeWorkDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Взять в работу
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              Назначьте исполнителя обращения. Статус изменится на «На исполнении». Можно оставить внутренний комментарий.
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Исполнитель *</InputLabel>
              <Select
                value={executorId}
                label="Исполнитель *"
                onChange={e => setExecutorId(Number(e.target.value))}
                sx={{ borderRadius: '8px' }}
              >
                {employeesList.map(emp => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              label="Внутренний комментарий (не виден заявителю)"
              value={takeWorkComment}
              onChange={e => setTakeWorkComment(e.target.value)}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
              <Button onClick={() => setTakeWorkDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={!executorId || actionLoading}
                onClick={handleTakeWork}
                sx={{ bgcolor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Назначить исполнителя
              </Button>
            </Box>
          </DialogPaper>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: ПЕРЕНАПРАВЛЕНИЕ ===================== */}
      <Modal open={redirectDialog} onClose={() => setRedirectDialog(false)} closeAfterTransition>
        <Fade in={redirectDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Перенаправление обращения
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              Обращение будет передано выбранной организации. Заявитель получит уведомление о переадресации на электронную почту.
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Организация-получатель *</InputLabel>
              <Select
                value={targetOrgId}
                label="Организация-получатель *"
                onChange={e => setTargetOrgId(Number(e.target.value))}
                sx={{ borderRadius: '8px' }}
              >
                {orgsList
                  .filter(o => !card || o.name !== undefined)
                  .map(o => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              label="Комментарий (причина перенаправления)"
              value={redirectComment}
              onChange={e => setRedirectComment(e.target.value)}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
              <Button onClick={() => setRedirectDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={!targetOrgId || actionLoading}
                onClick={handleRedirect}
                sx={{ bgcolor: '#e65100', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Перенаправить
              </Button>
            </Box>
          </DialogPaper>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: ОТВЕТ ===================== */}
      <Modal open={replyDialog} onClose={() => setReplyDialog(false)} closeAfterTransition>
        <Fade in={replyDialog}>
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '92%',
              maxWidth: '720px',
              maxHeight: '88vh',
              borderRadius: '14px',
              p: 3,
              overflowY: 'auto',
            }}
          >
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Направить ответ заявителю
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2 }}>
              Письмо будет отправлено на {card?.applicant.email}. Можно использовать шаблон и вложить связанные
              с обращением документы.
            </Typography>

            {/* Шаблоны */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setReplyText(buildTemplate('considered'))}
                sx={{ borderRadius: '20px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', borderColor: '#4c6ef5', color: '#4c6ef5' }}
              >
                Шаблон: рассмотрен по существу
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setReplyText(buildTemplate('acknowledged'))}
                sx={{ borderRadius: '20px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', borderColor: '#4c6ef5', color: '#4c6ef5' }}
              >
                Шаблон: принято к сведению
              </Button>
            </Box>

            <TextField
              fullWidth
              multiline
              rows={9}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Текст ответа заявителю…"
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': { borderRadius: '10px' },
                '& textarea': { fontFamily: 'Lato, sans-serif', fontSize: '14px' },
              }}
            />

            {/* Вложения из связанных документов */}
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '13px', color: '#101025', mb: 1 }}>
              Приложить связанные документы:
            </Typography>
            {!card || card.linked_documents.length === 0 ? (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', mb: 2 }}>
                Нет связанных документов. Перейдите на вкладку «Связанные документы», чтобы прикрепить их к обращению.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
                {card.linked_documents.map(d => (
                  <FormControlLabel
                    key={d.document_uuid}
                    sx={{ ml: 0, alignItems: 'flex-start' }}
                    control={
                      <Checkbox
                        size="small"
                        checked={replyDocIds.includes(d.link_id)}
                        onChange={(_, checked) => {
                          setReplyDocIds(prev =>
                            checked ? [...prev, d.link_id] : prev.filter(id => id !== d.link_id),
                          );
                        }}
                        sx={{ color: '#4c6ef5', pt: 0.25 }}
                      />
                    }
                    label={
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                        {d.name}
                        {d.registration_number ? ` (рег. № ${d.registration_number})` : ''}
                        {(d.signature_type === 'UNEP' || d.signature_type === 'UKEP') && (
                          <Chip
                            label={d.signature_type === 'UKEP' ? 'УКЭП' : 'УНЭП'}
                            size="small"
                            sx={{ ml: 1, height: 18, fontSize: 10, bgcolor: '#e8f5e9', color: '#2e7d32' }}
                          />
                        )}
                      </Typography>
                    }
                  />
                ))}
                {card.linked_documents.some(d =>
                  replyDocIds.includes(d.link_id) &&
                  (d.signature_type === 'UNEP' || d.signature_type === 'UKEP'),
                ) && (
                  <Alert severity="info" sx={{ borderRadius: '8px', mt: 0.5 }}>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px' }}>
                      К письму с УНЭП/УКЭП-документом будет приложены копия со штампом ЭП и архив
                      с подлинником. Сопроводительное письмо сформируется автоматически.
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button onClick={() => setReplyDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={!replyText.trim() || actionLoading}
                onClick={handleReply}
                startIcon={<SendIcon />}
                sx={{ bgcolor: '#2e7d32', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Направить ответ
              </Button>
            </Box>
          </Paper>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: СВЯЗАТЬ ДОКУМЕНТ ===================== */}
      <Modal open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} closeAfterTransition>
        <Fade in={linkDialogOpen}>
          <DialogPaper elevation={8} sx={{ maxWidth: '640px' }}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Связать документ с обращением
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Поиск документа по названию или номеру"
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') openLinkDialog(linkSearch);
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
              <Button
                variant="contained"
                onClick={() => openLinkDialog(linkSearch)}
                sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', bgcolor: '#4c6ef5', whiteSpace: 'nowrap' }}
              >
                Найти
              </Button>
            </Box>
            {linkLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : linkCandidates.length === 0 ? (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                Документы не найдены
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                {linkCandidates.map(doc => (
                  <Paper
                    key={doc.uuid}
                    variant="outlined"
                    sx={{ p: 1.25, px: 2, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <DescriptionIcon sx={{ color: '#e53935' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13.5px', color: '#101025' }}>
                        {doc.name}
                      </Typography>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                        рег. № {doc.registration_number || '—'}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleLinkDoc(doc.uuid, doc.name)}
                      sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#4c6ef5' }}
                    >
                      Связать
                    </Button>
                  </Paper>
                ))}
              </Box>
            )}
          </DialogPaper>
        </Fade>
      </Modal>
    </PageContainer>
  );
};

export default AppealsPage;
