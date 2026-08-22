import React, { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Chip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Modal,
  Fade,
  Stepper,
  Step,
  StepLabel,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Pagination,
  Autocomplete,
  FormControlLabel,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import {
  Inbox as InboxIcon,
  Outbox as OutboxIcon,
  Drafts as DraftsIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Add as AddIcon,
  Close as CloseIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Send as SendIcon,
  Business as BusinessIcon,
  Description as DescriptionIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Restore as RestoreIcon,
  DeleteForever as DeleteForeverIcon,
  Mail as MailIcon,
  Edit as EditIcon,
  Draw as DrawIcon,
} from '@mui/icons-material';
import {
  getMailMessages,
  getMailCounts,
  getOrganizations,
  getOrganization,
  sendMail,
  deleteMail,
  permanentDeleteMail,
  restoreMail,
  getDocuments,
  updateDocument,
  downloadArchive,
  signAndReplyMail,
  MailFolder,
  MailMessage,
  Organization,
  FolderType,
} from '../api/edoApi';
import { getApiErrorMessage } from '../api/edoApi';

dayjs.locale('ru');

// ===== СТИЛИЗОВАННЫЕ КОМПОНЕНТЫ =====
const PageContainer = styled(Box)({
  padding: '24px 32px',
  maxWidth: '1200px',
  margin: '0 auto',
});

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
  marginBottom: '16px',
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
    '& fieldset': { border: 'none' },
    '&:hover fieldset': { border: 'none' },
    '&.Mui-focused fieldset': { border: '2px solid #4c6ef5' },
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
  padding: '60px 20px 40px',
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
  marginBottom: '16px',
  '& svg': { fontSize: '40px', color: '#b0b3c3' },
});

const StyledChip = styled(Chip)({
  backgroundColor: '#f4f4f8',
  color: '#87879b',
  fontSize: '12px',
  fontWeight: 500,
  height: '28px',
  '& .MuiChip-label': { padding: '0 12px' },
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
});

const ModalHeader = styled(Box)({
  padding: '20px 28px',
  borderBottom: '1px solid #eaebf0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
});

const ModalBody = styled(Box)({
  padding: '24px 28px',
  overflowY: 'auto',
  flex: 1,
});

const ModalFooter = styled(Box)({
  padding: '16px 28px',
  borderTop: '1px solid #eaebf0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#fafafa',
  flexShrink: 0,
});

const StepButton = styled(Button)({
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 600,
  padding: '8px 24px',
  borderRadius: '8px',
  fontSize: '14px',
});

const NextButton = styled(StepButton)({
  backgroundColor: '#4c6ef5',
  color: '#ffffff',
  '&:hover': { backgroundColor: '#364fc7' },
  '&:disabled': { backgroundColor: '#d6d6df', color: '#87879b' },
});

const BackButton = styled(StepButton)({
  color: '#87879b',
  '&:hover': { backgroundColor: '#f4f4f8' },
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '& fieldset': { borderColor: '#d6d6df' },
    '&:hover fieldset': { borderColor: '#b0b3c3' },
    '&.Mui-focused fieldset': { borderColor: '#4c6ef5', borderWidth: '2px' },
  },
  '& .MuiInputLabel-root': {
    fontFamily: 'Lato, sans-serif',
    color: '#87879b',
    '&.Mui-focused': { color: '#4c6ef5' },
  },
  '& .MuiInputBase-input': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
  },
});

// ===== СТАТУСЫ ПИСЬМА =====
const MailStatusChip = styled(Chip)<{ status: string }>(({ status }) => {
  const colors: Record<string, { bg: string; color: string }> = {
    draft: { bg: '#f5f5f5', color: '#616161' },
    sent: { bg: '#e3f2fd', color: '#0d47a1' },
    delivered: { bg: '#e8f5e9', color: '#2e7d32' },
    read: { bg: '#e8f5e9', color: '#1b5e20' },
    pending_signature: { bg: '#fff3e0', color: '#e65100' },
    signed: { bg: '#e8f5e9', color: '#1b5e20' },
    rejected: { bg: '#ffebee', color: '#c62828' },
    deleted: { bg: '#ffebee', color: '#c62828' },
  };
  const style = colors[status] || colors.draft;
  return {
    backgroundColor: style.bg,
    color: style.color,
    fontWeight: 600,
    fontSize: '11px',
    height: '24px',
  };
});

const getMailStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    draft: 'Черновик',
    sent: 'Отправлено',
    delivered: 'Доставлено',
    read: 'Прочитано',
    pending_signature: 'Ожидает подписи',
    signed: 'Подписано',
    rejected: 'Отклонено',
    deleted: 'Удалено',
  };
  return map[status] || status;
};

// ===== ВКЛАДКИ =====
interface MailTab {
  id: MailFolder;
  label: string;
  icon: React.ReactNode;
}

const mailTabs: MailTab[] = [
  { id: 'incoming', label: 'Входящие', icon: <InboxIcon /> },
  { id: 'outgoing', label: 'Исходящие', icon: <OutboxIcon /> },
  { id: 'drafts', label: 'Черновики', icon: <DraftsIcon /> },
  { id: 'deleted', label: 'Удаленные', icon: <DeleteIcon /> },
];

// ===== КОМПОНЕНТ =====
const MailPage: React.FC = () => {
  const [activeFolder, setActiveFolder] = useState<MailFolder>('incoming');
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});

  // Состояния модалки отправки
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeStep, setComposeStep] = useState(0);
  const [composeLoading, setComposeLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [confirmedOrg, setConfirmedOrg] = useState<Organization | null>(null);
  const [outgoingDocs, setOutgoingDocs] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [requestSignature, setRequestSignature] = useState(false);
  const [comment, setComment] = useState('');
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [editMeta, setEditMeta] = useState({ name: '', registrationNumber: '', executor: '' });

  // Меню строки
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuMsg, setRowMenuMsg] = useState<MailMessage | null>(null);

  // Модалка удаления
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  // Модалка подписи и ответа (для входящих писем)
  const [isSignReplyOpen, setIsSignReplyOpen] = useState(false);
  const [signReplyMsg, setSignReplyMsg] = useState<MailMessage | null>(null);
  const [signReplyFile, setSignReplyFile] = useState<File | null>(null);
  const [signReplyLoading, setSignReplyLoading] = useState(false);

  const orgSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps = [
    { label: 'Получатель', icon: <BusinessIcon /> },
    { label: 'Документ', icon: <DescriptionIcon /> },
    { label: 'Отправка', icon: <SendIcon /> },
  ];

  // Загрузка писем
  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMailMessages(activeFolder, page, pageSize, debouncedSearch || undefined);
      startTransition(() => {
        setMessages(response.items);
        setTotal(response.total);
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки писем'));
    } finally {
      setLoading(false);
    }
  }, [activeFolder, page, pageSize, debouncedSearch]);

  // Дебаунс поиска: запрос уходит через 400 мс после окончания ввода
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // При изменении поискового запроса возвращаемся на первую страницу
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Загрузка счётчиков
  const loadCounts = useCallback(async () => {
    try {
      const counts = await getMailCounts();
      setFolderCounts(counts);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, activeFolder, loadMessages]);

  // Поиск организаций с debounce
  useEffect(() => {
    if (!isComposeOpen) return;
    if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);
    orgSearchTimer.current = setTimeout(async () => {
      try {
        const orgs = await getOrganizations(orgSearch || undefined);
        setOrganizations(orgs);
      } catch {
        setOrganizations([]);
      }
    }, 300);
    return () => {
      if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);
    };
  }, [orgSearch, isComposeOpen]);

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    try {
      const parsed = dayjs(dateStr, 'DD.MM.YYYY HH:mm:ss');
      if (parsed.isValid()) return parsed.format('DD.MM.YYYY HH:mm');
      return dayjs(dateStr).format('DD.MM.YYYY HH:mm');
    } catch {
      return '—';
    }
  };

  const handleOpenCompose = async () => {
    setComposeStep(0);
    setSelectedOrg(null);
    setConfirmedOrg(null);
    setSelectedDoc(null);
    setRequestSignature(false);
    setComment('');
    setOrgSearch('');
    setEditMetaOpen(false);
    setIsComposeOpen(true);

    // Загружаем подписанные исходящие документы
    try {
      const response = await getDocuments(1, 100, 'outgoing' as FolderType);
      setOutgoingDocs(response.items.filter((d: any) => d.status === 'signed'));
    } catch {
      setOutgoingDocs([]);
    }
  };

  const handleCloseCompose = () => {
    setIsComposeOpen(false);
  };

  const canProceedCompose = () => {
    switch (composeStep) {
      case 0:
        return confirmedOrg !== null;
      case 1:
        return selectedDoc !== null;
      case 2:
        return true;
      default:
        return false;
    }
  };

  const handleComposeNext = () => {
    if (composeStep === 0 && selectedOrg) {
      setConfirmedOrg(selectedOrg);
      setComposeStep(1);
    } else if (composeStep === 1) {
      setComposeStep(2);
    } else if (composeStep === 2) {
      handleSend();
    }
  };

  const handleConfirmOrg = async () => {
    if (!selectedOrg) return;
    try {
      const full = await getOrganization(selectedOrg.id);
      setConfirmedOrg(full);
    } catch {
      setConfirmedOrg(selectedOrg);
    }
  };

  const handleSend = async () => {
    if (!confirmedOrg || !selectedDoc) return;
    setComposeLoading(true);
    try {
      // Если редактировали метаданные — обновляем
      if (editMetaOpen && (editMeta.name !== selectedDoc.name || editMeta.registrationNumber !== selectedDoc.registration_number || editMeta.executor !== (selectedDoc.executor || ''))) {
        await updateDocument(selectedDoc.uuid, {
          name: editMeta.name,
          registration_number: editMeta.registrationNumber,
          executor: editMeta.executor,
        });
      }

      await sendMail({
        recipient_org_id: confirmedOrg.id,
        document_uuid: selectedDoc.uuid,
        document_name: editMetaOpen ? editMeta.name : selectedDoc.name,
        comment: comment || undefined,
        request_signature: requestSignature,
      });
      setSuccess('Письмо отправлено');
      setIsComposeOpen(false);
      await loadMessages();
      await loadCounts();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка отправки'));
    } finally {
      setComposeLoading(false);
    }
  };

  const handleDeleteMessages = async () => {
    setIsDeleteModalOpen(false);
    try {
      for (const uuid of deleteTarget) {
        if (activeFolder === 'deleted') {
          await permanentDeleteMail(uuid);
        } else {
          await deleteMail(uuid);
        }
      }
      setSelectedMessages([]);
      setSuccess(deleteTarget.length === 1 ? 'Письмо удалено' : `Удалено ${deleteTarget.length} писем`);
      await loadMessages();
      await loadCounts();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка удаления'));
    }
  };

  const handleRestoreMessage = async (uuid: string) => {
    setRowMenuAnchor(null);
    try {
      await restoreMail(uuid);
      setSuccess('Письмо восстановлено');
      await loadMessages();
      await loadCounts();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка восстановления'));
    }
  };

  const handleOpenSignReply = (msg: MailMessage) => {
    setRowMenuAnchor(null);
    setSignReplyMsg(msg);
    setSignReplyFile(null);
    setIsSignReplyOpen(true);
  };

  const handleSignReplySubmit = async () => {
    if (!signReplyMsg || !signReplyFile) return;
    setSignReplyLoading(true);
    try {
      await signAndReplyMail(signReplyMsg.uuid, signReplyFile);
      setSuccess('Документ подписан и отправлен отправителю');
      setIsSignReplyOpen(false);
      await loadMessages();
      await loadCounts();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка подписи/отправки'));
    } finally {
      setSignReplyLoading(false);
    }
  };

  const getFolderCount = (folderId: string) => folderCounts[folderId] ?? 0;

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 3 }}>
              Выберите организацию-получателя
            </Typography>

            {confirmedOrg ? (
              <Box sx={{
                p: 3, borderRadius: '12px', border: '2px solid #4c6ef5', backgroundColor: '#f9fafe',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <BusinessIcon sx={{ color: '#4c6ef5', fontSize: 32 }} />
                  <Box>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025' }}>
                      {confirmedOrg.name}
                    </Typography>
                    {confirmedOrg.inn && (
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                        ИНН: {confirmedOrg.inn}{confirmedOrg.kpp ? ` • КПП: ${confirmedOrg.kpp}` : ''}
                      </Typography>
                    )}
                    {confirmedOrg.contact_person && (
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                        Контактное лицо: {confirmedOrg.contact_person}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    onClick={() => { setConfirmedOrg(null); setSelectedOrg(null); }}
                    sx={{ ml: 'auto', textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}
                  >
                    Изменить
                  </Button>
                </Box>
              </Box>
            ) : selectedOrg ? (
              <Box>
                <Box sx={{
                  p: 2, borderRadius: '12px', border: '1px solid #eaebf0', backgroundColor: '#fafafa',
                  mb: 2, display: 'flex', alignItems: 'center', gap: 2,
                }}>
                  <BusinessIcon sx={{ color: '#4c6ef5' }} />
                  <Box>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                      {selectedOrg.name}
                    </Typography>
                    {selectedOrg.inn && (
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                        ИНН: {selectedOrg.inn}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={handleConfirmOrg}
                    sx={{
                      backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none',
                      fontFamily: 'Lato, sans-serif', fontWeight: 600, '&:hover': { backgroundColor: '#364fc7' },
                    }}
                  >
                    Подтвердить получателя
                  </Button>
                  <Button
                    onClick={() => setSelectedOrg(null)}
                    sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b' }}
                  >
                    Выбрать другую
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <Autocomplete
                  fullWidth
                  options={organizations}
                  getOptionLabel={(opt) => opt.name}
                  value={selectedOrg}
                  onChange={(_, val) => setSelectedOrg(val)}
                  inputValue={orgSearch}
                  onInputChange={(_, val) => setOrgSearch(val)}
                  renderInput={(params) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { InputProps: _ignored, ...rest } = params as any;
                    return (
                      <StyledTextField
                        {...rest}
                        label="Поиск организации по названию или UUID"
                        placeholder="Начните вводить..."
                        slotProps={{
                          ...rest.slotProps,
                          input: {
                            ...rest.slotProps?.input,
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchIcon sx={{ fontSize: '18px', color: '#b0b3c3' }} />
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                    );
                  }}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                      <BusinessIcon sx={{ color: '#b0b3c3', fontSize: 20 }} />
                      <Box>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500 }}>
                          {option.name}
                        </Typography>
                        {option.inn && (
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                            ИНН: {option.inn}{option.kpp ? ` • КПП: ${option.kpp}` : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                  noOptionsText="Организации не найдены"
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                />
                {organizations.length === 0 && !orgSearch && (
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', mt: 2, textAlign: 'center' }}>
                    Начните вводить название или UUID организации
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 3 }}>
              Выберите подписанный документ из папки «Исходящие»
            </Typography>

            {outgoingDocs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', mb: 2 }}>
                  Нет подписанных исходящих документов
                </Typography>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#b0b3c3' }}>
                  Сначала создайте и подпишите документ в разделе «Документы»
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {outgoingDocs.map((doc) => (
                  <Box
                    key={doc.uuid}
                    onClick={() => {
                      setSelectedDoc(doc);
                      setEditMeta({ name: doc.name, registrationNumber: doc.registration_number, executor: doc.executor || '' });
                      setEditMetaOpen(false);
                    }}
                    sx={{
                      p: 2, borderRadius: '10px',
                      border: selectedDoc?.uuid === doc.uuid ? '2px solid #4c6ef5' : '1px solid #eaebf0',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      '&:hover': { borderColor: '#4c6ef5', backgroundColor: '#f9fafe' },
                      backgroundColor: selectedDoc?.uuid === doc.uuid ? '#f9fafe' : 'transparent',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <DescriptionIcon sx={{ color: '#e53935', fontSize: 20 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 500, fontSize: '14px' }}>
                          {doc.name}
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                          {doc.registration_number} • {doc.type}
                        </Typography>
                      </Box>
                      {selectedDoc?.uuid === doc.uuid && <CheckCircleIcon sx={{ color: '#4c6ef5' }} />}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {selectedDoc && (
              <Box sx={{ mt: 3 }}>
                {!editMetaOpen ? (
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => setEditMetaOpen(true)}
                    sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#4c6ef5' }}
                  >
                    Редактировать метаданные
                  </Button>
                ) : (
                  <Box sx={{ p: 2, borderRadius: '10px', border: '1px solid #eaebf0', backgroundColor: '#fafafa' }}>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', fontWeight: 600, mb: 2 }}>
                      Редактирование метаданных
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <StyledTextField
                        fullWidth
                        label="Наименование"
                        value={editMeta.name}
                        onChange={(e) => setEditMeta(prev => ({ ...prev, name: e.target.value }))}
                        size="small"
                      />
                      <StyledTextField
                        fullWidth
                        label="Регистрационный номер"
                        value={editMeta.registrationNumber}
                        onChange={(e) => setEditMeta(prev => ({ ...prev, registrationNumber: e.target.value }))}
                        size="small"
                      />
                      <StyledTextField
                        fullWidth
                        label="Исполнитель"
                        value={editMeta.executor}
                        onChange={(e) => setEditMeta(prev => ({ ...prev, executor: e.target.value }))}
                        size="small"
                      />
                      <Button
                        size="small"
                        onClick={() => {
                          setEditMeta({ name: selectedDoc.name, registrationNumber: selectedDoc.registration_number, executor: selectedDoc.executor || '' });
                          setEditMetaOpen(false);
                        }}
                        sx={{ textTransform: 'none', fontFamily: 'Lato, sans-serif', color: '#87879b', alignSelf: 'flex-start' }}
                      >
                        Отменить редактирование
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 3 }}>
              Проверьте данные перед отправкой
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{
                p: 2, borderRadius: '10px', border: '1px solid #eaebf0', backgroundColor: '#fafafa',
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                <BusinessIcon sx={{ color: '#4c6ef5' }} />
                <Box>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                    Получатель
                  </Typography>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                    {confirmedOrg?.name}
                  </Typography>
                  {confirmedOrg?.inn && (
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                      ИНН: {confirmedOrg.inn}
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{
                p: 2, borderRadius: '10px', border: '1px solid #eaebf0', backgroundColor: '#fafafa',
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                <DescriptionIcon sx={{ color: '#e53935' }} />
                <Box>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                    Документ
                  </Typography>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                    {editMetaOpen ? editMeta.name : selectedDoc?.name}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                    {editMetaOpen ? editMeta.registrationNumber : selectedDoc?.registration_number}
                  </Typography>
                </Box>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={requestSignature}
                    onChange={(e) => setRequestSignature(e.target.checked)}
                    sx={{ color: '#4c6ef5' }}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '14px' }}>
                      Запросить подпись получателя
                    </Typography>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                      Получатель должен будет подписать документ электронной подписью
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', ml: 0 }}
              />

              <StyledTextField
                fullWidth
                label="Комментарий (необязательно)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                size="small"
                multiline
                rows={3}
                placeholder="Введите комментарий к письму..."
              />
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  const getPageTitle = () => {
    switch (activeFolder) {
      case 'incoming': return 'Входящие письма (документы)';
      case 'outgoing': return 'Исходящие письма (документы)';
      case 'drafts': return 'Черновики';
      case 'deleted': return 'Удаленные';
      default: return 'Почта';
    }
  };

  if (loading && messages.length === 0) {
    return (
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ru">
        <PageContainer>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        </PageContainer>
      </LocalizationProvider>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ru">
      <PageContainer>
        {/* Вкладки */}
        <Box sx={{ mb: 3 }}>
          <Tabs
            value={activeFolder}
            onChange={(_, val) => {
              setActiveFolder(val);
              setPage(1);
              setSelectedMessages([]);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': {
                fontFamily: 'Lato, sans-serif',
                textTransform: 'none',
                fontSize: '14px',
                fontWeight: 500,
                minHeight: '40px',
                padding: '6px 16px',
                borderRadius: '8px 8px 0 0',
                color: '#87879b',
                '&.Mui-selected': { color: '#4c6ef5' },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#4c6ef5',
                height: '3px',
                borderRadius: '3px 3px 0 0',
              },
            }}
          >
            {mailTabs.map((tab) => (
              <Tab
                key={tab.id}
                value={tab.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {tab.icon}
                    <span>{tab.label}</span>
                    <Chip
                      label={getFolderCount(tab.id)}
                      size="small"
                      sx={{
                        height: '18px', fontSize: '10px', fontWeight: 600,
                        backgroundColor: activeFolder === tab.id ? '#4c6ef5' : '#f4f4f8',
                        color: activeFolder === tab.id ? '#ffffff' : '#87879b',
                        '& .MuiChip-label': { padding: '0 6px' },
                      }}
                    />
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>

        {/* Уведомления */}
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
              <ToolbarButton size="small" onClick={loadMessages}>
                <RefreshIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {activeFolder === 'outgoing' && (
              <Tooltip title="Новое письмо (документ)">
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleOpenCompose}
                  sx={{
                    textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600,
                    fontSize: '13px', color: '#4c6ef5', '&:hover': { backgroundColor: '#f0f5ff' },
                  }}
                >
                  Новое письмо
                </Button>
              </Tooltip>
            )}

            {activeFolder === 'deleted' && (
              <Tooltip title="Восстановить">
                <ToolbarButton
                  size="small"
                  disabled={selectedMessages.length === 0}
                  onClick={async () => {
                    for (const uuid of selectedMessages) {
                      await restoreMail(uuid);
                    }
                    setSelectedMessages([]);
                    setSuccess('Письма восстановлены');
                    await loadMessages();
                    await loadCounts();
                  }}
                >
                  <RestoreIcon fontSize="small" />
                </ToolbarButton>
              </Tooltip>
            )}

            <Tooltip title={activeFolder === 'deleted' ? 'Удалить безвозвратно' : 'Удалить'}>
              <ToolbarButton
                size="small"
                disabled={selectedMessages.length === 0}
                onClick={() => {
                  setDeleteTarget(selectedMessages);
                  setIsDeleteModalOpen(true);
                }}
              >
                {activeFolder === 'deleted' ? <DeleteForeverIcon fontSize="small" /> : <DeleteIcon fontSize="small" />}
              </ToolbarButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            <SearchField
              placeholder="Поиск..."
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
              sx={{ width: '260px' }}
            />
          </ToolbarLeft>

          <ToolbarRight>
            <StyledChip label={`Всего: ${total}`} size="small" />
          </ToolbarRight>
        </ToolbarContainer>

        {/* Заголовок раздела */}
        <Typography
          variant="h5"
          sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025', mb: 2 }}
        >
          {getPageTitle()}
        </Typography>

        {/* Список писем */}
        <Fade in={!isPending} timeout={300}>
          <Box>
            {messages.length === 0 ? (
              <EmptyStateContainer>
                <EmptyStateIcon>
                  <MailIcon />
                </EmptyStateIcon>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '18px', color: '#101025' }}>
                  {activeFolder === 'incoming' ? 'Нет входящих писем' :
                   activeFolder === 'outgoing' ? 'Нет исходящих писем' :
                   activeFolder === 'drafts' ? 'Нет черновиков' :
                   'Корзина пуста'}
                </Typography>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', fontSize: '14px', mt: 1 }}>
                  {activeFolder === 'outgoing' ? 'Создайте новое письмо, чтобы отправить документ' : ''}
                </Typography>
                {activeFolder === 'outgoing' && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCompose}
                    sx={{
                      mt: 3, backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none',
                      fontFamily: 'Lato, sans-serif', fontWeight: 600, '&:hover': { backgroundColor: '#364fc7' },
                    }}
                  >
                    Новое письмо
                  </Button>
                )}
              </EmptyStateContainer>
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#fafafa' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={messages.length > 0 && selectedMessages.length === messages.length}
                          onChange={() => {
                            if (selectedMessages.length === messages.length) {
                              setSelectedMessages([]);
                            } else {
                              setSelectedMessages(messages.map(m => m.uuid));
                            }
                          }}
                          sx={{ color: '#b0b3c3' }}
                        />
                      </TableCell>
                      {activeFolder === 'incoming' ? (
                        <TableCell>Отправитель</TableCell>
                      ) : (
                        <TableCell>Получатель</TableCell>
                      )}
                      <TableCell>Документы</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell>Дата</TableCell>
                      <TableCell align="right">Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {messages.map((msg) => {
                      const isSelected = selectedMessages.includes(msg.uuid);
                      const orgName = activeFolder === 'incoming' ? msg.sender_org_name : msg.recipient_org_name;
                      return (
                        <TableRow
                          key={msg.uuid}
                          hover
                          selected={isSelected}
                          sx={{
                            transition: 'background-color 0.2s ease',
                            '&:hover': { backgroundColor: '#f9fafe' },
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={isSelected}
                              onChange={() => {
                                setSelectedMessages(prev =>
                                  prev.includes(msg.uuid)
                                    ? prev.filter(id => id !== msg.uuid)
                                    : [...prev, msg.uuid]
                                );
                              }}
                              sx={{ color: '#b0b3c3' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <BusinessIcon sx={{ color: '#b0b3c3', fontSize: '18px' }} />
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#101025', fontWeight: 500 }}>
                                {orgName}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <DescriptionIcon sx={{ color: '#e53935', fontSize: '18px' }} />
                              <Box>
                                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#101025', fontWeight: 500 }}>
                                  {msg.document_name || '—'}
                                </Typography>
                                {msg.comment && (
                                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                                    {msg.comment.length > 50 ? msg.comment.slice(0, 50) + '...' : msg.comment}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <MailStatusChip status={msg.status} label={getMailStatusLabel(msg.status)} size="small" />
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                              {formatDate(msg.sent_at || msg.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {msg.document_uuid && (
                              <Tooltip title="Скачать архив с подлинником">
                                <IconButton
                                  size="small"
                                  sx={{ color: '#87879b' }}
                                  onClick={() => window.open(downloadArchive(msg.document_uuid!), '_blank')}
                                >
                                  <DescriptionIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}

                            {activeFolder === 'incoming' && msg.request_signature && msg.status !== 'signed' && (
                              <Tooltip title="Подписать и отправить отправителю">
                                <IconButton
                                  size="small"
                                  sx={{ color: '#4c6ef5' }}
                                  onClick={() => handleOpenSignReply(msg)}
                                >
                                  <DrawIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}

                            <Tooltip title="Ещё">
                              <IconButton
                                size="small"
                                sx={{ color: '#87879b' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRowMenuAnchor(e.currentTarget);
                                  setRowMenuMsg(msg);
                                }}
                              >
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
              onChange={(_, value) => setPage(value)}
              color="primary"
              shape="rounded"
              sx={{
                '& .MuiPaginationItem-root': {
                  fontFamily: 'Lato, sans-serif',
                  fontSize: '14px',
                  fontWeight: 500,
                },
              }}
            />
          </Box>
        )}

        {/* ===== МЕНЮ СТРОКИ ===== */}
        <Menu
          anchorEl={rowMenuAnchor}
          open={Boolean(rowMenuAnchor)}
          onClose={() => { setRowMenuAnchor(null); setRowMenuMsg(null); }}
        >
          {rowMenuMsg?.document_uuid && (
            <MenuItem onClick={() => {
              setRowMenuAnchor(null);
              if (rowMenuMsg.document_uuid) {
                window.open(downloadArchive(rowMenuMsg.document_uuid), '_blank');
              }
            }}>
              <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Скачать архив</ListItemText>
            </MenuItem>
          )}
          {activeFolder === 'incoming' && rowMenuMsg?.request_signature && rowMenuMsg.status !== 'signed' && (
            <MenuItem onClick={() => {
              if (rowMenuMsg) handleOpenSignReply(rowMenuMsg);
            }}>
              <ListItemIcon><DrawIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Подписать и отправить</ListItemText>
            </MenuItem>
          )}
          {activeFolder === 'deleted' ? (
            <MenuItem onClick={() => {
              if (rowMenuMsg) handleRestoreMessage(rowMenuMsg.uuid);
            }}>
              <ListItemIcon><RestoreIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Восстановить</ListItemText>
            </MenuItem>
          ) : (
            <MenuItem onClick={() => {
              if (rowMenuMsg) {
                setDeleteTarget([rowMenuMsg.uuid]);
                setIsDeleteModalOpen(true);
              }
              setRowMenuAnchor(null);
            }}>
              <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Удалить</ListItemText>
            </MenuItem>
          )}
        </Menu>

        {/* ===== МОДАЛКА УДАЛЕНИЯ ===== */}
        <Modal open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} closeAfterTransition>
          <Fade in={isDeleteModalOpen}>
            <Box sx={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '440px',
              backgroundColor: '#ffffff', borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
            }}>
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Box sx={{
                  width: 64, height: 64, borderRadius: '50%', backgroundColor: '#ffebee',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                }}>
                  <WarningIcon sx={{ fontSize: 36, color: '#e53935' }} />
                </Box>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '18px', fontWeight: 700, color: '#101025', mb: 1 }}>
                  {activeFolder === 'deleted' ? 'Удалить безвозвратно?' : 'Подтвердите удаление'}
                </Typography>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                  {activeFolder === 'deleted'
                    ? 'Письмо будет удалено безвозвратно. Это действие нельзя отменить.'
                    : 'Письмо будет перемещено в корзину.'}
                </Typography>
              </Box>
              <Box sx={{ p: 2, backgroundColor: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button
                  onClick={() => setIsDeleteModalOpen(false)}
                  sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, color: '#87879b', '&:hover': { backgroundColor: '#f4f4f8' } }}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleDeleteMessages}
                  sx={{
                    fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600,
                    backgroundColor: '#e53935', color: '#ffffff', borderRadius: '8px',
                    '&:hover': { backgroundColor: '#c62828' },
                  }}
                >
                  Удалить
                </Button>
              </Box>
            </Box>
          </Fade>
        </Modal>

        {/* ===== МОДАЛКА ПОДПИСИ И ОТВЕТА ===== */}
        <Modal open={isSignReplyOpen} onClose={() => setIsSignReplyOpen(false)} closeAfterTransition>
          <Fade in={isSignReplyOpen}>
            <Box sx={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '520px',
              backgroundColor: '#ffffff', borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
            }}>
              <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <DrawIcon sx={{ color: '#4c6ef5' }} />
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '18px', fontWeight: 700, color: '#101025' }}>
                    Подписать и отправить
                  </Typography>
                </Box>

                {signReplyMsg && (
                  <Box sx={{ mb: 2, p: 2, borderRadius: '10px', border: '1px solid #eaebf0', backgroundColor: '#fafafa' }}>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>Документ</Typography>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                      {signReplyMsg.document_name || '—'}
                    </Typography>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b', mt: 0.5 }}>
                      От: {signReplyMsg.sender_org_name}
                    </Typography>
                  </Box>
                )}

                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 1.5 }}>
                  Загрузите файл электронной подписи (.sig) для документа. Подписанная копия будет создана в вашем реестре и отправлена отправителю.
                </Typography>

                <Box
                  onClick={() => document.getElementById('sign-reply-file')?.click()}
                  sx={{
                    p: 2.5, borderRadius: '10px', border: '2px dashed #d6d6df', cursor: 'pointer',
                    textAlign: 'center', backgroundColor: '#fafafa', transition: 'all 0.2s ease',
                    '&:hover': { borderColor: '#4c6ef5', backgroundColor: '#f9fafe' },
                  }}
                >
                  <input
                    id="sign-reply-file"
                    type="file"
                    accept=".sig"
                    hidden
                    onChange={(e) => setSignReplyFile(e.target.files?.[0] || null)}
                  />
                  {signReplyFile ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      <CheckCircleIcon sx={{ color: '#4c6ef5', fontSize: 20 }} />
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 600 }}>
                        {signReplyFile.name}
                      </Typography>
                    </Box>
                  ) : (
                    <Box>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                        Нажмите, чтобы выбрать файл подписи
                      </Typography>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#b0b3c3', mt: 0.5 }}>
                        Формат .sig
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
              <Box sx={{ p: 2, backgroundColor: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button
                  onClick={() => setIsSignReplyOpen(false)}
                  sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, color: '#87879b', '&:hover': { backgroundColor: '#f4f4f8' } }}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleSignReplySubmit}
                  disabled={!signReplyFile || signReplyLoading}
                  startIcon={signReplyLoading ? <CircularProgress size={16} /> : <SendIcon />}
                  sx={{
                    fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600,
                    backgroundColor: '#4c6ef5', color: '#ffffff', borderRadius: '8px',
                    '&:hover': { backgroundColor: '#364fc7' },
                    '&:disabled': { backgroundColor: '#d6d6df', color: '#87879b' },
                  }}
                >
                  Подписать и отправить
                </Button>
              </Box>
            </Box>
          </Fade>
        </Modal>

        {/* ===== МОДАЛКА ОТПРАВКИ ПИСЬМА ===== */}
        <Modal open={isComposeOpen} onClose={handleCloseCompose} closeAfterTransition>
          <Fade in={isComposeOpen}>
            <ModalContainer>
              <ModalHeader>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025' }}>
                    Новое письмо (документ)
                  </Typography>
                  <Chip
                    label={`Шаг ${composeStep + 1} из ${steps.length}`}
                    size="small"
                    sx={{ backgroundColor: '#f4f4f8', color: '#87879b', fontFamily: 'Lato, sans-serif', fontSize: '11px', fontWeight: 600 }}
                  />
                </Box>
                <IconButton onClick={handleCloseCompose} size="small" sx={{ color: '#87879b' }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </ModalHeader>

              <Box sx={{ px: 4, pt: 2 }}>
                <Stepper activeStep={composeStep} alternativeLabel>
                  {steps.map((step, index) => (
                    <Step key={step.label}>
                      <StepLabel
                        slotProps={{
                          stepIcon: {
                            icon: (
                              <Box sx={{
                                width: 32, height: 32, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: index <= composeStep ? '#4c6ef5' : '#f4f4f8',
                                color: index <= composeStep ? '#ffffff' : '#87879b',
                                transition: 'all 0.3s ease',
                              }}>
                                {step.icon}
                              </Box>
                            ),
                          },
                        }}
                      >
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b' }}>
                          {step.label}
                        </Typography>
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Box>

              <ModalBody>
                {getStepContent(composeStep)}
              </ModalBody>

              <ModalFooter>
                <BackButton
                  onClick={() => {
                    if (composeStep === 0) handleCloseCompose();
                    else setComposeStep(prev => prev - 1);
                  }}
                  startIcon={<ArrowBackIcon />}
                >
                  {composeStep === 0 ? 'Отмена' : 'Назад'}
                </BackButton>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {composeLoading && <CircularProgress size={24} />}
                  <NextButton
                    onClick={handleComposeNext}
                    disabled={!canProceedCompose() || composeLoading}
                    endIcon={composeStep === steps.length - 1 ? <SendIcon /> : <ArrowForwardIcon />}
                  >
                    {composeStep === steps.length - 1 ? 'Отправить' : 'Далее'}
                  </NextButton>
                </Box>
              </ModalFooter>
            </ModalContainer>
          </Fade>
        </Modal>
      </PageContainer>
    </LocalizationProvider>
  );
};

export default MailPage;
