import React, { useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';

import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';

import KndLogo from '../KndLogo';
import { authApi } from '../../api/edoApi';
import {
  KND_ACCOUNT_PATH,
  KND_APPEALS_PATH,
  KND_APP_BG,
  KND_APP_BLUE,
  KND_APP_BORDER,
  KND_APP_HOVER,
  KND_APP_SURFACE,
  KND_APP_TEXT,
  KND_APP_TEXT_MUTED,
  KND_HOME_PATH,
  KND_KNM_PATH,
  KND_LOGIN_PATH,
  KND_RAIL_BG,
} from '../../theme/knd';

// ===== РЕЛЬС РАЗДЕЛОВ =====

interface RailItem {
  key: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

/**
 * Пункты левого рельса. Порядок и набор повторяют логику работы инспектора:
 * главная, контролируемые лица, их объекты контроля, мероприятия, жалобы
 * и аналитика. Подписи совпадают с формулировками Положения о контроле
 * (надзоре) в сфере образования.
 */
export const KND_RAIL_ITEMS: RailItem[] = [
  { key: 'home', label: 'Главная', icon: GridViewOutlinedIcon, path: KND_HOME_PATH },
  { key: 'subjects', label: 'Контролируемые лица', icon: PeopleAltOutlinedIcon, path: KND_ACCOUNT_PATH },
  {
    key: 'objects',
    label: 'Объекты контроля',
    icon: FolderOutlinedIcon,
    path: `${KND_ACCOUNT_PATH}?tab=objects`,
  },
  { key: 'knm', label: 'Контрольные мероприятия', icon: FactCheckOutlinedIcon, path: KND_KNM_PATH },
  { key: 'appeals', label: 'Досудебное обжалование', icon: GavelOutlinedIcon, path: KND_APPEALS_PATH },
  { key: 'analytics', label: 'Аналитика', icon: TrendingUpOutlinedIcon, path: '/knd/section/analytics' },
];

/** Роли ЕИС → человекочитаемая подпись под ФИО в шапке. */
const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Администратор',
  department_head: 'Руководитель',
  final_approver: 'Руководитель',
  user_substitution_editor: 'Редактор замещений',
};

// ===== СТИЛИ =====

const Shell = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  // Высота фиксирована: прокручивается только рабочая область, а шапка,
  // рельс и панель фильтров остаются на месте.
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: KND_APP_BG,
  fontFamily: 'Lato, sans-serif',
});

const Header = styled(Box)({
  display: 'flex',
  alignItems: 'stretch',
  minHeight: '56px',
  flexShrink: 0,
  backgroundColor: KND_APP_SURFACE,
  borderBottom: `1px solid ${KND_APP_BORDER}`,
});

const LogoCell = styled(Box)({
  width: '56px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: KND_RAIL_BG,
});

const HeaderLeft = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flex: 1,
  minWidth: 0,
  padding: '0 16px',
});

const HeaderCenter = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  flex: '0 1 420px',
  minWidth: 0,
  padding: '0 12px',
});

const HeaderRight = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0 12px',
  flexShrink: 0,
});

const UserText = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  marginRight: '8px',
  lineHeight: 1.25,
});

const UserName = styled(Typography)({
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

const UserRole = styled(Typography)({
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  whiteSpace: 'nowrap',
});

const IconButtonSmall = styled(IconButton)({
  color: KND_APP_TEXT_MUTED,
  borderRadius: '4px',
  '&:hover': { backgroundColor: KND_APP_HOVER, color: KND_APP_TEXT },
});

/** Вертикальный разделитель между колокольчиком и блоком пользователя. */
const HeaderDivider = styled(Box)({
  width: '1px',
  height: '26px',
  margin: '0 10px',
  backgroundColor: KND_APP_BORDER,
});

/** Кружок с инициалами — в референсе на этом месте фото пользователя. */
const UserAvatar = styled(Avatar)({
  width: '30px',
  height: '30px',
  margin: '0 2px 0 10px',
  backgroundColor: '#dde5ef',
  color: '#3d5470',
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  fontWeight: 700,
});

/** Счётчик непрочитанных уведомлений: красный, как в референсе. */
const NoticeBadge = styled(Badge)({
  '& .MuiBadge-badge': {
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    backgroundColor: '#e05252',
    color: '#ffffff',
    fontFamily: 'Lato, sans-serif',
    fontSize: '10px',
    fontWeight: 700,
  },
});

/**
 * Инициалы для аватара: «Даев Дмитрий Анатольевич» → «ДД».
 *
 * Берём не больше двух слов: в ФИО из ЕИС может прийти и отчество, и служебный
 * хвост вроде «(отпуск)» — в кружок диаметром 30px больше не влезет.
 */
const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'П';

const Body = styled(Box)({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  alignItems: 'stretch',
});

const Rail = styled(Box)({
  width: '56px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  paddingTop: '8px',
  backgroundColor: KND_RAIL_BG,
});

const RailItemBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active?: boolean }>(({ active }) => ({
  width: '40px',
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  cursor: 'pointer',
  color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.62)',
  backgroundColor: active ? KND_APP_BLUE : 'transparent',
  transition: 'background-color 120ms ease, color 120ms ease',
  '&:hover': {
    color: '#ffffff',
    backgroundColor: active ? KND_APP_BLUE : 'rgba(255, 255, 255, 0.12)',
  },
}));

const SidePanel = styled(Box)({
  width: '300px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: KND_APP_SURFACE,
  borderRight: `1px solid ${KND_APP_BORDER}`,
});

const BreadcrumbBar = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
  padding: '10px 16px',
  borderBottom: `1px solid ${KND_APP_BORDER}`,
  color: KND_APP_TEXT_MUTED,
  fontSize: '12px',
});

const Main = styled(Box)({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

// ===== КОМПОНЕНТ =====

export interface KndShellProps {
  /** Содержимое слева в шапке (крошки, кнопка действия, заголовок раздела). */
  headerLeft: React.ReactNode;
  /** Центральный блок шапки — обычно поиск. */
  headerCenter?: React.ReactNode;
  /** Крошки над панелью второго уровня. */
  breadcrumb?: React.ReactNode;
  /** Панель второго уровня (фильтры или меню раздела). */
  sidePanel?: React.ReactNode;
  /** Ключ активного пункта рельса. Без рельса раздел считается «портальным». */
  activeRail?: string;
  /** Скрыть рельс и панель второго уровня — так устроен главный экран. */
  portal?: boolean;
  children: React.ReactNode;
}

/**
 * Каркас рабочего интерфейса «ТОР Контроль».
 *
 * Повторяет референс ГИС ТОР КНД: белая шапка с тёмным квадратом логотипа слева,
 * тёмный рельс разделов, панель второго уровня под крошками и рабочая область.
 * Главный экран (`portal`) отдаётся целиком под плитки — рельса там нет,
 * как и в референсе.
 */
const KndShell: React.FC<KndShellProps> = ({
  headerLeft,
  headerCenter,
  breadcrumb,
  sidePanel,
  activeRail,
  portal = false,
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const employeeName = authApi.getEmployeeName();
  const roles = authApi.getEmployeeRoles();
  const roleLabel = roles.map((role) => ROLE_LABELS[role]).find(Boolean) || 'Пользователь';

  const handleLogout = async () => {
    setMenuAnchor(null);
    await authApi.logout();
    // Полная перезагрузка: модуль держит данные сессии в localStorage,
    // частичный переход оставил бы интерфейс в неопределённом состоянии.
    window.location.href = KND_LOGIN_PATH;
  };

  /** Активным считаем пункт, чей путь совпадает с текущим (без учёта query). */
  const isRailActive = (item: RailItem) => {
    if (activeRail) return activeRail === item.key;
    const [itemPath] = item.path.split('?');
    return location.pathname === itemPath;
  };

  return (
    <Shell>
      <Header>
        {!portal && (
          <LogoCell>
            <KndLogo size={22} />
          </LogoCell>
        )}
        <HeaderLeft>{headerLeft}</HeaderLeft>
        {headerCenter && <HeaderCenter>{headerCenter}</HeaderCenter>}
        <HeaderRight>
          <IconButtonSmall size="small" title="Уведомления">
            <NoticeBadge badgeContent={1} overlap="circular">
              <NotificationsNoneOutlinedIcon fontSize="small" />
            </NoticeBadge>
          </IconButtonSmall>
          <HeaderDivider />
          <UserText>
            <UserName>{employeeName || 'Пользователь'}</UserName>
            <UserRole>{roleLabel}</UserRole>
          </UserText>
          <UserAvatar>{initialsOf(employeeName || 'Пользователь')}</UserAvatar>
          <IconButtonSmall size="small" title="Справка">
            <HelpOutlineOutlinedIcon fontSize="small" />
          </IconButtonSmall>
          <IconButtonSmall
            size="small"
            title="Настройки"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            <SettingsOutlinedIcon fontSize="small" />
          </IconButtonSmall>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled sx={{ fontSize: '13px', opacity: '1 !important' }}>
              {employeeName || 'Пользователь'}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout} sx={{ fontSize: '13px' }}>
              Выйти из системы
            </MenuItem>
          </Menu>
        </HeaderRight>
      </Header>

      <Body>
        {!portal && (
          <Rail>
            {KND_RAIL_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isRailActive(item);
              return (
                <Tooltip key={item.key} title={item.label} placement="right" arrow>
                  <RailItemBox active={active} onClick={() => navigate(item.path)}>
                    <Icon sx={{ fontSize: 21 }} />
                  </RailItemBox>
                </Tooltip>
              );
            })}
          </Rail>
        )}

        {/* Панель второго уровня показываем и без содержимого, если есть крошки:
            иначе раздел-заглушка остаётся вообще без навигационной цепочки. */}
        {!portal && (sidePanel || breadcrumb) && (
          <SidePanel>
            {breadcrumb && <BreadcrumbBar>{breadcrumb}</BreadcrumbBar>}
            {sidePanel}
          </SidePanel>
        )}

        <Main>{children}</Main>
      </Body>
    </Shell>
  );
};

export default KndShell;
