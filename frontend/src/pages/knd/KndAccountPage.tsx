import React, { useMemo, useState } from 'react';
import { Box, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate, useSearchParams } from 'react-router-dom';

import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';

import KndShell from '../../components/knd/KndShell';
import {
  KndBreadcrumb,
  KndFilterInput,
  KndFilterSelect,
  KndKindTag,
  KndSearchField,
  KndStatusTag,
  KndTag,
} from '../../components/knd/KndControls';
import {
  KndActionButton,
  KndCard,
  KndCardMeta,
  KndCardTitle,
  KndCounter,
  KndDetailCard,
  KndDetailLabel,
  KndDetailRow,
  KndDetailSectionTitle,
  KndDetailTitle,
  KndDetailValue,
  KndDetailColumn,
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
import {
  KND_APP_BLUE,
  KND_APP_BORDER,
  KND_APP_TEXT,
  KND_APP_TEXT_MUTED,
  KND_OBJECT_NEW_PATH,
} from '../../theme/knd';
import {
  KND_OBJECTS,
  KND_OKVED,
  KND_REGIONS,
  KND_SUBJECTS,
  SUBJECT_KIND_LABELS,
  SUBJECT_KIND_ORDER,
  SUBJECT_KIND_SHORT,
  type KndObject,
  type KndSubject,
  type SubjectKind,
} from './kndDemoData';
import {
  CONTROL_OBJECT_KINDS_BY_CODE,
  DUE_DILIGENCE_REWARD,
  RISK_CATEGORIES,
  RISK_CRITERIA_BY_ID,
  RISK_ORDER,
  type RiskCategory,
} from './kndRegulation';

// ===== ПАНЕЛЬ ФИЛЬТРОВ =====

const TabsRow = styled(Box)({
  display: 'flex',
  gap: '4px',
  padding: '0 16px',
  borderBottom: `1px solid ${KND_APP_BORDER}`,
});

const TabItem = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active?: boolean }>(({ active }) => ({
  padding: '12px 10px 10px',
  marginBottom: '-1px',
  cursor: 'pointer',
  borderBottom: `2px solid ${active ? KND_APP_BLUE : 'transparent'}`,
  color: active ? KND_APP_BLUE : KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: active ? 600 : 500,
  transition: 'color 120ms ease',
  '&:hover': { color: KND_APP_BLUE },
}));

const PanelActions = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  padding: '12px 16px',
  borderBottom: `1px solid ${KND_APP_BORDER}`,
});

const pillBase = {
  padding: '6px 14px',
  borderRadius: '16px',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
  transition: 'background-color 120ms ease, border-color 120ms ease',
};

const ActionPillFilled = styled(Box)({
  ...pillBase,
  backgroundColor: KND_APP_BLUE,
  border: `1px solid ${KND_APP_BLUE}`,
  color: '#ffffff',
  '&:hover': { backgroundColor: '#0a4fb8', borderColor: '#0a4fb8' },
});

const ActionPillOutline = styled(Box)({
  ...pillBase,
  backgroundColor: '#ffffff',
  border: `1px solid ${KND_APP_BLUE}`,
  color: KND_APP_BLUE,
  '&:hover': { backgroundColor: '#f5f7fa' },
});

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

/** Сворачиваемая группа фильтров: заголовок с шевроном + содержимое. */
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

/** Поле внутри группы: подпись сверху, элемент управления под ней. */
const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Box>
    <FilterFieldLabel>{label}</FilterFieldLabel>
    {children}
  </Box>
);

// ===== БЛОК КАТЕГОРИИ РИСКА =====

const CriteriaList = styled('ul')({
  margin: '8px 0 0',
  paddingLeft: '18px',
  color: '#4a5765',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  lineHeight: 1.55,
});

const CriteriaItem = styled('li')({
  marginBottom: '6px',
});

const Clause = styled('span')({
  color: KND_APP_TEXT_MUTED,
  fontWeight: 600,
});

const ScheduleNote = styled(Box)({
  marginTop: '12px',
  padding: '8px 10px',
  borderRadius: '3px',
  backgroundColor: '#f5f7fa',
  color: '#4a5765',
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  lineHeight: 1.5,
});

/** Чип категории риска — цвета берутся из справочника Положения. */
const RiskTag: React.FC<{ risk: RiskCategory }> = ({ risk }) => {
  const info = RISK_CATEGORIES[risk];
  return (
    <KndTag color={info.color} background={info.background}>
      {info.label}
    </KndTag>
  );
};

// ===== КОМПОНЕНТ =====

/**
 * Реестр «Учёт. Реестры контролируемых лиц».
 *
 * Две вкладки: контролируемые лица (организации и ИП, п. 3 Положения) и
 * объекты контроля — их образовательная деятельность (п. 4). Раскладка
 * повторяет референс ГИС ТОР КНД: фильтры слева, список по центру, карточка
 * выбранной записи справа.
 */
const KndAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: 'subjects' | 'objects' = searchParams.get('tab') === 'objects' ? 'objects' : 'subjects';

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<SubjectKind | ''>('');
  const [risk, setRisk] = useState<RiskCategory | ''>('');
  const [region, setRegion] = useState('');
  const [inn, setInn] = useState('');
  const [okved, setOkved] = useState('');
  const [ogrn, setOgrn] = useState('');

  const [selectedSubject, setSelectedSubject] = useState<KndSubject | null>(null);
  const [selectedObject, setSelectedObject] = useState<KndObject | null>(null);

  const okvedCode = okved ? okved.split(' ')[0] : '';

  const subjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return KND_SUBJECTS.filter((subject) => {
      if (
        needle &&
        !subject.name.toLowerCase().includes(needle) &&
        !subject.inn.includes(needle) &&
        !subject.ogrn.includes(needle)
      ) {
        return false;
      }
      if (kind && subject.kind !== kind) return false;
      if (risk && subject.risk !== risk) return false;
      if (region && subject.region !== region) return false;
      if (inn.trim() && !subject.inn.includes(inn.trim())) return false;
      if (ogrn.trim() && !subject.ogrn.includes(ogrn.trim())) return false;
      if (okvedCode && subject.okved !== okvedCode) return false;
      return true;
    });
  }, [query, kind, risk, region, inn, ogrn, okvedCode]);

  const objects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return KND_OBJECTS.filter((object) => {
      if (
        needle &&
        !object.name.toLowerCase().includes(needle) &&
        !object.subjectName.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (risk && object.risk !== risk) return false;
      if (region && object.region !== region) return false;
      return true;
    });
  }, [query, risk, region]);

  const switchTab = (next: 'subjects' | 'objects') => {
    setSearchParams(next === 'objects' ? { tab: 'objects' } : {}, { replace: true });
    setSelectedSubject(null);
    setSelectedObject(null);
  };

  const resetFilters = () => {
    setKind('');
    setRisk('');
    setRegion('');
    setInn('');
    setOkved('');
    setOgrn('');
  };

  const filtersActive = Boolean(kind || risk || region || inn || okved || ogrn);

  const sidePanel = (
    <>
      <TabsRow>
        <TabItem active={tab === 'subjects'} onClick={() => switchTab('subjects')}>
          Контролируемые лица
        </TabItem>
        <TabItem active={tab === 'objects'} onClick={() => switchTab('objects')}>
          Объекты контроля
        </TabItem>
      </TabsRow>

      <PanelActions>
        <ActionPillFilled onClick={() => navigate('/knd/knm')}>Контрольные мероприятия</ActionPillFilled>
        <ActionPillOutline onClick={() => navigate('/knd/appeals')}>Жалобы</ActionPillOutline>
      </PanelActions>

      <FiltersArea>
        <FilterGroup title={tab === 'subjects' ? 'Контролируемые лица' : 'Объекты контроля'}>
          {tab === 'subjects' && (
            <FilterField label="Вид организации">
              <RadioGroup
                value={kind}
                onChange={(event) => setKind(event.target.value as SubjectKind | '')}
              >
                <FormControlLabel
                  value=""
                  control={<TypeRadio size="small" />}
                  label={<TypeLabel>Все</TypeLabel>}
                />
                {SUBJECT_KIND_ORDER.map((value) => (
                  <FormControlLabel
                    key={value}
                    value={value}
                    control={<TypeRadio size="small" />}
                    label={<TypeLabel>{SUBJECT_KIND_SHORT[value]}</TypeLabel>}
                  />
                ))}
              </RadioGroup>
            </FilterField>
          )}

          <FilterField label="Категория риска">
            <RadioGroup
              value={risk}
              onChange={(event) => setRisk(event.target.value as RiskCategory | '')}
            >
              <FormControlLabel
                value=""
                control={<TypeRadio size="small" />}
                label={<TypeLabel>Все</TypeLabel>}
              />
              {RISK_ORDER.map((value) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<TypeRadio size="small" />}
                  label={<TypeLabel>{RISK_CATEGORIES[value].label}</TypeLabel>}
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

          {tab === 'subjects' && (
            <>
              <FilterField label="ИНН">
                <KndFilterInput label="ИНН" placeholder="ИНН" value={inn} onChange={setInn} />
              </FilterField>

              <FilterField label="ОКВЭД">
                <KndFilterSelect
                  label="ОКВЭД"
                  placeholder="ОКВЭД"
                  value={okved}
                  onChange={setOkved}
                  options={KND_OKVED}
                />
              </FilterField>

              <FilterField label="ОГРН">
                <KndFilterInput label="ОГРН" placeholder="ОГРН" value={ogrn} onChange={setOgrn} />
              </FilterField>
            </>
          )}
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
    </>
  );

  const breadcrumbItems =
    tab === 'subjects'
      ? [
          { label: 'Главная', path: '/knd' },
          { label: 'Учёт', path: '/knd/account' },
          { label: 'Контролируемые лица' },
        ]
      : [
          { label: 'Главная', path: '/knd' },
          { label: 'Учёт', path: '/knd/account' },
          { label: 'Объекты контроля' },
        ];

  return (
    <KndShell
      activeRail={tab}
      breadcrumb={<KndBreadcrumb items={breadcrumbItems} />}
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
          Учёт. Реестры контролируемых лиц
        </Typography>
      }
      headerCenter={<KndSearchField value={query} onChange={setQuery} />}
    >
      <KndToolbar>
        <KndRegistryPill>
          <CheckOutlinedIcon sx={{ fontSize: 15 }} />
          {tab === 'subjects' ? 'Реестр контролируемых лиц' : 'Реестр объектов контроля'}
        </KndRegistryPill>
        <KndTextButton onClick={() => navigate('/knd/knm')}>Перейти в КНМ</KndTextButton>
        {tab === 'objects' && (
          <KndActionButton onClick={() => navigate(KND_OBJECT_NEW_PATH)}>
            <AddCircleOutlinedIcon sx={{ fontSize: 16 }} />
            Новый объект
          </KndActionButton>
        )}
        <KndCounter>
          {tab === 'subjects'
            ? `${subjects.length} из ${KND_SUBJECTS.length}`
            : `${objects.length} из ${KND_OBJECTS.length}`}
        </KndCounter>
      </KndToolbar>

      <KndWorkArea>
        <KndListColumn>
          {tab === 'subjects' ? (
            subjects.length ? (
              subjects.map((subject) => (
                <KndCard
                  key={subject.id}
                  selected={selectedSubject?.id === subject.id}
                  onClick={() => setSelectedSubject(subject)}
                >
                  <KndTagsRow>
                    <KndKindTag>{SUBJECT_KIND_SHORT[subject.kind]}</KndKindTag>
                    <RiskTag risk={subject.risk} />
                    <KndStatusTag active={subject.active} />
                  </KndTagsRow>
                  <KndCardTitle>{subject.name}</KndCardTitle>
                  <KndCardMeta>
                    <span>
                      ОГРН: <KndMetaValue>{subject.ogrn}</KndMetaValue>
                    </span>
                    <span>
                      ИНН: <KndMetaValue>{subject.inn}</KndMetaValue>
                    </span>
                    <span>
                      КПП: <KndMetaValue>{subject.kpp}</KndMetaValue>
                    </span>
                    <span>
                      Регион: <KndMetaValue>{subject.region}</KndMetaValue>
                    </span>
                  </KndCardMeta>
                </KndCard>
              ))
            ) : (
              <KndEmptyState>По заданным условиям контролируемые лица не найдены</KndEmptyState>
            )
          ) : objects.length ? (
            objects.map((object) => (
              <KndCard
                key={object.id}
                selected={selectedObject?.id === object.id}
                onClick={() => setSelectedObject(object)}
              >
                <KndTagsRow>
                  <KndKindTag>{object.kindCode}</KndKindTag>
                  <RiskTag risk={object.risk} />
                  {object.smart && <KndTag color="#ffffff" background="#1fb6a6">Смарт</KndTag>}
                </KndTagsRow>
                <KndCardTitle>{object.name}</KndCardTitle>
                <KndCardMeta>
                  <span>
                    Контролируемое лицо: <KndMetaValue>{object.subjectName}</KndMetaValue>
                  </span>
                  <span>
                    Регион: <KndMetaValue>{object.region}</KndMetaValue>
                  </span>
                </KndCardMeta>
              </KndCard>
            ))
          ) : (
            <KndEmptyState>По заданным условиям объекты контроля не найдены</KndEmptyState>
          )}
        </KndListColumn>

        <KndDetailColumn>
          {tab === 'subjects' &&
            (selectedSubject ? (
              <KndDetailCard>
                <KndTagsRow>
                  <KndKindTag>{SUBJECT_KIND_LABELS[selectedSubject.kind]}</KndKindTag>
                  <RiskTag risk={selectedSubject.risk} />
                  <KndStatusTag active={selectedSubject.active} />
                </KndTagsRow>
                <KndDetailTitle>{selectedSubject.name}</KndDetailTitle>

                <KndDetailRow>
                  <KndDetailLabel>ОГРН</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.ogrn}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>ИНН</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.inn}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>КПП</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.kpp}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Регион</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.region}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>ОКВЭД</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.okved || '—'}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Лицензия</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.license}</KndDetailValue>
                </KndDetailRow>

                <KndDetailSectionTitle>Категория риска</KndDetailSectionTitle>
                <KndDetailRow>
                  <KndDetailLabel>Категория</KndDetailLabel>
                  <KndDetailValue>{RISK_CATEGORIES[selectedSubject.risk].label}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Дата решения</KndDetailLabel>
                  <KndDetailValue>{selectedSubject.riskDecisionDate}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Основания</KndDetailLabel>
                  <KndDetailValue>
                    <CriteriaList>
                      {selectedSubject.riskCriteria.map((id) => {
                        const criterion = RISK_CRITERIA_BY_ID[id];
                        if (!criterion) return null;
                        return (
                          <CriteriaItem key={id}>
                            <Clause>{criterion.clause}.</Clause> {criterion.text}
                          </CriteriaItem>
                        );
                      })}
                    </CriteriaList>
                  </KndDetailValue>
                </KndDetailRow>

                <ScheduleNote>
                  {RISK_CATEGORIES[selectedSubject.risk].schedule}
                  <br />
                  При соответствии всем критериям добросовестности (п. 25) — {DUE_DILIGENCE_REWARD.toLowerCase()}.
                </ScheduleNote>
              </KndDetailCard>
            ) : (
              <KndWarnBanner>
                Внимание! Для детального просмотра контролируемого лица выберите нужную запись слева
              </KndWarnBanner>
            ))}

          {tab === 'objects' &&
            (selectedObject ? (
              <KndDetailCard>
                <KndTagsRow>
                  <KndKindTag>{selectedObject.kindCode}</KndKindTag>
                  <RiskTag risk={selectedObject.risk} />
                  {selectedObject.smart && <KndTag color="#ffffff" background="#1fb6a6">Смарт</KndTag>}
                </KndTagsRow>
                <KndDetailTitle>{selectedObject.name}</KndDetailTitle>

                <KndDetailRow>
                  <KndDetailLabel>Контролируемое лицо</KndDetailLabel>
                  <KndDetailValue>{selectedObject.subjectName}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Адрес</KndDetailLabel>
                  <KndDetailValue>{selectedObject.address}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Лицензия</KndDetailLabel>
                  <KndDetailValue>{selectedObject.license}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Регион</KndDetailLabel>
                  <KndDetailValue>{selectedObject.region}</KndDetailValue>
                </KndDetailRow>
                <KndDetailRow>
                  <KndDetailLabel>Категория риска</KndDetailLabel>
                  <KndDetailValue>{RISK_CATEGORIES[selectedObject.risk].label}</KndDetailValue>
                </KndDetailRow>

                <KndDetailSectionTitle>Вид объекта контроля</KndDetailSectionTitle>
                <Box
                  sx={{
                    color: '#4a5765',
                    fontFamily: 'Lato, sans-serif',
                    fontSize: '12px',
                    lineHeight: 1.55,
                  }}
                >
                  {CONTROL_OBJECT_KINDS_BY_CODE[selectedObject.kindCode] ? (
                    <>
                      {CONTROL_OBJECT_KINDS_BY_CODE[selectedObject.kindCode].label}{' '}
                      <Clause>({CONTROL_OBJECT_KINDS_BY_CODE[selectedObject.kindCode].clause})</Clause>
                    </>
                  ) : (
                    'Вид объекта не указан'
                  )}
                </Box>

                <ScheduleNote>{RISK_CATEGORIES[selectedObject.risk].schedule}</ScheduleNote>
              </KndDetailCard>
            ) : (
              <KndWarnBanner>
                Внимание! Для детального просмотра объекта контроля выберите нужную запись слева
              </KndWarnBanner>
            ))}
        </KndDetailColumn>
      </KndWorkArea>
    </KndShell>
  );
};

export default KndAccountPage;
