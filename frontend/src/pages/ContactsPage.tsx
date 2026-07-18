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
  Avatar,
  Pagination,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import { styled } from '@mui/material/styles';
import {
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  OpenInNew as OpenIcon,
  Email as EmailIcon,
  Folder as FolderIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  PersonAdd as PersonAddIcon,
  FilterList as FilterListIcon,
  MoreVert as MoreVertIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Business as BusinessIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  Contact,
} from '../api/edoApi';

dayjs.locale('ru');

// ===== СТИЛИ =====
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
  marginBottom: '24px',
});

const ToolbarLeft = styled(Box)({ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
const ToolbarRight = styled(Box)({ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });

const ToolbarButton = styled(IconButton)({
  color: '#87879b', padding: '6px', borderRadius: '8px',
  '&:hover': { backgroundColor: '#f4f4f8', color: '#101025' },
});

const SearchField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    height: '36px', borderRadius: '8px', backgroundColor: '#f4f4f8',
    '& fieldset': { border: 'none' },
    '&:hover fieldset': { border: 'none' },
    '&.Mui-focused fieldset': { border: '2px solid #4c6ef5' },
  },
  '& .MuiInputBase-input': { fontSize: '14px', fontFamily: 'Lato, sans-serif', padding: '8px 12px' },
});

const EmptyStateContainer = styled(Box)({
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '80px 20px', backgroundColor: '#fafafa', borderRadius: '12px', border: '1px solid #eaebf0',
});

const EmptyStateIcon = styled(Box)({
  width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f4f4f8',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
  '& svg': { fontSize: '40px', color: '#b0b3c3' },
});

const StyledChip = styled(Chip)({
  backgroundColor: '#f4f4f8', color: '#87879b', fontSize: '12px', fontWeight: 500, height: '28px',
  '& .MuiChip-label': { padding: '0 12px' },
});

const ModalContainer = styled(Box)({
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '90%', maxWidth: '720px', maxHeight: '90vh', backgroundColor: '#ffffff',
  borderRadius: '16px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
});

const ModalHeader = styled(Box)({
  padding: '20px 28px', borderBottom: '1px solid #eaebf0', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
});

const ModalBody = styled(Box)({ padding: '28px 28px 20px', overflowY: 'auto', flex: 1, display: 'flex', gap: '32px' });
const ModalFooter = styled(Box)({
  padding: '16px 28px', borderTop: '1px solid #eaebf0', display: 'flex',
  justifyContent: 'flex-end', gap: '12px', backgroundColor: '#fafafa', flexShrink: 0,
});

const AvatarSection = styled(Box)({
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', paddingTop: '8px', flexShrink: 0, width: '100px',
});

const StyledAvatar = styled(Avatar)({
  width: '96px', height: '96px', backgroundColor: '#f4f4f8', border: '2px solid #eaebf0',
  '& svg': { fontSize: '48px', color: '#b0b3c3' },
});

const FieldsSection = styled(Box)({ flex: 1, minWidth: 0 });

const FieldRow = styled(Box)({
  display: 'flex', alignItems: 'center', padding: '6px 0', minHeight: '48px',
  borderBottom: '1px solid #f4f4f8', '&:last-child': { borderBottom: 'none' },
});

const FieldLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', fontWeight: 500, width: '130px', flexShrink: 0,
});

const FieldValue = styled(Box)({ flex: 1 });

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '6px', backgroundColor: '#ffffff', transition: 'all 0.2s ease',
    '& fieldset': { borderColor: '#d6d6df', borderWidth: '1px', transition: 'border-color 0.2s ease, box-shadow 0.2s ease' },
    '&:hover fieldset': { borderColor: '#b0b3c3' },
    '&.Mui-focused fieldset': { borderColor: '#4c6ef5', borderWidth: '2px', boxShadow: '0 0 0 4px rgba(76, 110, 245, 0.08)' },
  },
  '& .MuiInputLabel-root': {
    fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', transition: 'all 0.2s ease',
    '&.Mui-focused': { color: '#4c6ef5' },
  },
  '& .MuiInputBase-input': { fontFamily: 'Lato, sans-serif', fontSize: '13px', padding: '10px 14px' },
  '& .MuiFormHelperText-root': { fontFamily: 'Lato, sans-serif', fontSize: '12px', marginLeft: '0' },
});

const CancelButton = styled(Button)({
  textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 500, color: '#87879b',
  padding: '6px 20px', borderRadius: '6px', fontSize: '13px', '&:hover': { backgroundColor: '#f4f4f8' },
});

const SaveButton = styled(Button)({
  textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, backgroundColor: '#4c6ef5',
  color: '#ffffff', padding: '6px 28px', borderRadius: '6px', fontSize: '13px', '&:hover': { backgroundColor: '#364fc7' },
});

const formatPhoneNumber = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  let formatted = '+7';
  if (numbers.length > 1) { formatted += ' (' + numbers.slice(1, 4); }
  if (numbers.length >= 5) { formatted += ') ' + numbers.slice(4, 7); }
  if (numbers.length >= 8) { formatted += '-' + numbers.slice(7, 9); }
  if (numbers.length >= 10) { formatted += '-' + numbers.slice(9, 11); }
  return formatted;
};

const getFullName = (c: Contact) => {
  return [c.last_name, c.first_name, c.middle_name].filter(Boolean).join(' ');
};

const getInitials = (c: Contact) => {
  return ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase();
};

// ===== КОМПОНЕНТ =====
const ContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuContact, setRowMenuContact] = useState<Contact | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  const [formData, setFormData] = useState<{
    last_name: string; first_name: string; middle_name: string;
    organization: string; department: string; position: string;
    mobile_phone: string; email: string; birthday: Dayjs | null; notes: string;
  }>({
    last_name: '', first_name: '', middle_name: '',
    organization: '', department: '', position: '',
    mobile_phone: '', email: '', birthday: null, notes: '',
  });

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getContacts(page, pageSize, searchQuery || undefined);
      startTransition(() => {
        setContacts(response.items);
        setTotal(response.total);
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки контактов');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const handleOpenModal = (contact?: Contact) => {
    if (contact) {
      setEditContact(contact);
      setFormData({
        last_name: contact.last_name || '',
        first_name: contact.first_name || '',
        middle_name: contact.middle_name || '',
        organization: contact.organization || '',
        department: contact.department || '',
        position: contact.position || '',
        mobile_phone: contact.mobile_phone || '',
        email: contact.email || '',
        birthday: contact.birthday ? dayjs(contact.birthday) : null,
        notes: contact.notes || '',
      });
    } else {
      setEditContact(null);
      setFormData({
        last_name: '', first_name: '', middle_name: '',
        organization: '', department: '', position: '',
        mobile_phone: '', email: '', birthday: null, notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditContact(null);
  };

  const handleFormChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (field === 'mobile_phone') { value = formatPhoneNumber(value); }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.last_name.trim() || !formData.first_name.trim()) {
      setError('Фамилия и имя обязательны');
      return;
    }
    setSaving(true);
    try {
      const data = {
        last_name: formData.last_name,
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        organization: formData.organization || undefined,
        department: formData.department || undefined,
        position: formData.position || undefined,
        mobile_phone: formData.mobile_phone || undefined,
        email: formData.email || undefined,
        birthday: formData.birthday ? formData.birthday.toISOString() : undefined,
        notes: formData.notes || undefined,
      };
      if (editContact) {
        await updateContact(editContact.uuid, data);
        setSuccess('Контакт обновлён');
      } else {
        await createContact(data);
        setSuccess('Контакт создан');
      }
      setIsModalOpen(false);
      await loadContacts();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      for (const uuid of deleteTarget) {
        await deleteContact(uuid);
      }
      setSelectedContacts([]);
      setSuccess(deleteTarget.length === 1 ? 'Контакт удалён' : `Удалено ${deleteTarget.length} контактов`);
      await loadContacts();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка удаления');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try { return dayjs(dateStr).format('DD.MM.YYYY'); } catch { return '—'; }
  };

  if (loading && contacts.length === 0) {
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
        <Typography variant="h4" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '24px', color: '#101025', mb: 3 }}>
          Контакты
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
              <ToolbarButton size="small" onClick={loadContacts}>
                <RefreshIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Добавить">
              <ToolbarButton size="small" onClick={() => handleOpenModal()}>
                <PersonAddIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip title="Редактировать">
              <ToolbarButton size="small" disabled={selectedContacts.length !== 1}
                onClick={() => {
                  const c = contacts.find(x => x.uuid === selectedContacts[0]);
                  if (c) handleOpenModal(c);
                }}>
                <EditIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>
            <Tooltip title="Написать">
              <ToolbarButton size="small" disabled={selectedContacts.length === 0}>
                <EmailIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Удалить">
              <ToolbarButton size="small" disabled={selectedContacts.length === 0}
                onClick={() => { setDeleteTarget(selectedContacts); setIsDeleteModalOpen(true); }}>
                <DeleteIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <SearchField
              placeholder="Поиск"
              size="small"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              slotProps={{
                input: {
                  startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: '18px', color: '#b0b3c3' }} /></InputAdornment>),
                  endAdornment: searchQuery && (<InputAdornment position="end"><IconButton size="small" onClick={() => setSearchQuery('')}>✕</IconButton></InputAdornment>),
                },
              }}
              sx={{ width: '220px' }}
            />
          </ToolbarLeft>
          <ToolbarRight>
            <StyledChip label={`Всего: ${total}`} size="small" />
          </ToolbarRight>
        </ToolbarContainer>

        {/* Список */}
        <Fade in={!isPending} timeout={300}>
          <Box>
            {contacts.length === 0 ? (
              <EmptyStateContainer>
                <EmptyStateIcon><PersonAddIcon /></EmptyStateIcon>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '18px', color: '#101025', mb: 1 }}>
                  Список контактов пуст
                </Typography>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', fontSize: '14px', mb: 3 }}>
                  Создайте контакт, чтобы начать общение
                </Typography>
                <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => handleOpenModal()}
                  sx={{ backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, padding: '10px 24px', '&:hover': { backgroundColor: '#364fc7' } }}>
                  Добавить контакт
                </Button>
              </EmptyStateContainer>
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#fafafa' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={contacts.length > 0 && selectedContacts.length === contacts.length}
                          onChange={() => {
                            if (selectedContacts.length === contacts.length) setSelectedContacts([]);
                            else setSelectedContacts(contacts.map(c => c.uuid));
                          }}
                          sx={{ color: '#b0b3c3' }}
                        />
                      </TableCell>
                      <TableCell>Имя</TableCell>
                      <TableCell>Организация</TableCell>
                      <TableCell>Должность</TableCell>
                      <TableCell>Телефон</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell align="right">Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {contacts.map((c) => {
                      const isSelected = selectedContacts.includes(c.uuid);
                      return (
                        <TableRow key={c.uuid} hover selected={isSelected} sx={{ '&:hover': { backgroundColor: '#f9fafe' } }}>
                          <TableCell padding="checkbox">
                            <Checkbox checked={isSelected} onChange={() => {
                              setSelectedContacts(prev => prev.includes(c.uuid) ? prev.filter(id => id !== c.uuid) : [...prev, c.uuid]);
                            }} sx={{ color: '#b0b3c3' }} />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Avatar sx={{ width: 36, height: 36, backgroundColor: '#4c6ef5', fontSize: '14px', fontWeight: 600 }}>
                                {getInitials(c)}
                              </Avatar>
                              <Box>
                                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500, color: '#101025' }}>
                                  {getFullName(c)}
                                </Typography>
                                {c.contact_group && (
                                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                                    {c.contact_group}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                              {c.organization || '—'}
                            </Typography>
                            {c.department && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                                {c.department}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                              {c.position || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                              {c.mobile_phone || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                              {c.email || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Ещё">
                              <IconButton size="small" sx={{ color: '#87879b' }} onClick={(e) => {
                                e.stopPropagation(); setRowMenuAnchor(e.currentTarget); setRowMenuContact(c);
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
            <Pagination count={Math.ceil(total / pageSize)} page={page} onChange={(_, v) => setPage(v)} color="primary" shape="rounded"
              sx={{ '& .MuiPaginationItem-root': { fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500 } }} />
          </Box>
        )}

        {/* Меню строки */}
        <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)}
          onClose={() => { setRowMenuAnchor(null); setRowMenuContact(null); }}>
          <MenuItem onClick={() => { if (rowMenuContact) handleOpenModal(rowMenuContact); setRowMenuAnchor(null); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Редактировать</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => {
            if (rowMenuContact) { setDeleteTarget([rowMenuContact.uuid]); setIsDeleteModalOpen(true); }
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
                  <WarningIcon sx={{ fontSize: 36, color: '#e53935' }} />
                </Box>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '18px', fontWeight: 700, color: '#101025', mb: 1 }}>
                  Удалить контакт(ы)?
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
                <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025' }}>
                  {editContact ? 'Редактирование контакта' : 'Добавление контакта'}
                </Typography>
                <IconButton onClick={handleCloseModal} size="small" sx={{ color: '#87879b' }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </ModalHeader>
              <ModalBody>
                <AvatarSection>
                  <StyledAvatar>
                    {formData.first_name || formData.last_name ? (
                      <Typography sx={{ fontSize: '28px', fontWeight: 600, color: '#4c6ef5' }}>
                        {(formData.first_name[0] || '') + (formData.last_name[0] || '')}
                      </Typography>
                    ) : <PersonIcon />}
                  </StyledAvatar>
                </AvatarSection>
                <FieldsSection>
                  <FieldRow>
                    <FieldLabel>Фамилия *</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="Введите фамилию" value={formData.last_name} onChange={handleFormChange('last_name')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Имя *</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="Введите имя" value={formData.first_name} onChange={handleFormChange('first_name')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Отчество</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="Введите отчество" value={formData.middle_name} onChange={handleFormChange('middle_name')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Организация</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="Название организации" value={formData.organization} onChange={handleFormChange('organization')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Отдел</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="Название отдела" value={formData.department} onChange={handleFormChange('department')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Должность</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="Должность" value={formData.position} onChange={handleFormChange('position')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Телефон</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="+7 (___) ___-__-__" value={formData.mobile_phone} onChange={handleFormChange('mobile_phone')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>E-mail</FieldLabel>
                    <FieldValue><StyledTextField fullWidth placeholder="email@example.ru" value={formData.email} onChange={handleFormChange('email')} size="small" /></FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>День рождения</FieldLabel>
                    <FieldValue>
                      <DatePicker
                        value={formData.birthday}
                        onChange={(date) => setFormData(prev => ({ ...prev, birthday: date }))}
                        format="DD.MM.YYYY"
                        slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                      />
                    </FieldValue>
                  </FieldRow>
                  <FieldRow>
                    <FieldLabel>Заметки</FieldLabel>
                    <FieldValue><StyledTextField fullWidth multiline rows={2} placeholder="Дополнительная информация" value={formData.notes} onChange={handleFormChange('notes')} size="small" /></FieldValue>
                  </FieldRow>
                </FieldsSection>
              </ModalBody>
              <ModalFooter>
                <CancelButton onClick={handleCloseModal}>Отменить</CancelButton>
                <SaveButton onClick={handleSave} disabled={saving || !formData.last_name.trim() || !formData.first_name.trim()}>
                  {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Сохранить'}
                </SaveButton>
              </ModalFooter>
            </ModalContainer>
          </Fade>
        </Modal>
      </PageContainer>
    </LocalizationProvider>
  );
};

export default ContactsPage;
