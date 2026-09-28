import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

import {
  KND_APP_BLUE,
  KND_APP_BLUE_HOVER,
  KND_APP_BORDER,
  KND_APP_HOVER,
  KND_APP_SURFACE,
  KND_APP_TEXT,
  KND_APP_TEXT_MUTED,
  KND_WARN_BG,
  KND_WARN_BORDER,
  KND_WARN_TEXT,
} from '../../theme/knd';

/**
 * Общие блоки реестров модуля «ТОР Контроль».
 *
 * Раскладка у всех реестров одна: панель фильтров слева (её рисует KndShell),
 * список по центру и карточка выбранной записи справа. Здесь лежат кирпичи,
 * из которых собираются и «Учёт контролируемых лиц», и контрольные
 * мероприятия, и досудебное обжалование, — чтобы разметка не расползалась
 * копиями по страницам.
 */

// ===== РАБОЧАЯ ОБЛАСТЬ =====

export const KndWorkArea = styled(Box)({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  overflow: 'hidden',
});

export const KndListColumn = styled(Box)({
  flex: '1 1 56%',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
  overflowY: 'auto',
});

export const KndDetailColumn = styled(Box)({
  flex: '1 1 44%',
  minWidth: '300px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
  overflowY: 'auto',
  borderLeft: `1px solid ${KND_APP_BORDER}`,
});

// ===== ТУЛБАР НАД СПИСКОМ =====

export const KndToolbar = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
  flexShrink: 0,
  padding: '12px 16px',
  backgroundColor: KND_APP_SURFACE,
  borderBottom: `1px solid ${KND_APP_BORDER}`,
});

/** Синяя пилюля с названием реестра — как в референсе ГИС ТОР КНД. */
export const KndRegistryPill = styled(Box)({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  borderRadius: '16px',
  backgroundColor: KND_APP_BLUE,
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 600,
});

/** Кнопка действия в тулбаре: «Новый объект», «Выгрузить» и т.п. */
export const KndActionButton = styled(Box)({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  borderRadius: '3px',
  backgroundColor: KND_APP_BLUE,
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 120ms ease',
  '&:hover': { backgroundColor: KND_APP_BLUE_HOVER },
});

/** Текстовая ссылка-действие в тулбаре. */
export const KndTextButton = styled(Box)({
  color: KND_APP_BLUE,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'underline' },
});

/** Счётчик найденных записей — прижимается к правому краю тулбара. */
export const KndCounter = styled(Typography)({
  marginLeft: 'auto',
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
});

// ===== КАРТОЧКА СПИСКА =====

export const KndCard = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected?: boolean }>(({ selected }) => ({
  flexShrink: 0,
  padding: '10px 14px',
  borderRadius: '3px',
  backgroundColor: KND_APP_SURFACE,
  border: `1px solid ${selected ? KND_APP_BLUE : KND_APP_BORDER}`,
  boxShadow: selected ? '0 0 0 1px rgba(11, 92, 213, 0.22)' : 'none',
  cursor: 'pointer',
  transition: 'border-color 120ms ease',
  '&:hover': { borderColor: selected ? KND_APP_BLUE : '#c3cad3' },
}));

export const KndTagsRow = styled(Box)({
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  marginBottom: '6px',
});

export const KndCardTitle = styled(Typography)({
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: 1.35,
});

export const KndCardMeta = styled(Box)({
  marginTop: '6px',
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
});

export const KndMetaValue = styled('span')({
  color: '#4a5765',
});

export const KndEmptyState = styled(Box)({
  padding: '32px 16px',
  textAlign: 'center',
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
});

// ===== КАРТОЧКА ДЕТАЛИ =====

export const KndDetailCard = styled(Box)({
  padding: '16px',
  borderRadius: '3px',
  backgroundColor: KND_APP_SURFACE,
  border: `1px solid ${KND_APP_BORDER}`,
});

export const KndDetailTitle = styled(Typography)({
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  fontWeight: 700,
  lineHeight: 1.35,
  marginBottom: '14px',
});

/** Подзаголовок внутри карточки детали: отделяет блоки друг от друга. */
export const KndDetailSectionTitle = styled(Typography)({
  marginTop: '18px',
  marginBottom: '8px',
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
});

export const KndDetailRow = styled(Box)({
  display: 'flex',
  gap: '12px',
  padding: '7px 0',
  borderTop: `1px solid ${KND_APP_HOVER}`,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
});

export const KndDetailLabel = styled('span')({
  flexShrink: 0,
  width: '140px',
  color: KND_APP_TEXT_MUTED,
});

export const KndDetailValue = styled('span')({
  color: KND_APP_TEXT,
  fontWeight: 600,
  wordBreak: 'break-word',
});

// ===== ПОДСКАЗКА =====

/** Жёлтая подсказка, пока запись не выбрана, — как в референсе. */
export const KndWarnBanner = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 14px',
  borderRadius: '3px',
  backgroundColor: KND_WARN_BG,
  borderLeft: `3px solid ${KND_WARN_BORDER}`,
  color: KND_WARN_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  lineHeight: 1.45,
});
