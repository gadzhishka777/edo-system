import React from 'react';
import { Box, MenuItem, Select, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';

import {
  KND_APP_BLUE,
  KND_APP_BLUE_SOFT,
  KND_APP_BORDER,
  KND_APP_SURFACE,
  KND_APP_TEXT,
  KND_APP_TEXT_MUTED,
  KND_GREEN_SOFT,
  KND_GREEN_TEXT,
} from '../../theme/knd';

// ===== ПОИСК В ШАПКЕ =====

const SearchWrap = styled(Box)({
  position: 'relative',
  width: '100%',
});

const SearchInput = styled('input')({
  width: '100%',
  height: '34px',
  boxSizing: 'border-box',
  padding: '0 34px 0 12px',
  border: `1px solid ${KND_APP_BORDER}`,
  borderRadius: '3px',
  backgroundColor: KND_APP_SURFACE,
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  outline: 'none',
  '&::placeholder': { color: KND_APP_TEXT_MUTED },
  '&:focus': { borderColor: KND_APP_BLUE },
});

const SearchIconBox = styled(Box)({
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: KND_APP_TEXT_MUTED,
  lineHeight: 0,
  pointerEvents: 'none',
});

interface KndSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Строка поиска в шапке раздела — как в референсе, с иконкой справа. */
export const KndSearchField: React.FC<KndSearchFieldProps> = ({
  value,
  onChange,
  placeholder = 'Поиск...',
}) => (
  <SearchWrap>
    <SearchInput
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
    <SearchIconBox>
      <SearchOutlinedIcon sx={{ fontSize: 18 }} />
    </SearchIconBox>
  </SearchWrap>
);

// ===== ПОЛЯ ФИЛЬТРОВ =====

const InputWrap = styled(Box)({
  position: 'relative',
});

const InputIconBox = styled(Box)({
  position: 'absolute',
  left: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: KND_APP_TEXT_MUTED,
  lineHeight: 0,
  pointerEvents: 'none',
  zIndex: 1,
});

const fieldSx = {
  width: '100%',
  '& .MuiOutlinedInput-root': {
    height: '36px',
    borderRadius: '3px',
    backgroundColor: KND_APP_SURFACE,
    fontFamily: 'Lato, sans-serif',
    fontSize: '13px',
    '& fieldset': { borderColor: KND_APP_BORDER },
    '&:hover fieldset': { borderColor: '#c3cad3' },
    '&.Mui-focused fieldset': { borderColor: KND_APP_BLUE, borderWidth: '1px' },
  },
  '& .MuiOutlinedInput-input': {
    padding: '8px 12px 8px 34px',
    fontSize: '13px',
    color: KND_APP_TEXT,
    '&::placeholder': { color: KND_APP_TEXT_MUTED, opacity: 1 },
  },
};

interface KndFilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Текстовый фильтр панели. Собственной подписи у поля нет: название фильтра
 * уже выведено заголовком секции, дублировать его не нужно.
 */
export const KndFilterInput: React.FC<KndFilterInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
}) => (
  <InputWrap>
    <InputIconBox>
      <SearchOutlinedIcon sx={{ fontSize: 17 }} />
    </InputIconBox>
    <TextField
      value={value}
      placeholder={placeholder || label}
      onChange={(event) => onChange(event.target.value)}
      sx={fieldSx}
      variant="outlined"
    />
  </InputWrap>
);

interface KndFilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

/** Фильтр-список панели. Пустое значение трактуется как «не выбрано». */
export const KndFilterSelect: React.FC<KndFilterSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
}) => (
  <InputWrap>
    <InputIconBox>
      <SearchOutlinedIcon sx={{ fontSize: 17 }} />
    </InputIconBox>
    <Select
      value={value}
      displayEmpty
      onChange={(event) => onChange(event.target.value as string)}
      IconComponent={ExpandMoreOutlinedIcon}
      sx={{
        ...fieldSx,
        '& .MuiSelect-select': {
          padding: '8px 32px 8px 34px',
          fontSize: '13px',
          color: KND_APP_TEXT,
          fontFamily: 'Lato, sans-serif',
        },
        '& .MuiSelect-icon': { color: KND_APP_TEXT_MUTED, fontSize: 20, right: '8px' },
      }}
      renderValue={(selected) =>
        selected ? (
          (selected as string)
        ) : (
          <Box component="span" sx={{ color: KND_APP_TEXT_MUTED }}>
            {placeholder || label}
          </Box>
        )
      }
    >
      <MenuItem value="" sx={{ fontSize: '13px' }}>
        <Box component="span" sx={{ color: KND_APP_TEXT_MUTED }}>
          Не выбрано
        </Box>
      </MenuItem>
      {options.map((option) => (
        <MenuItem key={option} value={option} sx={{ fontSize: '13px' }}>
          {option}
        </MenuItem>
      ))}
    </Select>
  </InputWrap>
);

// ===== ЧИПЫ =====

const BaseTag = styled(Box)({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '3px',
  fontFamily: 'Lato, sans-serif',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
});

const KindTag = styled(BaseTag)({
  backgroundColor: KND_APP_BLUE_SOFT,
  color: KND_APP_BLUE,
});

const ActiveTag = styled(BaseTag)({
  backgroundColor: KND_GREEN_SOFT,
  color: KND_GREEN_TEXT,
});

const StoppedTag = styled(BaseTag)({
  backgroundColor: '#fbe4e4',
  color: '#b23c3c',
});

/** Синий чип типа субъекта: «Юридическое лицо», «ИП» и т.п. */
export const KndKindTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <KindTag>{children}</KindTag>
);

/** Чип статуса деятельности: зелёный «Действующая», красный «Прекращена». */
export const KndStatusTag: React.FC<{ active: boolean }> = ({ active }) =>
  active ? <ActiveTag>Действующая</ActiveTag> : <StoppedTag>Прекращена</StoppedTag>;

/**
 * Универсальный чип с цветами из справочника домена.
 *
 * Нужен там, где смысл чипа задаёт Положение, а не общий компонент: категория
 * риска, статус контрольного мероприятия, исход жалобы. Цвета приходят
 * пропсами, поэтому этот файл не знает о предметной области.
 */
export const KndTag: React.FC<{
  children: React.ReactNode;
  color: string;
  background: string;
}> = ({ children, color, background }) => (
  <BaseTag sx={{ backgroundColor: background, color }}>{children}</BaseTag>
);

// ===== КРОШКИ =====

const CrumbLink = styled(RouterLink)({
  color: KND_APP_TEXT_MUTED,
  textDecoration: 'none',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  '&:hover': { color: KND_APP_BLUE, textDecoration: 'underline' },
});

const CrumbText = styled('span')({
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
});

const CrumbCurrent = styled('span')({
  color: KND_APP_BLUE,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 600,
});

const CrumbSeparator = styled('span')({
  color: '#b6bec7',
  fontSize: '12px',
});

export interface Crumb {
  label: string;
  /** Без пути элемент считается текущим (не ссылка). */
  path?: string;
}

/** Хлебные крошки вида «Главная · Учет · Субъекты». */
export const KndBreadcrumb: React.FC<{ items: Crumb[] }> = ({ items }) => (
  <>
    {items.map((item, index) => (
      <React.Fragment key={`${item.label}-${index}`}>
        {index > 0 && <CrumbSeparator>·</CrumbSeparator>}
        {item.path ? (
          <CrumbLink to={item.path}>{item.label}</CrumbLink>
        ) : index === items.length - 1 ? (
          <CrumbCurrent>{item.label}</CrumbCurrent>
        ) : (
          <CrumbText>{item.label}</CrumbText>
        )}
      </React.Fragment>
    ))}
  </>
);
