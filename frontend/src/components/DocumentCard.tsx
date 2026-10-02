import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  Document,
  RegistryKind,
  REGISTRY_KIND_LABELS,
  getDocument,
  getDocumentTypes,
  updateDocument,
  DocumentType,
} from '../api/edoApi';
import DocumentAttachmentsTab from './DocumentAttachmentsTab';

type TabKey = 'details' | 'attachments' | 'registry' | 'hierarchy' | 'discussions';

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('ru-RU');
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 1.2, borderBottom: '1px solid #f0f0f5' }}>
      <Typography sx={{ width: 230, flexShrink: 0, color: '#87879b', fontSize: 13 }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, color: '#101025', wordBreak: 'break-word' }}>{value ?? '—'}</Box>
    </Box>
  );
}

export const DocumentCard: React.FC<{
  open: boolean;
  uuid: string | null;
  onClose: () => void;
}> = ({ open, uuid, onClose }) => {
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('details');
  const [types, setTypes] = useState<DocumentType[]>([]);

  // Локальное редактирование вкладки «Канцелярия»
  const [editTypeId, setEditTypeId] = useState<number | null>(null);
  const [editKind, setEditKind] = useState<RegistryKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadDoc = useCallback(async () => {
    if (!uuid) return;
    setLoading(true);
    setError(null);
    setSaveMsg(null);
    try {
      const d = await getDocument(uuid);
      setDoc(d);
      setEditTypeId(d.document_type_id ?? null);
      setEditKind(d.registry_kind ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось загрузить документ');
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    if (open && uuid) {
      setTab('details');
      loadDoc();
      getDocumentTypes()
        .then(setTypes)
        .catch(() => setTypes([]));
    }
  }, [open, uuid, loadDoc]);

  const handleSaveRegistry = async () => {
    if (!doc) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateDocument(doc.uuid, {
        document_type_id: editTypeId,
        registry_kind: editKind,
      });
      setDoc(updated);
      setSaveMsg('Сохранено');
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const kindLabel = doc?.registry_kind ? REGISTRY_KIND_LABELS[doc.registry_kind] : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          pr: 1,
        }}
      >
        <Box>
          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 600, fontSize: 18 }}>
            {doc?.name || 'Карточка документа'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#87879b' }}>
            {doc ? `${doc.registration_number || '—'}${kindLabel ? ` • ${kindLabel}` : ''}` : ''}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#87879b' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Детали" value="details" />
          <Tab label="Вложения" value="attachments" />
          <Tab label="Канцелярия" value="registry" />
          <Tab label="Иерархия" value="hierarchy" />
          <Tab label="Обсуждения" value="discussions" />
        </Tabs>
      </Box>
      <DialogContent dividers sx={{ minHeight: 360 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && doc && tab === 'details' && (
          <Box>
            <DetailRow label="Вид документа" value={doc.document_type_name || doc.type} />
            <DetailRow
              label="Канцелярский вид"
              value={doc.registry_kind ? REGISTRY_KIND_LABELS[doc.registry_kind] : '—'}
            />
            <DetailRow label="Регистрационный номер" value={doc.registration_number} />
            <DetailRow label="Дата регистрации" value={fmtDate(doc.registration_date)} />
            <DetailRow label="Тема / название" value={doc.name} />
            <DetailRow label="Подписант" value={doc.signer_full_name || doc.signer} />
            <DetailRow label="Исполнитель" value={doc.executor} />
            <DetailRow label="Дата документа" value={fmtDate(doc.created_at)} />
            <DetailRow label="Статус" value={doc.status} />
            <DetailRow label="Тип подписи" value={doc.signature_type} />
            <DetailRow
              label="Файл"
              value={`${doc.original_file_name} (${doc.original_file_size ? (doc.original_file_size / 1024).toFixed(1) : '?'} КБ)`}
            />
          </Box>
        )}

        {!loading && !error && doc && tab === 'registry' && (
          <Stack spacing={2} sx={{ maxWidth: 480 }}>
            <Typography sx={{ fontSize: 13, color: '#87879b' }}>
              Канцелярские реквизиты документа
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Вид документа</InputLabel>
              <Select
                label="Вид документа"
                value={editTypeId ?? ''}
                onChange={(e) => setEditTypeId(e.target.value ? Number(e.target.value) : null)}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {types.map((t) => (
                  <MenuItem key={t.uuid} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Канцелярский вид</InputLabel>
              <Select
                label="Канцелярский вид"
                value={editKind ?? ''}
                onChange={(e) => setEditKind((e.target.value as RegistryKind) || null)}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {(Object.keys(REGISTRY_KIND_LABELS) as RegistryKind[]).map((k) => (
                  <MenuItem key={k} value={k}>
                    {REGISTRY_KIND_LABELS[k]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DetailRow label="Регистрационный номер" value={doc.registration_number} />
            <DetailRow label="Дата регистрации" value={fmtDate(doc.registration_date)} />
            <Button variant="contained" onClick={handleSaveRegistry} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
            {saveMsg && (
              <Alert severity={saveMsg === 'Сохранено' ? 'success' : 'error'}>{saveMsg}</Alert>
            )}
          </Stack>
        )}

        {!loading && !error && doc && tab === 'attachments' && (
          <DocumentAttachmentsTab documentUuid={doc.uuid} />
        )}

        {!loading && !error && doc && (tab === 'hierarchy' || tab === 'discussions') && (
          <Box sx={{ py: 5, textAlign: 'center', color: '#87879b' }}>
            <Typography>
              Вкладка «{tab === 'hierarchy' ? 'Иерархия' : 'Обсуждения'}» — в разработке (следующие фазы СЭД).
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DocumentCard;
