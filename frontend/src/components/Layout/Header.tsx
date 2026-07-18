import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Badge,
  Tooltip,
  useTheme,
  useMediaQuery,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  Help as HelpIcon,
  Logout as LogoutIcon,
  Business as BusinessIcon,
  AccountCircle as AccountIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { authApi } from '../../api/edoApi';

interface HeaderProps {
  onMenuToggle: () => void;
  onLogout: () => void;
}

const getPageTitle = (path: string): string => {
  const titles: Record<string, string> = {
    '/mail': 'Почта',
    '/documents': 'Документы',
    '/contacts': 'Контакты',
    '/about': 'О приложении',
  };
  return titles[path] || 'Подсистема ЭДО';
};

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, onLogout }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const pageTitle = getPageTitle(location.pathname);
  const orgName = authApi.getOrgName();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid',
        borderColor: '#eaebf0',
        zIndex: 1200,
        height: '64px',
        ml: isMobile ? 0 : '280px',
        width: isMobile ? '100%' : 'calc(100% - 280px)',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', height: '64px', minHeight: '64px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={onMenuToggle}
            sx={{
              color: '#101025',
              display: { xs: 'flex', md: 'none' },
            }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            sx={{
              fontFamily: 'Lato, sans-serif',
              fontWeight: 600,
              fontSize: '18px',
              color: '#101025',
            }}
          >
            {pageTitle}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Имя организации */}
          {orgName && (
            <Chip
              icon={<BusinessIcon sx={{ fontSize: '16px !important' }} />}
              label={orgName}
              size="small"
              sx={{
                fontFamily: 'Lato, sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                backgroundColor: '#f4f4f8',
                color: '#101025',
                height: '32px',
                '& .MuiChip-icon': { color: '#4c6ef5' },
              }}
            />
          )}

          <Tooltip title="События">
            <IconButton
              size="large"
              sx={{ color: '#87879b', '&:hover': { color: '#4c6ef5' } }}
            >
              <Badge badgeContent={3} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ height: '32px', backgroundColor: '#eaebf0', my: 'auto' }} />

          <Tooltip title="Справка">
            <IconButton
              size="large"
              sx={{ color: '#87879b', '&:hover': { color: '#4c6ef5' } }}
            >
              <HelpIcon />
            </IconButton>
          </Tooltip>

          {/* Меню аккаунта */}
          <Tooltip title="Аккаунт">
            <IconButton
              size="large"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ color: '#87879b', '&:hover': { color: '#4c6ef5' } }}
            >
              <AccountIcon />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>
              <ListItemIcon><BusinessIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={orgName || 'Организация'} />
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setAnchorEl(null); onLogout(); }}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Выйти" />
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};