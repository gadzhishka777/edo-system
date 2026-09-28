import React, { useMemo, useState } from 'react';
import { Box, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';

import KndShell from '../../components/knd/KndShell';
import {
  KndBreadcrumb,
  KndFilterSelect,
  KndSearchField,
  KndTag,
} from '../../components/knd/KndControls';
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
  CONTROL_MEASURE_STATUS_LABELS,
  KND_CONTROL_MEASURES,
  KND_REGIONS,
  type ControlMeasureStatus,
} from './kndDemoData';
import { CONTROL_MEASURE_TYPES, CONTROL_MEASURE_TYPES_BY_KEY, UNSCHEDULED_KINDS } from './kndRegulation';

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

// ===== СТАТУСЫ =====

/** Цвета статусов мероприятий: спокойный синий, работа — жёлтый, итог — зелёный. */
const STATUS_STYLE: Record<ControlMeasureStatus, { color: string; background: string }> = {
  planned: { color: '#0b5cd5', background: '#e4edfb' },
  in_progress: { color: '#8a6100', background: '#fdf0d5' },
  completed: { color: '#2b7a3d', background: '#e3f4e8' },
  canceled: { color: '#5b6672', background: '#eef0f3' },
};

const MeasureActions = styled('ul')({
  margin: '8px 0 0',
  paddingLeft: '18px',
  color: '#4a5765',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  lineHeight: 1.55,
});

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

const STATUS_ORDER: ControlMeasureStatus[] = ['planned', 'in_progress', 'completed', 'canceled'];

// ===== КОМПОНЕНТ =====

/**
 * Реестр контрольных (надзорных) мероприятий.
 *
 * Состав видов задан пунктом 26 Положения: документарная проверка, выездная
 * проверка и наблюдение за соблюдением обязательных требований (мониторинг
 * безопасности). Внеплановые мероприятия проводятся только в виде проверок
 * (п. 66), а сроки и допустимые действия у каждого вида свои.
 */
const KndKnmPage: React.FC = () => {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [character, setCharacter] = useState<'' | 'planned' | 'unplanned'>('');
  const [status, setStatus] = useState<ControlMeasureStatus | ''>('');
  const [region, setRegion] = useState('');

  const measures = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return KND_CONTROL_MEASURES.filter((measure) => {
      if (
        needle &&
        !measure.subjectName.toLowerCase().includes(needle) &&
        !measure.objectName.toLowerCase().includes(needle) &&
        !measure.number.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (type && measure.type !== type) return false;
      if (character === 'planned' && !measure.scheduled) return false;
      if (character === 'unplanned' && measure.scheduled) return false;
      if (status && measure.status !== status) return false;
      if (region && measure.region !== region) return false;
      return true;
    });
  }, [query, type, character, status, region]);

  const [selected, setSelected] = useState<(typeof KND_CONTROL_MEASURES)[number] | null>(null);

  const resetFilters = () => {
    setType('');
    setCharacter('');
    setStatus('');
    setRegion('');
  };

  const filtersActive = Boolean(type || character || status || region);

  const sidePanel = (
    <FiltersArea>
      <FilterGroup title="Контрольные мероприятия">
        <FilterField label="Вид мероприятия">
          <RadioGroup value={type} onChange={(event) => setType(event.target.value as string)}>
            <FormControlLabel value="" control={<TypeRadio size="small" />} label={<TypeLabel>Все</TypeLabel>} />
            {CONTROL_MEASURE_TYPES.map((item) => (
              <FormControlLabel
                key={item.key}
                value={item.key}
                control={<TypeRadio size="small" />}
                label={<TypeLabel>{item.short}</TypeLabel>}
              />
            ))}
          </RadioGroup>
        </FilterField>

        <FilterField label="Характер">
          <RadioGroup
            value={character}
            onChange={(event) => setCharacter(event.target.value as '' | 'planned' | 'unplanned')}
          >
            <FormControlLabel value="" control={<TypeRadio size="small" />} label={<TypeLabel>Все</TypeLabel>} />
            <FormControlLabel
              value="planned"
              control={<TypeRadio size="small" />}
              label={<TypeLabel>Плановое</TypeLabel>}
            />
            <FormControlLabel
              value="unplanned"
              control={<TypeRadio size="small" />}
              label={<TypeLabel>Внеплановое</TypeLabel>}
            />
          </RadioGroup>
        </FilterField>

        <FilterField label="Статус">
          <RadioGroup
            value={status}
            onChange={(event) => setStatus(event.target.value as ControlMeasureStatus | '')}
          >
            <FormControlLabel value="" control={<TypeRadio size="small" />} label={<TypeLabel>Все</TypeLabel>} />
            {STATUS_ORDER.map((value) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<TypeRadio size="small" />}
                label={<TypeLabel>{CONTROL_MEASURE_STATUS_LABELS[value]}</TypeLabel>}
              />
            ))}
          </RadioGroup>
        </FilterField>

        <FilterField label="Регион">
          <KndFilterSelect
            label="Регион"
            placeholder="Регион"
            value={region}
            onChange={setRegion}
            options={KND_REGIONS}
          />
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

  const selectedType = selected ? CONTROL_MEASURE_TYPES_BY_KEY[selected.type] : undefined;

  return (
    <KndShell
      activeRail="knm"
      breadcrumb={
        <KndBreadcrumb items={[{ label: 'Главная', path: '/knd' }, { label: 'Контрольные мероприятия' }]} />
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
          Контрольные (надзорные) мероприятия
        </Typography>
      }
      headerCenter={<KndSearchField value={query} onChange={setQuery} />}
    >
      <KndToolbar>
        <KndRegistryPill>
          <CheckOutlinedIcon sx={{ fontSize: 15 }} />
          Единый реестр КНМ
        </KndRegistryPill>
        <KndTextButton onClick={() => navigate('/knd/account')}>Контролируемые лица</KndTextButton>
        <KndTextButton onClick={() => navigate('/knd/appeals')}>Жалобы</KndTextButton>
        <KndCounter>
          {measures.length} из {KND_CONTROL_MEASURES.length}
        </KndCounter>
      </KndToolbar>

      <KndWorkArea>
        <KndListColumn>
          {measures.length ? (
            measures.map((measure) => {
              const measureType = CONTROL_MEASURE_TYPES_BY_KEY[measure.type];
              const statusStyle = STATUS_STYLE[measure.status];
              return (
                <KndCard
                  key={measure.id}
                  selected={selected?.id === measure.id}
                  onClick={() => setSelected(measure)}
                >
                  <KndTagsRow>
                    <KndTag color="#0b5cd5" background="#e4edfb">
                      {measureType ? measureType.short : measure.type}
                    </KndTag>
                    <KndTag
                      color={measure.scheduled ? '#3d5470' : '#8a6100'}
                      background={measure.scheduled ? '#eef0f3' : '#fdf0d5'}
                    >
                      {measure.scheduled ? 'Плановое' : 'Внеплановое'}
                    </KndTag>
                    <KndTag color={statusStyle.color} background={statusStyle.background}>
                      {CONTROL_MEASURE_STATUS_LABELS[measure.status]}
                    </KndTag>
                  </KndTagsRow>
                  <KndCardTitle>{measure.subjectName}</KndCardTitle>
                  <KndCardMeta>
                    <span>
                      № <KndMetaValue>{measure.number}</KndMetaValue>
                    </span>
                    <span>
                      Срок: <KndMetaValue>
                        {measure.startDate} — {measure.endDate}
                      </KndMetaValue>
                    </span>
                    <span>
                      Регион: <KndMetaValue>{measure.region}</KndMetaValue>
                    </span>
                  </KndCardMeta>
                </KndCard>
              );
            })
          ) : (
            <KndEmptyState>По заданным условиям мероприятия не найдены</KndEmptyState>
          )}
        </KndListColumn>

        <KndDetailColumn>
          {selected ? (
            <KndDetailCard>
              <KndTagsRow>
                <KndTag color="#0b5cd5" background="#e4edfb">
                  {selectedType ? selectedType.label : selected.type}
                </KndTag>
                <KndTag
                  color={selected.scheduled ? '#3d5470' : '#8a6100'}
                  background={selected.scheduled ? '#eef0f3' : '#fdf0d5'}
                >
                  {selected.scheduled ? 'Плановое' : 'Внеплановое'}
                </KndTag>
                <KndTag
                  color={STATUS_STYLE[selected.status].color}
                  background={STATUS_STYLE[selected.status].background}
                >
                  {CONTROL_MEASURE_STATUS_LABELS[selected.status]}
                </KndTag>
              </KndTagsRow>
              <KndDetailTitle>{selected.subjectName}</KndDetailTitle>

              <KndDetailRow>
                <KndDetailLabel>Номер в реестре</KndDetailLabel>
                <KndDetailValue>{selected.number}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Объект контроля</KndDetailLabel>
                <KndDetailValue>{selected.objectName}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Срок проведения</KndDetailLabel>
                <KndDetailValue>
                  {selected.startDate} — {selected.endDate}
                </KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Должностное лицо</KndDetailLabel>
                <KndDetailValue>{selected.inspector}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Регион</KndDetailLabel>
                <KndDetailValue>{selected.region}</KndDetailValue>
              </KndDetailRow>
              <KndDetailRow>
                <KndDetailLabel>Основание</KndDetailLabel>
                <KndDetailValue>{selected.basis}</KndDetailValue>
              </KndDetailRow>
              {selected.result && (
                <KndDetailRow>
                  <KndDetailLabel>Результат</KndDetailLabel>
                  <KndDetailValue>{selected.result}</KndDetailValue>
                </KndDetailRow>
              )}

              {selectedType && (
                <>
                  <KndDetailSectionTitle>Порядок проведения</KndDetailSectionTitle>
                  <KndDetailRow>
                    <KndDetailLabel>Место</KndDetailLabel>
                    <KndDetailValue>{selectedType.place}</KndDetailValue>
                  </KndDetailRow>
                  <KndDetailRow>
                    <KndDetailLabel>Срок</KndDetailLabel>
                    <KndDetailValue>{selectedType.term}</KndDetailValue>
                  </KndDetailRow>
                  <KndDetailRow>
                    <KndDetailLabel>Действия</KndDetailLabel>
                    <KndDetailValue>
                      <MeasureActions>
                        {selectedType.actions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </MeasureActions>
                    </KndDetailValue>
                  </KndDetailRow>
                  <Note>
                    Основание вида мероприятия — {selectedType.clause} Положения. {UNSCHEDULED_KINDS}.
                  </Note>
                </>
              )}
            </KndDetailCard>
          ) : (
            <KndWarnBanner>
              Внимание! Для просмотра контрольного мероприятия выберите нужную запись слева
            </KndWarnBanner>
          )}
        </KndDetailColumn>
      </KndWorkArea>
    </KndShell>
  );
};

export default KndKnmPage;
