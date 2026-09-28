import React, { useMemo, useState } from 'react';
import { Box, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';

import KndShell from '../../components/knd/KndShell';
import { KndBreadcrumb, KndSearchField, KndTag } from '../../components/knd/KndControls';
import {
  KndCard,
  KndCardMeta,
  KndCardTitle,
  KndCounter,
  KndDetailCard,
  KndDetailColumn,
  KndDetailLabel,
  KndDetailRow,
  KndDetailSectionTitle,
  KndDetailTitle,
  KndDetailValue,
  KndEmptyState,
  KndListColumn,
  KndMetaValue,
  KndRegistryPill,
  KndTagsRow,
  KndTextButton,
  KndToolbar,
  KndWarnBanner,
  KndWorkArea,
} from '../../components/knd/KndRegistry';
import { KND_APP_BLUE, KND_APP_TEXT, KND_APP_TEXT_MUTED } from '../../theme/knd';
import {
  APPEAL_STATUS_LABELS,
  KND_APPEALS,
  type AppealStatus,
} from './kndDemoData';
import { APPEAL_GROUNDS, APPEAL_GROUNDS_BY_KEY, APPEAL_TERMS } from './kndRegulation';

// ===== ПАНЕЛЬ ФИЛЬТРОВ =====

const FiltersArea = styled(Box)({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
});

const FilterHeader = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
  userSelect: 'none',
});

const FilterBody = styled(Box)({
  marginTop: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
});

const FilterFieldLabel = styled(Typography)({
  marginBottom: '6px',
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 600,
});

const TypeRadio = styled(Radio)({
  padding: '4px 8px 4px 4px',
  color: '#b6bec7',
  '&.Mui-checked': { color: KND_APP_BLUE },
});

const TypeLabel = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  color: KND_APP_TEXT,
});

const FilterGroup: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const [open, setOpen] = useState(true);
  return (
    <Box>
      <FilterHeader onClick={() => setOpen((value) => !value)}>
        <span>{title}</span>
        <ExpandMoreOutlinedIcon
          sx={{
            fontSize: 20,
            color: KND_APP_TEXT_MUTED,
            transform: open ? 'none' : 'rotate(-90deg)',
            transition: 'transform 120ms ease',
          }}
        />
      </FilterHeader>
      {open && <FilterBody>{children}</FilterBody>}
    </Box>
  );
};

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Box>
    <FilterFieldLabel>{label}</FilterFieldLabel>
    {children}
  </Box>
);

// ===== СПРАВОЧНЫЕ ПОДПИСИ =====

/**
 * Короткие подписи предметов обжалования для фильтра: полные формулировки
 * пункта 68 не помещаются рядом с радиокнопкой, но в карточке показываются
 * целиком вместе с номером подпункта.
 */
const GROUND_SHORT: Record<string, string> = {
  decision: 'Решение о проведении',
  act: 'Акт и предписание',
  actions: 'Действия должностных лиц',
  risk: 'Категория риска',
  refusal: 'Отказ в профилактическом визите',
};

const STATUS_STYLE: Record<AppealStatus, { color: string; background: string }> = {
  registered: { color: '#0b5cd5', background: '#e4edfb' },
  review: { color: '#8a6100', background: '#fdf0d5' },
  satisfied: { color: '#2b7a3d', background: '#e3f4e8' },
  rejected: { color: '#b23c3c', background: '#fbe4e4' },
};

const STATUS_ORDER: AppealStatus[] = ['registered', 'review', 'satisfied', 'rejected'];

const Note = styled(Box)({
  marginTop: '12px',
  padding: '8px 10px',
  borderRadius: '3px',
  backgroundColor: '#f5f7fa',
  color: '#4a5765',
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  lineHeight: 1.5,
});

// ===== КОМПОНЕНТ =====

/**
 * Реестр досудебного обжалования.
 *
 * Предметы обжалования перечислены в пункте 68 Положения, сроки рассмотрения —
 * в пункте 70.1: 15 рабочих дней в общем случае и не более 5 рабочих дней для
 * жалобы на отнесение объекта контроля к категории риска. Решение публикуется
 * в личном кабинете на ЕПГУ в течение одного рабочего дня (п. 71).
 */
const KndAppealsPage: React.FC = () => {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [ground, setGround] = useState('');
  const [status, setStatus] = useState<AppealStatus | ''>('');
  const [term, setTerm] = useState<'' | 'standard' | 'risk'>('');

  const appeals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return KND_APPEALS.filter((appeal) => {
      if (
        needle &&
        !appeal.subjectName.toLowerCase().includes(needle) &&
        !appeal.summary.toLowerCase().includes(needle) &&
        !appeal.number.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (ground && appeal.ground !== ground) return false;
      if (status && appeal.status !== status) return false;
      if (term === 'risk' && !appeal.onRiskCategory) return false;
      if (term === 'standard' && appeal.onRiskCategory) return false;
      return true;
    });
  }, [query, ground, status, term]);

  const [selected, setSelected] = useState<(typeof KND_APPEALS)[number] | null>(null);

  const resetFilters = () => {
    setGround('');
    setStatus('');
    setTerm('');
  };

  const filtersActive = Boolean(ground || status || term);

  const sidePanel = (
    <FiltersArea>
      <FilterGroup title="Досудебное обжалование">
        <FilterField label="Предмет обжалования">
          <RadioGroup value={ground} onChange={(event) => setGround(event.target.value as string)}>
            <FormControlLabel value="" control={<TypeRadio size="small" />} label={<TypeLabel>Все</TypeLabel>} />
            {APPEAL_GROUNDS.map((item) => (
              <FormControlLabel
                key={item.key}
                value={item.key}
                control={<TypeRadio size="small" />}
                label={<TypeLabel>{GROUND_SHORT[item.key] || item.label}</TypeLabel>}
              />
            ))}
          </RadioGroup>
        </FilterField>

        <FilterField label="Срок рассмотрения">
          <RadioGroup value={term} onChange={(event) => setTerm(event.target.value as '' | 'standard' | 'risk')}>
            <FormControlLabel value="" control={<TypeRadio size="small" />} label={<TypeLabel>Все</TypeLabel>} />
            <FormControlLabel
              value="standard"
              control={<TypeRadio size="small" />}
              label={<TypeLabel>Общий — 15 рабочих дней</TypeLabel>}
            />
            <FormControlLabel
              value="risk"
              control={<TypeRadio size="small" />}
              label={<TypeLabel>Категория риска — 5 рабочих дней</TypeLabel>}
            />
          </RadioGroup>
        </FilterField>

        <FilterField label="Статус">
          <RadioGroup
            value={status}
            onChange={(event) => setStatus(event.target.value as AppealStatus | '')}
          >
            <FormControlLabel value="" control={<TypeRadio size="small" />} label={<TypeLabel>Все</TypeLabel>} />
            {STATUS_ORDER.map((value) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<TypeRadio size="small" />}
                label={<TypeLabel>{APPEAL_STATUS_LABELS[value]}</TypeLabel>}
              />
            ))}
          </RadioGroup>
        </FilterField>
      </FilterGroup>

      {filtersActive && (
        <Box
          onClick={resetFilters}
          sx={{
            color: KND_APP_BLUE,
            fontFamily: 'Lato, sans-serif',
            fontSize: '12px',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Сбросить фильтры
        </Box>
      )}
    </FiltersArea>
  );

  const selectedGround = selected ? APPEAL_GROUNDS_BY_KEY[selected.ground] : undefined;

  return (
    <KndShell
      activeRail="appeals"
      breadcrumb={
        <KndBreadcrumb items={[{ label: 'Главная', path: '/knd' }, { label: 'Досудебное обжалование' }]} />
      }
      sidePanel={sidePanel}
      headerLeft={
        <Typography
          sx={{
            color: KND_APP_TEXT,
            fontFamily: 'Lato, sans-serif',
            fontSize: '15px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Жалобы. Досудебное обжалование
        </Typography>
      }
      headerCenter={<KndSearchField value={query} onChange={setQuery} />}
    >
      <KndToolbar>
        <KndRegistryPill>
          <CheckOutlinedIcon sx={{ fontSize: 15 }} />
          Подсистема досудебного обжалования
        </KndRegistryPill>
        <KndTextButton onClick={() => navigate('/knd/knm')}>Контрольные мероприятия</KndTextButton>
        <KndTextButton onClick={() => navigate('/knd/account')}>Контролируемые лица</KndTextButton>
        <KndCounter>
          {appeals.length} из {KND_APPEALS.length}
        </KndCounter>
      </KndToolbar>

      <KndWorkArea>
        <KndListColumn>
          {appeals.length ? (
            appeals.map((appeal) => (
              <KndCard
                key={appeal.id}
                selected={selected?.id === appeal.id}
                onClick={() => setSelected(appeal)}
              >
                <KndTagsRow>
                  <KndTag color="#0b5cd5" background="#e4edfb">
                    {GROUND_SHORT[appeal.ground] || appeal.ground}
                  </KndTag>
                  <KndTag
                    color={STATUS_STYLE[appeal.status].color}
                    background={STATUS_STYLE[appeal.status].background}
                  >
                    {APPEAL_STATUS_LABELS[appeal.status]}
                  </KndTag>
                  {appeal.onRiskCategory && (
                    <KndTag color="#8a6100" background="#fdf0d5">
                      5 рабочих дней
                    </KndTag>
                  )}
                </KndTagsRow>
                <KndCardTitle>{appeal.subjectName}</KndCardTitle>
                <KndCardMeta>
                  <span>
                    № <KndMetaValue>{appeal.number}</KndMetaValue>
                  </span>
                  <span>
                    Подана: <KndMetaValue>{appeal.filedAt}</KndMetaValue>
                  </span>
                  <span>
                    Рассмотреть до: <KndMetaValue>{appeal.dueAt}</KndMetaValue>
                  </span>
                </KndCardMeta>
              </KndCard>
            ))
          ) : (
            <KndEmptyState>По заданным условиям жалобы не найдены</KndEmptyState>
          )}
        </KndListColumn>

        <KndDetailColumn>
          {selected ? (
            <KndDetailCard>
              <KndTagsRow>
                <KndTag color="#0b5cd5" background="#e4edfb">
                  {GROUND_SHORT[selected.ground] || selected.ground}
                </KndTag>
                <KndTag
                  color={STATUS_STYLE[selected.status].color}
                  background={STATUS_STYLE[selected.status].background}
                >
                  {APPEAL_STATUS_LABELS[selected.status]}
                </KndTag>
              </KndTagsRow>
              <KndDetailTitle>{selected.subjectName}</KndDetailTitle>

              <KndDetailRow>
                <KndDetailLabel>Номер жалобы</KndDetailLabel>
                <KndDetailValue>{selected.number}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Дата подачи</KndDetailLabel>
                <KndDetailValue>{selected.filedAt}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Рассмотреть до</KndDetailLabel>
                <KndDetailValue>{selected.dueAt}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Содержание</KndDetailLabel>
                <KndDetailValue>{selected.summary}</KndDetailValue>
              </KndDetailRow>
              {selected.decision && (
                <KndDetailRow>
                  <KndDetailLabel>Решение</KndDetailLabel>
                  <KndDetailValue>{selected.decision}</KndDetailValue>
                </KndDetailRow>
              )}

              <KndDetailSectionTitle>Предмет обжалования</KndDetailSectionTitle>
              <Box
                sx={{
                  color: '#4a5765',
                  fontFamily: 'Lato, sans-serif',
                  fontSize: '12px',
                  lineHeight: 1.55,
                }}
              >
                {selectedGround ? (
                  <>
                    {selectedGround.label}{' '}
                    <Box component="span" sx={{ color: KND_APP_TEXT_MUTED, fontWeight: 600 }}>
                      ({selectedGround.clause})
                    </Box>
                  </>
                ) : (
                  'Предмет не указан'
                )}
              </Box>

              <Note>
                Срок рассмотрения —{' '}
                {selected.onRiskCategory ? APPEAL_TERMS.riskCategory : APPEAL_TERMS.standard}.
                <br />
                {APPEAL_TERMS.channel}.
                <br />
                {APPEAL_TERMS.publication}.
              </Note>
            </KndDetailCard>
          ) : (
            <KndWarnBanner>
              Внимание! Для просмотра жалобы выберите нужную запись слева
            </KndWarnBanner>
          )}
        </KndDetailColumn>
      </KndWorkArea>
    </KndShell>
  );
};

export default KndAppealsPage;
