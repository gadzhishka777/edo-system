import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Radio,
  RadioGroup,
  Menu,
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
  Edit as EditIcon,
  Delete as DeleteIcon,
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
  getAppealExecutors,
  getOrganizations,
  getResponseTemplates,
  createResponseTemplate,
  updateResponseTemplate,
  deleteResponseTemplate,
  type AppealListItem,
  type AppealCard,
  type AppealStatus,
  type AppealExecutor,
  type Organization,
  type Document,
  type ResponseTemplate,
} from '../api/edoApi';
import { getApiErrorMessage } from '../api/edoApi';
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

const REPLY_TYPE_LABELS: Record<string, string> = {
  resolved: 'Решено',
  unresolved: 'Не решено',
  postponed: 'Отложено',
  not_considered: 'Оставлено без рассмотрения',
};

const REPLY_STATE_LABELS: Record<string, string> = {
  draft: 'черновик',
  pending_approval: 'на согласовании',
  sent: 'направлен',
};

// ===== СТИЛИ =====
const PageContainer = styled(Box)({
  padding: '24px 32px',
  '@media (max-width: 600px)': {
    padding: '16px',
  },
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
  const [employeesList, setEmployeesList] = useState<AppealExecutor[]>([]);

  const [recallDialog, setRecallDialog] = useState(false);

  const [redirectDialog, setRedirectDialog] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState<number | ''>('');
  const [redirectComment, setRedirectComment] = useState('');
  const [orgsList, setOrgsList] = useState<Organization[]>([]);

  const [replyDialog, setReplyDialog] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyDocIds, setReplyDocIds] = useState<number[]>([]);
  const [replyType, setReplyType] = useState<string>('');
  const [replyFormat, setReplyFormat] = useState<'message' | 'document'>('message');
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [replyHintAnchor, setReplyHintAnchor] = useState<null | HTMLElement>(null);
  const [templateMenuAnchor, setTemplateMenuAnchor] = useState<null | HTMLElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement | null>(null);
  const [templateEditor, setTemplateEditor] = useState<{
    open: boolean;
    uuid: string | null;
    name: string;
    body: string;
  }>({ open: false, uuid: null, name: '', body: '' });
  const [templateEditorError, setTemplateEditorError] = useState('');

  // Роли текущего сотрудника (для гейта согласования/утверждения)
  const currentRoles: string[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('employee_roles') || '[]');
    } catch {
      return [];
    }
  })();
  const IS_APPROVER = currentRoles.some(r =>
    ['org_admin', 'department_head', 'final_approver'].includes(r),
  );
  // Текущий сотрудник — подготовивший ответ (нужно для кнопки «Отозвать с согласования»)
  const currentEmployeeId = Number(localStorage.getItem('employee_id') || 0) || null;
  const IS_PREPARER = !!card && !!currentEmployeeId && card.reply_prepared_by_id === currentEmployeeId;

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
      addError('Ошибка загрузки обращений', getApiErrorMessage(err, ''));
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
    if (takeWorkDialog) {
      // Только сотрудники с правом согласования: иначе обращение гарантированно
      // застрянет на этапе согласования ответа.
      getAppealExecutors().then(setEmployeesList).catch(() => setEmployeesList([]));
    }
  }, [takeWorkDialog]);

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
      addError('Ошибка загрузки обращения', getApiErrorMessage(err, ''));
      setCardOpen(false);
    } finally {
      setCardLoading(false);
    }
  };

  const reloadCardAndList = async () => {
    // Счётчик обращений на согласовании в меню обновится сразу, не дожидаясь polling
    window.dispatchEvent(new Event('appeals:changed'));
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
        typeof getApiErrorMessage(err) === 'string'
          ? getApiErrorMessage(err)
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

  // ===== ШАБЛОНЫ И ОТВЕТ =====
  const openReplyDialog = async () => {
    // Если есть сохранённый черновик или ответ на согласовании —
    // восстанавливаем сохранённые данные в поля формы.
    if (card?.reply_state === 'draft' || card?.reply_state === 'pending_approval') {
      setReplyText(card.reply_text || '');
      setReplyType(card.reply_type || 'resolved');
      setReplyFormat(
        card.reply_format === 'document' ? 'document' : 'message',
      );
    } else {
      setReplyText('');
      setReplyType('resolved');
      setReplyFormat('message');
    }
    setReplyDocIds([]);
    setReplyDialog(true);
    setTemplatesLoading(true);
    try {
      const t = await getResponseTemplates();
      setTemplates(t);
    } catch {
      /* ignore */
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Подставляет в текст реальные значения вместо {{подсказок}}.
  // Понимает и описательные подсказки из меню, и короткие имена из системных шаблонов.
  const resolveHints = (text: string): string => {
    if (!card) return text;
    const parts = (card.applicant?.full_name || '').split(' ').filter(Boolean);
    const nameOtch = parts.slice(1).join(' ') || card.applicant?.full_name || '';
    const fmt = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '___');
    const values: Record<string, string> = {
      // описательные подсказки (вставляет пользователь)
      'ФИО заявителя': card.applicant?.full_name || '',
      'Системный номер сообщения': card.system_number || '',
      'Наименование ЛКО': card.org_name || '',
      'Дата создания сообщения': fmt(card.created_at),
      'Регистрационный номер сообщения': card.reg_number || '___',
      'Дата регистрации': fmt(card.registered_at),
      // короткие имена из системных шаблонов
      ИМЯ_ОТЧЕСТВО: nameOtch,
      СИСТЕМНЫЙ_НОМЕР: card.system_number || '',
      ОРГАНИЗАЦИЯ: card.org_name || '',
      ДАТА_СОЗДАНИЯ: fmt(card.created_at),
    };
    return text.replace(/\{\{(.+?)\}\}/g, (m, raw: string) => {
      const key = String(raw).trim();
      return values[key] !== undefined ? values[key] : m;
    });
  };

  // Шаблон вставляется уже с подставленными данными
  const applyTemplate = (uuid: string) => {
    const t = templates.find(x => x.uuid === uuid);
    if (t) setReplyText(resolveHints(t.body));
  };

  const REPLY_HINTS: { label: string; token: string }[] = [
    { label: 'ФИО заявителя', token: '{{ФИО заявителя}}' },
    { label: 'Системный номер сообщения', token: '{{Системный номер сообщения}}' },
    { label: 'Наименование ЛКО', token: '{{Наименование ЛКО}}' },
    { label: 'Дата создания сообщения', token: '{{Дата создания сообщения}}' },
    { label: 'Регистрационный номер сообщения', token: '{{Регистрационный номер сообщения}}' },
    { label: 'Дата регистрации', token: '{{Дата регистрации}}' },
  ];

  // Вставляем по курсору готовое значение, а не переменную
  const insertHint = (token: string) => {
    setReplyHintAnchor(null);
    const value = resolveHints(token);
    const el = replyTextRef.current;
    const start = el?.selectionStart ?? replyText.length;
    const end = el?.selectionEnd ?? replyText.length;
    setReplyText(replyText.slice(0, start) + value + replyText.slice(end));
  };

  const openCreateTemplate = () => {
    setTemplateEditor({ open: true, uuid: null, name: '', body: '' });
    setTemplateEditorError('');
  };

  const openEditTemplate = (t: ResponseTemplate) => {
    setTemplateEditor({ open: true, uuid: t.uuid, name: t.name, body: t.body });
    setTemplateEditorError('');
  };

  const handleSaveTemplate = async () => {
    if (!templateEditor.name.trim() || !templateEditor.body.trim()) {
      setTemplateEditorError('Заполните название и текст шаблона');
      return;
    }
    const fn = templateEditor.uuid
      ? updateResponseTemplate(templateEditor.uuid, templateEditor.name.trim(), templateEditor.body.trim())
      : createResponseTemplate(templateEditor.name.trim(), templateEditor.body.trim());
    const res = await runAction(() => fn);
    if (res) {
      setTemplateEditor({ open: false, uuid: null, name: '', body: '' });
      setTemplateEditorError('');
      try {
        setTemplates(await getResponseTemplates());
      } catch {
        /* ignore */
      }
    }
  };

  const handleDeleteTemplate = async (uuid: string) => {
    const res = await runAction(() => deleteResponseTemplate(uuid));
    if (res) {
      try {
        setTemplates(await getResponseTemplates());
      } catch {
        /* ignore */
      }
    }
  };

  const handleReply = async (decision: string) => {
    if (!card) return;

    // Отзыв с согласования: форма ответа не нужна, документы не переприкрепляем
    if (decision === 'recall') {
      const res = await runAction(() =>
        replyToAppeal(card!.uuid, '', [], card!.reply_type || undefined,
          card!.reply_format === 'document' ? 'document' : 'message', 'recall'),
      );
      if (res) {
        setRecallDialog(false);
        await reloadCardAndList();
      }
      return;
    }

    // approve/reject из карточки (без диалога) — утверждаем/возвращаем
    // уже сохранённый черновик: берём данные из card, а не из полей формы.
    const fromCard = !replyDialog && (decision === 'approve' || decision === 'reject');

    if (fromCard) {
      // При approve в формате «Электронный документ» нужно передать
      // link_id всех связанных УНЭП/УКЭП-документов — иначе прикреплённые
      // документы «потеряются» и заявитель получит пустое письмо.
      // Документы НЕ перечисляем: бэкенд берёт сохранённые при подготовке ответа
      // appeal.reply_link_ids — ровно те, что выбрал исполнитель.
      const res = await runAction(() =>
        replyToAppeal(
          card!.uuid,
          card!.reply_text?.trim() || '',
          [],
          card!.reply_type || 'resolved',
          card!.reply_format === 'document' ? 'document' : 'message',
          decision,
        ),
      );
      if (res) {
        setReplyDialog(false);
        setReplyText('');
        setReplyDocIds([]);
        setReplyType('resolved');
        setReplyFormat('message');
        await reloadCardAndList();
      }
      return;
    }

    // Из диалога — валидация по выбранному формату (message/document).
    if (replyFormat === 'message') {
      if (!replyText.trim()) {
        addWarning('Нужен текст', 'Введите текст ответа или примените шаблон');
        return;
      }
    } else if (replyDocIds.length === 0) {
      addWarning('Нужен документ', 'Для формата «Электронный документ» выберите хотя бы один документ с электронной подписью (УНЭП/УКЭП)');
      return;
    }

    const res = await runAction(() =>
      replyToAppeal(
        card!.uuid,
        // В формате «Электронный документ» текст не отправляется —
        // сопроводительное письмо формируется автоматически.
        replyFormat === 'message' ? replyText.trim() : '',
        // В формате «Сообщение» вложения не отправляются.
        replyFormat === 'message' ? [] : replyDocIds,
        replyType || undefined,
        replyFormat,
        decision,
      ),
    );
    if (res) {
      setReplyDialog(false);
      setReplyText('');
      setReplyDocIds([]);
      setReplyType('resolved');
      setReplyFormat('message');
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
              sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', overflowX: 'auto', width: '100%' }}
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
                            <DetailLabel>
                              {card.reply_state === 'draft'
                                ? 'Черновик ответа'
                                : card.reply_state === 'pending_approval'
                                  ? 'Согласуемый текст ответа'
                                  : `Направленный ответ (${fmtDate(card.answered_at)})`}
                            </DetailLabel>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.5, mt: 0.5, borderRadius: '8px',
                                bgcolor: card.reply_state === 'draft'
                                  ? '#fff8e1'
                                  : card.reply_state === 'pending_approval'
                                    ? '#e3f2fd'
                                    : '#f1f8e9',
                                maxHeight: 200, overflowY: 'auto',
                              }}
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

                          {card.status === 'on_execution' && card.reply_state !== 'pending_approval' && (
                            <Button
                              fullWidth
                              variant="contained"
                              startIcon={<SendIcon />}
                              disabled={actionLoading}
                              onClick={openReplyDialog}
                              sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', bgcolor: '#2e7d32' }}
                            >
                              Направить ответ
                            </Button>
                          )}

                          {/* Кнопки согласующего при ответе на согласовании */}
                          {card.status === 'on_execution' && card.reply_state === 'pending_approval' && IS_APPROVER && (
                            <>
                              <Button
                                fullWidth
                                variant="contained"
                                startIcon={<SendIcon />}
                                disabled={actionLoading}
                                onClick={() => handleReply('approve')}
                                sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', bgcolor: '#2e7d32' }}
                              >
                                Утвердить
                              </Button>
                              <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<EditIcon />}
                                disabled={actionLoading}
                                onClick={openReplyDialog}
                                sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', borderColor: '#d6d6df', color: '#5a5a72' }}
                              >
                                Редактировать
                              </Button>
                              <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<RedoIcon />}
                                disabled={actionLoading}
                                onClick={() => handleReply('reject')}
                                sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', borderColor: '#e57373', color: '#e57373' }}
                              >
                                Вернуть на доработку
                              </Button>
                            </>
                          )}

                          {/* Ответ на согласовании, но сотрудник не согласующий */}
                          {card.status === 'on_execution' && card.reply_state === 'pending_approval' && !IS_APPROVER && (
                            <>
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                                Ответ на согласовании у Администратора или Руководителя.
                              </Typography>
                              {IS_PREPARER && (
                                <Button
                                  fullWidth
                                  variant="outlined"
                                  startIcon={<RedoIcon />}
                                  disabled={actionLoading}
                                  onClick={() => setRecallDialog(true)}
                                  sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', borderColor: '#e57373', color: '#e57373' }}
                                >
                                  Отозвать с согласования
                                </Button>
                              )}
                            </>
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

                        {/* Статус подготовки ответа */}
                        {card.reply_state && (
                          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px', mt: 2, bgcolor: '#f7f8fc' }}>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '12.5px', color: '#101025', mb: 0.5 }}>
                              Ответ: {REPLY_STATE_LABELS[card.reply_state] || card.reply_state}
                            </Typography>
                            {card.reply_type && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#5a5a72' }}>
                                Тип: {REPLY_TYPE_LABELS[card.reply_type] || card.reply_type}
                              </Typography>
                            )}
                            {card.reply_format && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#5a5a72' }}>
                                Формат: {card.reply_format === 'document' ? 'Электронный документ' : 'Сообщение'}
                              </Typography>
                            )}
                            {card.reply_prepared_by_name && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#5a5a72' }}>
                                Подготовил: {card.reply_prepared_by_name}
                              </Typography>
                            )}
                            {card.reply_approved_by_name && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#5a5a72' }}>
                                Утвердил: {card.reply_approved_by_name}
                              </Typography>
                            )}
                          </Paper>
                        )}
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
                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px', overflowX: 'auto', width: '100%' }}>
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
                                    {d.used_in_reply ? (
                                      <Tooltip title="Нельзя отвязать: документ уже используется в отправленном ответе">
                                        <Chip
                                          label="в ответе"
                                          size="small"
                                          sx={{ height: 22, fontSize: '10px', bgcolor: '#fff3e0', color: '#e65100' }}
                                        />
                                      </Tooltip>
                                    ) : (
                                      <IconButton size="small" onClick={() => handleUnlinkDoc(d.document_uuid, d.name)}>
                                        <LinkOffIcon fontSize="small" sx={{ color: '#c62828' }} />
                                      </IconButton>
                                    )}
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
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', mb: 2 }}>
              Исполнителем может быть любой сотрудник — он готовит проект ответа.
              Утвердить ответ вправе только Администратор, Руководитель или Утверждающий
              (отмечены значком «согласующий»).
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
                    {emp.full_name}{emp.position ? ` — ${emp.position}` : ''}
                    {emp.is_approver ? '  · согласующий' : ''}
                  </MenuItem>
                ))}
              </Select>
              {employeesList.length === 0 && (
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#e57373', mt: 0.5 }}>
                  В организации нет активных сотрудников. Добавьте сотрудника, чтобы назначить исполнителя.
                </Typography>
              )}
              {employeesList.length > 0 && !employeesList.some(e => e.is_approver) && (
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#ed6c02', mt: 0.5 }}>
                  Внимание: в организации нет сотрудника с правом согласования. Ответ не получится
                  направить на согласование — назначьте Администратора или Руководителя.
                </Typography>
              )}
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

      {/* ===================== ДИАЛОГ: ОТЗЫВ С СОГЛАСОВАНИЯ ===================== */}
      <Modal open={recallDialog} onClose={() => setRecallDialog(false)} closeAfterTransition>
        <Fade in={recallDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Отозвать ответ с согласования?
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              Ответ вернётся в черновик — его можно будет поправить и снова направить на согласование.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button onClick={() => setRecallDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={actionLoading}
                onClick={() => handleReply('recall')}
                sx={{ bgcolor: '#e57373', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Отозвать
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
              Письмо будет отправлено на {card?.applicant.email}.{' '}
              {replyFormat === 'document'
                ? 'К письму будут приложены выбранные документы с электронной подписью (УНЭП/УКЭП), а сопроводительное письмо сформируется автоматически.'
                : 'В формате «Сообщение» ответ отправляется текстом письма, вложения недоступны.'}
            </Typography>

            {/* Тип ответа */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Тип ответа</InputLabel>
              <Select
                value={replyType}
                label="Тип ответа"
                onChange={e => setReplyType(e.target.value)}
              >
                <MenuItem value=""><em>— не выбран —</em></MenuItem>
                <MenuItem value="resolved">Решено</MenuItem>
                <MenuItem value="unresolved">Не решено</MenuItem>
                <MenuItem value="postponed">Отложено</MenuItem>
                <MenuItem value="not_considered">Оставлено без рассмотрения</MenuItem>
              </Select>
            </FormControl>

            {/* Формат ответа */}
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '13px', color: '#101025', mb: 0.5 }}>
              Формат ответа:
            </Typography>
            <RadioGroup
              row
              value={replyFormat}
              onChange={e => {
                const value = e.target.value as 'message' | 'document';
                setReplyFormat(value);
                if (value === 'message') {
                  // В формате «Сообщение» вложения недоступны — сбрасываем выбранные документы
                  setReplyDocIds([]);
                } else {
                  // В формате «Электронный документ» принимаются только документы
                  // с электронной подписью (УНЭП/УКЭП) — оставляем в выборе только их.
                  const epIds = new Set(
                    (card?.linked_documents || [])
                      .filter(d => d.signature_type === 'UNEP' || d.signature_type === 'UKEP')
                      .map(d => d.link_id),
                  );
                  setReplyDocIds(prev => prev.filter(id => epIds.has(id)));
                  // Текст ответа в этом формате не используется (сопроводительное письмо
                  // формируется автоматически) — сбрасываем, чтобы не ушёл лишний текст.
                  setReplyText('');
                }
              }}
              sx={{ mb: 1.5 }}
            >
              <FormControlLabel value="message" control={<Radio size="small" />} label="Сообщение" />
              <FormControlLabel value="document" control={<Radio size="small" />} label="Электронный документ" />
            </RadioGroup>

            {/* Формат: сообщение — шаблоны, подсказки, текст */}
            {replyFormat === 'message' && (
              <>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e: React.MouseEvent<HTMLElement>) => setTemplateMenuAnchor(e.currentTarget)}
                    disabled={templatesLoading}
                    sx={{ borderRadius: '20px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', borderColor: '#4c6ef5', color: '#4c6ef5' }}
                  >
                    {templatesLoading ? 'Загрузка шаблонов…' : 'Применить шаблон'}
                  </Button>
                  <Menu anchorEl={templateMenuAnchor} open={!!templateMenuAnchor} onClose={() => setTemplateMenuAnchor(null)}>
                    {templates.length === 0 && <MenuItem disabled>Нет доступных шаблонов</MenuItem>}
                    {templates.filter(t => t.is_system).map(t => (
                      <MenuItem key={t.uuid} onClick={() => { applyTemplate(t.uuid); setTemplateMenuAnchor(null); }}>
                        {t.name} (системный)
                      </MenuItem>
                    ))}
                    {templates.filter(t => !t.is_system).map(t => (
                      <MenuItem key={t.uuid} onClick={() => { applyTemplate(t.uuid); setTemplateMenuAnchor(null); }}>
                        {t.name}
                      </MenuItem>
                    ))}
                  </Menu>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e: React.MouseEvent<HTMLElement>) => setReplyHintAnchor(e.currentTarget)}
                    sx={{ borderRadius: '20px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', borderColor: '#87879b', color: '#5a5a72' }}
                  >
                    Вставить подсказку
                  </Button>
                  <Menu anchorEl={replyHintAnchor} open={!!replyHintAnchor} onClose={() => setReplyHintAnchor(null)}>
                    {REPLY_HINTS.map(h => (
                      <MenuItem
                        key={h.token}
                        onClick={() => insertHint(h.token)}
                        sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
                      >
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                          {h.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontFamily: 'Lato, sans-serif',
                            fontSize: '12px',
                            color: '#87879b',
                            maxWidth: '190px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {resolveHints(h.token) || '—'}
                        </Typography>
                      </MenuItem>
                    ))}
                  </Menu>
                  <Button
                    size="small"
                    onClick={openCreateTemplate}
                    sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#4c6ef5' }}
                  >
                    + Создать свой шаблон
                  </Button>
                </Box>

                {templates.some(t => !t.is_system) && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5 }}>
                    {templates.filter(t => !t.is_system).map(t => (
                      <Box key={t.uuid} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#101025', flex: 1 }}>
                          Мой шаблон: {t.name}
                        </Typography>
                        <IconButton size="small" onClick={() => openEditTemplate(t)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteTemplate(t.uuid)}>
                          <DeleteIcon fontSize="small" sx={{ color: '#c62828' }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}

                <TextField
                  fullWidth
                  multiline
                  rows={9}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  inputRef={replyTextRef}
                  placeholder="Текст ответа заявителю… Подсказки вставляются уже с реальными данными."
                  sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': { borderRadius: '10px' },
                    '& textarea': { fontFamily: 'Lato, sans-serif', fontSize: '14px' },
                  }}
                />
              </>
            )}

            {/* Формат: электронный документ */}
            {replyFormat === 'document' && (
              <Alert severity="info" sx={{ borderRadius: '8px', mb: 2 }}>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px' }}>
                  Текст ответа не вводится — сопроводительное письмо формируется автоматически
                  на основе выбранного документа с электронной подписью (УНЭП/УКЭП) и прикладывается
                  к нему. Можно прикрепить только документы с УНЭП/УКЭП.
                </Typography>
              </Alert>
            )}

            {/* Вложения из связанных документов — только для формата «Электронный документ» */}
            {replyFormat === 'message' ? (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', mb: 2 }}>
                Вложения недоступны: ответ в формате «Сообщение» отправляется текстом письма.
                Чтобы приложить документы, выберите формат «Электронный документ».
              </Typography>
            ) : (
            <>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '13px', color: '#101025', mb: 1 }}>
              Документы для ответа — только с электронной подписью (УНЭП/УКЭП), обязательно:
            </Typography>
            {!card || card.linked_documents.filter(d => d.signature_type === 'UNEP' || d.signature_type === 'UKEP').length === 0 ? (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', mb: 2 }}>
                {card && card.linked_documents.length > 0
                  ? 'Нет связанных документов с электронной подписью (УНЭП/УКЭП). Для формата «Электронный документ» нужен хотя бы один такой документ.'
                  : 'Нет связанных документов. Перейдите на вкладку «Связанные документы», чтобы прикрепить документ с электронной подписью (УНЭП/УКЭП).'}
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
                {card.linked_documents
                  .filter(d => d.signature_type === 'UNEP' || d.signature_type === 'UKEP')
                  .map(d => (
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
                      <Box sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                        <Box component="span" sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                          {d.name}
                          {d.registration_number ? ` (рег. № ${d.registration_number})` : ''}
                        </Box>
                        <Chip
                          label={d.signature_type === 'UKEP' ? 'УКЭП' : 'УНЭП'}
                          size="small"
                          sx={{ ml: 0.5, height: 18, fontSize: 10, bgcolor: '#e8f5e9', color: '#2e7d32' }}
                        />
                      </Box>
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
            </>
            )}

            {/* Статус ответа (если черновик / на согласовании) */}
            {card?.reply_state && ['draft', 'pending_approval'].includes(card.reply_state) && (
              <Alert severity="info" sx={{ borderRadius: '8px', mb: 2 }}>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px' }}>
                  {card.reply_state === 'draft'
                    ? 'Сохранён черновик ответа.'
                    : 'Ответ ожидает согласования / утверждения.'}
                  {card.reply_prepared_by_name ? ` Подготовил: ${card.reply_prepared_by_name}.` : ''}
                </Typography>
              </Alert>
            )}

            {/* Действия */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
              <Button onClick={() => setReplyDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                Отмена
              </Button>
              {/* На согласовании черновик сохранить нельзя (бэкенд вернёт 400) */}
              {card?.reply_state !== 'pending_approval' && (
                <Button
                  variant="outlined"
                  disabled={actionLoading}
                  onClick={() => handleReply('save')}
                  sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', borderColor: '#d6d6df', color: '#5a5a72' }}
                >
                  Сохранить черновик
                </Button>
              )}
              {IS_APPROVER ? (
                <Button
                  variant="contained"
                  disabled={actionLoading || (replyFormat === 'message' && !replyText.trim()) || (replyFormat === 'document' && replyDocIds.length === 0)}
                  onClick={() => handleReply('approve')}
                  startIcon={<SendIcon />}
                  sx={{ bgcolor: '#2e7d32', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
                >
                  Утвердить
                </Button>
              ) : (
                <Button
                  variant="contained"
                  disabled={actionLoading || (replyFormat === 'message' && !replyText.trim())}
                  onClick={() => handleReply('submit')}
                  startIcon={<SendIcon />}
                  sx={{ bgcolor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
                >
                  Отправить на согласование
                </Button>
              )}
            </Box>
          </Paper>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: ШАБЛОН ОТВЕТА ===================== */}
      <Modal open={templateEditor.open} onClose={() => setTemplateEditor({ ...templateEditor, open: false })} closeAfterTransition>
        <Fade in={templateEditor.open}>
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '92%',
              maxWidth: '560px',
              borderRadius: '14px',
              p: 3,
            }}
          >
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              {templateEditor.uuid ? 'Редактировать шаблон' : 'Новый шаблон ответа'}
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2 }}>
              Шаблон применяется только в формате «Сообщение». Можно использовать подсказки вида {'{{ФИО заявителя}}'}.
            </Typography>
            <StyledField
              fullWidth
              size="small"
              label="Название шаблона *"
              value={templateEditor.name}
              onChange={e => setTemplateEditor({ ...templateEditor, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              rows={8}
              label="Текст шаблона *"
              value={templateEditor.body}
              onChange={e => setTemplateEditor({ ...templateEditor, body: e.target.value })}
              placeholder="Текст ответа… Подсказки: {{ФИО заявителя}}, {{Системный номер сообщения}}, {{Дата создания сообщения}} и др."
              sx={{
                mb: 1,
                '& .MuiOutlinedInput-root': { borderRadius: '10px' },
                '& textarea': { fontFamily: 'Lato, sans-serif', fontSize: '14px' },
              }}
            />
            {templateEditorError && (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#c62828', mb: 1 }}>
                {templateEditorError}
              </Typography>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button
                onClick={() => setTemplateEditor({ ...templateEditor, open: false })}
                sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}
              >
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={actionLoading}
                onClick={handleSaveTemplate}
                sx={{ bgcolor: '#2e7d32', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Сохранить
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
