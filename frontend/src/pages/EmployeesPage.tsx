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
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  InputAdornment as MuiInputAdornment,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  FileCopy as CopyIcon,
  PersonAdd as PersonAddIcon,
  Badge as BadgeIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  VpnKey as VpnKeyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  AutoFixHigh as AutoFixHighIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  type Employee,
} from '../api/edoApi';
import { getApiErrorMessage } from '../api/edoApi';

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
  padding: '28px 28px 20px',
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  gap: '32px',
});

const ModalFooter = styled(Box)({
  padding: '16px 28px',
  borderTop: '1px solid #eaebf0',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  backgroundColor: '#fafafa',
  flexShrink: 0,
});

const AvatarSection = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  paddingTop: '8px',
  flexShrink: 0,
  width: '100px',
});

const StyledAvatar = styled(Avatar)({
  width: '96px',
  height: '96px',
  backgroundColor: '#f4f4f8',
  border: '2px solid #eaebf0',
  '& svg': {
    fontSize: '48px',
    color: '#b0b3c3',
  },
});

const FieldsSection = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const FieldRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  padding: '6px 0',
  minHeight: '48px',
  borderBottom: '1px solid #f4f4f8',
  '&:last-child': {
    borderBottom: 'none',
  },
});

const FieldLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  color: '#87879b',
  fontWeight: 500,
  width: '130px',
  flexShrink: 0,
});

const FieldValue = styled(Box)({
  flex: 1,
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '6px',
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
    fontSize: '13px',
    color: '#87879b',
    transition: 'all 0.2s ease',
    '&.Mui-focused': {
      color: '#4c6ef5',
    },
  },
  '& .MuiInputBase-input': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '13px',
    padding: '10px 14px',
  },
});

const CancelButton = styled(Button)({
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 500,
  color: '#87879b',
  padding: '6px 20px',
  borderRadius: '6px',
  fontSize: '13px',
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
  padding: '6px 28px',
  borderRadius: '6px',
  fontSize: '13px',
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

const categoryColors: Record<string, string> = {
  admin: '#f3e5f5',
  manager: '#e3f2fd',
  clerk: '#fff3e0',
  basic: '#f1f8e9',
};

// Маппинг конкретных ролей → вид пользователя
// Базовые роли (archive_access, document_initiator и т.д.) — дефолтный набор, не отображаются
const ROLE_TYPE_MAP: Record<string, { label: string; category: string }> = {
  // Администратор
  'org_admin': { label: 'Администратор', category: 'admin' },
  'user_substitution_editor': { label: 'Администратор', category: 'admin' },
  // Делопроизводитель
  'clerk': { label: 'Делопроизводитель', category: 'clerk' },
  'archivist': { label: 'Делопроизводитель', category: 'clerk' },
  'citizen_appeals_registrar': { label: 'Делопроизводитель', category: 'clerk' },
  'dictionary_editor': { label: 'Делопроизводитель', category: 'clerk' },
  // Руководитель
  'department_head': { label: 'Руководитель', category: 'manager' },
  'final_approver': { label: 'Руководитель', category: 'manager' },
  // Исполнитель
  'task_executor': { label: 'Исполнитель', category: 'basic' },
  'co_executor': { label: 'Исполнитель', category: 'basic' },
  'controller': { label: 'Исполнитель', category: 'basic' },
  'observer': { label: 'Исполнитель', category: 'basic' },
  'approver': { label: 'Исполнитель', category: 'basic' },
};

// Базовые роли — получает каждый пользователь
const BASE_ROLES = [
  'archive_access',
  'document_initiator',
  'task_initiator',
  'doc_review',
  'citizen_appeals',
  'task_creator',
  'recurring_task_creator',
];

// Роли по видам пользователя
const USER_TYPE_ROLES: Record<string, string[]> = {
  admin: ['org_admin', 'user_substitution_editor'],
  clerk: ['clerk', 'archivist', 'citizen_appeals_registrar', 'dictionary_editor'],
  manager: ['department_head', 'final_approver'],
  executor: ['task_executor', 'co_executor', 'controller', 'observer', 'approver'],
};

const USER_TYPE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  clerk: 'Делопроизводитель',
  manager: 'Руководитель',
  executor: 'Исполнитель',
};

// Определяет вид пользователя по списку ролей
const detectUserRole = (empRoles: string[]): string => {
  if (empRoles.some(r => r === 'org_admin' || r === 'user_substitution_editor')) return 'admin';
  if (empRoles.some(r => r === 'clerk' || r === 'archivist' || r === 'citizen_appeals_registrar' || r === 'dictionary_editor')) return 'clerk';
  if (empRoles.some(r => r === 'department_head' || r === 'final_approver')) return 'manager';
  if (empRoles.some(r => r === 'task_executor' || r === 'co_executor' || r === 'controller' || r === 'observer' || r === 'approver')) return 'executor';
  return 'executor'; // по умолчанию — исполнитель (только базовые роли)
};

// Собирает все роли для выбранного вида
const getRolesForUserType = (userType: string): string[] => {
  return [...BASE_ROLES, ...(USER_TYPE_ROLES[userType] || [])];
};

const getFullName = (emp: Employee) => {
  return [emp.last_name, emp.first_name, emp.middle_name].filter(Boolean).join(' ');
};

const getInitials = (emp: Employee) => {
  return ((emp.first_name?.[0] || '') + (emp.last_name?.[0] || '')).toUpperCase();
};

// ===== ФУНКЦИИ ГЕНЕРАЦИИ =====
const transliterate = (text: string): string => {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  
  return text.toLowerCase().split('').map(char => map[char] || char).join('');
};

const generateLogin = (lastName: string, firstName: string, middleName: string): string => {
  const last = transliterate(lastName).replace(/[^a-z]/g, '');
  const first = transliterate(firstName).replace(/[^a-z]/g, '');
  const middle = transliterate(middleName).replace(/[^a-z]/g, '');
  
  if (last && first) {
    // Формат: ivanov.ii (фамилия + инициалы)
    const initials = first[0] + (middle ? middle[0] : '');
    return `${last}.${initials}`;
  } else if (last) {
    return last;
  } else if (first) {
    return first;
  }
  return '';
};

const generatePassword = (length: number = 12): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%&*?';
  
  const all = upper + lower + numbers + special;
  let password = '';
  
  // Гарантируем минимум по одному символу каждого типа
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Заполняем остальное
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  // Перемешиваем
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// ===== КОМПОНЕНТ =====
const EmployeesPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuEmployee, setRowMenuEmployee] = useState<Employee | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'login' | 'password' | null>(null);

  const [formData, setFormData] = useState<{
    last_name: string;
    first_name: string;
    middle_name: string;
    position: string;
    department: string;
    phone: string;
    email: string;
    birthday: Dayjs | null;
    notes: string;
    login: string;
    password: string;
    userRole: string;
  }>({
    last_name: '',
    first_name: '',
    middle_name: '',
    position: '',
    department: '',
    phone: '',
    email: '',
    birthday: null,
    notes: '',
    login: '',
    password: '',
    userRole: 'executor',
  });

  // Загружаем сотрудников
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEmployees(page, pageSize, debouncedSearch || undefined);
      startTransition(() => {
        setEmployees(res.items);
        setTotal(res.total);
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки сотрудников'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Дебаунс поиска: запрос уходит через 400 мс после окончания ввода
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // При изменении поискового запроса возвращаемся на первую страницу
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Автогенерация логина при вводе ФИО
  useEffect(() => {
    if (!editEmployee && formData.last_name && formData.first_name) {
      const login = generateLogin(formData.last_name, formData.first_name, formData.middle_name);
      setFormData(prev => ({ ...prev, login }));
    }
  }, [formData.last_name, formData.first_name, formData.middle_name, editEmployee]);

  const handleOpenModal = (employee?: Employee) => {
    if (employee) {
      setEditEmployee(employee);
      setFormData({
        last_name: employee.last_name || '',
        first_name: employee.first_name || '',
        middle_name: employee.middle_name || '',
        position: employee.position || '',
        department: employee.department || '',
        phone: employee.phone || '',
        email: employee.email || '',
        birthday: employee.birthday ? dayjs(employee.birthday) : null,
        notes: employee.notes || '',
        login: employee.login || '',
        password: '',
        userRole: detectUserRole(employee.roles || []),
      });
    } else {
      setEditEmployee(null);
      setFormData({
        last_name: '',
        first_name: '',
        middle_name: '',
        position: '',
        department: '',
        phone: '',
        email: '',
        birthday: null,
        notes: '',
        login: '',
        password: generatePassword(),
        userRole: 'admin',
      });
    }
    setGeneratedPassword('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditEmployee(null);
    setGeneratedPassword('');
    setShowPassword(false);
  };

  const handleFormChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    setFormData(prev => ({ ...prev, password: newPassword }));
    setShowPassword(true);
  };

  const handleCopyToClipboard = (text: string, field: 'login' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    if (!formData.last_name.trim() || !formData.first_name.trim()) {
      setError('Фамилия и имя обязательны');
      return;
    }
    if (!formData.login.trim()) {
      setError('Логин обязателен');
      return;
    }
    if (!editEmployee && !formData.password.trim()) {
      setError('Пароль обязателен');
      return;
    }
    
    setSaving(true);
    try {
      const data = {
        last_name: formData.last_name,
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        position: formData.position || undefined,
        department: formData.department || undefined,
        roles: getRolesForUserType(formData.userRole),
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        birthday: formData.birthday ? formData.birthday.format('YYYY-MM-DD') : undefined,
        notes: formData.notes || undefined,
        login: formData.login,
        password: formData.password || undefined,
      };

      if (editEmployee) {
        await updateEmployee(editEmployee.uuid, data);
        setSuccess('Сотрудник обновлён');
      } else {
        const result = await createEmployee(data);
        if (result.generated_password) {
          setGeneratedPassword(result.generated_password);
          setShowPassword(true);
        }
        setSuccess('Сотрудник создан');
      }
      setIsModalOpen(false);
      await loadEmployees();
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
        await deactivateEmployee(uuid);
      }
      setSelectedEmployees([]);
      setSuccess(deleteTarget.length === 1 ? 'Сотрудник деактивирован' : `Деактивировано ${deleteTarget.length} сотрудников`);
      await loadEmployees();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка деактивации'));
    }
  };

  const handleSelectAll = () => {
    const allIds = employees.filter(e => e.is_active).map(e => e.uuid);
    if (selectedEmployees.length === allIds.length && allIds.length > 0) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(allIds);
    }
  };

  const isAllSelected = employees.filter(e => e.is_active).length > 0 && 
    selectedEmployees.length === employees.filter(e => e.is_active).length;

  if (loading && employees.length === 0) {
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
        Сотрудники
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
            <ToolbarButton size="small" onClick={loadEmployees}>
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
            <ToolbarButton size="small" disabled={selectedEmployees.length !== 1}
              onClick={() => {
                const emp = employees.find(x => x.uuid === selectedEmployees[0]);
                if (emp) handleOpenModal(emp);
              }}>
              <EditIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Деактивировать">
            <ToolbarButton size="small" disabled={selectedEmployees.length === 0}
              onClick={() => { setDeleteTarget(selectedEmployees); setIsDeleteModalOpen(true); }}>
              <DeleteIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <SearchField
            placeholder="Поиск по ФИО, логину или email..."
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
            sx={{ width: '280px' }}
          />
        </ToolbarLeft>
        <ToolbarRight>
          <StyledChip label={`Всего: ${total}`} size="small" />
        </ToolbarRight>
      </ToolbarContainer>

      {/* Список */}
      <Fade in={!isPending} timeout={300}>
        <Box>
          {employees.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon><PersonAddIcon /></EmptyStateIcon>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '18px', color: '#101025', mb: 1 }}>
                Список сотрудников пуст
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#87879b', fontSize: '14px', mb: 3 }}>
                Добавьте сотрудника, чтобы начать работу
              </Typography>
              <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => handleOpenModal()}
                sx={{ backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato, sans-serif', fontWeight: 600, padding: '10px 24px', '&:hover': { backgroundColor: '#364fc7' } }}>
                Добавить сотрудника
              </Button>
            </EmptyStateContainer>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        sx={{ color: '#b0b3c3' }}
                      />
                    </TableCell>
                    <TableCell>Сотрудник</TableCell>
                    <TableCell>Логин</TableCell>
                    <TableCell>Должность</TableCell>
                    <TableCell>Роли</TableCell>
                    <TableCell>Контакты</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map((emp) => {
                    const isSelected = selectedEmployees.includes(emp.uuid);
                    return (
                      <TableRow 
                        key={emp.uuid} 
                        hover 
                        selected={isSelected}
                        sx={{ 
                          '&:hover': { backgroundColor: '#f9fafe' },
                          opacity: !emp.is_active ? 0.6 : 1,
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            disabled={!emp.is_active}
                            onChange={() => {
                              setSelectedEmployees(prev =>
                                prev.includes(emp.uuid)
                                  ? prev.filter(id => id !== emp.uuid)
                                  : [...prev, emp.uuid]
                              );
                            }}
                            sx={{ color: '#b0b3c3' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar sx={{ width: 36, height: 36, backgroundColor: '#4c6ef5', fontSize: '14px', fontWeight: 600 }}>
                              {getInitials(emp)}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500, color: '#101025' }}>
                                {getFullName(emp)}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                            @{emp.login}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                            {emp.position || '—'}
                          </Typography>
                          {emp.department && (
                            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                              {emp.department}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {(() => {
                              const seen = new Set<string>();
                              return emp.roles
                                .map((roleValue) => ROLE_TYPE_MAP[roleValue])
                                .filter((rt): rt is typeof rt & { label: string; category: string } => !!rt && !seen.has(rt.label) && (seen.add(rt.label), true))
                                .map((rt) => (
                                  <Chip
                                    key={rt.label}
                                    label={rt.label}
                                    size="small"
                                    sx={{
                                      fontSize: '10px',
                                      height: 20,
                                      backgroundColor: categoryColors[rt.category] || '#f4f4f8',
                                      color: '#101025',
                                      fontWeight: 500,
                                    }}
                                  />
                                ));
                            })()}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {emp.phone && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <PhoneIcon sx={{ fontSize: '14px' }} /> {emp.phone}
                              </Typography>
                            )}
                            {emp.email && (
                              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <EmailIcon sx={{ fontSize: '14px' }} /> {emp.email}
                              </Typography>
                            )}
                            {!emp.phone && !emp.email && '—'}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <StatusChip
                            label={emp.is_active ? 'Активен' : 'Деактивирован'}
                            size="small"
                            active={emp.is_active}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Ещё">
                            <IconButton size="small" sx={{ color: '#87879b' }} onClick={(e) => {
                              e.stopPropagation();
                              setRowMenuAnchor(e.currentTarget);
                              setRowMenuEmployee(emp);
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
        onClose={() => { setRowMenuAnchor(null); setRowMenuEmployee(null); }}
      >
        <MenuItem onClick={() => { 
          if (rowMenuEmployee) handleOpenModal(rowMenuEmployee); 
          setRowMenuAnchor(null); 
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Редактировать</ListItemText>
        </MenuItem>
        {rowMenuEmployee?.is_active && (
          <MenuItem onClick={() => {
            if (rowMenuEmployee) { 
              setDeleteTarget([rowMenuEmployee.uuid]); 
              setIsDeleteModalOpen(true); 
            }
            setRowMenuAnchor(null);
          }}>
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Деактивировать</ListItemText>
          </MenuItem>
        )}
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
                Деактивировать сотрудника(ов)?
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                Будет деактивировано: {deleteTarget.length}
              </Typography>
            </Box>
            <Box sx={{ p: 2, backgroundColor: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setIsDeleteModalOpen(false)} sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, color: '#87879b', '&:hover': { backgroundColor: '#f4f4f8' } }}>Отмена</Button>
              <Button onClick={handleDelete} sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', fontWeight: 600, backgroundColor: '#e53935', color: '#ffffff', borderRadius: '8px', '&:hover': { backgroundColor: '#c62828' } }}>Деактивировать</Button>
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
                {editEmployee ? 'Редактирование сотрудника' : 'Добавление сотрудника'}
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
                  ) : (
                    <PersonIcon />
                  )}
                </StyledAvatar>
              </AvatarSection>
              
              <FieldsSection>
                <FieldRow>
                  <FieldLabel>Фамилия *</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="Введите фамилию" value={formData.last_name} onChange={handleFormChange('last_name')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>Имя *</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="Введите имя" value={formData.first_name} onChange={handleFormChange('first_name')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>Отчество</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="Введите отчество" value={formData.middle_name} onChange={handleFormChange('middle_name')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                {!editEmployee && (
                  <>
                    <FieldRow>
                      <FieldLabel>Логин *</FieldLabel>
                      <FieldValue>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <StyledTextField 
                            fullWidth 
                            placeholder="Автогенерация из ФИО" 
                            value={formData.login} 
                            onChange={handleFormChange('login')} 
                            size="small"
                            slotProps={{
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <BadgeIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                                  </InputAdornment>
                                ),
                                endAdornment: formData.login && (
                                  <InputAdornment position="end">
                                    <Tooltip title={copiedField === 'login' ? 'Скопировано!' : 'Копировать'}>
                                      <IconButton size="small" onClick={() => handleCopyToClipboard(formData.login, 'login')}>
                                        <ContentCopyIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </InputAdornment>
                                ),
                              },
                            }}
                          />
                        </Box>
                      </FieldValue>
                    </FieldRow>
                    
                    <FieldRow>
                      <FieldLabel>Пароль *</FieldLabel>
                      <FieldValue>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <StyledTextField 
                            fullWidth 
                            placeholder="Сгенерируйте пароль" 
                            value={formData.password} 
                            onChange={handleFormChange('password')} 
                            size="small"
                            type={showPassword ? 'text' : 'password'}
                            slotProps={{
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <VpnKeyIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                                  </InputAdornment>
                                ),
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <Tooltip title={showPassword ? 'Скрыть' : 'Показать'}>
                                      <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Сгенерировать">
                                      <IconButton size="small" onClick={handleGeneratePassword}>
                                        <AutoFixHighIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title={copiedField === 'password' ? 'Скопировано!' : 'Копировать'}>
                                      <IconButton size="small" onClick={() => handleCopyToClipboard(formData.password, 'password')}>
                                        <ContentCopyIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </InputAdornment>
                                ),
                              },
                            }}
                          />
                        </Box>
                      </FieldValue>
                    </FieldRow>
                  </>
                )}
                
                <FieldRow>
                  <FieldLabel>Должность</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="Должность" value={formData.position} onChange={handleFormChange('position')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>Подразделение</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="Название подразделения" value={formData.department} onChange={handleFormChange('department')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>Телефон</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="+7 (___) ___-__-__" value={formData.phone} onChange={handleFormChange('phone')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>E-mail</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth placeholder="email@example.ru" value={formData.email} onChange={handleFormChange('email')} size="small" />
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>День рождения</FieldLabel>
                  <FieldValue>
                    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ru">
                      <DatePicker
                        value={formData.birthday}
                        onChange={(date: Dayjs | null) => setFormData(prev => ({ ...prev, birthday: date }))}
                        format="DD.MM.YYYY"
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            size: 'small' as const,
                            sx: {
                              '& .MuiOutlinedInput-root': { borderRadius: '8px' },
                            },
                          },
                        }}
                      />
                    </LocalizationProvider>
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>Роль</FieldLabel>
                  <FieldValue>
                    <FormControl fullWidth size="small">
                      <InputLabel sx={{ fontFamily: 'Lato, sans-serif' }}>Роль в системе</InputLabel>
                      <Select
                        value={formData.userRole}
                        onChange={(e) => setFormData(prev => ({ ...prev, userRole: e.target.value }))}
                        label="Роль в системе"
                        sx={{ borderRadius: '6px', fontFamily: 'Lato, sans-serif' }}
                      >
                        {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '11px', color: '#87879b', mt: 0.5 }}>
                      Базовые права (архив, инициаторы, согласование) — у всех сотрудников
                    </Typography>
                  </FieldValue>
                </FieldRow>
                
                <FieldRow>
                  <FieldLabel>Заметки</FieldLabel>
                  <FieldValue>
                    <StyledTextField fullWidth multiline rows={2} placeholder="Дополнительная информация" value={formData.notes} onChange={handleFormChange('notes')} size="small" />
                  </FieldValue>
                </FieldRow>
              </FieldsSection>
            </ModalBody>
            
            <ModalFooter>
              <CancelButton onClick={handleCloseModal}>Отменить</CancelButton>
              <SaveButton 
                onClick={handleSave} 
                disabled={saving || !formData.last_name.trim() || !formData.first_name.trim() || (!editEmployee && (!formData.login.trim() || !formData.password.trim()))}
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

export default EmployeesPage;