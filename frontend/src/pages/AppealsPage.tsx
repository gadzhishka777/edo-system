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
import { getApiErrorMessage } from '../api/edoApi';
import { useEvents } from '../context/EventContext';

dayjs.locale('ru');

// ===== РЎР›РћР’РђР Р =====
const KIND_LABELS: Record<string, string> = {
  complaint: 'Р–Р°Р»РѕР±Р°',
  application: 'Р—Р°СЏРІР»РµРЅРёРµ',
  suggestion: 'РџСЂРµРґР»РѕР¶РµРЅРёРµ',
};

const APPLICANT_LABELS: Record<string, string> = {
  citizen: 'РћР±СЂР°С‰РµРЅРёРµ С„РёР·Р»РёС†Р°',
  organization: 'РћР±СЂР°С‰РµРЅРёРµ РѕСЂРіР°РЅРёР·Р°С†РёРё',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'РџРѕСЃС‚СѓРїРёР»Рѕ',
  registered: 'Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРѕ',
  on_execution: 'РќР° РёСЃРїРѕР»РЅРµРЅРёРё',
  answered: 'РћС‚РІРµС‚ РЅР°РїСЂР°РІР»РµРЅ',
  redirected: 'РџРµСЂРµРЅР°РїСЂР°РІР»РµРЅРѕ',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new: { bg: '#fff3e0', color: '#e65100' },
  registered: { bg: '#e3f2fd', color: '#0d47a1' },
  on_execution: { bg: '#ede7f6', color: '#4527a0' },
  answered: { bg: '#e8f5e9', color: '#2e7d32' },
  redirected: { bg: '#eceff1', color: '#546e7a' },
};

const STATUS_TABS: { value: AppealStatus | ''; label: string }[] = [
  { value: '', label: 'Р’СЃРµ' },
  { value: 'new', label: 'РќРѕРІС‹Рµ' },
  { value: 'registered', label: 'Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹Рµ' },
  { value: 'on_execution', label: 'РќР° РёСЃРїРѕР»РЅРµРЅРёРё' },
  { value: 'answered', label: 'РћС‚РІРµС‚ РЅР°РїСЂР°РІР»РµРЅ' },
  { value: 'redirected', label: 'РџРµСЂРµРЅР°РїСЂР°РІР»РµРЅРЅС‹Рµ' },
];

// ===== РЎРўРР›Р =====
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
  // Р¤РёРєСЃРёСЂРѕРІР°РЅРЅР°СЏ РІС‹СЃРѕС‚Р°: РјРѕРґР°Р»РєР° РЅРµ В«РїСЂС‹РіР°РµС‚В» РїСЂРё РїРµСЂРµРєР»СЋС‡РµРЅРёРё С‚Р°Р±РѕРІ,
  // РїСЂРё РєРѕСЂРѕС‚РєРѕРј СЃРѕРґРµСЂР¶РёРјРѕРј СЃРЅРёР·Сѓ РѕСЃС‚Р°С‘С‚СЃСЏ РїСѓСЃС‚РѕРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ
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

const fmtDate = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY') : 'вЂ”');
const fmtDateTime = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : 'вЂ”');

// ===== РљРћРњРџРћРќР•РќРў =====
const AppealsPage: React.FC = () => {
  const { addSuccess, addError, addWarning, addInfo } = useEvents();

  // РЎРїРёСЃРѕРє
  const [items, setItems] = useState<AppealListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [statusTab, setStatusTab] = useState<AppealStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // РљР°СЂС‚РѕС‡РєР°
  const [cardOpen, setCardOpen] = useState(false);
  const [card, setCard] = useState<AppealCard | null>(null);
  const [cardTab, setCardTab] = useState(0);
  const [cardLoading, setCardLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Р”РёР°Р»РѕРіРё
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

  // РЎРІСЏР·С‹РІР°РЅРёРµ РґРѕРєСѓРјРµРЅС‚РѕРІ
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<Document[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  // ===== Р—РђР“Р РЈР—РљРђ РЎРџРРЎРљРђ =====
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
      addError('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РѕР±СЂР°С‰РµРЅРёР№', getApiErrorMessage(err, ''));
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

  // ===== РЎРџР РђР’РћР§РќРРљР Р”Р›РЇ Р”РРђР›РћР“РћР’ =====
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

  // ===== РљРђР РўРћР§РљРђ =====
  const openCard = async (uuid: string) => {
    setCardLoading(true);
    setCardOpen(true);
    setCardTab(0);
    try {
      const data = await getAppealCard(uuid);
      setCard(data);
    } catch (err: any) {
      addError('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РѕР±СЂР°С‰РµРЅРёСЏ', getApiErrorMessage(err, ''));
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
      const msg = res?.message || 'Р“РѕС‚РѕРІРѕ';
      if (res?.warning) {
        addWarning('Р’РЅРёРјР°РЅРёРµ', res.warning);
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
          : 'РћС€РёР±РєР° РІС‹РїРѕР»РЅРµРЅРёСЏ РґРµР№СЃС‚РІРёСЏ';
      setSnack({ msg: detail, severity: 'error' });
      addError('РћС€РёР±РєР°', detail);
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  // ===== Р”Р•Р™РЎРўР’РРЇ =====
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
      addInfo('РСЃРїРѕР»РЅРёС‚РµР»СЊ РЅР°Р·РЅР°С‡РµРЅ', emp ? emp.full_name : '');
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

  // РЁР°Р±Р»РѕРЅС‹ РѕС‚РІРµС‚Р°
  const buildTemplate = (variant: 'considered' | 'acknowledged'): string => {
    if (!card) return '';
    const parts = card.applicant.full_name.split(' ');
    const nameOtch = parts.slice(1).join(' ') || card.applicant.full_name;
    const dateStr = card.created_at ? dayjs(card.created_at).format('DD.MM.YYYY') : '___';
    const header = `РЈРІР°Р¶Р°РµРјС‹Р№(Р°СЏ) ${nameOtch}!`;
    const intro = `Р’Р°С€Рµ РѕР±СЂР°С‰РµРЅРёРµ, РїРѕСЃС‚СѓРїРёРІС€РµРµ РІ Р•РґРёРЅСѓСЋ С†РёС„СЂРѕРІСѓСЋ РїР»Р°С‚С„РѕСЂРјСѓ РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё РѕС‚ ${dateStr} в„– ${card.system_number}`;
    if (variant === 'considered') {
      return (
        `${header}\n\n${intro} СЂР°СЃСЃРјРѕС‚СЂРµРЅРѕ. РџРѕ СЃСѓС‰РµСЃС‚РІСѓ РІРѕРїСЂРѕСЃР° СЃРѕРѕР±С‰Р°РµРј СЃР»РµРґСѓСЋС‰РµРµ.\n\n` +
        `\n\nР‘Р»Р°РіРѕРґР°СЂРёРј Р·Р° РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ Р•РґРёРЅРѕРіРѕ С†РёС„СЂРѕРІРѕРіРѕ РїРѕСЂС‚Р°Р»Р° РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё!`
      );
    }
    return `${header}\n\n${intro} СЂР°СЃСЃРјРѕС‚СЂРµРЅРѕ. РР·Р»РѕР¶РµРЅРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ РїСЂРёРЅСЏС‚Р° Рє СЃРІРµРґРµРЅРёСЋ.\n\nР‘Р»Р°РіРѕРґР°СЂРёРј Р·Р° РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ Р•РґРёРЅРѕРіРѕ С†РёС„СЂРѕРІРѕРіРѕ РїРѕСЂС‚Р°Р»Р° РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё!`;
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

  // ===== РЎР’РЇР—РђРќРќР«Р• Р”РћРљРЈРњР•РќРўР« =====
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
      addInfo('Р”РѕРєСѓРјРµРЅС‚ СЃРІСЏР·Р°РЅ', docName);
      setLinkDialogOpen(false);
      await reloadCardAndList();
    }
  };

  const handleUnlinkDoc = async (docUuid: string, docName: string) => {
    if (!card) return;
    const res = await runAction(() => unlinkDocumentFromAppeal(card.uuid, docUuid));
    if (res) {
      addInfo('РЎРІСЏР·СЊ СѓРґР°Р»РµРЅР°', docName);
      await reloadCardAndList();
    }
  };

  const deadlineInfo = (
    item: { deadline?: string | null; days_left?: number | null; overdue: boolean; status: string },
  ): React.ReactNode => {
    if (['answered', 'redirected'].includes(item.status)) {
      return <span style={{ color: '#87879b' }}>Р—Р°РІРµСЂС€РµРЅРѕ</span>;
    }
    if (item.overdue) {
      return <span style={{ color: '#c62828', fontWeight: 700 }}>РџСЂРѕСЃСЂРѕС‡РµРЅРѕ</span>;
    }
    if (item.days_left !== null && item.days_left !== undefined) {
      const color = item.days_left <= 3 ? '#e65100' : '#2e7d32';
      return <span style={{ color, fontWeight: 600 }}>РћСЃС‚Р°Р»РѕСЃСЊ {item.days_left} РґРЅ.</span>;
    }
    return <span>вЂ”</span>;
  };

  const kindIcon = (kind: string): React.ReactNode => {
    if (kind === 'complaint') return <GavelIcon fontSize="small" sx={{ color: '#c62828' }} />;
    if (kind === 'suggestion') return <LightbulbIcon fontSize="small" sx={{ color: '#e65100' }} />;
    return <AssignmentIcon fontSize="small" sx={{ color: '#0d47a1' }} />;
  };

  // ===== Р Р•РќР”Р•Р  =====
  return (
    <PageContainer>
      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '24px', color: '#101025', mb: 3 }}>
        РћР±СЂР°С‰РµРЅРёСЏ
      </Typography>

      {/* РўР°Р±С‹ СЃС‚Р°С‚СѓСЃРѕРІ */}
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

      {/* РўСѓР»Р±Р°СЂ */}
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
          <Tooltip title="РћР±РЅРѕРІРёС‚СЊ">
            <IconButton size="small" onClick={loadAppeals} sx={{ color: '#87879b' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <TextField
            placeholder="РџРѕРёСЃРє РїРѕ РЅРѕРјРµСЂСѓ, Р¤РРћ РёР»Рё С‚РµРєСЃС‚Сѓ"
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
              РўРѕР»СЊРєРѕ РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Рµ
            </span>
          }
        />
      </Paper>

      {/* РўР°Р±Р»РёС†Р° */}
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
                РћР±СЂР°С‰РµРЅРёР№ РЅРµС‚
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: '#87879b' }}>
                РћР±СЂР°С‰РµРЅРёСЏ РіСЂР°Р¶РґР°РЅ Рё РѕСЂРіР°РЅРёР·Р°С†РёР№ РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ РїРѕСЃР»Рµ РїРѕРґР°С‡Рё С‡РµСЂРµР· РёРЅС‚РµСЂРЅРµС‚-РїСЂРёС‘РјРЅСѓСЋ
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
                    <TableCell>Р’РёРґ</TableCell>
                    <TableCell>РќРѕРјРµСЂ / Р”Р°С‚Р° РїРѕСЃС‚СѓРїР»РµРЅРёСЏ</TableCell>
                    <TableCell>РўРµРјР°</TableCell>
                    <TableCell>РЎРѕРґРµСЂР¶Р°РЅРёРµ</TableCell>
                    <TableCell>РЎС‚Р°С‚СѓСЃ / РЎСЂРѕРє</TableCell>
                    <TableCell align="center">Р’Р»РѕР¶РµРЅРёСЏ</TableCell>
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
                          в„– {item.system_number}
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
                          {item.content_preview}вЂ¦
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
                          <Tooltip title="РџРѕРєР°Р·Р°С‚СЊ РІР»РѕР¶РµРЅРёСЏ">
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
                          <span style={{ color: '#d6d6df' }}>вЂ”</span>
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

      {/* ===================== РљРђР РўРћР§РљРђ РћР‘Р РђР©Р•РќРРЇ ===================== */}
      <Modal open={cardOpen} onClose={() => setCardOpen(false)} closeAfterTransition>
        <Fade in={cardOpen}>
          <CardModalContainer elevation={8}>
            {/* Р—Р°РіРѕР»РѕРІРѕРє */}
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
                  ? `${APPLICANT_LABELS[card.applicant_type]} в„– ${card.reg_number || card.system_number}`
                  : 'Р—Р°РіСЂСѓР·РєР°вЂ¦'}
              </Typography>
              <IconButton onClick={() => setCardOpen(false)} size="small" sx={{ color: '#87879b' }}>
                вњ•
              </IconButton>
            </Box>

            {cardLoading || !card ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {/* РўР°Р±С‹ */}
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
                    <Tab label="Р”РµС‚Р°Р»Рё" />
                    <Tab label={`Р’Р»РѕР¶РµРЅРёСЏ (${card.attachments.length})`} />
                    <Tab label={`РЎРІСЏР·Р°РЅРЅС‹Рµ РґРѕРєСѓРјРµРЅС‚С‹ (${card.linked_documents.length})`} />
                  </Tabs>
                </Box>

                <Box sx={{ overflowY: 'auto', flex: 1, p: 3 }}>
                  {/* ---------- Р”Р•РўРђР›Р ---------- */}
                  {cardTab === 0 && (
                    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {/* Р›РµРІР°СЏ РєРѕР»РѕРЅРєР° */}
                      <Box sx={{ flex: '1 1 640px', minWidth: 320 }}>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                            gap: 2,
                          }}
                        >
                          <Box>
                            <DetailLabel>Р РµРіРёСЃС‚СЂР°С†РёРѕРЅРЅС‹Р№ РЅРѕРјРµСЂ</DetailLabel>
                            <DetailValue>{card.reg_number || 'РќРµ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРѕ'}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Р”Р°С‚Р° СЂРµРіРёСЃС‚СЂР°С†РёРё</DetailLabel>
                            <DetailValue>{fmtDate(card.registered_at)}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>РЎРёСЃС‚РµРјРЅС‹Р№ РЅРѕРјРµСЂ</DetailLabel>
                            <DetailValue>{card.system_number}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Р”Р°С‚Р° РїРѕСЃС‚СѓРїР»РµРЅРёСЏ</DetailLabel>
                            <DetailValue>{fmtDate(card.created_at)}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Р’РёРґ</DetailLabel>
                            <DetailValue>{APPLICANT_LABELS[card.applicant_type]}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>РўРµРјР° РѕР±СЂР°С‰РµРЅРёСЏ</DetailLabel>
                            <DetailValue>{KIND_LABELS[card.kind]}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>РўРµРєСѓС‰РёР№ РїСЂРѕС†РµСЃСЃ</DetailLabel>
                            <Box sx={{ mt: 0.25 }}>
                              <StatusChip st={card.status} label={STATUS_LABELS[card.status]} size="small" />
                            </Box>
                          </Box>
                          <Box>
                            <DetailLabel>РЎРѕСЃС‚РѕСЏРЅРёРµ (СЃСЂРѕРє)</DetailLabel>
                            <DetailValue>{deadlineInfo(card)}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>РљСЂР°С‚РЅРѕСЃС‚СЊ РїРѕСЃС‚СѓРїР»РµРЅРёСЏ</DetailLabel>
                            <DetailValue>
                              {card.is_redirected_in
                                ? <>РџРµСЂРµРЅР°РїСЂР°РІР»РµРЅРѕ РёР· В«{card.redirect_from_org_name}В»</>
                                : 'РџРµСЂРІРёС‡РЅРѕРµ'}
                            </DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>РСЃРїРѕР»РЅРёС‚РµР»СЊ</DetailLabel>
                            <DetailValue>{card.executor_name || 'РќРµ РЅР°Р·РЅР°С‡РµРЅ'}</DetailValue>
                          </Box>
                        </Box>

                        <Divider sx={{ my: 2.5 }} />

                        <DetailLabel>РЎРѕРґРµСЂР¶Р°РЅРёРµ РѕР±СЂР°С‰РµРЅРёСЏ</DetailLabel>
                        <Paper
                          variant="outlined"
                          sx={{ p: 1.5, mt: 0.5, borderRadius: '8px', bgcolor: '#fafafa', maxHeight: 180, overflowY: 'auto' }}
                        >
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13.5px', lineHeight: 1.6, whiteSpace: 'pre-line', color: '#3a3a52' }}>
                            {card.content}
                          </Typography>
                        </Paper>

                        <Divider sx={{ my: 2.5 }} />

                        <DetailLabel>Р”Р°РЅРЅС‹Рµ Р·Р°СЏРІРёС‚РµР»СЏ</DetailLabel>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: 2,
                            mt: 0.5,
                          }}
                        >
                          <Box>
                            <DetailLabel>Р¤РРћ</DetailLabel>
                            <DetailValue>{card.applicant.full_name}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>Р­Р». РїРѕС‡С‚Р°</DetailLabel>
                            <DetailValue>{card.applicant.email}</DetailValue>
                          </Box>
                          <Box>
                            <DetailLabel>РљРѕРЅС‚Р°РєС‚РЅС‹Р№ С‚РµР»РµС„РѕРЅ</DetailLabel>
                            <DetailValue>{card.applicant.phone || 'вЂ”'}</DetailValue>
                          </Box>
                          {card.applicant_type === 'organization' && (
                            <>
                              <Box>
                                <DetailLabel>РџРѕР»РЅРѕРµ РЅР°РёРјРµРЅРѕРІР°РЅРёРµ РѕСЂРіР°РЅРёР·Р°С†РёРё</DetailLabel>
                                <DetailValue>{card.applicant.org_full_name || 'вЂ”'}</DetailValue>
                              </Box>
                              <Box>
                                <DetailLabel>РљСЂР°С‚РєРѕРµ РЅР°РёРјРµРЅРѕРІР°РЅРёРµ РѕСЂРіР°РЅРёР·Р°С†РёРё</DetailLabel>
                                <DetailValue>{card.applicant.org_short_name || 'вЂ”'}</DetailValue>
                              </Box>
                              <Box>
                                <DetailLabel>Р¤РРћ СЂСѓРєРѕРІРѕРґРёС‚РµР»СЏ</DetailLabel>
                                <DetailValue>{card.applicant.org_director || 'вЂ”'}</DetailValue>
                              </Box>
                            </>
                          )}
                        </Box>

                        {card.internal_comment && (
                          <>
                            <Divider sx={{ my: 2.5 }} />
                            <DetailLabel>Р’РЅСѓС‚СЂРµРЅРЅРёР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№</DetailLabel>
                            <Alert severity="info" sx={{ mt: 0.5, borderRadius: '8px', fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                              {card.internal_comment}
                            </Alert>
                          </>
                        )}

                        {card.reply_text && (
                          <>
                            <Divider sx={{ my: 2.5 }} />
                            <DetailLabel>РќР°РїСЂР°РІР»РµРЅРЅС‹Р№ РѕС‚РІРµС‚ ({fmtDate(card.answered_at)})</DetailLabel>
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

                        {/* Р–СѓСЂРЅР°Р» РґРµР№СЃС‚РІРёР№ */}
                        <Divider sx={{ my: 2.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                          <HistoryIcon sx={{ fontSize: 18, color: '#87879b' }} />
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '14px', color: '#101025' }}>
                            Р–СѓСЂРЅР°Р» РґРµР№СЃС‚РІРёР№
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
                                  {h.employee_name} В· {fmtDateTime(h.created_at)}
                                  {h.comment ? ` В· ${h.comment}` : ''}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>

                      {/* РџСЂР°РІР°СЏ РєРѕР»РѕРЅРєР° вЂ” РґРµР№СЃС‚РІРёСЏ */}
                      <Box sx={{ flex: '0 0 240px', minWidth: 240 }}>
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '14px', color: '#101025' }}>
                            Р”РµР№СЃС‚РІРёСЏ
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
                              Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊ
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
                              Р’Р·СЏС‚СЊ РІ СЂР°Р±РѕС‚Сѓ
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
                              РќР°РїСЂР°РІРёС‚СЊ РѕС‚РІРµС‚
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
                              РџРµСЂРµРЅР°РїСЂР°РІРёС‚СЊ
                            </Button>
                          )}

                          {['answered', 'redirected'].includes(card.status) && (
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                              РћР±СЂР°С‰РµРЅРёРµ Р·Р°РІРµСЂС€РµРЅРѕ. Р”РµР№СЃС‚РІРёСЏ РЅРµРґРѕСЃС‚СѓРїРЅС‹.
                            </Typography>
                          )}
                        </Paper>
                      </Box>
                    </Box>
                  )}

                  {/* ---------- Р’Р›РћР–Р•РќРРЇ ---------- */}
                  {cardTab === 1 && (
                    <>
                      {card.attachments.length === 0 ? (
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', textAlign: 'center', py: 6 }}>
                          Р’Р»РѕР¶РµРЅРёР№ РЅРµС‚
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
                                  {(at.file_size / 1024).toFixed(1)} РљР‘ В· {fmtDate(at.uploaded_at)}
                                </Typography>
                              </Box>
                              <Tooltip title="РЎРєР°С‡Р°С‚СЊ / РѕС‚РєСЂС‹С‚СЊ">
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

                  {/* ---------- РЎР’РЇР—РђРќРќР«Р• Р”РћРљРЈРњР•РќРўР« ---------- */}
                  {cardTab === 2 && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', flex: 1 }}>
                          РЎРІСЏР·Р°РЅРЅС‹Рµ РґРѕРєСѓРјРµРЅС‚С‹ РјРѕР¶РЅРѕ РїСЂРёР»РѕР¶РёС‚СЊ Рє РѕС‚РІРµС‚Сѓ Р·Р°СЏРІРёС‚РµР»СЋ.
                          Р”Р»СЏ СЃРІСЏР·С‹РІР°РЅРёСЏ РІС‹Р±РµСЂРёС‚Рµ РґРѕРєСѓРјРµРЅС‚ РёР· РІР°С€РµР№ СЃРёСЃС‚РµРјС‹.
                        </Typography>
                        <Button
                          variant="outlined"
                          startIcon={<LinkIcon />}
                          onClick={() => openLinkDialog()}
                          sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', borderColor: '#4c6ef5', color: '#4c6ef5' }}
                        >
                          РЎРІСЏР·Р°С‚СЊ РґРѕРєСѓРјРµРЅС‚
                        </Button>
                      </Box>

                      {card.linked_documents.length === 0 ? (
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13.5px', color: '#87879b' }}>
                          РЎ РѕР±СЂР°С‰РµРЅРёРµРј РїРѕРєР° РЅРµ СЃРІСЏР·Р°РЅС‹ РґРѕРєСѓРјРµРЅС‚С‹.
                        </Typography>
                      ) : (
                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Р”РѕРєСѓРјРµРЅС‚</TableCell>
                                <TableCell>Р РµРі. РЅРѕРјРµСЂ</TableCell>
                                <TableCell>Р¤Р°Р№Р»</TableCell>
                                <TableCell align="right">РћС‚РІСЏР·Р°С‚СЊ</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {card.linked_documents.map(d => (
                                <TableRow key={d.document_uuid}>
                                  <TableCell sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>{d.name}</TableCell>
                                  <TableCell sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                                    {d.registration_number || 'вЂ”'}
                                  </TableCell>
                                  <TableCell sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px' }}>
                                    {d.original_file_name}
                                    {d.has_signed_copy && (
                                      <Chip
                                        label="РµСЃС‚СЊ РїРѕРґРїРёСЃР°РЅРЅР°СЏ РєРѕРїРёСЏ"
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

      {/* ===================== Р”РРђР›РћР“: Р Р•Р“РРЎРўР РђР¦РРЇ ===================== */}
      <Modal open={registerDialog} onClose={() => setRegisterDialog(false)} closeAfterTransition>
        <Fade in={registerDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Р РµРіРёСЃС‚СЂР°С†РёСЏ РѕР±СЂР°С‰РµРЅРёСЏ
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              Р’РІРµРґРёС‚Рµ СЂРµРіРёСЃС‚СЂР°С†РёРѕРЅРЅС‹Р№ РЅРѕРјРµСЂ. Р”Р°С‚Р° СЂРµРіРёСЃС‚СЂР°С†РёРё С„РёРєСЃРёСЂСѓРµС‚СЃСЏ СЃРµРіРѕРґРЅСЏС€РЅРёРј С‡РёСЃР»РѕРј ({fmtDate(dayjs().toISOString())}).
              РџРѕСЃР»Рµ СЂРµРіРёСЃС‚СЂР°С†РёРё РЅР°С‡РЅС‘С‚ РѕС‚СЃС‡РёС‚С‹РІР°С‚СЊСЃСЏ СЃСЂРѕРє РѕС‚РІРµС‚Р° вЂ” 30 РєР°Р»РµРЅРґР°СЂРЅС‹С… РґРЅРµР№.
            </Typography>
            <StyledField
              fullWidth
              size="small"
              label="Р РµРіРёСЃС‚СЂР°С†РёРѕРЅРЅС‹Р№ РЅРѕРјРµСЂ *"
              placeholder="РќР°РїСЂРёРјРµСЂ: 1234-РѕР±"
              value={regNumber}
              onChange={e => setRegNumber(e.target.value)}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
              <Button onClick={() => setRegisterDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                РћС‚РјРµРЅР°
              </Button>
              <Button
                variant="contained"
                disabled={!regNumber.trim() || actionLoading}
                onClick={handleRegister}
                sx={{ bgcolor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊ
              </Button>
            </Box>
          </DialogPaper>
        </Fade>
      </Modal>

      {/* ===================== Р”РРђР›РћР“: Р’Р—РЇРўР¬ Р’ Р РђР‘РћРўРЈ ===================== */}
      <Modal open={takeWorkDialog} onClose={() => setTakeWorkDialog(false)} closeAfterTransition>
        <Fade in={takeWorkDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              Р’Р·СЏС‚СЊ РІ СЂР°Р±РѕС‚Сѓ
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              РќР°Р·РЅР°С‡СЊС‚Рµ РёСЃРїРѕР»РЅРёС‚РµР»СЏ РѕР±СЂР°С‰РµРЅРёСЏ. РЎС‚Р°С‚СѓСЃ РёР·РјРµРЅРёС‚СЃСЏ РЅР° В«РќР° РёСЃРїРѕР»РЅРµРЅРёРёВ». РњРѕР¶РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ РІРЅСѓС‚СЂРµРЅРЅРёР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№.
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>РСЃРїРѕР»РЅРёС‚РµР»СЊ *</InputLabel>
              <Select
                value={executorId}
                label="РСЃРїРѕР»РЅРёС‚РµР»СЊ *"
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
              label="Р’РЅСѓС‚СЂРµРЅРЅРёР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№ (РЅРµ РІРёРґРµРЅ Р·Р°СЏРІРёС‚РµР»СЋ)"
              value={takeWorkComment}
              onChange={e => setTakeWorkComment(e.target.value)}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
              <Button onClick={() => setTakeWorkDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                РћС‚РјРµРЅР°
              </Button>
              <Button
                variant="contained"
                disabled={!executorId || actionLoading}
                onClick={handleTakeWork}
                sx={{ bgcolor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                РќР°Р·РЅР°С‡РёС‚СЊ РёСЃРїРѕР»РЅРёС‚РµР»СЏ
              </Button>
            </Box>
          </DialogPaper>
        </Fade>
      </Modal>

      {/* ===================== Р”РРђР›РћР“: РџР•Р Р•РќРђРџР РђР’Р›Р•РќРР• ===================== */}
      <Modal open={redirectDialog} onClose={() => setRedirectDialog(false)} closeAfterTransition>
        <Fade in={redirectDialog}>
          <DialogPaper elevation={8}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              РџРµСЂРµРЅР°РїСЂР°РІР»РµРЅРёРµ РѕР±СЂР°С‰РµРЅРёСЏ
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2.5 }}>
              РћР±СЂР°С‰РµРЅРёРµ Р±СѓРґРµС‚ РїРµСЂРµРґР°РЅРѕ РІС‹Р±СЂР°РЅРЅРѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё. Р—Р°СЏРІРёС‚РµР»СЊ РїРѕР»СѓС‡РёС‚ СѓРІРµРґРѕРјР»РµРЅРёРµ Рѕ РїРµСЂРµР°РґСЂРµСЃР°С†РёРё РЅР° СЌР»РµРєС‚СЂРѕРЅРЅСѓСЋ РїРѕС‡С‚Сѓ.
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>РћСЂРіР°РЅРёР·Р°С†РёСЏ-РїРѕР»СѓС‡Р°С‚РµР»СЊ *</InputLabel>
              <Select
                value={targetOrgId}
                label="РћСЂРіР°РЅРёР·Р°С†РёСЏ-РїРѕР»СѓС‡Р°С‚РµР»СЊ *"
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
              label="РљРѕРјРјРµРЅС‚Р°СЂРёР№ (РїСЂРёС‡РёРЅР° РїРµСЂРµРЅР°РїСЂР°РІР»РµРЅРёСЏ)"
              value={redirectComment}
              onChange={e => setRedirectComment(e.target.value)}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
              <Button onClick={() => setRedirectDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                РћС‚РјРµРЅР°
              </Button>
              <Button
                variant="contained"
                disabled={!targetOrgId || actionLoading}
                onClick={handleRedirect}
                sx={{ bgcolor: '#e65100', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                РџРµСЂРµРЅР°РїСЂР°РІРёС‚СЊ
              </Button>
            </Box>
          </DialogPaper>
        </Fade>
      </Modal>

      {/* ===================== Р”РРђР›РћР“: РћРўР’Р•Рў ===================== */}
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
              РќР°РїСЂР°РІРёС‚СЊ РѕС‚РІРµС‚ Р·Р°СЏРІРёС‚РµР»СЋ
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mb: 2 }}>
              РџРёСЃСЊРјРѕ Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РЅР° {card?.applicant.email}. РњРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С€Р°Р±Р»РѕРЅ Рё РІР»РѕР¶РёС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ
              СЃ РѕР±СЂР°С‰РµРЅРёРµРј РґРѕРєСѓРјРµРЅС‚С‹.
            </Typography>

            {/* РЁР°Р±Р»РѕРЅС‹ */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setReplyText(buildTemplate('considered'))}
                sx={{ borderRadius: '20px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', borderColor: '#4c6ef5', color: '#4c6ef5' }}
              >
                РЁР°Р±Р»РѕРЅ: СЂР°СЃСЃРјРѕС‚СЂРµРЅ РїРѕ СЃСѓС‰РµСЃС‚РІСѓ
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setReplyText(buildTemplate('acknowledged'))}
                sx={{ borderRadius: '20px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontSize: '12px', borderColor: '#4c6ef5', color: '#4c6ef5' }}
              >
                РЁР°Р±Р»РѕРЅ: РїСЂРёРЅСЏС‚Рѕ Рє СЃРІРµРґРµРЅРёСЋ
              </Button>
            </Box>

            <TextField
              fullWidth
              multiline
              rows={9}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="РўРµРєСЃС‚ РѕС‚РІРµС‚Р° Р·Р°СЏРІРёС‚РµР»СЋвЂ¦"
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': { borderRadius: '10px' },
                '& textarea': { fontFamily: 'Lato, sans-serif', fontSize: '14px' },
              }}
            />

            {/* Р’Р»РѕР¶РµРЅРёСЏ РёР· СЃРІСЏР·Р°РЅРЅС‹С… РґРѕРєСѓРјРµРЅС‚РѕРІ */}
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '13px', color: '#101025', mb: 1 }}>
              РџСЂРёР»РѕР¶РёС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ РґРѕРєСѓРјРµРЅС‚С‹:
            </Typography>
            {!card || card.linked_documents.length === 0 ? (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12.5px', color: '#87879b', mb: 2 }}>
                РќРµС‚ СЃРІСЏР·Р°РЅРЅС‹С… РґРѕРєСѓРјРµРЅС‚РѕРІ. РџРµСЂРµР№РґРёС‚Рµ РЅР° РІРєР»Р°РґРєСѓ В«РЎРІСЏР·Р°РЅРЅС‹Рµ РґРѕРєСѓРјРµРЅС‚С‹В», С‡С‚РѕР±С‹ РїСЂРёРєСЂРµРїРёС‚СЊ РёС… Рє РѕР±СЂР°С‰РµРЅРёСЋ.
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
                        {d.registration_number ? ` (СЂРµРі. в„– ${d.registration_number})` : ''}
                        {(d.signature_type === 'UNEP' || d.signature_type === 'UKEP') && (
                          <Chip
                            label={d.signature_type === 'UKEP' ? 'РЈРљР­Рџ' : 'РЈРќР­Рџ'}
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
                      Рљ РїРёСЃСЊРјСѓ СЃ РЈРќР­Рџ/РЈРљР­Рџ-РґРѕРєСѓРјРµРЅС‚РѕРј Р±СѓРґРµС‚ РїСЂРёР»РѕР¶РµРЅС‹ РєРѕРїРёСЏ СЃРѕ С€С‚Р°РјРїРѕРј Р­Рџ Рё Р°СЂС…РёРІ
                      СЃ РїРѕРґР»РёРЅРЅРёРєРѕРј. РЎРѕРїСЂРѕРІРѕРґРёС‚РµР»СЊРЅРѕРµ РїРёСЃСЊРјРѕ СЃС„РѕСЂРјРёСЂСѓРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
              <Button onClick={() => setReplyDialog(false)} sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}>
                РћС‚РјРµРЅР°
              </Button>
              <Button
                variant="contained"
                disabled={!replyText.trim() || actionLoading}
                onClick={handleReply}
                startIcon={<SendIcon />}
                sx={{ bgcolor: '#2e7d32', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif' }}
              >
                РќР°РїСЂР°РІРёС‚СЊ РѕС‚РІРµС‚
              </Button>
            </Box>
          </Paper>
        </Fade>
      </Modal>

      {/* ===================== Р”РРђР›РћР“: РЎР’РЇР—РђРўР¬ Р”РћРљРЈРњР•РќРў ===================== */}
      <Modal open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} closeAfterTransition>
        <Fade in={linkDialogOpen}>
          <DialogPaper elevation={8} sx={{ maxWidth: '640px' }}>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 1 }}>
              РЎРІСЏР·Р°С‚СЊ РґРѕРєСѓРјРµРЅС‚ СЃ РѕР±СЂР°С‰РµРЅРёРµРј
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="РџРѕРёСЃРє РґРѕРєСѓРјРµРЅС‚Р° РїРѕ РЅР°Р·РІР°РЅРёСЋ РёР»Рё РЅРѕРјРµСЂСѓ"
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
                РќР°Р№С‚Рё
              </Button>
            </Box>
            {linkLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : linkCandidates.length === 0 ? (
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                Р”РѕРєСѓРјРµРЅС‚С‹ РЅРµ РЅР°Р№РґРµРЅС‹
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
                        СЂРµРі. в„– {doc.registration_number || 'вЂ”'}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleLinkDoc(doc.uuid, doc.name)}
                      sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#4c6ef5' }}
                    >
                      РЎРІСЏР·Р°С‚СЊ
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
