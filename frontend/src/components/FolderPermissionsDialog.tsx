import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  Autocomplete,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItemButton,
  ListItemText,
  Avatar,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import FolderIcon from '@mui/icons-material/Folder';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import {
  getFolderPermissions,
  putFolderPermissions,
  getDocumentEmployees,
  getApiErrorMessage,
  type FolderPermissionFolder,
  type FolderPermissionRule,
} from '../api/edoApi';

interface FolderPermissionsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Три роли, доступные для выдачи прав (соответствуют категориям ролей на
 * бэкенде, `app/core/roles.py`). Грант хранится как grantee_type='role',
 * grantee_key='cat:<категория>' и срабатывает, если у сотрудника есть хотя бы
 * одна роль из этой группы.
 */
const ROLE_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'cat:clerk', label: 'Делопроизводитель', hint: 'Архивариус, делопроизводитель, регистратор обращений' },
  { key: 'cat:basic', label: 'Исполнитель', hint: 'Инициатор, исполнитель поручений, наблюдатель и др.' },
  { key: 'cat:manager', label: 'Руководитель', hint: 'Руководитель департамента, утверждающий' },
];

const ACTION_COLUMNS: { key: 'can_view' | 'can_create_edit' | 'can_delete'; label: string; short: string }[] = [
  { key: 'can_view', label: 'Просмотр', short: 'Просмотр' },
  { key: 'can_create_edit', label: 'Создание / редактирование', short: 'Создание' },
  { key: 'can_delete', label: 'Удаление', short: 'Удаление' },
];

const EMPTY_ACTIONS = { can_view: true, can_create_edit: false, can_delete: false };

const GRID = 'minmax(180px, 1fr) 96px 120px 96px 40px';

const FolderPermissionsDialog: React.FC<FolderPermissionsDialogProps> = ({ open, onClose }) => {
  const [folders, setFolders] = useState<FolderPermissionFolder[]>([]);
  const [employees, setEmployees] = useState<{ id: number; full_name: string }[]>([]);
  const [draft, setDraft] = useState<Record<string, FolderPermissionRule[]>>({});
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [savedRef, setSavedRef] = useState<string | null>(null);

  // Форма добавления доступа для выбранной папки
  const [addMode, setAddMode] = useState<'role' | 'user'>('role');
  const [addRoleKey, setAddRoleKey] = useState<string>('');
  const [addEmployees, setAddEmployees] = useState<{ id: number; full_name: string }[]>([]);
  const [addActions, setAddActions] = useState({ ...EMPTY_ACTIONS });

  const roleLabel = (key: string) => ROLE_OPTIONS.find((r) => r.key === key)?.label || key;
  const empLabel = (key: string) => employees.find((e) => String(e.id) === key)?.full_name || `#${key}`;
  const granteeLabel = (g: FolderPermissionRule) =>
    g.grantee_type === 'role' ? roleLabel(g.grantee_key) : empLabel(g.grantee_key);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [permRes, empRes] = await Promise.all([getFolderPermissions(), getDocumentEmployees()]);
      setFolders(permRes.folders);
      setEmployees(empRes.map((e) => ({ id: e.id, full_name: e.full_name })));
      const init: Record<string, FolderPermissionRule[]> = {};
      for (const f of permRes.folders) init[f.ref] = f.rules.map((r) => ({ ...r }));
      setDraft(init);
      setSelectedRef(permRes.folders[0]?.ref ?? null);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка загрузки прав доступа'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = (ref: string) => {
    const orig = folders.find((f) => f.ref === ref)?.rules ?? [];
    const cur = draft[ref] ?? [];
    return JSON.stringify(orig) !== JSON.stringify(cur);
  };

  const updateRule = (ref: string, index: number, patch: Partial<FolderPermissionRule>) => {
    setDraft((d) => ({ ...d, [ref]: (d[ref] || []).map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  };

  const removeRule = (ref: string, index: number) => {
    setDraft((d) => ({ ...d, [ref]: (d[ref] || []).filter((_, i) => i !== index) }));
  };

  const addGrant = (ref: string) => {
    if (addMode === 'role') {
      if (!addRoleKey) return;
      if ((draft[ref] || []).some((g) => g.grantee_type === 'role' && g.grantee_key === addRoleKey)) return;
      const rule: FolderPermissionRule = { grantee_type: 'role', grantee_key: addRoleKey, ...addActions };
      setDraft((d) => ({ ...d, [ref]: [...(d[ref] || []), rule] }));
      setAddRoleKey('');
    } else {
      const existing = new Set((draft[ref] || []).filter((g) => g.grantee_type === 'user').map((g) => g.grantee_key));
      const toAdd = addEmployees.filter((e) => !existing.has(String(e.id)));
      if (!toAdd.length) return;
      const rules: FolderPermissionRule[] = toAdd.map((e) => ({
        grantee_type: 'user',
        grantee_key: String(e.id),
        ...addActions,
      }));
      setDraft((d) => ({ ...d, [ref]: [...(d[ref] || []), ...rules] }));
      setAddEmployees([]);
    }
    setAddActions({ ...EMPTY_ACTIONS });
  };

  const save = async (ref: string) => {
    setSavingRef(ref);
    setError(null);
    try {
      const res = await putFolderPermissions(ref, draft[ref] || []);
      setFolders((fs) => fs.map((f) => (f.ref === ref ? { ...f, rules: res.rules } : f)));
      setDraft((d) => ({ ...d, [ref]: res.rules.map((r) => ({ ...r })) }));
      setSavedRef(ref);
      setTimeout(() => setSavedRef((s) => (s === ref ? null : s)), 2500);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Ошибка сохранения прав доступа'));
    } finally {
      setSavingRef(null);
    }
  };

  const selected = useMemo(() => folders.find((f) => f.ref === selectedRef) || null, [folders, selectedRef]);
  const selectedRules = selectedRef ? draft[selectedRef] || [] : [];
  const canAdd = addMode === 'role' ? !!addRoleKey : addEmployees.length > 0;
  const availableRoles = (ref: string) =>
    ROLE_OPTIONS.filter((o) => !(draft[ref] || []).some((g) => g.grantee_type === 'role' && g.grantee_key === o.key));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle
        sx={{
          fontFamily: 'Lato, sans-serif', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Box>
          Права доступа к папкам
          <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '12px', color: '#87879b', fontWeight: 400, mt: 0.25 }}>
            Настраивается администратором. Папка без правил открыта всем сотрудникам организации.
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ fontFamily: 'Lato, sans-serif', p: 0 }}>
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
        ) : (
          <Box sx={{ display: 'flex', height: '64vh', minHeight: 380 }}>
            {/* Левая колонка — список папок */}
            <Box sx={{ width: 300, borderRight: '1px solid #eaebf0', overflowY: 'auto', flexShrink: 0 }}>
              <List dense disablePadding>
                {folders.map((f) => {
                  const rules = draft[f.ref] || [];
                  const openAll = rules.length === 0;
                  const active = f.ref === selectedRef;
                  return (
                    <ListItemButton
                      key={f.ref}
                      selected={active}
                      onClick={() => setSelectedRef(f.ref)}
                      sx={{
                        alignItems: 'flex-start',
                        borderBottom: '1px solid #f4f4f8',
                        '&.Mui-selected': { backgroundColor: '#eef1ff' },
                        '&.Mui-selected:hover': { backgroundColor: '#e4e9ff' },
                      }}
                    >
                      <FolderIcon fontSize="small" sx={{ mt: 0.5, mr: 1, color: active ? '#4c6ef5' : '#b0b3c3' }} />
                      <ListItemText
                        disableTypography
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontFamily: 'Lato, sans-serif', fontSize: '14px', fontWeight: active ? 600 : 500 }}>
                            <span>{f.label}</span>
                            {isDirty(f.ref) && <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#f59f00' }} />}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                            {openAll ? (
                              <Chip size="small" icon={<LockOpenIcon />} label="Открыта" color="success" variant="outlined"
                                sx={{ fontSize: '10px', height: '18px' }} />
                            ) : (
                              <Chip size="small" icon={<LockIcon />} label={`${rules.length} правил`}
                                sx={{ fontSize: '10px', height: '18px', background: '#eef1ff', color: '#4c6ef5' }} />
                            )}
                            <Chip size="small" label={f.type === 'system' ? 'системная' : 'кастомная'}
                              sx={{ fontSize: '10px', height: '18px', color: '#87879b', background: '#f4f4f8' }} />
                          </Box>
                        }
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            </Box>

            {/* Правая колонка — редактор выбранной папки */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
              {!selected ? (
                <Typography sx={{ color: '#87879b', fontSize: '14px' }}>Выберите папку слева</Typography>
              ) : (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>{selected.label}</Typography>
                    {selectedRules.length === 0 ? (
                      <Chip size="small" icon={<LockOpenIcon />} label="Открыта для всех" color="success" variant="outlined"
                        sx={{ fontSize: '11px', height: '20px' }} />
                    ) : (
                      <Chip size="small" icon={<LockIcon />} label="Доступ ограничен"
                        sx={{ fontSize: '11px', height: '20px', background: '#eef1ff', color: '#4c6ef5' }} />
                    )}
                  </Box>

                  {selectedRules.length === 0 && (
                    <Alert severity="info" sx={{ mb: 2, fontSize: '13px' }}>
                      Правила не заданы — папка доступна всем сотрудникам организации. Добавьте доступ ниже, чтобы ограничить.
                    </Alert>
                  )}

                  {selectedRules.length > 0 && (
                    <Box sx={{ border: '1px solid #eaebf0', borderRadius: '10px', overflow: 'hidden', mb: 2 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: GRID, px: 1.5, py: 0.75, background: '#fafafc', borderBottom: '1px solid #eaebf0' }}>
                        <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#87879b' }}>Кому</Typography>
                        {ACTION_COLUMNS.map((a) => (
                          <Typography key={a.key} sx={{ fontSize: '12px', fontWeight: 600, color: '#87879b', textAlign: 'center' }}>
                            {a.short}
                          </Typography>
                        ))}
                        <span />
                      </Box>
                      {selectedRules.map((g, idx) => (
                        <Box
                          key={idx}
                          sx={{ display: 'grid', gridTemplateColumns: GRID, px: 1.5, py: 0.5, alignItems: 'center', borderBottom: '1px solid #f4f4f8', '&:last-of-type': { borderBottom: 'none' } }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Avatar sx={{ width: 24, height: 24, background: g.grantee_type === 'role' ? '#eef1ff' : '#f1f8f4' }}>
                              {g.grantee_type === 'role'
                                ? <GroupIcon sx={{ fontSize: 15, color: '#4c6ef5' }} />
                                : <PersonIcon sx={{ fontSize: 15, color: '#2f9e44' }} />}
                            </Avatar>
                            <Typography noWrap sx={{ fontSize: '14px' }} title={granteeLabel(g)}>{granteeLabel(g)}</Typography>
                          </Box>
                          {ACTION_COLUMNS.map((a) => (
                            <Box key={a.key} sx={{ textAlign: 'center' }}>
                              <Checkbox
                                size="small"
                                checked={!!g[a.key]}
                                onChange={(e) => updateRule(selected.ref, idx, { [a.key]: e.target.checked } as Partial<FolderPermissionRule>)}
                              />
                            </Box>
                          ))}
                          <Box sx={{ textAlign: 'center' }}>
                            <Tooltip title="Убрать доступ">
                              <IconButton size="small" onClick={() => removeRule(selected.ref, idx)}><DeleteIcon fontSize="small" /></IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Добавление доступа */}
                  <Box sx={{ border: '1px dashed #d5d7e3', borderRadius: '10px', p: 2 }}>
                    <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#5b5b74', mb: 1.5 }}>
                      Добавить доступ
                    </Typography>

                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={addMode}
                      onChange={(_, v) => { if (v) { setAddMode(v); setAddRoleKey(''); setAddEmployees([]); } }}
                      sx={{ mb: 2 }}
                    >
                      <ToggleButton value="role" sx={{ textTransform: 'none', px: 2 }}>
                        <GroupIcon fontSize="small" sx={{ mr: 0.5 }} /> По роли
                      </ToggleButton>
                      <ToggleButton value="user" sx={{ textTransform: 'none', px: 2 }}>
                        <PersonIcon fontSize="small" sx={{ mr: 0.5 }} /> По сотруднику
                      </ToggleButton>
                    </ToggleButtonGroup>

                    {addMode === 'role' ? (
                      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                        <Select
                          displayEmpty
                          value={addRoleKey}
                          onChange={(e) => setAddRoleKey(e.target.value)}
                          renderValue={(v) => (v ? roleLabel(String(v)) : <span style={{ color: '#9aa0b4' }}>Выберите роль…</span>)}
                        >
                          {availableRoles(selected.ref).length === 0 && (
                            <MenuItem value="" disabled>Все роли уже добавлены</MenuItem>
                          )}
                          {availableRoles(selected.ref).map((o) => (
                            <MenuItem key={o.key} value={o.key}>
                              <Box>
                                <Typography sx={{ fontSize: '14px' }}>{o.label}</Typography>
                                <Typography sx={{ fontSize: '11px', color: '#87879b' }}>{o.hint}</Typography>
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <Autocomplete
                        multiple
                        size="small"
                        options={employees}
                        value={addEmployees}
                        onChange={(_, v) => setAddEmployees(v)}
                        getOptionLabel={(o) => o.full_name}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        noOptionsText="Нет сотрудников"
                        renderInput={(params) => <TextField {...params} placeholder="Начните вводить имя…" />}
                        sx={{ mb: 1.5 }}
                      />
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: '13px', color: '#5b5b74' }}>Права:</Typography>
                      {ACTION_COLUMNS.map((a) => (
                        <FormControlLabel
                          key={a.key}
                          control={
                            <Checkbox
                              size="small"
                              checked={(addActions as any)[a.key]}
                              onChange={(e) => setAddActions((s) => ({ ...s, [a.key]: e.target.checked }))}
                            />
                          }
                          label={<span style={{ fontSize: '14px' }}>{a.label}</span>}
                        />
                      ))}
                      <Box sx={{ flex: 1 }} />
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        disabled={!canAdd || (!addActions.can_view && !addActions.can_create_edit && !addActions.can_delete)}
                        onClick={() => addGrant(selected.ref)}
                      >
                        Добавить
                      </Button>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
                    {isDirty(selected.ref) && (
                      <Typography sx={{ fontSize: '12px', color: '#f59f00' }}>Есть несохранённые изменения</Typography>
                    )}
                    <Button
                      variant="contained"
                      startIcon={savingRef === selected.ref ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                      disabled={savingRef === selected.ref || !isDirty(selected.ref)}
                      onClick={() => save(selected.ref)}
                    >
                      {savedRef === selected.ref ? 'Сохранено' : 'Сохранить'}
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ fontFamily: 'Lato, sans-serif' }}>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FolderPermissionsDialog;
