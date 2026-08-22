import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Modal,
  Fade,
  Chip,
  Pagination,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Tooltip,
  InputAdornment,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Key as KeyIcon,
  Business as BusinessIcon,
  Description as DescriptionIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Lock as LockIcon,
  Delete as DeleteIcon,
  Group as GroupIcon,
  Extension as ExtensionIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  UploadFile as UploadFileIcon,
  Download as DownloadIcon,
  Archive as ArchiveIcon,
  Verified as VerifiedIcon,
  Image as ImageIcon,
  Forum as ForumIcon,
  AttachFile as AttachFileIcon,
  History as HistoryIcon,
} from '@mui/icons-material';

// ===================== API =====================

const API_BASE = process.env.REACT_APP_API_URL || '';

const adminApi = {
  getHeaders: (): HeadersInit => {
    const token = localStorage.getItem('admin_access_token') || '';
    return { 'Authorization': `Bearer ${token}` };
  },

  getStats: async () => {
    const r = await fetch(`${API_BASE}/api/admin/stats`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки статистики');
    return r.json();
  },

  getOrganizations: async (page = 1, size = 20, search = '') => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) params.set('search', search);
    const r = await fetch(`${API_BASE}/api/admin/organizations?${params}`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки организаций');
    return r.json();
  },

  createOrganization: async (data: any) => {
    const r = await fetch(`${API_BASE}/api/admin/organizations`, {
      method: 'POST',
      headers: { ...adminApi.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка создания' }));
      throw new Error(err.detail || 'Ошибка создания');
    }
    return r.json();
  },

  updateOrganization: async (orgId: number, data: any) => {
    const r = await fetch(`${API_BASE}/api/admin/organizations/${orgId}`, {
      method: 'PUT',
      headers: { ...adminApi.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка обновления' }));
      throw new Error(err.detail || 'Ошибка обновления');
    }
    return r.json();
  },

  deactivateOrganization: async (orgId: number) => {
    const r = await fetch(`${API_BASE}/api/admin/organizations/${orgId}`, {
      method: 'DELETE',
      headers: adminApi.getHeaders(),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка деактивации' }));
      throw new Error(err.detail || 'Ошибка деактивации');
    }
    return r.json();
  },

  updateCredentials: async (orgId: number, data: any) => {
    const r = await fetch(`${API_BASE}/api/admin/organizations/${orgId}/credentials`, {
      method: 'PUT',
      headers: { ...adminApi.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка обновления учётных данных' }));
      throw new Error(err.detail || 'Ошибка обновления учётных данных');
    }
    return r.json();
  },

  getOrgDocuments: async (orgId: number, page = 1, size = 20, search = '', folder = '') => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) params.set('search', search);
    if (folder) params.set('folder', folder);
    const r = await fetch(`${API_BASE}/api/admin/organizations/${orgId}/documents?${params}`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки документов');
    return r.json();
  },

  // ===== ШТАМПЫ =====
  getStamps: async () => {
    const r = await fetch(`${API_BASE}/api/admin/stamps`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки штампов');
    return r.json();
  },

  uploadStamp: async (signerKeyword: string, file: File) => {
    const formData = new FormData();
    formData.append('signer_keyword', signerKeyword);
    formData.append('file', file);
    const r = await fetch(`${API_BASE}/api/admin/stamps`, {
      method: 'POST',
      headers: adminApi.getHeaders(),
      body: formData,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка загрузки штампа' }));
      throw new Error(err.detail || 'Ошибка загрузки штампа');
    }
    return r.json();
  },

  deleteStamp: async (stampId: number) => {
    const r = await fetch(`${API_BASE}/api/admin/stamps/${stampId}`, {
      method: 'DELETE',
      headers: adminApi.getHeaders(),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка удаления' }));
      throw new Error(err.detail || 'Ошибка удаления');
    }
    return r.json();
  },

  // ===== ОБРАЩЕНИЯ (просмотр всех) =====
  getAppeals: async (params: { page?: number; size?: number; status?: string; org_id?: number; search?: string; overdue?: boolean }) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('size', String(params.size ?? 20));
    if (params.status) q.set('status', params.status);
    if (params.org_id) q.set('org_id', String(params.org_id));
    if (params.search) q.set('search', params.search);
    if (params.overdue) q.set('overdue', 'true');
    const r = await fetch(`${API_BASE}/api/admin/appeals?${q}`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки обращений');
    return r.json();
  },

  getAppealCard: async (uuid: string) => {
    const r = await fetch(`${API_BASE}/api/admin/appeals/${uuid}`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки обращения');
    return r.json();
  },

  downloadAppealAttachment: (attachmentId: number) => {
    const token = localStorage.getItem('admin_access_token') || '';
    return `${API_BASE}/api/admin/appeals/attachments/${attachmentId}/download?token=${token}`;
  },

  // ===== СКАЧИВАНИЕ ДОКУМЕНТОВ (АДМИН) =====
  downloadOriginal: (docUuid: string) => {
    const token = localStorage.getItem('admin_access_token') || '';
    return `${API_BASE}/api/admin/documents/${docUuid}/download/original?token=${token}`;
  },

  downloadSigned: (docUuid: string) => {
    const token = localStorage.getItem('admin_access_token') || '';
    return `${API_BASE}/api/admin/documents/${docUuid}/download/signed?token=${token}`;
  },

  downloadArchive: (docUuid: string) => {
    const token = localStorage.getItem('admin_access_token') || '';
    return `${API_BASE}/api/admin/documents/${docUuid}/download/archive?token=${token}`;
  },

  getLicenses: async (page = 1, size = 20, search = '') => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) params.set('search', search);
    const r = await fetch(`${API_BASE}/api/admin/licenses?${params}`, { headers: adminApi.getHeaders() });
    if (!r.ok) throw new Error('Ошибка загрузки лицензий');
    return r.json();
  },

  generateLicenses: async (count = 5, durationDays = 180) => {
    const params = new URLSearchParams({ count: String(count), duration_days: String(durationDays) });
    const r = await fetch(`${API_BASE}/api/admin/licenses?${params}`, {
      method: 'POST',
      headers: adminApi.getHeaders(),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка генерации' }));
      throw new Error(err.detail || 'Ошибка генерации');
    }
    return r.json();
  },

  deleteLicense: async (licenseId: number) => {
    const r = await fetch(`${API_BASE}/api/admin/licenses/${licenseId}`, {
      method: 'DELETE',
      headers: adminApi.getHeaders(),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Ошибка удаления' }));
      throw new Error(err.detail || 'Ошибка удаления');
    }
    return r.json();
  },

  logout: async () => {
    const token = localStorage.getItem('admin_access_token');
    if (token) {
      await fetch(`${API_BASE}/api/admin/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    }
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
  },
};

// ===================== СТИЛИ =====================

const PageContainer = styled(Box)({
  padding: '24px 32px',
  maxWidth: '1400px',
  margin: '0 auto',
});

const StatsGrid = styled(Box)({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '16px',
  marginBottom: '32px',
});

const StatCard = styled(Paper)({
  borderRadius: '12px',
  border: '1px solid #eaebf0',
  boxShadow: 'none',
  padding: '20px 24px',
  transition: 'box-shadow 0.2s',
  '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
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

const StyledModalContainer = styled(Box)({
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '90%', maxWidth: '640px', maxHeight: '90vh', backgroundColor: '#ffffff',
  borderRadius: '16px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
});

const ModalHeader = styled(Box)({
  padding: '20px 28px', borderBottom: '1px solid #eaebf0', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
});

const ModalBody = styled(Box)({ padding: '28px', overflowY: 'auto', flex: 1 });
const ModalFooter = styled(Box)({
  padding: '16px 28px', borderTop: '1px solid #eaebf0', display: 'flex',
  justifyContent: 'flex-end', gap: '12px', backgroundColor: '#fafafa', flexShrink: 0,
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '& fieldset': { borderColor: '#d6d6df' },
    '&:hover fieldset': { borderColor: '#b0b3c3' },
    '&.Mui-focused fieldset': { borderColor: '#7950f2', borderWidth: '2px' },
  },
  '& .MuiInputBase-input': { fontFamily: 'Lato, sans-serif', fontSize: '14px', padding: '10px 14px' },
  '& .MuiInputLabel-root': { fontFamily: 'Lato, sans-serif', fontSize: '13px' },
  marginBottom: '16px',
});

const CancelButton = styled(Button)({
  textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 500, color: '#87879b',
  padding: '8px 24px', borderRadius: '8px', fontSize: '14px', '&:hover': { backgroundColor: '#f4f4f8' },
});

const SaveButton = styled(Button)({
  textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, backgroundColor: '#7950f2',
  color: '#ffffff', padding: '8px 28px', borderRadius: '8px', fontSize: '14px', '&:hover': { backgroundColor: '#6040d4' },
});

const PrimaryButton = styled(Button)({
  textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, backgroundColor: '#7950f2',
  color: '#ffffff', borderRadius: '8px', '&:hover': { backgroundColor: '#6040d4' },
});

// ===================== СТРАНИЦА =====================

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminInfo, setAdminInfo] = useState<any>(null);

  // Проверка авторизации при загрузке
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    // Проверяем токен
    adminApi.getStats().then(() => {
      setLoading(false);
    }).catch((err) => {
      console.error('Token validation failed:', err);
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
      navigate('/admin/login');
    });
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // ignore
    }
    navigate('/admin/login');
  };

  // Stats
  const [stats, setStats] = useState<any>(null);

  // Organizations
  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgTotal, setOrgTotal] = useState(0);
  const [orgPage, setOrgPage] = useState(1);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgLoading, setOrgLoading] = useState(false);

  // Licenses
  const [licenses, setLicenses] = useState<any[]>([]);
  const [licTotal, setLicTotal] = useState(0);
  const [licPage, setLicPage] = useState(1);
  const [licSearch, setLicSearch] = useState('');
  const [licLoading, setLicLoading] = useState(false);

  // Org Documents
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [docPage, setDocPage] = useState(1);
  const [docSearch, setDocSearch] = useState('');
  const [docFolder, setDocFolder] = useState('');
  const [docLoading, setDocLoading] = useState(false);

  // Stamps
  const [stamps, setStamps] = useState<any[]>([]);
  const [stampsLoading, setStampsLoading] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [stampForm, setStampForm] = useState({ signerKeyword: '', file: null as File | null });
  const [stampUploading, setStampUploading] = useState(false);
  const [stampDeleteDialog, setStampDeleteDialog] = useState<number | null>(null);

  // Обращения (просмотр всех организаций)
  const [appeals, setAppeals] = useState<any[]>([]);
  const [appealsTotal, setAppealsTotal] = useState(0);
  const [appealsPage, setAppealsPage] = useState(1);
  const [appealsStatus, setAppealsStatus] = useState('');
  const [appealsOrgId, setAppealsOrgId] = useState<number | ''>('');
  const [appealsSearch, setAppealsSearch] = useState('');
  const [debouncedAppealsSearch, setDebouncedAppealsSearch] = useState('');
  const [appealsLoading, setAppealsLoading] = useState(false);
  const [appealCard, setAppealCard] = useState<any | null>(null);
  const [appealCardOpen, setAppealCardOpen] = useState(false);

  // Modals
  const [createOrgModal, setCreateOrgModal] = useState(false);
  const [editCredsModal, setEditCredsModal] = useState(false);
  const [editOrgModal, setEditOrgModal] = useState(false);
  const [generateLicModal, setGenerateLicModal] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ type: string; id: number; name?: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Form data
  const [orgForm, setOrgForm] = useState({ name: '', login: '', password: '', inn: '', kpp: '', address: '', contact_person: '', contact_email: '' });
  const [credsForm, setCredsForm] = useState({ login: '', password: '' });
  const [editOrgForm, setEditOrgForm] = useState({ name: '', inn: '', kpp: '', address: '', contact_person: '', contact_email: '', is_active: true });
  const [licForm, setLicForm] = useState({ count: 5, duration_days: 180 });

  // ===================== STATS =====================

  const loadStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ===================== ORGANIZATIONS =====================

  const loadOrgs = useCallback(async () => {
    setOrgLoading(true);
    try {
      const data = await adminApi.getOrganizations(orgPage, 20, orgSearch);
      setOrgs(data.items || []);
      setOrgTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOrgLoading(false);
    }
  }, [orgPage, orgSearch]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  // ===================== APPEALS (просмотр) =====================

  const loadAppeals = useCallback(async () => {
    setAppealsLoading(true);
    try {
      const data = await adminApi.getAppeals({
        page: appealsPage,
        size: 20,
        status: appealsStatus || undefined,
        org_id: appealsOrgId || undefined,
        search: debouncedAppealsSearch || undefined,
      });
      setAppeals(data.items || []);
      setAppealsTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAppealsLoading(false);
    }
  }, [appealsPage, appealsStatus, appealsOrgId, debouncedAppealsSearch]);

  useEffect(() => {
    if (tab === 4) loadAppeals();
  }, [tab, loadAppeals]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedAppealsSearch(appealsSearch); setAppealsPage(1); }, 400);
    return () => clearTimeout(t);
  }, [appealsSearch]);

  const openAppealCard = async (uuid: string) => {
    try {
      setAppealCard(await adminApi.getAppealCard(uuid));
      setAppealCardOpen(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateOrg = async () => {
    try {
      const res = await adminApi.createOrganization(orgForm);
      setSuccess(res.message || 'Организация создана');
      setCreateOrgModal(false);
      resetOrgForm();
      await loadOrgs();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateOrg = async () => {
    if (!selectedOrg) return;
    try {
      await adminApi.updateOrganization(selectedOrg.id, editOrgForm);
      setSuccess('Организация обновлена');
      setEditOrgModal(false);
      setSelectedOrg(null);
      await loadOrgs();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeactivateOrg = async () => {
    if (!deleteDialog || !selectedOrg) return;
    try {
      await adminApi.deactivateOrganization(selectedOrg.id);
      setSuccess('Организация деактивирована');
      setDeleteDialog(null);
      if (tab === 0) await loadOrgs();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!selectedOrg) return;
    try {
      await adminApi.updateCredentials(selectedOrg.id, credsForm);
      setSuccess('Учётные данные обновлены');
      setEditCredsModal(false);
      setCredsForm({ login: '', password: '' });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetOrgForm = () => {
    setOrgForm({ name: '', login: '', password: '', inn: '', kpp: '', address: '', contact_person: '', contact_email: '' });
  };

  const openCreateOrg = () => { resetOrgForm(); setCreateOrgModal(true); };

  const openEditOrg = (org: any) => {
    setSelectedOrg(org);
    setEditOrgForm({
      name: org.name || '',
      inn: org.inn || '',
      kpp: org.kpp || '',
      address: org.address || '',
      contact_person: org.contact_person || '',
      contact_email: org.contact_email || '',
      is_active: org.is_active ?? true,
    });
    setEditOrgModal(true);
  };

  const openEditCreds = (org: any) => {
    setSelectedOrg(org);
    setCredsForm({ login: org.login || '', password: '' });
    setEditCredsModal(true);
  };

  // ===================== LICENSES =====================

  const loadLicenses = useCallback(async () => {
    setLicLoading(true);
    try {
      const data = await adminApi.getLicenses(licPage, 20, licSearch);
      setLicenses(data.items || []);
      setLicTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLicLoading(false);
    }
  }, [licPage, licSearch]);

  useEffect(() => { loadLicenses(); }, [loadLicenses]);

  const handleGenerateLicenses = async () => {
    setGenerating(true);
    try {
      const data = await adminApi.generateLicenses(licForm.count, licForm.duration_days);
      setSuccess(`Сгенерировано ${licForm.count} лицензий`);
      setGenerateLicModal(false);
      setLicForm({ count: 5, duration_days: 180 });
      await loadLicenses();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteLicense = async () => {
    if (!deleteDialog) return;
    try {
      await adminApi.deleteLicense(deleteDialog.id);
      setSuccess('Лицензия удалена');
      setDeleteDialog(null);
      await loadLicenses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ===================== DOCUMENTS =====================

  const loadDocs = useCallback(async () => {
    if (!selectedOrg) return;
    setDocLoading(true);
    try {
      const data = await adminApi.getOrgDocuments(selectedOrg.id, docPage, 20, docSearch, docFolder);
      setDocs(data.items || []);
      setDocTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDocLoading(false);
    }
  }, [selectedOrg, docPage, docSearch, docFolder]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const selectOrg = (org: any) => {
    setSelectedOrg(org);
    setDocPage(1);
    setDocSearch('');
    setDocFolder('');
  };

  // ===================== STAMPS =====================

  const loadStamps = useCallback(async () => {
    setStampsLoading(true);
    try {
      const data = await adminApi.getStamps();
      setStamps(data.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStampsLoading(false);
    }
  }, []);

  useEffect(() => { loadStamps(); }, [loadStamps]);

  const handleUploadStamp = async () => {
    if (!stampForm.signerKeyword.trim() || !stampForm.file) return;
    setStampUploading(true);
    try {
      await adminApi.uploadStamp(stampForm.signerKeyword.trim(), stampForm.file);
      setSuccess(`Штамп для «${stampForm.signerKeyword}» загружен`);
      setStampModalOpen(false);
      setStampForm({ signerKeyword: '', file: null });
      await loadStamps();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStampUploading(false);
    }
  };

  const handleDeleteStamp = async () => {
    if (stampDeleteDialog === null) return;
    try {
      await adminApi.deleteStamp(stampDeleteDialog);
      setSuccess('Штамп удалён');
      setStampDeleteDialog(null);
      await loadStamps();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ===================== HELPERS =====================

  const formatDate = (d?: string) => {
    if (!d) return '\u2014';
    try { return new Date(d).toLocaleDateString('ru-RU'); } catch { return '\u2014'; }
  };

  const folderNames: Record<string, string> = {
    orders: 'Приказы',
    regulations: 'Распоряжения',
    provisions: 'Положения',
    incoming: 'Входящие',
    outgoing: 'Исходящие',
    tasks: 'Поручения',
  };

  const TwoCol = ({ children }: { children: React.ReactNode }) => (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>{children}</Box>
  );

  const HalfCol = ({ children }: { children: React.ReactNode }) => (
    <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>{children}</Box>
  );

  const FullCol = ({ children }: { children: React.ReactNode }) => (
    <Box sx={{ flex: '1 1 100%' }}>{children}</Box>
  );

  return (
    <PageContainer>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '24px', color: '#101025' }}>
          Админ-панель
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {adminInfo && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon sx={{ fontSize: 20, color: '#87879b' }} />
              <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#555' }}>{adminInfo.username}</Typography>
            </Box>
          )}
          <Tooltip title="Выйти">
            <IconButton onClick={handleLogout} sx={{ color: '#87879b', '&:hover': { color: '#e53935' } }}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Snackbar open={!!error || !!success} autoHideDuration={5000}
        onClose={() => { setError(null); setSuccess(null); }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity={error ? 'error' : 'success'} onClose={() => { setError(null); setSuccess(null); }}>
          {error || success}
        </Alert>
      </Snackbar>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* ===================== СТАТИСТИКА ===================== */}
          {stats && (
            <StatsGrid>
              <StatCard>
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ede7f6' }}>
                    <GroupIcon sx={{ color: '#7950f2', fontSize: 24 }} />
                  </Box>
                </Box>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 28, fontWeight: 700, color: '#101025' }}>
                  {stats.total_organizations}
                </Typography>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Организаций</Typography>
              </StatCard>
              <StatCard>
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f5e9' }}>
                    <BusinessIcon sx={{ color: '#43a047', fontSize: 24 }} />
                  </Box>
                </Box>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 28, fontWeight: 700, color: '#101025' }}>
                  {stats.active_organizations}
                </Typography>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Активных</Typography>
              </StatCard>
              <StatCard>
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd' }}>
                    <DescriptionIcon sx={{ color: '#1e88e5', fontSize: 24 }} />
                  </Box>
                </Box>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 28, fontWeight: 700, color: '#101025' }}>
                  {stats.total_documents}
                </Typography>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Документов</Typography>
              </StatCard>
              <StatCard>
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff3e0' }}>
                    <ExtensionIcon sx={{ color: '#fb8c00', fontSize: 24 }} />
                  </Box>
                </Box>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 28, fontWeight: 700, color: '#101025' }}>
                  {stats.total_licenses}
                </Typography>
                <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Лицензий</Typography>
              </StatCard>
            </StatsGrid>
          )}

          {/* ===================== ТАБЫ ===================== */}
          <Paper sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', mb: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}
              textColor="primary" indicatorColor="primary">
              <Tab icon={<GroupIcon fontSize="small" />} label="Организации" />
              <Tab icon={<ExtensionIcon fontSize="small" />} label="Лицензии" />
              <Tab icon={<DescriptionIcon fontSize="small" />} label="Документы" disabled={!selectedOrg} />
              <Tab icon={<ImageIcon fontSize="small" />} label="Штампы" />
              <Tab icon={<ForumIcon fontSize="small" />} label="Обращения" />
            </Tabs>

            {/* TAB: Организации */}
            {tab === 0 && (
              <Box sx={{ p: 3 }}>
                <ToolbarContainer>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                    <TextField
                      placeholder="Поиск по названию или логину"
                      size="small"
                      value={orgSearch}
                      onChange={(e) => { setOrgSearch(e.target.value); setOrgPage(1); }}
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#b0b3c3' }} /></InputAdornment>,
                        },
                      }}
                      sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                    <Tooltip title="Обновить"><IconButton size="small" onClick={loadOrgs}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                  </Box>
                  <PrimaryButton startIcon={<AddIcon />} onClick={openCreateOrg}>Создать организацию</PrimaryButton>
                </ToolbarContainer>

                {orgLoading && orgs.length === 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                ) : (
                  <>
                    <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', mb: 2 }}>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#fafafa' }}>
                            <TableCell>Название</TableCell>
                            <TableCell>Логин</TableCell>
                            <TableCell>ИНН</TableCell>
                            <TableCell>Контакты</TableCell>
                            <TableCell align="center">Статус</TableCell>
                            <TableCell align="right">Действия</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {orgs.length === 0 ? (
                            <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                              <Typography sx={{ color: '#87879b', fontFamily: 'Lato' }}>Организации не найдены</Typography>
                            </TableCell></TableRow>
                          ) : orgs.map((org) => (
                            <TableRow key={org.id} hover>
                              <TableCell>
                                <Typography sx={{ fontFamily: 'Lato', fontWeight: 500, fontSize: 14 }}>{org.name}</Typography>
                                {org.address && <Typography sx={{ fontSize: 12, color: '#87879b' }}>{org.address}</Typography>}
                              </TableCell>
                              <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#7950f2' }}>{org.login}</Typography></TableCell>
                              <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{org.inn || '\u2014'}</Typography></TableCell>
                              <TableCell>
                                {org.contact_person && <Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{org.contact_person}</Typography>}
                                {org.contact_email && <Typography sx={{ fontSize: 12, color: '#87879b' }}>{org.contact_email}</Typography>}
                              </TableCell>
                              <TableCell align="center">
                                <Chip label={org.is_active ? 'Активна' : 'Деактивирована'} size="small"
                                  sx={{
                                    backgroundColor: org.is_active ? '#e8f5e9' : '#ffebee',
                                    color: org.is_active ? '#2e7d32' : '#c62828',
                                    fontWeight: 600, fontSize: 12,
                                  }} />
                              </TableCell>
                              <TableCell align="right">
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                  <Tooltip title="Редактировать"><IconButton size="small" onClick={() => openEditOrg(org)} sx={{ color: '#87879b' }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                  <Tooltip title="Учётные данные"><IconButton size="small" onClick={() => openEditCreds(org)} sx={{ color: '#87879b' }}><LockIcon fontSize="small" /></IconButton></Tooltip>
                                  <Tooltip title="Документы"><IconButton size="small" onClick={() => selectOrg(org)} sx={{ color: '#87879b' }}><DescriptionIcon fontSize="small" /></IconButton></Tooltip>
                                  <Tooltip title="Деактивировать"><IconButton size="small" onClick={() => setDeleteDialog({ type: 'org', id: org.id, name: org.name })} sx={{ color: '#e53935' }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {orgTotal > 20 && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                        <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Всего: {orgTotal}</Typography>
                        <Pagination count={Math.ceil(orgTotal / 20)} page={orgPage} onChange={(_, v) => setOrgPage(v)} color="primary" shape="rounded" />
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}

            {/* TAB: Лицензии */}
            {tab === 1 && (
              <Box sx={{ p: 3 }}>
                <ToolbarContainer>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                    <TextField
                      placeholder="Поиск по ключу"
                      size="small"
                      value={licSearch}
                      onChange={(e) => { setLicSearch(e.target.value); setLicPage(1); }}
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#b0b3c3' }} /></InputAdornment>,
                        },
                      }}
                      sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                    <Tooltip title="Обновить"><IconButton size="small" onClick={loadLicenses}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                  </Box>
                  <PrimaryButton startIcon={<KeyIcon />} onClick={() => { setGenerateLicModal(true); }}>Создать лицензии</PrimaryButton>
                </ToolbarContainer>

                {licLoading && licenses.length === 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                ) : (
                  <>
                    <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', mb: 2 }}>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#fafafa' }}>
                            <TableCell>Ключ</TableCell>
                            <TableCell>Срок действия</TableCell>
                            <TableCell>Активирована</TableCell>
                            <TableCell>Истекает</TableCell>
                            <TableCell align="right">Действия</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {licenses.length === 0 ? (
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                              <Typography sx={{ color: '#87879b', fontFamily: 'Lato' }}>Лицензии не найдены</Typography>
                            </TableCell></TableRow>
                          ) : licenses.map((lic) => (
                            <TableRow key={lic.id} hover>
                              <TableCell><Typography sx={{ fontFamily: 'monospace', fontSize: 13, color: '#7950f2' }}>{lic.key}</Typography></TableCell>
                              <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{lic.duration_days} дн.</Typography></TableCell>
                              <TableCell>
                                {lic.activated_org_id ? (
                                  <Chip label={`Орг #${lic.activated_org_id}`} size="small" sx={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontWeight: 500, fontSize: 12 }} />
                                ) : (
                                  <Chip label="Не активирована" size="small" sx={{ backgroundColor: '#fff3e0', color: '#e65100', fontWeight: 500, fontSize: 12 }} />
                                )}
                              </TableCell>
                              <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{formatDate(lic.expires_at)}</Typography></TableCell>
                              <TableCell align="right">
                                {!lic.activated_org_id && (
                                  <Tooltip title="Удалить"><IconButton size="small" onClick={() => setDeleteDialog({ type: 'license', id: lic.id })} sx={{ color: '#e53935' }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {licTotal > 20 && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                        <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Всего: {licTotal}</Typography>
                        <Pagination count={Math.ceil(licTotal / 20)} page={licPage} onChange={(_, v) => setLicPage(v)} color="primary" shape="rounded" />
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}

            {/* TAB: Документы */}
            {tab === 2 && (
              <Box sx={{ p: 3 }}>
                {selectedOrg ? (
                  <>
                    <Paper sx={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #eaebf0', mb: 2, backgroundColor: '#f8f7ff' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon sx={{ color: '#7950f2' }} />
                        <Typography sx={{ fontFamily: 'Lato', fontWeight: 600, fontSize: 15 }}>
                          Документы: <strong>{selectedOrg.name}</strong>
                        </Typography>
                      </Box>
                    </Paper>

                    <ToolbarContainer>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <TextField
                          placeholder="Поиск по названию"
                          size="small"
                          value={docSearch}
                          onChange={(e) => { setDocSearch(e.target.value); setDocPage(1); }}
                          slotProps={{
                            input: {
                              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#b0b3c3' }} /></InputAdornment>,
                            },
                          }}
                          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                        />
                        <Box sx={{ minWidth: 160 }}>
                          <select value={docFolder} onChange={(e) => { setDocFolder(e.target.value); setDocPage(1); }}
                            style={{ height: '37px', borderRadius: '8px', border: '1px solid #d6d6df', padding: '0 14px', fontFamily: 'Lato, sans-serif', fontSize: '14px', width: '100%', backgroundColor: '#fff', boxSizing: 'border-box' }}>
                            <option value="">Все типы</option>
                            {Object.entries(folderNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </Box>
                        <Tooltip title="Обновить"><IconButton size="small" onClick={loadDocs}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                      </Box>
                    </ToolbarContainer>

                    {docLoading && docs.length === 0 ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                    ) : (
                      <>
                        <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', mb: 2 }}>
                          <Table>
                            <TableHead>
                              <TableRow sx={{ backgroundColor: '#fafafa' }}>
                                <TableCell>Название</TableCell>
                                <TableCell>Рег. номер</TableCell>
                                <TableCell>Тип</TableCell>
                                <TableCell>Подписант</TableCell>
                                <TableCell>Тип подписи</TableCell>
                                <TableCell>Дата создания</TableCell>
                                <TableCell>Дата подписи</TableCell>
                                <TableCell align="center">Статус</TableCell>
                                <TableCell align="right">Действия</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {docs.length === 0 ? (
                                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                  <Typography sx={{ color: '#87879b', fontFamily: 'Lato' }}>Документы не найдены</Typography>
                                </TableCell></TableRow>
                              ) : docs.map((doc) => (
                                <TableRow key={doc.id} hover>
                                  <TableCell>
                                    <Typography sx={{ fontFamily: 'Lato', fontWeight: 500, fontSize: 14 }}>{doc.name}</Typography>
                                    <Typography sx={{ fontSize: 12, color: '#87879b' }}>{doc.original_file_name}</Typography>
                                  </TableCell>
                                  <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{doc.registration_number}</Typography></TableCell>
                                  <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{folderNames[doc.folder] || doc.folder}</Typography></TableCell>
                                  <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{doc.signer_full_name || doc.signer || '\u2014'}</Typography></TableCell>
                                  <TableCell>
                                    <Chip
                                      label={doc.signature_type === 'HAND' ? 'Собственноручная' : doc.signature_type === 'UNEP' ? 'УНЭП' : doc.signature_type === 'UKEP' ? 'УКЭП' : doc.signature_type === 'PEP' ? 'ПЭП' : '—'}
                                      size="small"
                                      sx={{
                                        backgroundColor: doc.signature_type === 'HAND' ? '#e8f5e9' : doc.signature_type === 'UNEP' || doc.signature_type === 'UKEP' ? '#e3f2fd' : '#f4f4f8',
                                        color: doc.signature_type === 'HAND' ? '#2e7d32' : doc.signature_type === 'UNEP' || doc.signature_type === 'UKEP' ? '#1565c0' : '#87879b',
                                        fontWeight: 500, fontSize: 11,
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{formatDate(doc.created_at)}</Typography></TableCell>
                                  <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{formatDate(doc.signature_date)}</Typography></TableCell>
                                  <TableCell align="center">
                                    <Chip label={doc.status} size="small" sx={{
                                      backgroundColor: doc.status === 'signed' ? '#e8f5e9' : doc.status === 'pending' ? '#fff3e0' : doc.status === 'rejected' ? '#ffebee' : '#f4f4f8',
                                      color: doc.status === 'signed' ? '#2e7d32' : doc.status === 'pending' ? '#e65100' : doc.status === 'rejected' ? '#c62828' : '#87879b',
                                      fontWeight: 500, fontSize: 12,
                                    }} />
                                  </TableCell>
                                  <TableCell align="right">
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                      <Tooltip title="Скачать оригинал">
                                        <IconButton size="small" onClick={() => window.open(adminApi.downloadOriginal(doc.uuid), '_blank')} sx={{ color: '#87879b' }}>
                                          <DownloadIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                      {doc.signature_type !== 'HAND' && (
                                        <Tooltip title="Скачать архив (PDF + SIG)">
                                          <IconButton size="small" onClick={() => window.open(adminApi.downloadArchive(doc.uuid), '_blank')} sx={{ color: '#87879b' }}>
                                            <ArchiveIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                      {doc.signed_copy_url && (
                                        <Tooltip title="Скачать со штампом">
                                          <IconButton size="small" onClick={() => window.open(adminApi.downloadSigned(doc.uuid), '_blank')} sx={{ color: '#7950f2' }}>
                                            <VerifiedIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                    </Box>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        {docTotal > 20 && (
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                            <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b' }}>Всего: {docTotal}</Typography>
                            <Pagination count={Math.ceil(docTotal / 20)} page={docPage} onChange={(_, v) => setDocPage(v)} color="primary" shape="rounded" />
                          </Box>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <DescriptionIcon sx={{ fontSize: 48, color: '#b0b3c3', mb: 2 }} />
                    <Typography sx={{ fontFamily: 'Lato', color: '#87879b' }}>Выберите организацию для просмотра документов</Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* TAB: Штампы */}
            {tab === 3 && (
              <Box sx={{ p: 3 }}>
                <ToolbarContainer>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                    <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b' }}>
                      Маппинг: ключевое слово подписанта → файл штампа
                    </Typography>
                    <Tooltip title="Обновить"><IconButton size="small" onClick={loadStamps}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                  </Box>
                  <PrimaryButton startIcon={<UploadFileIcon />} onClick={() => setStampModalOpen(true)}>Загрузить штамп</PrimaryButton>
                </ToolbarContainer>

                {stampsLoading && stamps.length === 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                ) : (
                  <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none', mb: 2 }}>
                    <Table>
                      <TableHead>
                        <TableRow sx={{ backgroundColor: '#fafafa' }}>
                          <TableCell>Подписант (ключевое слово)</TableCell>
                          <TableCell>Штамп</TableCell>
                          <TableCell>Файл</TableCell>
                          <TableCell align="right">Действия</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {stamps.length === 0 ? (
                          <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                            <Typography sx={{ color: '#87879b', fontFamily: 'Lato' }}>Штампы не загружены</Typography>
                          </TableCell></TableRow>
                        ) : stamps.map((stamp) => (
                          <TableRow key={stamp.id} hover>
                            <TableCell>
                              <Typography sx={{ fontFamily: 'Lato', fontWeight: 500, fontSize: 14 }}>{stamp.signer_keyword}</Typography>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  component="img"
                                  src={stamp.stamp_url}
                                  alt={stamp.signer_keyword}
                                  sx={{ width: 60, height: 32, objectFit: 'contain', border: '1px solid #eaebf0', borderRadius: '4px', backgroundColor: '#fafafa' }}
                                  onError={(e: any) => { e.target.style.display = 'none'; }}
                                />
                                <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b' }}>{stamp.stamp_url}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell><Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{stamp.stamp_filename}</Typography></TableCell>
                            <TableCell align="right">
                              <Tooltip title="Удалить">
                                <IconButton size="small" onClick={() => setStampDeleteDialog(stamp.id)} sx={{ color: '#e53935' }}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* TAB: Обращения (все организации, только просмотр) */}
            {tab === 4 && (
              <Box sx={{ p: 3 }}>
                <ToolbarContainer>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1 }}>
                    <TextField
                      placeholder="Поиск по номеру, ФИО или тексту"
                      size="small"
                      value={appealsSearch}
                      onChange={(e) => { setAppealsSearch(e.target.value); setAppealsPage(1); }}
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#b0b3c3' }} /></InputAdornment>,
                        },
                      }}
                      sx={{ flex: '1 1 260px', '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                    <FormControl size="small" sx={{ minWidth: 190 }}>
                      <InputLabel>Организация</InputLabel>
                      <Select
                        value={appealsOrgId}
                        label="Организация"
                        onChange={(e) => { setAppealsOrgId(e.target.value as number | ''); setAppealsPage(1); }}
                        sx={{ borderRadius: '8px' }}
                      >
                        <MenuItem value=""><em>Все организации</em></MenuItem>
                        {orgs.map((o) => (
                          <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 170 }}>
                      <InputLabel>Статус</InputLabel>
                      <Select
                        value={appealsStatus}
                        label="Статус"
                        onChange={(e) => { setAppealsStatus(e.target.value); setAppealsPage(1); }}
                        sx={{ borderRadius: '8px' }}
                      >
                        <MenuItem value=""><em>Все статусы</em></MenuItem>
                        <MenuItem value="new">Новые</MenuItem>
                        <MenuItem value="registered">Зарегистрированные</MenuItem>
                        <MenuItem value="on_execution">На исполнении</MenuItem>
                        <MenuItem value="answered">Ответ направлен</MenuItem>
                        <MenuItem value="redirected">Перенаправленные</MenuItem>
                      </Select>
                    </FormControl>
                    <Tooltip title="Обновить">
                      <IconButton size="small" onClick={loadAppeals}><RefreshIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Box>
                </ToolbarContainer>

                {appealsLoading && appeals.length === 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                ) : appeals.length === 0 ? (
                  <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b', textAlign: 'center', py: 6 }}>
                    Обращений нет
                  </Typography>
                ) : (
                  <>
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '8px' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Номер</TableCell>
                            <TableCell>Организация-адресат</TableCell>
                            <TableCell>Заявитель</TableCell>
                            <TableCell>Тема</TableCell>
                            <TableCell>Содержание</TableCell>
                            <TableCell>Статус / Срок</TableCell>
                            <TableCell align="center">Вложения</TableCell>
                            <TableCell>Поступил</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {appeals.map((a: any) => (
                            <TableRow key={a.uuid} hover onClick={() => openAppealCard(a.uuid)}
                              sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f9fafe' } }}>
                              <TableCell>
                                <Typography sx={{ fontFamily: 'Lato', fontSize: 13, fontWeight: 600 }}>№ {a.system_number}</Typography>
                                {a.reg_number && (
                                  <Typography sx={{ fontFamily: 'Lato', fontSize: 11, color: '#87879b' }}>рег. № {a.reg_number}</Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'Lato', fontSize: 12, maxWidth: 200 }}>{a.org_name}</TableCell>
                              <TableCell>
                                <Typography sx={{ fontFamily: 'Lato', fontSize: 12.5 }}>
                                  {a.applicant_name}
                                  {a.applicant_type === 'organization' && ' (орг.)'}
                                </Typography>
                                <Typography sx={{ fontFamily: 'Lato', fontSize: 11, color: '#87879b' }}>{a.email}</Typography>
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'Lato', fontSize: 12.5 }}>
                                {a.kind === 'complaint' ? 'Жалоба' : a.kind === 'suggestion' ? 'Предложение' : 'Заявление'}
                              </TableCell>
                              <TableCell sx={{ maxWidth: 240 }}>
                                <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#5a5a72', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {a.content_preview}…
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip size="small" sx={{ height: 22, fontSize: 11, fontFamily: 'Lato',
                                  bgcolor: a.status === 'answered' ? '#e8f5e9' : a.status === 'redirected' ? '#eceff1'
                                    : a.status === 'on_execution' ? '#ede7f6' : a.status === 'registered' ? '#e3f2fd' : '#fff3e0',
                                  color: a.status === 'answered' ? '#2e7d32' : a.status === 'redirected' ? '#546e7a'
                                    : a.status === 'on_execution' ? '#4527a0' : a.status === 'registered' ? '#0d47a1' : '#e65100',
                                }} label={
                                  a.status === 'new' ? 'Новое' : a.status === 'registered' ? 'Зарегистрировано'
                                    : a.status === 'on_execution' ? 'На исполнении' : a.status === 'answered' ? 'Ответ направлен' : 'Перенаправлено'
                                } />
                                {a.deadline && !['answered', 'redirected'].includes(a.status) && (
                                  <Typography sx={{ fontFamily: 'Lato', fontSize: 11, mt: 0.25,
                                    color: a.overdue ? '#c62828' : (a.days_left ?? 99) <= 3 ? '#e65100' : '#2e7d32', fontWeight: 600 }}>
                                    {a.overdue ? 'Просрочено' : `${a.days_left} дн.`}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="center">
                                {a.has_attachments ? (
                                  <AttachFileIcon fontSize="small" sx={{ color: '#4c6ef5' }} />
                                ) : <span style={{ color: '#d6d6df' }}>—</span>}
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'Lato', fontSize: 12, color: '#5a5a72' }}>
                                {new Date(a.created_at).toLocaleDateString('ru-RU')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {appealsTotal > 20 && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                        <Pagination count={Math.ceil(appealsTotal / 20)} page={appealsPage}
                          onChange={(_, v) => setAppealsPage(v)} color="primary" shape="rounded" />
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}
          </Paper>
        </>
      )}

      {/* ===================== МОДАЛКА: Создание организации ===================== */}
      <Modal open={createOrgModal} onClose={() => setCreateOrgModal(false)} closeAfterTransition>
        <Fade in={createOrgModal}>
          <StyledModalContainer>
            <ModalHeader>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18 }}>Создание организации</Typography>
              <IconButton onClick={() => setCreateOrgModal(false)} size="small" sx={{ color: '#87879b' }}><CloseIcon fontSize="small" /></IconButton>
            </ModalHeader>
            <ModalBody>
              <StyledTextField fullWidth label="Название *" value={orgForm.name} onChange={(e) => setOrgForm(p => ({ ...p, name: e.target.value }))} />
              <StyledTextField fullWidth label="Логин администратора *" value={orgForm.login} onChange={(e) => setOrgForm(p => ({ ...p, login: e.target.value }))}
                helperText="Логин и пароль будут выданы администратору организации для входа в систему" />
              <StyledTextField fullWidth label="Пароль администратора *" type="password" value={orgForm.password} onChange={(e) => setOrgForm(p => ({ ...p, password: e.target.value }))} />
              <TwoCol>
                <HalfCol><StyledTextField fullWidth label="ИНН" value={orgForm.inn} onChange={(e) => setOrgForm(p => ({ ...p, inn: e.target.value }))} /></HalfCol>
                <HalfCol><StyledTextField fullWidth label="КПП" value={orgForm.kpp} onChange={(e) => setOrgForm(p => ({ ...p, kpp: e.target.value }))} /></HalfCol>
              </TwoCol>
              <FullCol><StyledTextField fullWidth label="Адрес" value={orgForm.address} onChange={(e) => setOrgForm(p => ({ ...p, address: e.target.value }))} /></FullCol>
              <TwoCol>
                <HalfCol><StyledTextField fullWidth label="Контактное лицо" value={orgForm.contact_person} onChange={(e) => setOrgForm(p => ({ ...p, contact_person: e.target.value }))} /></HalfCol>
                <HalfCol><StyledTextField fullWidth label="Email" value={orgForm.contact_email} onChange={(e) => setOrgForm(p => ({ ...p, contact_email: e.target.value }))} /></HalfCol>
              </TwoCol>
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => setCreateOrgModal(false)}>Отмена</CancelButton>
              <SaveButton onClick={handleCreateOrg} disabled={!orgForm.name.trim() || !orgForm.login.trim() || !orgForm.password.trim()}>Создать</SaveButton>
            </ModalFooter>
          </StyledModalContainer>
        </Fade>
      </Modal>

      {/* ===================== МОДАЛКА: Редактировать организацию ===================== */}
      <Modal open={editOrgModal} onClose={() => setEditOrgModal(false)} closeAfterTransition>
        <Fade in={editOrgModal}>
          <StyledModalContainer>
            <ModalHeader>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18 }}>Редактирование организации</Typography>
              <IconButton onClick={() => setEditOrgModal(false)} size="small" sx={{ color: '#87879b' }}><CloseIcon fontSize="small" /></IconButton>
            </ModalHeader>
            <ModalBody>
              <StyledTextField fullWidth label="Название *" value={editOrgForm.name} onChange={(e) => setEditOrgForm(p => ({ ...p, name: e.target.value }))} />
              <TwoCol>
                <HalfCol><StyledTextField fullWidth label="ИНН" value={editOrgForm.inn} onChange={(e) => setEditOrgForm(p => ({ ...p, inn: e.target.value }))} /></HalfCol>
                <HalfCol><StyledTextField fullWidth label="КПП" value={editOrgForm.kpp} onChange={(e) => setEditOrgForm(p => ({ ...p, kpp: e.target.value }))} /></HalfCol>
              </TwoCol>
              <FullCol><StyledTextField fullWidth label="Адрес" value={editOrgForm.address} onChange={(e) => setEditOrgForm(p => ({ ...p, address: e.target.value }))} /></FullCol>
              <TwoCol>
                <HalfCol><StyledTextField fullWidth label="Контактное лицо" value={editOrgForm.contact_person} onChange={(e) => setEditOrgForm(p => ({ ...p, contact_person: e.target.value }))} /></HalfCol>
                <HalfCol><StyledTextField fullWidth label="Email" value={editOrgForm.contact_email} onChange={(e) => setEditOrgForm(p => ({ ...p, contact_email: e.target.value }))} /></HalfCol>
              </TwoCol>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 0 }}>
                <input type="checkbox" checked={editOrgForm.is_active} onChange={(e) => setEditOrgForm(p => ({ ...p, is_active: e.target.checked }))} id="isActive" />
                <label htmlFor="isActive" style={{ fontFamily: 'Lato', fontSize: 14 }}>Организация активна</label>
              </Box>
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => setEditOrgModal(false)}>Отмена</CancelButton>
              <SaveButton onClick={handleUpdateOrg}>Сохранить</SaveButton>
            </ModalFooter>
          </StyledModalContainer>
        </Fade>
      </Modal>

      {/* ===================== МОДАЛКА: Учётные данные ===================== */}
      <Modal open={editCredsModal} onClose={() => setEditCredsModal(false)} closeAfterTransition>
        <Fade in={editCredsModal}>
          <StyledModalContainer>
            <ModalHeader>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18 }}>Учётные данные</Typography>
              <IconButton onClick={() => setEditCredsModal(false)} size="small" sx={{ color: '#87879b' }}><CloseIcon fontSize="small" /></IconButton>
            </ModalHeader>
            <ModalBody>
              <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b', mb: 2 }}>
                Организация: <strong>{selectedOrg?.name}</strong>
              </Typography>
              <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#87879b', mb: 2 }}>
                Изменения применяются к учётной записи администратора организации, под которой выполняется вход в систему.
              </Typography>
              <StyledTextField fullWidth label="Логин администратора *" value={credsForm.login} onChange={(e) => setCredsForm(p => ({ ...p, login: e.target.value }))} />
              <StyledTextField fullWidth label="Новый пароль" type="password" value={credsForm.password} onChange={(e) => setCredsForm(p => ({ ...p, password: e.target.value }))}
                helperText={credsForm.password ? 'Оставьте пустым, если не хотите менять пароль' : ''} />
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => setEditCredsModal(false)}>Отмена</CancelButton>
              <SaveButton onClick={handleUpdateCredentials} disabled={!credsForm.login.trim()}>Сохранить</SaveButton>
            </ModalFooter>
          </StyledModalContainer>
        </Fade>
      </Modal>

      {/* ===================== МОДАЛКА: Просмотр обращения ===================== */}
      <Modal open={appealCardOpen} onClose={() => setAppealCardOpen(false)} closeAfterTransition>
        <Fade in={appealCardOpen}>
          <Paper elevation={8} sx={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '92%', maxWidth: '900px', maxHeight: '88vh', borderRadius: '16px',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <Box sx={{ p: '16px 26px', borderBottom: '1px solid #eaebf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 17, color: '#101025' }}>
                {appealCard
                  ? `${appealCard.applicant_type === 'organization' ? 'Обращение организации' : 'Обращение физлица'} № ${appealCard.reg_number || appealCard.system_number}`
                  : 'Загрузка…'}
              </Typography>
              <IconButton onClick={() => setAppealCardOpen(false)} size="small" sx={{ color: '#87879b' }}>✕</IconButton>
            </Box>

            {!appealCard ? (
              <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box>
            ) : (
              <Box sx={{ overflowY: 'auto', p: 3 }}>
                {/* Реквизиты */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
                  {[
                    ['Системный номер', appealCard.system_number],
                    ['Регистрационный номер', appealCard.reg_number || 'Не зарегистрировано'],
                    ['Организация-адресат', appealCard.org_name],
                    ['Дата поступления', new Date(appealCard.created_at).toLocaleDateString('ru-RU')],
                    ['Статус', appealCard.status === 'new' ? 'Новое' : appealCard.status === 'registered' ? 'Зарегистрировано'
                      : appealCard.status === 'on_execution' ? 'На исполнении' : appealCard.status === 'answered' ? 'Ответ направлен' : 'Перенаправлено'],
                    ['Тема', appealCard.kind === 'complaint' ? 'Жалоба' : appealCard.kind === 'suggestion' ? 'Предложение' : 'Заявление'],
                    ...(appealCard.is_redirected_in ? [['Кратность поступления', `Перенаправлено из «${appealCard.redirect_from_org_name}»`]] : []),
                  ].map(([label, value]: any) => (
                    <Box key={label as string}>
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 11, color: '#87879b' }}>{label}</Typography>
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 13.5, fontWeight: 600, color: '#101025', wordBreak: 'break-word' }}>
                        {value as string}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                <Divider sx={{ my: 2.5 }} />

                <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b' }}>Содержание обращения</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, borderRadius: '8px', bgcolor: '#fafafa', maxHeight: 180, overflowY: 'auto' }}>
                  <Typography sx={{ fontFamily: 'Lato', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-line', color: '#3a3a52' }}>
                    {appealCard.content}
                  </Typography>
                </Paper>

                <Divider sx={{ my: 2.5 }} />

                {/* Заявитель */}
                <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b', mb: 1 }}>
                  Заявитель{appealCard.applicant_type === 'organization' && appealCard.org_full_name ? ` — ${appealCard.org_full_name}` : ''}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2 }}>
                  {[
                    ['ФИО', [appealCard.applicant_name, appealCard.middle_name].filter(Boolean).join(' ')],
                    ['Эл. почта', appealCard.email],
                    ['Телефон', appealCard.phone || '—'],
                    ...(appealCard.applicant_type === 'organization' ? [
                      ['ФИО руководителя', appealCard.org_director || '—'],
                      ['Организация (кратко)', appealCard.org_short_name || '—'],
                    ] : []),
                  ].map(([label, value]: any) => (
                    <Box key={label}>
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 11, color: '#87879b' }}>{label}</Typography>
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 13.5, fontWeight: 600, color: '#101025', wordBreak: 'break-word' }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {appealCard.internal_comment && (
                  <>
                    <Divider sx={{ my: 2.5 }} />
                    <Alert severity="info" sx={{ borderRadius: '8px', fontFamily: 'Lato', fontSize: 13 }}>
                      Внутренний комментарий: {appealCard.internal_comment}
                    </Alert>
                  </>
                )}

                {appealCard.reply_text && (
                  <>
                    <Divider sx={{ my: 2.5 }} />
                    <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b' }}>Направленный ответ</Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, borderRadius: '8px', bgcolor: '#f1f8e9', maxHeight: 160, overflowY: 'auto' }}>
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 13.5, whiteSpace: 'pre-line' }}>{appealCard.reply_text}</Typography>
                    </Paper>
                  </>
                )}

                <Divider sx={{ my: 2.5 }} />

                {/* Вложения */}
                <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b', mb: 1 }}>
                  Вложения ({appealCard.attachments.length})
                </Typography>
                {appealCard.attachments.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2.5 }}>
                    {appealCard.attachments.map((at: any) => (
                      <Paper key={at.id} variant="outlined" sx={{ p: 1.25, px: 2, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <DescriptionIcon sx={{ color: '#e53935' }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontFamily: 'Lato', fontSize: 13.5, wordBreak: 'break-all' }}>{at.file_name}</Typography>
                          <Typography sx={{ fontFamily: 'Lato', fontSize: 11.5, color: '#87879b' }}>
                            {(at.file_size / 1024).toFixed(1)} КБ
                          </Typography>
                        </Box>
                        <IconButton size="small" onClick={() => window.open(adminApi.downloadAppealAttachment(at.id), '_blank')} sx={{ color: '#4c6ef5' }}>
                          <DownloadIcon />
                        </IconButton>
                      </Paper>
                    ))}
                  </Box>
                )}

                {/* Журнал */}
                <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b', mb: 1 }}>
                  История ({appealCard.history.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  {appealCard.history.map((h: any) => (
                    <Box key={h.id} sx={{ display: 'flex', gap: 1.5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4c6ef5', mt: '6px', flexShrink: 0 }} />
                      <Box>
                        <Typography sx={{ fontFamily: 'Lato', fontSize: 13 }}>{h.action}</Typography>
                        <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b' }}>
                          {h.employee_name} · {new Date(h.created_at).toLocaleString('ru-RU')}
                          {h.comment ? ` · ${h.comment}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        </Fade>
      </Modal>

      {/* ===================== МОДАЛКА: Генерация лицензий ===================== */}
      <Modal open={generateLicModal} onClose={() => setGenerateLicModal(false)} closeAfterTransition>
        <Fade in={generateLicModal}>
          <StyledModalContainer>
            <ModalHeader>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18 }}>Генерация лицензий</Typography>
              <IconButton onClick={() => setGenerateLicModal(false)} size="small" sx={{ color: '#87879b' }}><CloseIcon fontSize="small" /></IconButton>
            </ModalHeader>
            <ModalBody>
              <TwoCol>
                <HalfCol>
                  <StyledTextField fullWidth label="Количество" type="number"
                    slotProps={{ input: { inputProps: { min: 1, max: 100, type: 'number' } } }}
                    value={licForm.count} onChange={(e) => setLicForm(p => ({ ...p, count: parseInt(e.target.value) || 1 }))} />
                </HalfCol>
                <HalfCol>
                  <StyledTextField fullWidth label="Срок (дней)" type="number"
                    slotProps={{ input: { inputProps: { min: 1, type: 'number' } } }}
                    value={licForm.duration_days} onChange={(e) => setLicForm(p => ({ ...p, duration_days: parseInt(e.target.value) || 180 }))} />
                </HalfCol>
              </TwoCol>
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => setGenerateLicModal(false)}>Отмена</CancelButton>
              <SaveButton onClick={handleGenerateLicenses} disabled={generating}>
                {generating ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Сгенерировать'}
              </SaveButton>
            </ModalFooter>
          </StyledModalContainer>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: Подтверждение ===================== */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18, pb: 1 }}>
          {deleteDialog?.type === 'org' ? 'Деактивировать организацию?' : 'Удалить лицензию?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#555' }}>
            {deleteDialog?.type === 'org'
              ? `Организация "${deleteDialog?.name}" будет деактивирована. Пользователи не смогут войти.`
              : 'Неактивированная лицензия будет удалена без возможности восстановления.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteDialog(null)} sx={{ fontFamily: 'Lato' }}>Отмена</Button>
          <Button onClick={() => deleteDialog?.type === 'org' ? handleDeactivateOrg() : handleDeleteLicense()}
            sx={{ fontFamily: 'Lato', backgroundColor: '#e53935', color: 'white', '&:hover': { backgroundColor: '#c62828' } }}>
            {deleteDialog?.type === 'org' ? 'Деактивировать' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================== МОДАЛКА: Загрузка штампа ===================== */}
      <Modal open={stampModalOpen} onClose={() => setStampModalOpen(false)} closeAfterTransition>
        <Fade in={stampModalOpen}>
          <StyledModalContainer>
            <ModalHeader>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18 }}>Загрузка штампа для подписанта</Typography>
              <IconButton onClick={() => setStampModalOpen(false)} size="small" sx={{ color: '#87879b' }}><CloseIcon fontSize="small" /></IconButton>
            </ModalHeader>
            <ModalBody>
              <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b', mb: 2 }}>
                Укажите ключевое слово (фамилию) подписанта и загрузите изображение штампа (PNG/JPG).
                При совпадении фамилии подписанта с ключевым словом будет использоваться этот штамп.
              </Typography>
              <StyledTextField
                fullWidth
                label="Ключевое слово (фамилия) *"
                value={stampForm.signerKeyword}
                onChange={(e) => setStampForm(p => ({ ...p, signerKeyword: e.target.value }))}
                placeholder="Например: плахов"
              />
              <Box sx={{ mt: 2 }}>
                <input
                  type="file"
                  id="stamp-file"
                  accept=".png,.jpg,.jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setStampForm(p => ({ ...p, file: e.target.files![0] }));
                    }
                  }}
                />
                <Box
                  onClick={() => document.getElementById('stamp-file')?.click()}
                  sx={{
                    border: '2px dashed #d6d6df',
                    borderRadius: '8px',
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#fafafa',
                    '&:hover': { borderColor: '#7950f2', backgroundColor: '#f8f7ff' },
                  }}
                >
                  {stampForm.file ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                      <Box
                        component="img"
                        src={URL.createObjectURL(stampForm.file)}
                        alt="preview"
                        sx={{ width: 80, height: 44, objectFit: 'contain', border: '1px solid #eaebf0', borderRadius: '4px' }}
                      />
                      <Box>
                        <Typography sx={{ fontFamily: 'Lato', fontSize: 14, fontWeight: 500 }}>{stampForm.file.name}</Typography>
                        <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#87879b' }}>{(stampForm.file.size / 1024).toFixed(1)} КБ</Typography>
                      </Box>
                    </Box>
                  ) : (
                    <>
                      <ImageIcon sx={{ fontSize: 36, color: '#b0b3c3', mb: 1 }} />
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b' }}>
                        Перетащите файл или <span style={{ color: '#7950f2' }}>выберите изображение</span>
                      </Typography>
                      <Typography sx={{ fontFamily: 'Lato', fontSize: 12, color: '#b0b3c3', mt: 0.5 }}>PNG или JPG</Typography>
                    </>
                  )}
                </Box>
              </Box>
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => setStampModalOpen(false)}>Отмена</CancelButton>
              <SaveButton
                onClick={handleUploadStamp}
                disabled={!stampForm.signerKeyword.trim() || !stampForm.file || stampUploading}
              >
                {stampUploading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Загрузить'}
              </SaveButton>
            </ModalFooter>
          </StyledModalContainer>
        </Fade>
      </Modal>

      {/* ===================== ДИАЛОГ: Удаление штампа ===================== */}
      <Dialog open={stampDeleteDialog !== null} onClose={() => setStampDeleteDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 18, pb: 1 }}>Удалить штамп?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#555' }}>
            Маппинг штампа будет удалён. Файл изображения также будет удалён.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setStampDeleteDialog(null)} sx={{ fontFamily: 'Lato' }}>Отмена</Button>
          <Button onClick={handleDeleteStamp}
            sx={{ fontFamily: 'Lato', backgroundColor: '#e53935', color: 'white', '&:hover': { backgroundColor: '#c62828' } }}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default AdminPage;
