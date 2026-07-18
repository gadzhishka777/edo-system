import React, { useState, useEffect, useCallback, useTransition, useRef, useMemo } from 'react';
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
  Tabs,
  Tab,
  Stack,
  CircularProgress,
  Alert,
  Snackbar,
  Fade,
  Modal,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  FormHelperText,
  Stepper,
  Step,
  StepLabel,
  Radio,
  RadioGroup,
  Card,
  CardContent,
  FormControlLabel,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import {
  CloudUpload as CloudUploadIcon,
  OpenInNew as OpenIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  Folder as FolderIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  FilePresent as FileIcon,
  UploadFile as UploadFileIcon,
  PictureAsPdf as PdfIcon,
  Visibility as VisibilityIcon,
  Description as DescriptionIcon,
  Refresh as RefreshIcon,
  Verified as VerifiedIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  FileCopy as FileCopyIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Group as GroupIcon,
  VpnKey as VpnKeyIcon,
  CenterFocusStrong as CenterFocusStrongIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Edit as EditIcon,
  Warning as WarningIcon,
  Archive as ArchiveIcon,
} from '@mui/icons-material';
import {
  getDocuments,
  deleteDocument,
  getFolderCounts,
  downloadArchive,
  downloadSignedCopy,
  FolderType,
  Document,
  uploadDocument,
  uploadSignatureFile,
  verifySignature as verifySignatureApi,
  visualizeSignature,
  updateDocument,
} from '../api/edoApi';
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Настройка worker для PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

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

const UploadButton = styled(Button)({
  backgroundColor: '#4c6ef5',
  color: '#ffffff',
  borderRadius: '8px',
  textTransform: 'none',
  fontFamily: 'Lato, sans-serif',
  fontWeight: 600,
  padding: '10px 24px',
  marginTop: '16px',
  '&:hover': {
    backgroundColor: '#364fc7',
  },
});

// ===== СТАТУСЫ =====
const StatusChip = styled(Chip)<{ status: string }>(({ status }) => {
  const colors: Record<string, { bg: string; color: string }> = {
    signed: { bg: '#e8f5e9', color: '#2e7d32' },
    pending: { bg: '#fff3e0', color: '#e65100' },
    rejected: { bg: '#ffebee', color: '#c62828' },
    draft: { bg: '#f5f5f5', color: '#616161' },
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

const SignatureTypeText = styled(Typography)<{ type: string; valid?: boolean }>(({ type, valid }) => {
  const colors: Record<string, { bg: string; color: string }> = {
    PEP: { bg: '#e3f2fd', color: '#0d47a1' },
    UNEP_valid: { bg: '#e8f5e9', color: '#1b5e20' },
    UNEP_invalid: { bg: '#ffebee', color: '#c62828' },
    UKEP_valid: { bg: '#e8f5e9', color: '#1b5e20' },
    UKEP_invalid: { bg: '#ffebee', color: '#c62828' },
    none: { bg: '#f5f5f5', color: '#9e9e9e' },
  };
  
  let key = type;
  if (type === 'UNEP' || type === 'UKEP') {
    key = valid ? `${type}_valid` : `${type}_invalid`;
  }
  
  const style = colors[key as keyof typeof colors] || colors.none;
  return {
    backgroundColor: style.bg,
    color: style.color,
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'Lato, sans-serif',
  };
});

// ===== ПАПКИ =====
interface FolderTab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const folderTabs: FolderTab[] = [
  { id: 'all', label: 'Все документы', icon: <DescriptionIcon /> },
  { id: 'orders', label: 'Приказы', icon: <FolderIcon /> },
  { id: 'regulations', label: 'Распоряжения', icon: <FolderIcon /> },
  { id: 'provisions', label: 'Положения', icon: <FolderIcon /> },
  { id: 'incoming', label: 'Входящие', icon: <FolderIcon /> },
  { id: 'outgoing', label: 'Исходящие', icon: <FolderIcon /> },
  { id: 'tasks', label: 'Поручения', icon: <FolderIcon /> },
];

// ===== МОДАЛКА ЗАГРУЗКИ (ПОШАГОВАЯ) =====
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

const DropZoneUpload = styled(Box)({
  border: '2px dashed #d6d6df',
  borderRadius: '12px',
  padding: '32px 20px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  backgroundColor: '#fafafa',
  '&:hover': {
    borderColor: '#4c6ef5',
    backgroundColor: '#f9fafe',
  },
  '&.dragging': {
    borderColor: '#4c6ef5',
    backgroundColor: '#f0f5ff',
  },
});

const FileInfoBox = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  backgroundColor: '#f4f4f8',
  borderRadius: '8px',
  marginTop: '12px',
});

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '& fieldset': {
      borderColor: '#d6d6df',
    },
    '&:hover fieldset': {
      borderColor: '#b0b3c3',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#4c6ef5',
      borderWidth: '2px',
    },
  },
  '& .MuiInputLabel-root': {
    fontFamily: 'Lato, sans-serif',
    color: '#87879b',
    '&.Mui-focused': {
      color: '#4c6ef5',
    },
  },
  '& .MuiInputBase-input': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '14px',
  },
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
  '&:hover': {
    backgroundColor: '#364fc7',
  },
  '&:disabled': {
    backgroundColor: '#d6d6df',
    color: '#87879b',
  },
});

const BackButton = styled(StepButton)({
  color: '#87879b',
  '&:hover': {
    backgroundColor: '#f4f4f8',
  },
});

// ===== СТИЛИ ДЛЯ ПРЕДПРОСМОТРА PDF СО ШТАМПОМ =====
const PreviewContainer = styled(Box)({
  position: 'relative',
  border: '1px solid #eaebf0',
  borderRadius: '12px',
  overflow: 'hidden',
  backgroundColor: '#e8e8e8',
  minHeight: '400px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '8px',
  marginTop: '16px',
});

const StampContainer = styled(Box)({
  position: 'absolute',
  top: 0,
  left: 0,
  cursor: 'grab',
  padding: '10px 14px',
  borderRadius: '8px',
  backgroundColor: 'rgba(255, 255, 200, 0.92)',
  border: '2px solid #2e7d32',
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  userSelect: 'none',
  minWidth: '160px',
  zIndex: 10,
  transition: 'box-shadow 0.2s ease',
  transformOrigin: 'top left',
  '&:hover': {
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
  },
  '&:active': {
    cursor: 'grabbing',
  },
});

// ===== ТИПЫ ПОДПИСИ =====
type SignatureType = 'none' | 'PEP' | 'UNEP' | 'UKEP';

const signatureTypes = [
  { value: 'PEP', label: 'ПЭП', description: 'Простая электронная подпись (фото подписи)', disabled: true },
  { value: 'UNEP', label: 'УНЭП (Госключ)', description: 'Усиленная неквалифицированная ЭП через Госключ', disabled: false },
  { value: 'UKEP', label: 'УКЭП (Госключ)', description: 'Усиленная квалифицированная ЭП через Госключ', disabled: false },
];

// ===== МАППИНГ ПОДПИСАНТ → ШТАМП =====
// Фамилия подписанта (в нижнем регистре) → файл штампа в /public/stamps/
const STAMP_BY_SIGNER: Record<string, string> = {
  'плахов': '/stamps/plakhov.png',
  'валеев': '/stamps/valeev.png',
  'солтанов': '/stamps/soltanov.png',
};

const DEFAULT_STAMP_URL = '/stamps/premium-stamp.png';

// Размер штампа по умолчанию — фикс 40%, нельзя менять
const FIXED_STAMP_SIZE = 40;

// Автоподстановка типа документа по выбранной папке
const FOLDER_TO_TYPE: Record<string, string> = {
  orders: 'Приказ по ОО',
  regulations: 'Распоряжение',
  provisions: 'Положение',
  incoming: 'Входящее письмо',
  outgoing: 'Исходящее письмо',
  tasks: 'Поручение',
};

/**
 * Определяет URL штампа по имени подписанта.
 * Ищет фамилию в строке (не зависит от регистра).
 * Если совпадений нет — возвращает штамп по умолчанию.
 */
function resolveStampUrl(signerName: string | undefined | null): string {
  if (!signerName) return DEFAULT_STAMP_URL;
  const lower = signerName.toLowerCase();
  for (const [lastName, stampUrl] of Object.entries(STAMP_BY_SIGNER)) {
    if (lower.includes(lastName)) {
      return stampUrl;
    }
  }
  return DEFAULT_STAMP_URL;
}

// ===== ОСНОВНОЙ КОМПОНЕНТ =====
const DocumentsPage: React.FC = () => {
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<Document | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    type: '',
    folder: 'orders' as FolderType,
    registrationNumber: '',
    date: dayjs().format('YYYY-MM-DD'),
    executor: '',
    familiarized: [] as string[],
  });
  const [editLoading, setEditLoading] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<null | HTMLElement>(null);
  const [rowMenuDoc, setRowMenuDoc] = useState<Document | null>(null);
  
  // ===== СОСТОЯНИЕ ЗАГРУЗКИ =====
  const [activeStep, setActiveStep] = useState(0);
  const [uploadData, setUploadData] = useState({
    signatureType: 'UNEP' as SignatureType,
    pdfFile: null as File | null,
    sigFile: null as File | null,
    folder: 'orders' as FolderType,
    documentType: '',
    name: '',
    registrationNumber: '',
    date: dayjs().format('DD-MM-YYYY'),
    signer: '',
    signerFullName: '',
    signerInn: '',
    executor: '',
    familiarized: [] as string[],
    visualizeStamp: false,
    customStampUrl: '',
    _doc_uuid: '',
  });
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ===== СОСТОЯНИЕ ДЛЯ ПРОВЕРКИ ПОДПИСИ =====
  const [verificationResult, setVerificationResult] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    data: any | null;
    error: string | null;
  }>({ status: 'idle', data: null, error: null });

  // ===== СОСТОЯНИЕ ДЛЯ ПРЕДПРОСМОТРА PDF =====
  const [showStampPreview, setShowStampPreview] = useState(false);
  const [stampSize, setStampSize] = useState(FIXED_STAMP_SIZE);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pdfOriginalSize, setPdfOriginalSize] = useState<{ width: number; height: number } | null>(null);
  const [previewPageWidth, setPreviewPageWidth] = useState<number>(500);
  const previewRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const isDraggingStamp = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const stampPosition = useRef({ x: 100, y: 50 });

  // Размеры штампа в PDF (мм) — должны совпадать с бэкендом
  const STAMP_BASE_WIDTH_MM = 150;
  const STAMP_BASE_HEIGHT_MM = 80;
  const MM_TO_PT = 2.83465;

  // Вычисляем размеры штампа в пикселях превью, чтобы они точно соответствовали PDF
  const previewScale = pdfOriginalSize && previewPageWidth
    ? previewPageWidth / pdfOriginalSize.width
    : 1;
  const stampBaseWidthPx = STAMP_BASE_WIDTH_MM * MM_TO_PT * previewScale;  // ширина при 100%
  const stampBaseHeightPx = STAMP_BASE_HEIGHT_MM * MM_TO_PT * previewScale; // высота при 100%

  // Мемоизированный URL файла — создаётся один раз, чтобы react-pdf не перезагружался
  const pdfFileUrl = useMemo(() => {
    if (uploadData.pdfFile) {
      return URL.createObjectURL(uploadData.pdfFile);
    }
    return null;
  }, [uploadData.pdfFile]);

  // Очищаем URL при размонтировании / смене файла
  useEffect(() => {
    return () => {
      if (pdfFileUrl) {
        URL.revokeObjectURL(pdfFileUrl);
      }
    };
  }, [pdfFileUrl]);

  // Загрузка документов
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const folder = activeFolder === 'all' ? undefined : activeFolder as FolderType;
      const response = await getDocuments(page, pageSize, folder, searchQuery || undefined);
      
      startTransition(() => {
        setDocuments(response.items);
        setTotal(response.total);
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки документов');
    } finally {
      setLoading(false);
    }
  }, [activeFolder, page, pageSize, searchQuery]);

  // Загрузка счётчиков по папкам
  const loadFolderCounts = useCallback(async () => {
    try {
      const counts = await getFolderCounts();
      setFolderCounts(counts);
    } catch {
      // тихо игнорируем — счётчики не критичны
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Обновляем счётчики при загрузке, смене папки и после операций
  useEffect(() => {
    loadFolderCounts();
  }, [loadFolderCounts, activeFolder]);

  // Обновляем счётчики после загрузки документов
  useEffect(() => {
    loadFolderCounts();
  }, [loadDocuments]);

  // ===== ОБРАБОТЧИКИ ДРАГА ШТАМПА =====
  // Позиция трекается относительно pageWrapRef (элемент-обёртка страницы PDF),
  // чтобы координаты пикселей превью точно соответствовали координатам в PDF.
  const handleStampMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pageWrapRef.current || !stampRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    isDraggingStamp.current = true;
    const stampRect = stampRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - stampRect.left,
      y: e.clientY - stampRect.top,
    };
  };

  const handleStampMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingStamp.current || !pageWrapRef.current || !stampRef.current) return;
    e.preventDefault();
    const rect = pageWrapRef.current.getBoundingClientRect();
    const stampW = stampBaseWidthPx * (stampSize / 100);
    const stampH = stampBaseHeightPx * (stampSize / 100);
    const newX = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.current.x, rect.width - stampW));
    const newY = Math.max(0, Math.min(e.clientY - rect.top - dragOffset.current.y, rect.height - stampH));
    stampPosition.current = { x: newX, y: newY };
    updateStampTransform();
  };

  const handleStampMouseUp = () => {
    isDraggingStamp.current = false;
  };

  const updateStampTransform = () => {
    if (stampRef.current) {
      const scale = stampSize / 100;
      stampRef.current.style.transform = `translate(${stampPosition.current.x}px, ${stampPosition.current.y}px) scale(${scale})`;
    }
  };

  const handleStampReset = () => {
    stampPosition.current = { x: 100, y: 50 };
    updateStampTransform();
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  // Получаем оригинальные размеры PDF-страницы (в точках) для точного масштабирования штампа
  const onPageLoadSuccess = (page: any) => {
    setPdfOriginalSize({
      width: page.originalWidth,
      height: page.originalHeight,
    });
  };

  // Отслеживаем ширину контейнера превью для синхронизации с бэкендом
  useEffect(() => {
    if (!showStampPreview) return;
    const updateWidth = () => {
      if (previewRef.current) {
        const newWidth = previewRef.current.clientWidth - 20;
        setPreviewPageWidth(prev => (prev !== newWidth ? newWidth : prev));
      }
    };
    updateWidth();
    // ResizeObserver для отслеживания изменений размера контейнера
    const ro = new ResizeObserver(updateWidth);
    if (previewRef.current) {
      ro.observe(previewRef.current);
    }
    return () => ro.disconnect();
  }, [showStampPreview]);

  const handleSelectAll = () => {
    const allIds = documents.map(d => d.uuid);
    if (selectedDocuments.length === allIds.length && allIds.length > 0) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(allIds);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDeleteSelected = async () => {
    if (selectedDocuments.length === 0) return;
    setIsDeleteModalOpen(false);
    
    try {
      for (const uuid of selectedDocuments) {
        await deleteDocument(uuid);
      }
      setSelectedDocuments([]);
      setSuccess(`Удалено ${selectedDocuments.length} документов`);
      await loadDocuments();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка удаления');
    }
  };

  // ===== РЕДАКТИРОВАНИЕ МЕТАДАННЫХ =====
  const handleOpenEditModal = async (doc: Document) => {
    setRowMenuAnchor(null);
    setEditData(doc);
    setEditFormData({
      name: doc.name || '',
      type: doc.type || '',
      folder: doc.folder,
      registrationNumber: doc.registration_number || '',
      date: doc.created_at ? dayjs(doc.created_at).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      executor: doc.executor || '',
      familiarized: [],
    });
    setIsEditModalOpen(true);
  };

  const handleEditFieldChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleEditFolderChange = (folder: FolderType) => {
    setEditFormData(prev => ({
      ...prev,
      folder,
      type: FOLDER_TO_TYPE[folder] || prev.type,
    }));
  };

  const handleSaveEdit = async () => {
    if (!editData) return;
    setEditLoading(true);
    try {
      await updateDocument(editData.uuid, {
        name: editFormData.name,
        type: editFormData.type,
        folder: editFormData.folder,
        registration_number: editFormData.registrationNumber,
        executor: editFormData.executor,
        created_at: editFormData.date ? `${editFormData.date}T00:00:00` : undefined,
      });
      setSuccess('Метаданные обновлены');
      setIsEditModalOpen(false);
      await loadDocuments();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления');
    } finally {
      setEditLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    try {
      // Go GOST возвращает дату в формате "DD.MM.YYYY HH:mm:ss TZ"
      // dayjs по умолчанию парсит точечно-разделённые даты как MM.DD.YYYY,
      // поэтому указываем формат явно
      const parsed = dayjs(dateStr, 'DD.MM.YYYY HH:mm:ss');
      if (parsed.isValid()) {
        return parsed.format('DD.MM.YYYY');
      }
      // Fallback — пробуем стандартный парсинг
      return dayjs(dateStr).format('DD.MM.YYYY');
    } catch {
      return '—';
    }
  };

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      signed: 'Подписан',
      pending: 'Ожидает',
      rejected: 'Отклонён',
      draft: 'Черновик',
    };
    return map[status] || map.draft;
  };

  const getSignatureLabel = (type: string, valid?: boolean): string => {
    const map: Record<string, string> = {
      PEP: 'ПЭП действ',
      UNEP_valid: 'УНЭП действ',
      UNEP_invalid: 'УНЭП недейств',
      UKEP_valid: 'УКЭП действ',
      UKEP_invalid: 'УКЭП недейств',
      none: 'Без подписи',
    };
    
    if (type === 'PEP') return map.PEP;
    if (type === 'none') return map.none;
    if (type === 'UNEP' || type === 'UKEP') {
      const key = valid ? `${type}_valid` : `${type}_invalid`;
      return map[key as keyof typeof map] || type;
    }
    return type;
  };

  // ===== ВИЗУАЛИЗАЦИЯ ШТАМПА =====
  const handleVisualizeStamp = async (uuid: string) => {
    try {
      setLoading(true);
      await visualizeSignature(
        uuid,
        Math.round(stampPosition.current.x),
        Math.round(stampPosition.current.y),
        stampSize,
        uploadData.customStampUrl || DEFAULT_STAMP_URL,
        pageNumber,
        previewPageWidth
      );
      setSuccess('Документ готов к загрузке');
      await loadDocuments();
      window.open(downloadSignedCopy(uuid), '_blank');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания штампа');
    } finally {
      setLoading(false);
    }
  };

  // ===== ПРОВЕРКА ПОДПИСИ ЧЕРЕЗ БЭКЕНД =====
  const handleVerifySignature = async () => {
    if (!uploadData.pdfFile || !uploadData.sigFile) {
      setVerificationResult({
        status: 'error',
        data: null,
        error: 'Не выбраны файлы для проверки',
      });
      return;
    }

    setVerificationResult({ status: 'loading', data: null, error: null });

    try {
      const doc = await uploadDocument(uploadData.pdfFile, {
        name: uploadData.name || uploadData.pdfFile.name,
        type: uploadData.documentType || 'Документ',
        folder: uploadData.folder,
        registration_number: uploadData.registrationNumber || 'Не указан',
        signer: uploadData.signer || 'Не указан',
        signer_full_name: uploadData.signerFullName || uploadData.signer,
        executor: uploadData.executor || '',
        signature_type: uploadData.signatureType,
      });

      await uploadSignatureFile(doc.uuid, uploadData.sigFile);

      const result = await verifySignatureApi(doc.uuid);
      
      const isValid = result?.signature_valid === true;

      // Подбираем штамп по имени подписанта из сертификата
      const signerNameFromCert = result?.signer_name;
      const resolvedStampUrl = resolveStampUrl(signerNameFromCert);

      setUploadData(prev => ({
        ...prev,
        _doc_uuid: doc.uuid,
        customStampUrl: resolvedStampUrl,
        // Если имя подписанта не было введено вручную — берём из сертификата
        signer: prev.signer || signerNameFromCert || 'Не указан',
        signerFullName: prev.signerFullName || signerNameFromCert || prev.signer,
      }));
      
      setVerificationResult({
        status: isValid ? 'success' : 'error',
        data: result,
        error: isValid ? null : 'Подпись не подтверждена. Файл был модифицирован или подпись не соответствует файлу.',
      });
    } catch (err: any) {
      console.error('❌ Ошибка проверки:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Ошибка проверки подписи';
      setVerificationResult({
        status: 'error',
        data: null,
        error: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage),
      });
    }
  };

  // ===== ПОШАГОВАЯ ЗАГРУЗКА =====
  const handleOpenUploadModal = () => {
    setIsUploadModalOpen(true);
    setActiveStep(0);
    setUploadData({
      signatureType: 'UNEP',
      pdfFile: null,
      sigFile: null,
      folder: 'orders',
      documentType: FOLDER_TO_TYPE['orders'] || '',
      name: '',
      registrationNumber: '',
      date: dayjs().format('YYYY-MM-DD'),
      signer: '',
      signerFullName: '',
      signerInn: '',
      executor: '',
      familiarized: [],
      visualizeStamp: false,
      customStampUrl: '',
      _doc_uuid: '',
    });
    setVerificationResult({ status: 'idle', data: null, error: null });
    setShowStampPreview(false);
    stampPosition.current = { x: 100, y: 50 };
    setStampSize(FIXED_STAMP_SIZE);
    setNumPages(null);
    setPageNumber(1);
    setPdfOriginalSize(null);
    setPreviewPageWidth(500);
  };

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadLoading(false);
    setActiveStep(0);
    setShowStampPreview(false);
    setVerificationResult({ status: 'idle', data: null, error: null });
  };

  // Шаг 1: Выбор типа подписи
  const handleSignatureTypeSelect = (type: SignatureType) => {
    setUploadData(prev => ({ ...prev, signatureType: type }));
    setVerificationResult({ status: 'idle', data: null, error: null });
  };

  // Шаг 2: Загрузка файлов
  const handleFileSelect = (type: 'pdf' | 'sig') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (type === 'pdf') {
        setUploadData(prev => ({ ...prev, pdfFile: e.target.files![0] }));
        if (!uploadData.name) {
          setUploadData(prev => ({ ...prev, name: e.target.files![0].name.replace(/\.[^/.]+$/, '') }));
        }
      } else {
        setUploadData(prev => ({ ...prev, sigFile: e.target.files![0] }));
      }
      setVerificationResult({ status: 'idle', data: null, error: null });
    }
  };

  const handleDrop = (type: 'pdf' | 'sig') => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (type === 'pdf') {
        setUploadData(prev => ({ ...prev, pdfFile: e.dataTransfer.files[0] }));
        if (!uploadData.name) {
          setUploadData(prev => ({ ...prev, name: e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, '') }));
        }
      } else {
        setUploadData(prev => ({ ...prev, sigFile: e.dataTransfer.files[0] }));
      }
      setVerificationResult({ status: 'idle', data: null, error: null });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Шаг 5: Заполнение метаданных
  const handleFieldChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUploadData(prev => {
      const next = { ...prev, [field]: value };
      // При изменении подписанта — обновляем штамп (если проверка ещё не прошла,
      // т.е. имя из сертификата ещё не получено)
      if ((field === 'signer' || field === 'signerFullName') && !next._doc_uuid) {
        next.customStampUrl = resolveStampUrl(value || next.signerFullName);
      }
      return next;
    });
  };

  // Шаг 6: Сохранение
  const handleSaveDocument = async () => {
    if (!uploadData.pdfFile) {
      setError('Выберите PDF файл');
      return;
    }

    setUploadLoading(true);
    setError(null);

    try {
      let docUuid = uploadData._doc_uuid;
      
      if (!docUuid) {
        const doc = await uploadDocument(uploadData.pdfFile, {
          name: uploadData.name || uploadData.pdfFile.name,
          type: uploadData.documentType || 'Документ',
          folder: uploadData.folder,
          registration_number: uploadData.registrationNumber || 'Не указан',
          signer: uploadData.signer || 'Не указан',
          signer_full_name: uploadData.signerFullName || uploadData.signer,
          executor: uploadData.executor || '',
          signature_type: uploadData.signatureType,
        });
        docUuid = doc.uuid;
        
        if (uploadData.sigFile) {
          await uploadSignatureFile(docUuid, uploadData.sigFile);
        }
        
        if (uploadData.signatureType === 'UNEP' || uploadData.signatureType === 'UKEP') {
          await verifySignatureApi(docUuid);
        }
      } else {
        // Документ уже создан на шаге проверки — обновляем метаданные
        await updateDocument(docUuid, {
          name: uploadData.name || uploadData.pdfFile.name,
          type: uploadData.documentType || 'Документ',
          folder: uploadData.folder,
          registration_number: uploadData.registrationNumber || 'Не указан',
          signer: uploadData.signer || 'Не указан',
          signer_full_name: uploadData.signerFullName || uploadData.signer,
          executor: uploadData.executor || '',
          created_at: uploadData.date
            ? `${uploadData.date}T00:00:00`
            : undefined,
        });
      }
      
      if (uploadData.visualizeStamp && docUuid) {
        await visualizeSignature(
          docUuid,
          Math.round(stampPosition.current.x),
          Math.round(stampPosition.current.y),
          stampSize,
          uploadData.customStampUrl || DEFAULT_STAMP_URL,
          pageNumber,
          previewPageWidth
        );
      }
      
      setSuccess(`Документ успешно сохранён`);
      handleCloseUploadModal();
      await loadDocuments();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Ошибка загрузки документа';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setUploadLoading(false);
    }
  };

  // Шаги для стоппера
  const steps = [
    { label: 'Тип подписи', icon: <VpnKeyIcon /> },
    { label: 'Загрузка файлов', icon: <UploadFileIcon /> },
    { label: 'Проверка подписи', icon: <VerifiedIcon /> },
    { label: 'Визуализация', icon: <VisibilityIcon /> },
    { label: 'Метаданные', icon: <DescriptionIcon /> },
    { label: 'Сохранение', icon: <CheckCircleIcon /> },
  ];

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        // ПЭП недоступен
        return uploadData.signatureType !== 'none' && uploadData.signatureType !== 'PEP';
      case 1:
        if (!uploadData.pdfFile) return false;
        if ((uploadData.signatureType === 'UNEP' || uploadData.signatureType === 'UKEP') && !uploadData.sigFile) return false;
        return true;
      case 2:
        return verificationResult.status === 'success';
      case 3:
        return true;
      case 4:
        return uploadData.name.trim().length > 0
          && uploadData.signer.trim().length > 0
          && uploadData.registrationNumber.trim().length > 0;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    // Блокировка ПЭП
    if (uploadData.signatureType === 'PEP') {
      setError('Невозможно использовать ПЭП');
      return;
    }
    if (activeStep === 5) {
      handleSaveDocument();
    } else if (activeStep === 1 && (uploadData.signatureType === 'UNEP' || uploadData.signatureType === 'UKEP')) {
      setActiveStep(2);
      handleVerifySignature();
    } else if (activeStep === 2 && verificationResult.status === 'success') {
      setActiveStep(3);
      // Превью загружается только при активации чекбокса
      stampPosition.current = { x: 100, y: 50 };
      setStampSize(FIXED_STAMP_SIZE);
    } else if (activeStep === 3) {
      setActiveStep(4);
    } else {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (activeStep === 3 && showStampPreview) {
      setShowStampPreview(false);
    }
    setActiveStep(prev => prev - 1);
  };

  const isAllSelected = documents.length > 0 && selectedDocuments.length === documents.length;

  const getFolderCount = (folderId: string) => {
    return folderCounts[folderId] ?? 0;
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 3 }}>
              Выберите тип электронной подписи, который будет использован для документа
            </Typography>
            <RadioGroup
              value={uploadData.signatureType}
              onChange={(e) => {
                const val = e.target.value as SignatureType;
                if (val === 'PEP') {
                  setError('Невозможно использовать ПЭП');
                  return;
                }
                handleSignatureTypeSelect(val);
              }}
            >
              {signatureTypes.map((type) => {
                const isDisabled = type.disabled;
                return (
                  <Card
                    key={type.value}
                    sx={{
                      mb: 1.5,
                      border: !isDisabled && uploadData.signatureType === type.value ? '2px solid #4c6ef5' : '1px solid #eaebf0',
                      borderRadius: '12px',
                      transition: 'all 0.2s ease',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.5 : 1,
                      '&:hover': isDisabled ? {} : {
                        borderColor: '#4c6ef5',
                        boxShadow: '0 2px 8px rgba(76, 110, 245, 0.1)',
                      },
                    }}
                    onClick={() => {
                      if (isDisabled) {
                        setError('Невозможно использовать ПЭП');
                        return;
                      }
                      handleSignatureTypeSelect(type.value as SignatureType);
                    }}
                  >
                    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Radio
                          checked={uploadData.signatureType === type.value}
                          value={type.value}
                          disabled={isDisabled}
                          sx={{ color: '#4c6ef5' }}
                        />
                        <Box>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: '15px' }}>
                            {type.label}
                            {isDisabled && (
                              <Typography component="span" sx={{ ml: 1, fontSize: '11px', color: '#e53935', fontWeight: 500 }}>
                                (недоступно)
                              </Typography>
                            )}
                          </Typography>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                            {type.description}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </RadioGroup>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 2 }}>
              Загрузите файлы документа
            </Typography>

            <input
              type="file"
              id="pdf-upload"
              style={{ display: 'none' }}
              onChange={handleFileSelect('pdf')}
              accept=".pdf"
            />
            <DropZoneUpload
              onClick={() => document.getElementById('pdf-upload')?.click()}
              onDrop={handleDrop('pdf')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={isDragging ? 'dragging' : ''}
              sx={{ mb: 2 }}
            >
              {uploadData.pdfFile ? (
                <FileInfoBox>
                  <PdfIcon sx={{ color: '#e53935' }} />
                  <Box sx={{ flex: 1, textAlign: 'left' }}>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500 }}>
                      {uploadData.pdfFile.name}
                    </Typography>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                      {(uploadData.pdfFile.size / 1024).toFixed(1)} КБ
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); setUploadData(prev => ({ ...prev, pdfFile: null })); }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </FileInfoBox>
              ) : (
                <>
                  <PdfIcon sx={{ fontSize: '40px', color: '#e53935', opacity: 0.5, mb: 1 }} />
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                    Перетащите PDF файл или <span style={{ color: '#4c6ef5' }}>выберите на компьютере</span>
                  </Typography>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#b0b3c3', mt: 1 }}>
                    Подлинник документа (PDF)
                  </Typography>
                </>
              )}
            </DropZoneUpload>

            {(uploadData.signatureType === 'UNEP' || uploadData.signatureType === 'UKEP') && (
              <>
                <input
                  type="file"
                  id="sig-upload"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect('sig')}
                  accept=".sig"
                />
                <DropZoneUpload
                  onClick={() => document.getElementById('sig-upload')?.click()}
                  onDrop={handleDrop('sig')}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={isDragging ? 'dragging' : ''}
                  sx={{ mb: 2 }}
                >
                  {uploadData.sigFile ? (
                    <FileInfoBox>
                      <FileCopyIcon sx={{ color: '#4c6ef5' }} />
                      <Box sx={{ flex: 1, textAlign: 'left' }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 500 }}>
                          {uploadData.sigFile.name}
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                          {(uploadData.sigFile.size / 1024).toFixed(1)} КБ
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setUploadData(prev => ({ ...prev, sigFile: null })); }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </FileInfoBox>
                  ) : (
                    <>
                      <FileCopyIcon sx={{ fontSize: '40px', color: '#4c6ef5', opacity: 0.5, mb: 1 }} />
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                        Перетащите SIG файл или <span style={{ color: '#4c6ef5' }}>выберите на компьютере</span>
                      </Typography>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#b0b3c3', mt: 1 }}>
                        Отсоединённая электронная подпись (.sig)
                      </Typography>
                    </>
                  )}
                </DropZoneUpload>
              </>
            )}
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 3 }}>
              Проверка электронной подписи
            </Typography>

            {verificationResult.status === 'idle' && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <PendingIcon sx={{ fontSize: '64px', color: '#ff9800', mb: 2 }} />
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '16px', color: '#87879b' }}>
                  Нажмите "Проверить", чтобы начать проверку подписи
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleVerifySignature}
                  sx={{ mt: 2 }}
                >
                  Проверить подпись
                </Button>
              </Box>
            )}

            {verificationResult.status === 'loading' && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress size={48} sx={{ mb: 2 }} />
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '16px', color: '#87879b' }}>
                  Проверка подписи через Госключ...
                </Typography>
              </Box>
            )}

            {verificationResult.status === 'success' && (
              <Box>
                <Alert
                  severity="success"
                  sx={{ mb: 3 }}
                >
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600 }}>
                    Подпись подтверждена. Подпись была создана для проверяемого документа, и он после этого не был изменён.
                  </Typography>
                </Alert>

                <Paper sx={{ p: 2, bgcolor: '#f9fafe', borderRadius: '8px' }}>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', fontWeight: 600, mb: 1.5 }}>
                    Информация о подписи
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {(verificationResult.data?.signer_name) && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                          Подписант
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                          {verificationResult.data?.signer_name}
                        </Typography>
                      </Box>
                    )}

                    {(verificationResult.data?.signature_date) && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                          Дата подписания
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                          {formatDate(verificationResult.data?.signature_date)}
                        </Typography>
                      </Box>
                    )}

                    {(verificationResult.data?.certificate_serial) && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                          Серийный номер сертификата
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                          {verificationResult.data?.certificate_serial}
                        </Typography>
                      </Box>
                    )}

                    {(verificationResult.data?.hash_algorithm) && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                          Алгоритм хеширования
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                          {verificationResult.data?.hash_algorithm}
                        </Typography>
                      </Box>
                    )}

                    {(verificationResult.data?.ocsp_status) && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #f0f0f0' }}>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                          OCSP
                        </Typography>
                        <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#4caf50' }}>
                          {verificationResult.data?.ocsp_status}
                        </Typography>
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                        Детали
                      </Typography>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                        {verificationResult.data?.verification_details?.replace?.(/Go.?Gost/gi, 'сервер ГОСТ') || 'Подпись проверена через сервер ГОСТ'}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Box>
            )}

            {verificationResult.status === 'error' && (
              <Box>
                <Alert
                  severity="error"
                  sx={{ mb: 2 }}
                >
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600 }}>
                    {verificationResult.error}
                  </Typography>
                </Alert>
                <Button
                  variant="outlined"
                  onClick={handleVerifySignature}
                  sx={{ mt: 1 }}
                >
                  Попробовать снова
                </Button>
              </Box>
            )}
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 2 }}>
              Визуализация штампа на документе
            </Typography>

            <FormControlLabel
              control={
                <Checkbox
                  checked={uploadData.visualizeStamp}
                  onChange={(e) => {
                    setUploadData(prev => ({ ...prev, visualizeStamp: e.target.checked }));
                    if (!e.target.checked) {
                      setShowStampPreview(false);
                    } else {
                      setShowStampPreview(true);
                      stampPosition.current = { x: 100, y: 50 };
                      setStampSize(FIXED_STAMP_SIZE);
                    }
                  }}
                  sx={{
                    color: '#87879b',
                    '&.Mui-checked': {
                      color: '#4c6ef5',
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', fontWeight: 500, color: '#101025' }}>
                  Визуализировать штамп ЭП по 63-ФЗ
                </Typography>
              }
            />

            {showStampPreview && (
              <Box sx={{ mt: 3 }}>
                <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b', mb: 1 }}>
                  Штамп
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                      Размер: {stampSize}%
                    </Typography>
                    <IconButton size="small" onClick={handleStampReset} sx={{ color: '#4c6ef5' }}>
                      <CenterFocusStrongIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {numPages && numPages > 1 && (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', ml: 2 }}>
                      <IconButton 
                        size="small" 
                        onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
                        disabled={pageNumber <= 1}
                        sx={{ color: '#87879b' }}
                      >
                        <ArrowBackIcon fontSize="small" />
                      </IconButton>
                      <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b' }}>
                        {pageNumber} / {numPages}
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                        disabled={pageNumber >= numPages}
                        sx={{ color: '#87879b' }}
                      >
                        <ArrowForwardIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>

                <PreviewContainer
                  ref={previewRef}
                  onMouseMove={handleStampMouseMove}
                  onMouseUp={handleStampMouseUp}
                  onMouseLeave={handleStampMouseUp}
                >
                  <Box
                    sx={{
                      width: '100%',
                      minHeight: '500px',
                      backgroundColor: '#e8e8e8',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      padding: '8px',
                      position: 'relative',
                    }}
                  >
                    <PDFDocument
                      file={pdfFileUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      loading={
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                          <CircularProgress size={40} />
                        </Box>
                      }
                      error={
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', color: '#e53935' }}>
                            Не удалось загрузить PDF
                          </Typography>
                        </Box>
                      }
                    >
                      <Box ref={pageWrapRef} sx={{ position: 'relative', display: 'inline-block', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
                        <Page
                          pageNumber={pageNumber}
                          scale={1}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                          width={previewPageWidth}
                          onLoadSuccess={onPageLoadSuccess}
                        />
                        
                        <StampContainer
                          ref={stampRef}
                          sx={{
                            width: `${stampBaseWidthPx}px`,
                            height: `${stampBaseHeightPx}px`,
                            transform: `translate(${stampPosition.current.x}px, ${stampPosition.current.y}px) scale(${stampSize / 100})`,
                            transformOrigin: 'top left',
                            cursor: isDraggingStamp.current ? 'grabbing' : 'grab',
                            boxShadow: isDraggingStamp.current ? '0 8px 32px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.15)',
                            padding: '0',
                            backgroundColor: 'transparent',
                            border: 'none',
                            minWidth: 'auto',
                          }}
                          onMouseDown={handleStampMouseDown}
                          onMouseUp={handleStampMouseUp}
                        >
                          <img
                            src={uploadData.customStampUrl || DEFAULT_STAMP_URL}
                            alt="Штамп ЭП"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              pointerEvents: 'none',
                              display: 'block',
                            }}
                          />
                        </StampContainer>
                      </Box>
                    </PDFDocument>
                  </Box>
                </PreviewContainer>
              </Box>
            )}
          </Box>
        );

      case 4:
        return (
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b', mb: 3 }}>
              Заполните метаданные документа
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ fontFamily: 'Lato, sans-serif' }}>Папка</InputLabel>
                  <Select
                    value={uploadData.folder}
                    onChange={(e) => {
                      const folder = e.target.value as FolderType;
                      setUploadData(prev => ({
                        ...prev,
                        folder,
                        // Автоподстановка типа документа по папке
                        documentType: FOLDER_TO_TYPE[folder] || prev.documentType,
                      }));
                    }}
                    input={<OutlinedInput label="Папка" />}
                    sx={{ borderRadius: '8px', fontFamily: 'Lato, sans-serif' }}
                  >
                    <MenuItem value="orders">Приказы</MenuItem>
                    <MenuItem value="regulations">Распоряжения</MenuItem>
                    <MenuItem value="provisions">Положения</MenuItem>
                    <MenuItem value="incoming">Входящие</MenuItem>
                    <MenuItem value="outgoing">Исходящие</MenuItem>
                    <MenuItem value="tasks">Поручения</MenuItem>
                  </Select>
                </FormControl>

                <StyledTextField
                  fullWidth
                  label="Тип документа"
                  value={uploadData.documentType}
                  size="small"
                  disabled
                  placeholder="Определяется папкой"
                />
              </Box>

              <StyledTextField
                fullWidth
                label="Наименование"
                value={uploadData.name}
                onChange={handleFieldChange('name')}
                size="small"
                required
                placeholder="Введите наименование документа"
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <StyledTextField
                  fullWidth
                  label="Регистрационный номер"
                  value={uploadData.registrationNumber}
                  onChange={handleFieldChange('registrationNumber')}
                  size="small"
                  required
                  placeholder="П-2026-001"
                />

                <DatePicker
                  label="Дата"
                  value={dayjs(uploadData.date)}
                  onChange={(date: Dayjs | null) => {
                    if (date) {
                      setUploadData(prev => ({ ...prev, date: date.format('YYYY-MM-DD') }));
                    }
                  }}
                  format="DD.MM.YYYY"
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: 'small',
                    },
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <StyledTextField
                  fullWidth
                  label="Подписант"
                  value={uploadData.signer}
                  size="small"
                  required
                  disabled
                  placeholder="Заполняется из проверки подписи"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <StyledTextField
                  fullWidth
                  label="Исполнитель"
                  value={uploadData.executor}
                  onChange={handleFieldChange('executor')}
                  size="small"
                  placeholder="Петрова А.С."
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <BusinessIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Box>

              <StyledTextField
                fullWidth
                label="ФИО подписанта (полное)"
                value={uploadData.signerFullName}
                size="small"
                disabled
                placeholder="Заполняется из проверки подписи"
              />

              <StyledTextField
                fullWidth
                label="Ознакомлены"
                value={uploadData.familiarized.join(', ')}
                size="small"
                placeholder="Введите ФИО через запятую"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <GroupIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
          </Box>
        );

      case 5:
        return (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleIcon sx={{ fontSize: '64px', color: '#4caf50', mb: 2 }} />
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '20px', fontWeight: 700, color: '#101025' }}>
              Готово к сохранению!
            </Typography>
            <Box sx={{ mt: 2, textAlign: 'left', bgcolor: '#f9fafe', p: 2, borderRadius: '8px' }}>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: 600, mb: 1 }}>
                Проверьте данные:
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                <strong>Тип подписи:</strong> {signatureTypes.find(t => t.value === uploadData.signatureType)?.label}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                <strong>Файл:</strong> {uploadData.pdfFile?.name || 'Не выбран'}
              </Typography>
              {(uploadData.signatureType === 'UNEP' || uploadData.signatureType === 'UKEP') && (
                <>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                    <strong>SIG файл:</strong> {uploadData.sigFile?.name || 'Не выбран'}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                    <strong>Статус проверки:</strong> {verificationResult.status === 'success' ? 'Подпись подтверждена' : 'Подпись не подтверждена'}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                    <strong>Визуализация штампа:</strong> {uploadData.visualizeStamp ? 'Включена' : 'Отключена'}
                  </Typography>
                </>
              )}
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                <strong>Наименование:</strong> {uploadData.name || 'Не указано'}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                <strong>Рег. номер:</strong> {uploadData.registrationNumber || 'Не указан'}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                <strong>Дата:</strong> {uploadData.date ? dayjs(uploadData.date).format('DD.MM.YYYY') : 'Не указана'}
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                <strong>Подписант:</strong> {uploadData.signer || 'Не указан'}
              </Typography>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  if (loading && documents.length === 0) {
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
      {/* Заголовок */}
      <Typography
        variant="h4"
        sx={{
          fontFamily: 'Lato, sans-serif',
          fontWeight: 700,
          fontSize: '24px',
          color: '#101025',
          mb: 3,
        }}
      >
        Документы
      </Typography>

      {/* Папки */}
      <Box sx={{ mb: 3 }}>
        <Tabs
          value={activeFolder}
          onChange={(_, val) => {
            setActiveFolder(val);
            setPage(1);
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
              transition: 'all 0.3s ease',
              '&.Mui-selected': {
                color: '#4c6ef5',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#4c6ef5',
              height: '3px',
              borderRadius: '3px 3px 0 0',
              transition: 'all 0.3s ease',
            },
          }}
        >
          {folderTabs.map((tab) => {
            const count = getFolderCount(tab.id);
            return (
              <Tab
                key={tab.id}
                value={tab.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {tab.icon}
                    <span>{tab.label}</span>
                    <Chip
                      label={count}
                      size="small"
                      sx={{
                        height: '18px',
                        fontSize: '10px',
                        fontWeight: 600,
                        backgroundColor: activeFolder === tab.id ? '#4c6ef5' : '#f4f4f8',
                        color: activeFolder === tab.id ? '#ffffff' : '#87879b',
                        '& .MuiChip-label': {
                          padding: '0 6px',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    />
                  </Box>
                }
              />
            );
          })}
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
            <ToolbarButton size="small" onClick={loadDocuments}>
              <RefreshIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Tooltip title="Загрузить">
            <ToolbarButton size="small" onClick={handleOpenUploadModal}>
              <CloudUploadIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Tooltip title="Открыть">
            <ToolbarButton size="small" disabled={selectedDocuments.length === 0}>
              <OpenIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Tooltip title="Удалить">
            <ToolbarButton size="small" disabled={selectedDocuments.length === 0} onClick={() => setIsDeleteModalOpen(true)}>
              <DeleteIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Tooltip title="Отправить">
            <ToolbarButton size="small" disabled={selectedDocuments.length === 0}>
              <SendIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Tooltip title="Выгрузка в папку Пед.ID">
            <ToolbarButton size="small" disabled={selectedDocuments.length === 0}>
              <FolderIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <SearchField
            placeholder="Поиск по номеру или подписанту"
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
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      ✕
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: '280px' }}
          />
        </ToolbarLeft>

        <ToolbarRight>
          <StyledChip label={`Всего: ${total}`} size="small" />
          
          <Tooltip title="Дополнительные действия">
            <IconButton size="small" onClick={handleMenuOpen} sx={{ color: '#87879b' }}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <MenuItem onClick={handleMenuClose}>
              <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Новая папка</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleMenuClose}>
              <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Импорт</ListItemText>
            </MenuItem>
          </Menu>
        </ToolbarRight>
      </ToolbarContainer>

      {/* Список документов */}
      <Fade in={!isPending} timeout={300}>
        <Box>
          {documents.length === 0 ? (
            <EmptyStateContainer>
              <EmptyStateIcon>
                <FileIcon />
              </EmptyStateIcon>
              <Typography
                variant="h6"
                sx={{
                  fontFamily: 'Lato, sans-serif',
                  fontWeight: 600,
                  fontSize: '18px',
                  color: '#101025',
                }}
              >
                Нет данных
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'Lato, sans-serif',
                  color: '#87879b',
                  fontSize: '14px',
                  mt: 1,
                }}
              >
                Загрузите первый документ
              </Typography>
              <UploadButton startIcon={<CloudUploadIcon />} onClick={handleOpenUploadModal}>
                Загрузить документ
              </UploadButton>
            </EmptyStateContainer>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #eaebf0', boxShadow: 'none' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        sx={{ color: '#b0b3c3' }}
                      />
                    </TableCell>
                    <TableCell>Название / Рег. номер</TableCell>
                    <TableCell>Подписант</TableCell>
                    <TableCell>Тип подписи</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Дата</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.map((doc) => {
                    const isSelected = selectedDocuments.includes(doc.uuid);
                    const signatureLabel = getSignatureLabel(doc.signature_type, doc.goskey_valid);
                    const statusLabel = getStatusLabel(doc.status);
                    
                    const displayName = doc.name || 'Без названия';
                    const displaySigner = doc.signer_full_name || doc.signer || 'Не указан';
                    const displayRegNumber = doc.registration_number || '—';
                    const displayType = doc.type || 'Документ';
                    
                    return (
                      <TableRow
                        key={doc.uuid}
                        hover
                        selected={isSelected}
                        sx={{
                          transition: 'background-color 0.2s ease',
                          '&:hover': {
                            backgroundColor: '#f9fafe',
                          },
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => {
                              setSelectedDocuments(prev =>
                                prev.includes(doc.uuid)
                                  ? prev.filter(id => id !== doc.uuid)
                                  : [...prev, doc.uuid]
                              );
                            }}
                            sx={{ color: '#b0b3c3' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PdfIcon sx={{ color: '#e53935', fontSize: '20px' }} />
                            <Box>
                              <Typography
                                sx={{
                                  fontFamily: 'Lato, sans-serif',
                                  fontSize: '14px',
                                  color: '#101025',
                                  fontWeight: 500,
                                }}
                              >
                                {displayName}
                              </Typography>
                              <Typography
                                sx={{
                                  fontFamily: 'Lato, sans-serif',
                                  fontSize: '12px',
                                  color: '#87879b',
                                }}
                              >
                                {displayRegNumber} • {displayType}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#101025' }}>
                            {displaySigner}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <SignatureTypeText
                            type={doc.signature_type}
                            valid={doc.goskey_valid}
                          >
                            {signatureLabel}
                          </SignatureTypeText>
                        </TableCell>
                        <TableCell>
                          <StatusChip status={doc.status} label={statusLabel} size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: '#87879b' }}>
                            {formatDate(doc.signature_date || doc.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Скачать архив с подлинником">
                            <IconButton 
                              size="small" 
                              sx={{ color: '#87879b' }} 
                              onClick={() => window.open(downloadArchive(doc.uuid), '_blank')}
                            >
                              <ArchiveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title={doc.signed_copy_url ? "Скачать со штампом ЭП" : "Штамп не создан"}>
                            <IconButton 
                              size="small" 
                              sx={{ color: doc.signed_copy_url ? '#4c6ef5' : '#b0b3c3' }}
                              onClick={() => {
                                if (doc.signed_copy_url) {
                                  window.open(downloadSignedCopy(doc.uuid), '_blank');
                                } else if (doc.status === 'signed') {
                                  handleVisualizeStamp(doc.uuid);
                                }
                              }}
                              disabled={doc.status !== 'signed' && !doc.signed_copy_url}
                            >
                              <VerifiedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Ещё">
                            <IconButton 
                              size="small" 
                              sx={{ color: '#87879b' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRowMenuAnchor(e.currentTarget);
                                setRowMenuDoc(doc);
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

      {/* ===== МОДАЛКА ЗАГРУЗКИ (ПОШАГОВАЯ) ===== */}
      <Modal
        open={isUploadModalOpen}
        onClose={handleCloseUploadModal}
        closeAfterTransition
      >
        <Fade in={isUploadModalOpen}>
          <ModalContainer>
            <ModalHeader>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontFamily: 'Lato, sans-serif',
                    fontWeight: 700,
                    fontSize: '18px',
                    color: '#101025',
                  }}
                >
                  Загрузка документа
                </Typography>
                <Chip
                  label={`Шаг ${activeStep + 1} из ${steps.length}`}
                  size="small"
                  sx={{
                    backgroundColor: '#f4f4f8',
                    color: '#87879b',
                    fontFamily: 'Lato, sans-serif',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                />
              </Box>
              <IconButton onClick={handleCloseUploadModal} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>

            <Box sx={{ px: 4, pt: 2 }}>
              <Stepper activeStep={activeStep} alternativeLabel>
                {steps.map((step, index) => (
                  <Step key={step.label}>
                    <StepLabel
                      slotProps={{
                        stepIcon: {
                          icon: (
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: index <= activeStep ? '#4c6ef5' : '#f4f4f8',
                                color: index <= activeStep ? '#ffffff' : '#87879b',
                                transition: 'all 0.3s ease',
                              }}
                            >
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
              {getStepContent(activeStep)}
            </ModalBody>

            <ModalFooter>
              <BackButton
                onClick={handleBack}
                disabled={activeStep === 0}
                startIcon={<ArrowBackIcon />}
              >
                Назад
              </BackButton>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {uploadLoading && <CircularProgress size={24} />}
                <NextButton
                  onClick={handleNext}
                  disabled={!canProceed() || uploadLoading}
                  endIcon={activeStep === steps.length - 1 ? <CheckCircleIcon /> : <ArrowForwardIcon />}
                >
                  {activeStep === steps.length - 1 ? 'Сохранить' : 'Далее'}
                </NextButton>
              </Box>
            </ModalFooter>
          </ModalContainer>
        </Fade>
      </Modal>

      {/* ===== МЕНЮ СТРОКИ (Ещё) ===== */}
      <Menu
        anchorEl={rowMenuAnchor}
        open={Boolean(rowMenuAnchor)}
        onClose={() => { setRowMenuAnchor(null); setRowMenuDoc(null); }}
      >
        <MenuItem onClick={() => rowMenuDoc && handleOpenEditModal(rowMenuDoc)}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Редактировать метаданные</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (rowMenuDoc) {
            setSelectedDocuments([rowMenuDoc.uuid]);
            setRowMenuAnchor(null);
            setIsDeleteModalOpen(true);
          }
        }}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Удалить</ListItemText>
        </MenuItem>
      </Menu>

      {/* ===== МОДАЛКА ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ ===== */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        closeAfterTransition
      >
        <Fade in={isDeleteModalOpen}>
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '440px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            overflow: 'hidden',
          }}>
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Box sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: '#ffebee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <WarningIcon sx={{ fontSize: 36, color: '#e53935' }} />
              </Box>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '18px', fontWeight: 700, color: '#101025', mb: 1 }}>
                Подтвердите удаление
              </Typography>
              <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#87879b' }}>
                Вы собираетесь удалить {selectedDocuments.length} документ(ов). Это действие нельзя отменить.
              </Typography>
            </Box>
            <Box sx={{
              p: 2,
              backgroundColor: '#fafafa',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 1,
            }}>
              <Button
                onClick={() => setIsDeleteModalOpen(false)}
                sx={{
                  fontFamily: 'Lato, sans-serif',
                  textTransform: 'none',
                  fontWeight: 600,
                  color: '#87879b',
                  '&:hover': { backgroundColor: '#f4f4f8' },
                }}
              >
                Отмена
              </Button>
              <Button
                onClick={handleDeleteSelected}
                sx={{
                  fontFamily: 'Lato, sans-serif',
                  textTransform: 'none',
                  fontWeight: 600,
                  backgroundColor: '#e53935',
                  color: '#ffffff',
                  borderRadius: '8px',
                  '&:hover': { backgroundColor: '#c62828' },
                }}
              >
                Удалить
              </Button>
            </Box>
          </Box>
        </Fade>
      </Modal>

      {/* ===== МОДАЛКА РЕДАКТИРОВАНИЯ МЕТАДАННЫХ ===== */}
      <Modal
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        closeAfterTransition
      >
        <Fade in={isEditModalOpen}>
          <ModalContainer>
            <ModalHeader>
              <Typography variant="h6" sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '18px', color: '#101025' }}>
                Редактирование метаданных
              </Typography>
              <IconButton onClick={() => setIsEditModalOpen(false)} size="small" sx={{ color: '#87879b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </ModalHeader>
            <ModalBody>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontFamily: 'Lato, sans-serif' }}>Папка</InputLabel>
                    <Select
                      value={editFormData.folder}
                      onChange={(e) => handleEditFolderChange(e.target.value as FolderType)}
                      input={<OutlinedInput label="Папка" />}
                      sx={{ borderRadius: '8px', fontFamily: 'Lato, sans-serif' }}
                    >
                      <MenuItem value="orders">Приказы</MenuItem>
                      <MenuItem value="regulations">Распоряжения</MenuItem>
                      <MenuItem value="provisions">Положения</MenuItem>
                      <MenuItem value="incoming">Входящие</MenuItem>
                      <MenuItem value="outgoing">Исходящие</MenuItem>
                      <MenuItem value="tasks">Поручения</MenuItem>
                    </Select>
                  </FormControl>
                  <StyledTextField
                    fullWidth
                    label="Тип документа"
                    value={editFormData.type}
                    size="small"
                    disabled
                  />
                </Box>
                <StyledTextField
                  fullWidth
                  label="Наименование"
                  value={editFormData.name}
                  onChange={handleEditFieldChange('name')}
                  size="small"
                  required
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <StyledTextField
                    fullWidth
                    label="Регистрационный номер"
                    value={editFormData.registrationNumber}
                    onChange={handleEditFieldChange('registrationNumber')}
                    size="small"
                    required
                  />
                  <DatePicker
                    label="Дата"
                    value={dayjs(editFormData.date)}
                    onChange={(date: Dayjs | null) => {
                      if (date) {
                        setEditFormData(prev => ({ ...prev, date: date.format('YYYY-MM-DD') }));
                      }
                    }}
                    format="DD.MM.YYYY"
                    slotProps={{
                      textField: { fullWidth: true, size: 'small' },
                    }}
                  />
                </Box>
                <StyledTextField
                  fullWidth
                  label="Подписант"
                  value={editData?.signer_full_name || editData?.signer || ''}
                  size="small"
                  disabled
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <StyledTextField
                  fullWidth
                  label="Исполнитель"
                  value={editFormData.executor}
                  onChange={handleEditFieldChange('executor')}
                  size="small"
                  placeholder="Петрова А.С."
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <BusinessIcon sx={{ fontSize: '18px', color: '#87879b' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Box>
            </ModalBody>
            <ModalFooter>
              <BackButton onClick={() => setIsEditModalOpen(false)} startIcon={<ArrowBackIcon />}>
                Отмена
              </BackButton>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {editLoading && <CircularProgress size={24} />}
                <NextButton
                  onClick={handleSaveEdit}
                  disabled={editLoading || editFormData.name.trim().length === 0 || editFormData.registrationNumber.trim().length === 0}
                  endIcon={<CheckCircleIcon />}
                >
                  Сохранить
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

export default DocumentsPage;