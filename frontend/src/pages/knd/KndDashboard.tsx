import React from 'react';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PersonalVideoOutlinedIcon from '@mui/icons-material/PersonalVideoOutlined';
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';

import KndShell from '../../components/knd/KndShell';
import { authApi } from '../../api/edoApi';
import {
  KND_ACCOUNT_PATH,
  KND_APPEALS_PATH,
  KND_APP_BLUE,
  KND_APP_BLUE_HOVER,
  KND_APP_TEXT,
} from '../../theme/knd';
import { KND_DEFAULT_ORG_NAME } from './kndDemoData';
import { KND_SECTIONS, sectionPath, type KndSection } from './kndSections';

// ===== МОДЕЛЬ ПЛИТОК =====

interface TileModel extends KndSection {
  key: string;
  icon: React.ElementType;
  path: string;
  /** Позиция в «геройской» сетке из 10 колонок. */
  area?: { column: string; row: string };
}

/**
 * Плитки главного экрана.
 *
 * Раскладка повторяет референс: слева высокий «Кабинет руководителя» на две
 * строки, правее — инспектор и администратор, под ними отчёты, методолог и учёт,
 * а внизу полоса из пяти разделов. Сетка одна на десять колонок: так все три
 * строки получают одинаковую высоту и тянутся на всю высоту экрана.
 */
const TILES: TileModel[] = [
  {
    key: 'manager',
    ...KND_SECTIONS.manager,
    icon: PersonalVideoOutlinedIcon,
    path: sectionPath('manager'),
    area: { column: '1 / 5', row: '1 / 3' },
  },
  {
    key: 'inspector',
    ...KND_SECTIONS.inspector,
    icon: PersonalVideoOutlinedIcon,
    path: sectionPath('inspector'),
    area: { column: '5 / 9', row: '1 / 2' },
  },
  {
    key: 'admin',
    ...KND_SECTIONS.admin,
    icon: PersonalVideoOutlinedIcon,
    path: sectionPath('admin'),
    area: { column: '9 / 11', row: '1 / 2' },
  },
  {
    key: 'reports',
    ...KND_SECTIONS.reports,
    icon: AssessmentOutlinedIcon,
    path: sectionPath('reports'),
    area: { column: '5 / 7', row: '2 / 3' },
  },
  {
    key: 'methodologist',
    ...KND_SECTIONS.methodologist,
    icon: PersonalVideoOutlinedIcon,
    path: sectionPath('methodologist'),
    area: { column: '7 / 9', row: '2 / 3' },
  },
  {
    key: 'account',
    ...KND_SECTIONS.account,
    icon: DnsOutlinedIcon,
    path: KND_ACCOUNT_PATH,
    area: { column: '9 / 11', row: '2 / 3' },
  },
  {
    key: 'plans',
    ...KND_SECTIONS.plans,
    icon: AssignmentOutlinedIcon,
    path: sectionPath('plans'),
    area: { column: '1 / 3', row: '3 / 4' },
  },
  {
    key: 'analytics',
    ...KND_SECTIONS.analytics,
    icon: InsightsOutlinedIcon,
    path: sectionPath('analytics'),
    area: { column: '3 / 5', row: '3 / 4' },
  },
  {
    key: 'nsi',
    ...KND_SECTIONS.nsi,
    icon: StorageOutlinedIcon,
    path: sectionPath('nsi'),
    area: { column: '5 / 7', row: '3 / 4' },
  },
  {
    key: 'oversight',
    ...KND_SECTIONS.oversight,
    icon: PolicyOutlinedIcon,
    path: sectionPath('oversight'),
    area: { column: '7 / 9', row: '3 / 4' },
  },
  {
    key: 'appeals',
    ...KND_SECTIONS.appeals,
    icon: GavelOutlinedIcon,
    path: KND_APPEALS_PATH,
    area: { column: '9 / 11', row: '3 / 4' },
  },
];

// ===== СТИЛИ =====

const OrgName = styled(Typography)({
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '16px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

/**
 * Кнопка «Сменить» рядом с наименованием организации — как в референсе.
 *
 * В ГИС ТОР КНД она переключает организацию, в которой работает пользователь.
 * Здесь ведёт в «Кабинет администратора КНО»: именно там настраивается
 * организация, а отдельного переключателя в модуле пока нет.
 */
const ChangeOrgChip = styled(Box)({
  flexShrink: 0,
  padding: '3px 10px',
  borderRadius: '3px',
  backgroundColor: KND_APP_BLUE,
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 120ms ease',
  '&:hover': { backgroundColor: KND_APP_BLUE_HOVER },
});

const TilesArea = styled(Box)({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
});

/**
 * Сетка из десяти колонок. Строки тянутся (`1fr`), но не ниже 130px,
 * и упираются в потолок — на очень высоких экранах плитки не растягиваются
 * в бесконечность. Нижняя граница в 422px (три строки по 130 плюс отступы)
 * заставляет область прокручиваться на низких экранах, а не сжимать плитки.
 */
const TilesGrid = styled(Box)({
  flex: 1,
  minHeight: '422px',
  maxHeight: '860px',
  display: 'grid',
  gridTemplateColumns: 'repeat(10, 1fr)',
  gridAutoRows: 'minmax(130px, 1fr)',
  gap: '16px',
});

const Tile = styled(Box)({
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: '4px',
  backgroundColor: KND_APP_BLUE,
  color: '#ffffff',
  cursor: 'pointer',
  transition: 'background-color 120ms ease, box-shadow 120ms ease',
  '&:hover': {
    backgroundColor: KND_APP_BLUE_HOVER,
    boxShadow: '0 4px 16px rgba(11, 92, 213, 0.3)',
  },
});

const TileTitle = styled(Typography)({
  position: 'relative',
  zIndex: 1,
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: 1.25,
  maxWidth: '72%',
});

const TileSubtitle = styled(Typography)({
  position: 'relative',
  zIndex: 1,
  marginTop: '10px',
  color: 'rgba(255, 255, 255, 0.85)',
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  lineHeight: 1.4,
  maxWidth: '62%',
});

const TileIcon = styled(Box)({
  position: 'absolute',
  right: '14px',
  bottom: '12px',
  color: 'rgba(255, 255, 255, 0.34)',
  lineHeight: 0,
});

// ===== КОМПОНЕНТ =====

/**
 * Главный экран модуля «ТОР Контроль».
 *
 * Портал-лончер: рельса разделов здесь нет — как в референсе ГИС ТОР КНД,
 * навигация идёт через плитки. Внутри разделов каркас уже с рельсом.
 */
const KndDashboard: React.FC = () => {
  const navigate = useNavigate();
  const orgName = authApi.getOrgName() || KND_DEFAULT_ORG_NAME;

  const renderTile = (tile: TileModel) => {
    const Icon = tile.icon;
    return (
      <Tile
        key={tile.key}
        onClick={() => navigate(tile.path)}
        sx={
          tile.area
            ? { gridColumn: tile.area.column, gridRow: tile.area.row }
            : undefined
        }
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') navigate(tile.path);
        }}
      >
        <TileTitle>{tile.title}</TileTitle>
        <TileSubtitle>{tile.subtitle}</TileSubtitle>
        <TileIcon>
          <Icon sx={{ fontSize: 72 }} />
        </TileIcon>
      </Tile>
    );
  };

  return (
    <KndShell
      portal
      headerLeft={
        <>
          <OrgName>{orgName}</OrgName>
          <ChangeOrgChip onClick={() => navigate(sectionPath('admin'))}>Сменить</ChangeOrgChip>
        </>
      }
    >
      <TilesArea>
        <TilesGrid>{TILES.map(renderTile)}</TilesGrid>
      </TilesArea>
    </KndShell>
  );
};

export default KndDashboard;
