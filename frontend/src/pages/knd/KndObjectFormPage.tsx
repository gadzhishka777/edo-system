import React, { useState } from 'react';
import { Box, MenuItem, Select, Snackbar, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import MoreHorizOutlinedIcon from '@mui/icons-material/MoreHorizOutlined';

import KndShell from '../../components/knd/KndShell';
import { KndBreadcrumb, KndTag } from '../../components/knd/KndControls';
import {
  KND_ACCOUNT_PATH,
  KND_APP_BLUE,
  KND_APP_BLUE_SOFT,
  KND_APP_BORDER,
  KND_APP_SURFACE,
  KND_APP_TEXT,
  KND_APP_TEXT_MUTED,
  KND_DANGER,
  KND_GREEN,
  KND_GREEN_HOVER,
  KND_TEAL,
} from '../../theme/knd';
import {
  KND_OBJECTS,
  KND_REGIONS,
  KND_REGION_CODES,
  KND_SUBJECTS,
} from './kndDemoData';
import { CONTROL_OBJECT_KINDS, RISK_CATEGORIES, RISK_ORDER, type RiskCategory } from './kndRegulation';

// ===== МЕНЮ РАЗДЕЛА =====

const MenuItemBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active?: boolean }>(({ active }) => ({
  padding: '11px 16px',
  cursor: 'pointer',
  borderLeft: `3px solid ${active ? KND_APP_BLUE : 'transparent'}`,
  backgroundColor: active ? KND_APP_BLUE_SOFT : 'transparent',
  color: active ? KND_APP_TEXT : KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: active ? 700 : 500,
  transition: 'background-color 120ms ease, color 120ms ease',
  '&:hover': { backgroundColor: KND_APP_BLUE_SOFT, color: KND_APP_TEXT },
}));

const MENU_ITEMS = [
  'Основные параметры',
  'Контролируемые лица',
  'Виды КНД',
  'КНМ',
  'Версии объекта',
];

// ===== ШАПКА РАЗДЕЛА =====

const SaveButton = styled(Box)({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: '32px',
  padding: '0 18px',
  borderRadius: '3px',
  backgroundColor: KND_GREEN,
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  '&:hover': { backgroundColor: KND_GREEN_HOVER },
});

const SaveCheckButton = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  backgroundColor: KND_GREEN,
  color: '#ffffff',
  cursor: 'pointer',
  flexShrink: 0,
  '&:hover': { backgroundColor: KND_GREEN_HOVER },
});

const FormTitle = styled(Typography)({
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

const TitleMark = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: KND_GREEN,
  lineHeight: 0,
  flexShrink: 0,
});

// ===== ФОРМА =====

const FormArea = styled(Box)({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '20px 24px 40px',
});

const FormCard = styled(Box)({
  padding: '24px',
  borderRadius: '3px',
  backgroundColor: KND_APP_SURFACE,
  border: `1px solid ${KND_APP_BORDER}`,
  maxWidth: '1180px',
});

const Field = styled(Box)({
  marginBottom: '20px',
});

const FieldLabel = styled(Typography)({
  marginBottom: '6px',
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 500,
});

const RequiredMark = styled('span')({
  color: KND_DANGER,
  marginLeft: '2px',
});

const HintText = styled(Typography)({
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  lineHeight: 1.5,
});

const TextInput = styled('input')({
  width: '100%',
  height: '38px',
  boxSizing: 'border-box',
  padding: '0 12px',
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

/** Единый стиль выпадающих списков формы. */
const selectSx = {
  width: '100%',
  '& .MuiOutlinedInput-root': {
    height: '38px',
    borderRadius: '3px',
    backgroundColor: KND_APP_SURFACE,
    fontFamily: 'Lato, sans-serif',
    fontSize: '13px',
    '& fieldset': { borderColor: KND_APP_BORDER },
    '&:hover fieldset': { borderColor: '#c3cad3' },
    '&.Mui-focused fieldset': { borderColor: KND_APP_BLUE, borderWidth: '1px' },
  },
  '& .MuiSelect-select': {
    padding: '8px 32px 8px 12px',
    fontSize: '13px',
    color: KND_APP_TEXT,
    fontFamily: 'Lato, sans-serif',
    whiteSpace: 'normal',
  },
  '& .MuiSelect-icon': { color: KND_APP_TEXT_MUTED, fontSize: 20, right: '8px' },
};

const CodeChip = styled(Box)({
  padding: '3px 8px',
  borderRadius: '3px',
  backgroundColor: KND_APP_BLUE_SOFT,
  color: KND_APP_BLUE,
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  fontWeight: 600,
});

const ClearIcon = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  color: KND_APP_TEXT_MUTED,
  lineHeight: 0,
  cursor: 'pointer',
  '&:hover': { color: KND_DANGER },
});

const InlineRow = styled(Box)({
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
});

const AddressRow = styled(Box)({
  display: 'flex',
  gap: '8px',
});

const AddressPickerButton = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '46px',
  height: '38px',
  flexShrink: 0,
  border: `1px solid ${KND_APP_BORDER}`,
  borderRadius: '3px',
  backgroundColor: KND_APP_SURFACE,
  color: KND_APP_TEXT_MUTED,
  cursor: 'pointer',
  '&:hover': { borderColor: '#c3cad3', color: KND_APP_TEXT },
});

const KindChipRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '10px',
  flexWrap: 'wrap',
});

/**
 * Ссылка «справочник» — в референсе бирюзовая и стоит сразу за кодом вида
 * объекта. Ведёт в НСИ: именно оттуда подставляется вид объекта, вручную его
 * не редактируют.
 */
const RefLink = styled(Box)({
  color: KND_TEAL,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'underline' },
});

const InfoBanner = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  marginBottom: '20px',
  borderRadius: '3px',
  backgroundColor: KND_APP_BLUE_SOFT,
  color: '#1c3f73',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  lineHeight: 1.45,
});

const InfoBannerText = styled('span')({
  flex: 1,
});

// ===== КОМПОНЕНТ =====

/**
 * Форма создания объекта контроля.
 *
 * Раздел «Учёт → Объекты контроля → Новый объект». Объект контроля — это
 * образовательная деятельность контролируемого лица (п. 4 Положения), поэтому
 * вместо кадастрового номера и координат заполняются вид объекта, реквизиты
 * лицензии, сведения об аккредитации и категория риска.
 *
 * Сохранение пока демонстрационное — бэкенда под объекты контроля нет.
 */
const KndObjectFormPage: React.FC = () => {
  const navigate = useNavigate();

  const [kindCode, setKindCode] = useState(CONTROL_OBJECT_KINDS[4].code);
  const [subjectName, setSubjectName] = useState(KND_OBJECTS[0].subjectName);
  const [name, setName] = useState(
    'Образовательная деятельность по образовательным программам начального общего, основного общего и среднего общего образования'
  );
  const [shortName, setShortName] = useState(
    'Образовательные программы начального общего, основного общего и среднего общего образования'
  );
  const [region, setRegion] = useState(KND_REGIONS[0]);
  const [address, setAddress] = useState('');
  const [license, setLicense] = useState('');
  const [accreditation, setAccreditation] = useState('');
  const [risk, setRisk] = useState<RiskCategory>('low');
  const [hintVisible, setHintVisible] = useState(true);
  const [saved, setSaved] = useState(false);
  const [activeMenu, setActiveMenu] = useState(MENU_ITEMS[0]);

  const kind = CONTROL_OBJECT_KINDS.find((item) => item.code === kindCode) || CONTROL_OBJECT_KINDS[0];
  const regionCode = KND_REGION_CODES[region] || '—';

  const sidePanel = (
    <Box sx={{ paddingTop: '4px' }}>
      {MENU_ITEMS.map((item) => (
        <MenuItemBox key={item} active={item === activeMenu} onClick={() => setActiveMenu(item)}>
          {item}
        </MenuItemBox>
      ))}
    </Box>
  );

  return (
    <KndShell
      activeRail="objects"
      breadcrumb={
        <KndBreadcrumb
          items={[
            { label: 'Главная', path: '/knd' },
            { label: 'Учёт', path: KND_ACCOUNT_PATH },
            { label: 'Объекты контроля', path: `${KND_ACCOUNT_PATH}?tab=objects` },
            { label: 'Новый объект' },
          ]}
        />
      }
      sidePanel={sidePanel}
      headerLeft={
        <>
          <SaveButton onClick={() => setSaved(true)}>Сохранить</SaveButton>
          <SaveCheckButton onClick={() => setSaved(true)} title="Сохранить">
            <CheckOutlinedIcon sx={{ fontSize: 18 }} />
          </SaveCheckButton>
          <TitleMark>
            <AddCircleOutlinedIcon sx={{ fontSize: 22 }} />
          </TitleMark>
          <FormTitle>Создание объекта контроля</FormTitle>
        </>
      }
    >
      <FormArea>
        <FormCard>
          {/* Вид объекта — значение из справочника, задаётся пунктом 4 Положения */}
          <Field>
            <FieldLabel>
              Вид объекта
              <RequiredMark>*</RequiredMark>
            </FieldLabel>
            <Select
              value={kindCode}
              onChange={(event) => setKindCode(event.target.value as string)}
              sx={selectSx}
              variant="outlined"
            >
              {CONTROL_OBJECT_KINDS.map((item) => (
                <MenuItem key={item.code} value={item.code} sx={{ fontSize: '13px', whiteSpace: 'normal' }}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
            <KindChipRow>
              <CodeChip>{kind.code}</CodeChip>
              <RefLink onClick={() => navigate('/knd/section/nsi')}>справочник</RefLink>
              <KndTag color={KND_APP_TEXT_MUTED} background="#f0f2f5">{kind.clause}</KndTag>
            </KindChipRow>
          </Field>

          <Field>
            <FieldLabel>
              Контролируемое лицо
              <RequiredMark>*</RequiredMark>
            </FieldLabel>
            <Select
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value as string)}
              sx={selectSx}
              variant="outlined"
            >
              {KND_SUBJECTS.map((subject) => (
                <MenuItem key={subject.id} value={subject.shortName || subject.name} sx={{ fontSize: '13px' }}>
                  {subject.shortName || subject.name}
                </MenuItem>
              ))}
            </Select>
            <HintText>
              Объект контроля принадлежит контролируемому лицу: организация или индивидуальный
              предприниматель, осуществляющие образовательную деятельность (п. 3 Положения).
            </HintText>
          </Field>

          <InlineRow>
            <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
              <FieldLabel>
                Наименование
                <RequiredMark>*</RequiredMark>
              </FieldLabel>
              <TextInput value={name} onChange={(event) => setName(event.target.value)} />
            </Box>
            <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
              <FieldLabel>
                Краткое наименование
                <RequiredMark>*</RequiredMark>
              </FieldLabel>
              <TextInput value={shortName} onChange={(event) => setShortName(event.target.value)} />
            </Box>
          </InlineRow>

          <Box sx={{ height: '20px' }} />

          <Field>
            <FieldLabel>Регион</FieldLabel>
            <AddressRow>
              <Select
                value={region}
                onChange={(event) => setRegion(event.target.value as string)}
                sx={{ ...selectSx, flex: 1 }}
                variant="outlined"
                displayEmpty
                renderValue={(selected) =>
                  selected ? (
                    (selected as string)
                  ) : (
                    <Box component="span" sx={{ color: KND_APP_TEXT_MUTED }}>
                      Выберите регион
                    </Box>
                  )
                }
              >
                {KND_REGIONS.map((item) => (
                  <MenuItem key={item} value={item} sx={{ fontSize: '13px' }}>
                    {item}
                  </MenuItem>
                ))}
              </Select>
              <CodeChip>{regionCode}</CodeChip>
              <ClearIcon onClick={() => setRegion('')} title="Очистить регион">
                <CloseOutlinedIcon sx={{ fontSize: 16 }} />
              </ClearIcon>
            </AddressRow>
          </Field>

          <Field>
            <FieldLabel>
              Адрес места осуществления образовательной деятельности
              <RequiredMark>*</RequiredMark>
            </FieldLabel>
            <AddressRow>
              <TextInput
                value={address}
                placeholder="Индекс, регион, населённый пункт, улица, дом"
                onChange={(event) => setAddress(event.target.value)}
              />
              <AddressPickerButton title="Выбрать из справочника адресов">
                <MoreHorizOutlinedIcon sx={{ fontSize: 20 }} />
              </AddressPickerButton>
            </AddressRow>
          </Field>

          <InlineRow>
            <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
              <FieldLabel>Лицензия на осуществление образовательной деятельности</FieldLabel>
              <TextInput
                value={license}
                placeholder="Номер и дата"
                onChange={(event) => setLicense(event.target.value)}
              />
            </Box>
            <Box sx={{ flex: '1 1 420px', minWidth: 0 }}>
              <FieldLabel>Государственная аккредитация</FieldLabel>
              <TextInput
                value={accreditation}
                placeholder="Номер и дата либо «не имеет»"
                onChange={(event) => setAccreditation(event.target.value)}
              />
            </Box>
          </InlineRow>

          <Box sx={{ height: '20px' }} />

          <Field>
            <FieldLabel>Категория риска</FieldLabel>
            <Select
              value={risk}
              onChange={(event) => setRisk(event.target.value as RiskCategory)}
              sx={selectSx}
              variant="outlined"
            >
              {RISK_ORDER.map((value) => (
                <MenuItem key={value} value={value} sx={{ fontSize: '13px' }}>
                  {RISK_CATEGORIES[value].label}
                </MenuItem>
              ))}
            </Select>
            <HintText>{RISK_CATEGORIES[risk].schedule}.</HintText>
          </Field>

          {hintVisible && (
            <InfoBanner>
              <InfoBannerText>
                Внимание! Категория риска присваивается ежегодно решением контрольного (надзорного)
                органа и считается присвоенной после внесения сведений в единый реестр видов
                контроля (п. 7 Положения).
              </InfoBannerText>
              <ClearIcon onClick={() => setHintVisible(false)}>
                <CloseOutlinedIcon sx={{ fontSize: 16 }} />
              </ClearIcon>
            </InfoBanner>
          )}
        </FormCard>
      </FormArea>

      <Snackbar
        open={saved}
        autoHideDuration={4000}
        onClose={() => setSaved(false)}
        message="Объект сохранён (демонстрационный режим — данные не отправляются на сервер)"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        action={
          <Box
            onClick={() => {
              setSaved(false);
              navigate(`${KND_ACCOUNT_PATH}?tab=objects`);
            }}
            sx={{
              color: '#8fc7ff',
              fontFamily: 'Lato, sans-serif',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            К списку объектов
          </Box>
        }
      />
    </KndShell>
  );
};

export default KndObjectFormPage;
