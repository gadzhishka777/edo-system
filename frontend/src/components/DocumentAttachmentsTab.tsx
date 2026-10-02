import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Stack,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import {
  DocumentAttachment,
  AttachmentVersion,
  AttachmentType,
  ATTACHMENT_TYPE_LABELS,
  getAttachments,
  createAttachment,
  getAttachmentVersions,
  addAttachmentVersion,
  updateAttachment,
  deleteAttachment,
  downloadAttachmentVersion,
} from '../api/edoApi';

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('ru-RU');
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

export const DocumentAttachmentsTab: React.FC<{ documentUuid: string }> = ({ documentUuid }) => {
  const [items, setItems] = useState<DocumentAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const addInputRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const versionTargetRef = useRef<string | null>(null);

  // Диалог «Изменить»
  const [editAtt, setEditAtt] = useState<DocumentAttachment | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AttachmentType>('attachment');
  const [editComment, setEditComment] = useState('');

  // Диалог «Версии»
  const [versionsAtt, setVersionsAtt] = useState<DocumentAttachment | null>(null);
  const [versions, setVersions] = useState<AttachmentVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAttachments(documentUuid);
      setItems(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось загрузить вложения');
    } finally {
      setLoading(false);
    }
  }, [documentUuid]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of arr) {
        await createAttachment(documentUuid, f);
      }
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки вложения');
    } finally {
      setBusy(false);
    }
  };

  const handleNewVersion = async (file: File) => {
    const attUuid = versionTargetRef.current;
    if (!attUuid) return;
    setBusy(true);
    setError(null);
    try {
      await addAttachmentVersion(attUuid, file);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка добавления версии');
    } finally {
      setBusy(false);
      versionTargetRef.current = null;
    }
  };

  const handleDelete = async (att: DocumentAttachment) => {
    if (!window.confirm(`Удалить вложение «${att.name}» со всеми версиями?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAttachment(att.uuid);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  const handleSetPrimary = async (att: DocumentAttachment) => {
    setBusy(true);
    try {
      await updateAttachment(att.uuid, { is_primary: true });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (att: DocumentAttachment) => {
    setEditAtt(att);
    setEditName(att.name);
    setEditType(att.type);
    setEditComment(att.comment || '');
  };

  const handleSaveEdit = async () => {
    if (!editAtt) return;
    setBusy(true);
    try {
      await updateAttachment(editAtt.uuid, { name: editName, type: editType, comment: editComment });
      setEditAtt(null);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const openVersions = async (att: DocumentAttachment) => {
    setVersionsAtt(att);
    setVersions([]);
    setVersionsLoading(true);
    try {
      setVersions(await getAttachmentVersions(att.uuid));
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const download = (att: DocumentAttachment) => {
    const v = att.latest_version;
    if (v) window.open(downloadAttachmentVersion(v.uuid), '_blank');
  };

  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
      }}
      sx={{
        position: 'relative',
        minHeight: 300,
        border: dragging ? '2px dashed #4c6ef5' : '2px dashed transparent',
        borderRadius: 2,
        transition: 'border-color 0.15s ease',
      }}
    >
      <input
        ref={addInputRef}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          if (e.target.files?.length) uploadFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={versionInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleNewVersion(f);
          e.target.value = '';
        }}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          disabled={busy}
          onClick={() => addInputRef.current?.click()}
        >
          Добавить
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CloudUploadIcon />}
          disabled={busy}
          onClick={() => addInputRef.current?.click()}
        >
          Загрузить файл
        </Button>
        {busy && <CircularProgress size={18} />}
        <Box sx={{ flexGrow: 1 }} />
        <Typography sx={{ fontSize: 12, color: '#87879b' }}>
          Перетащите файлы сюда, чтобы добавить вложение
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center', color: '#87879b' }}>
          <Typography>Вложений пока нет. Нажмите «Добавить» или перетащите файл.</Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Файл</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Версия</TableCell>
                <TableCell>Размер</TableCell>
                <TableCell>Дата</TableCell>
                <TableCell>Комментарий</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((att) => (
                <TableRow key={att.uuid} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Tooltip title={att.is_primary ? 'Основное вложение' : 'Сделать основным'}>
                        <IconButton
                          size="small"
                          onClick={() => !att.is_primary && handleSetPrimary(att)}
                          sx={{ color: att.is_primary ? '#f5b301' : '#c7c9d6' }}
                        >
                          {att.is_primary ? (
                            <StarIcon fontSize="small" />
                          ) : (
                            <StarBorderIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Typography sx={{ fontSize: 13, color: '#101025', wordBreak: 'break-word' }}>
                        {att.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12 }}>
                      {ATTACHMENT_TYPE_LABELS[att.type] || att.type}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12 }}>
                      {att.current_version}
                      {att.version_count > 1 ? ` (${att.version_count})` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12 }}>
                      {fmtSize(att.latest_version?.file_size)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12 }}>{fmtDate(att.created_at)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12, color: '#87879b' }}>
                      {att.comment || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Сохранить на компьютер">
                      <span>
                        <IconButton size="small" onClick={() => download(att)} disabled={!att.latest_version}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Новая версия">
                      <IconButton
                        size="small"
                        onClick={() => {
                          versionTargetRef.current = att.uuid;
                          versionInputRef.current?.click();
                        }}
                      >
                        <CloudUploadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Версии">
                      <IconButton size="small" onClick={() => openVersions(att)}>
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Изменить">
                      <IconButton size="small" onClick={() => openEdit(att)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить">
                      <IconButton size="small" onClick={() => handleDelete(att)} sx={{ color: '#e53935' }}>
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

      {/* Диалог «Изменить вложение» */}
      <Dialog open={!!editAtt} onClose={() => setEditAtt(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактирование вложения</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Наименование"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              size="small"
              fullWidth
            />
            <FormControl fullWidth size="small">
              <InputLabel>Тип</InputLabel>
              <Select
                label="Тип"
                value={editType}
                onChange={(e) => setEditType(e.target.value as AttachmentType)}
              >
                {(Object.keys(ATTACHMENT_TYPE_LABELS) as AttachmentType[]).map((t) => (
                  <MenuItem key={t} value={t}>
                    {ATTACHMENT_TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Комментарий"
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditAtt(null)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={busy}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог «Версии вложения» */}
      <Dialog open={!!versionsAtt} onClose={() => setVersionsAtt(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Версии вложения «{versionsAtt?.name}»</DialogTitle>
        <DialogContent dividers>
          {versionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack divider={<Divider flexItem />} spacing={1}>
              {versions.map((v) => (
                <Box
                  key={v.uuid}
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 13 }}>
                      Версия {v.version}
                      {versionsAtt && v.version === versionsAtt.current_version ? ' (текущая)' : ''}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#87879b' }}>
                      {v.file_name} • {fmtSize(v.file_size)} • {fmtDate(v.created_at)}
                      {v.comment ? ` • ${v.comment}` : ''}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => window.open(downloadAttachmentVersion(v.uuid), '_blank')}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              {versions.length === 0 && (
                <Typography sx={{ color: '#87879b', py: 2 }}>Версии не найдены.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionsAtt(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DocumentAttachmentsTab;
