import React, { useState, useEffect } from 'react';
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
  Popover,
  ListItem,
  ListItemAvatar,
  Avatar,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Snackbar,
  List,
  Fade,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  Help as HelpIcon,
  Logout as LogoutIcon,
  Business as BusinessIcon,
  AccountCircle as AccountIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Description as DescriptionIcon,
  VpnKey as VpnKeyIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Done as DoneIcon,
  Schedule as ScheduleIcon,
  Verified as VerifiedIcon,
  Folder as FolderIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { authApi } from '../../api/edoApi';
import { useEvents, Event } from '../../context/EventContext';

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

const getEventIcon = (type: string) => {
  switch (type) {
    case 'success': return <CheckCircleIcon />;
    case 'error': return <ErrorIcon />;
    case 'warning': return <WarningIcon />;
    default: return <InfoIcon />;
  }
};

const getEventColor = (type: string) => {
  switch (type) {
    case 'success': return '#4caf50';
    case 'error': return '#e53935';
    case 'warning': return '#ff9800';
    default: return '#4c6ef5';
  }
};

const getCategoryIcon = (category?: string) => {
  switch (category) {
    case 'document': return <DescriptionIcon />;
    case 'license': return <VpnKeyIcon />;
    case 'mail': return <EmailIcon />;
    case 'signature': return <VerifiedIcon />;
    default: return <InfoIcon />;
  }
};

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, onLogout }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [eventsAnchorEl, setEventsAnchorEl] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const pageTitle = getPageTitle(location.pathname);
  const orgName = authApi.getOrgName();
  
  const { events, unreadCount, markAsRead, markAllAsRead, deleteEvent, deleteAllEvents } = useEvents();

  // Показываем уведомления при добавлении новых событий
  useEffect(() => {
    if (events.length > 0) {
      const lastEvent = events[0];
      if (!lastEvent.read) {
        setSnackbar({
          open: true,
          message: lastEvent.title,
          severity: lastEvent.type,
        });
      }
    }
  }, [events]);

  const handleEventsOpen = (event: React.MouseEvent<HTMLElement>) => {
    setEventsAnchorEl(event.currentTarget);
  };

  const handleEventsClose = () => {
    setEventsAnchorEl(null);
  };

  const handleEventClick = (event: Event) => {
    if (!event.read) {
      markAsRead(event.id);
    }
    if (event.action) {
      event.action.handler();
    }
    if (event.link) {
      window.location.href = event.link;
    }
    handleEventsClose();
  };

  const getTimeAgo = (date: Date): string => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} д назад`;
    return date.toLocaleDateString('ru-RU');
  };

  const open = Boolean(eventsAnchorEl);

  return (
    <>
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
                onClick={handleEventsOpen}
                sx={{ 
                  color: '#87879b', 
                  '&:hover': { color: '#4c6ef5' },
                  position: 'relative',
                }}
              >
                <Badge 
                  badgeContent={unreadCount} 
                  color="error"
                  sx={{
                    '& .MuiBadge-badge': {
                      fontFamily: 'Lato, sans-serif',
                      fontWeight: 600,
                      fontSize: '10px',
                    }
                  }}
                >
                  <NotificationsIcon />
                </Badge>
                {unreadCount > 0 && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: '#e53935',
                      animation: 'pulse 1.5s ease-in-out infinite',
                      '@keyframes pulse': {
                        '0%': { transform: 'scale(0.8)', opacity: 1 },
                        '50%': { transform: 'scale(1.2)', opacity: 0.7 },
                        '100%': { transform: 'scale(0.8)', opacity: 1 },
                      },
                    }}
                  />
                )}
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

      {/* Поповер с событиями */}
      <Popover
        open={open}
        anchorEl={eventsAnchorEl}
        onClose={handleEventsClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: {
              width: 480,
              maxHeight: 560,
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
              overflow: 'hidden',
              mt: 1,
            }
          }
        }}
      >
        <Fade in={open}>
          <Box>
            {/* Заголовок */}
            <Box sx={{ 
              p: 2, 
              borderBottom: '1px solid #eaebf0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fafafa',
            }}>
              <Typography sx={{ 
                fontFamily: 'Lato, sans-serif', 
                fontWeight: 700, 
                fontSize: '16px',
                color: '#101025',
              }}>
                События
                {unreadCount > 0 && (
                  <Chip
                    label={unreadCount}
                    size="small"
                    sx={{
                      ml: 1,
                      backgroundColor: '#4c6ef5',
                      color: '#ffffff',
                      height: '20px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  />
                )}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {events.length > 0 && (
                  <>
                    <Button
                      size="small"
                      onClick={markAllAsRead}
                      sx={{
                        fontFamily: 'Lato, sans-serif',
                        fontSize: '12px',
                        textTransform: 'none',
                        color: '#87879b',
                        '&:hover': { color: '#4c6ef5' },
                      }}
                    >
                      Все прочитаны
                    </Button>
                    <Button
                      size="small"
                      onClick={deleteAllEvents}
                      sx={{
                        fontFamily: 'Lato, sans-serif',
                        fontSize: '12px',
                        textTransform: 'none',
                        color: '#87879b',
                        '&:hover': { color: '#e53935' },
                      }}
                    >
                      Очистить все
                    </Button>
                  </>
                )}
                <IconButton size="small" onClick={handleEventsClose} sx={{ color: '#87879b' }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            {/* Список событий */}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={32} />
              </Box>
            ) : events.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                py: 6,
                px: 2,
              }}>
                <NotificationsIcon sx={{ fontSize: 48, color: '#b0b3c3', mb: 2 }} />
                <Typography sx={{ 
                  fontFamily: 'Lato, sans-serif',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#101025',
                }}>
                  Нет событий
                </Typography>
                <Typography sx={{ 
                  fontFamily: 'Lato, sans-serif',
                  fontSize: '13px',
                  color: '#87879b',
                  mt: 0.5,
                }}>
                  Все события будут отображаться здесь
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflowY: 'auto', maxHeight: 460 }}>
                {events.map((event) => (
                  <ListItem
                    key={event.id}
                    onClick={() => handleEventClick(event)}
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderBottom: '1px solid #f4f4f8',
                      cursor: 'pointer',
                      backgroundColor: event.read ? 'transparent' : '#f9fafe',
                      transition: 'background-color 0.2s ease',
                      '&:hover': {
                        backgroundColor: '#f4f8ff',
                      },
                      '&:last-child': {
                        borderBottom: 'none',
                      },
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        sx={{
                          width: 40,
                          height: 40,
                          backgroundColor: event.read ? '#f4f4f8' : `${getEventColor(event.type)}20`,
                          color: getEventColor(event.type),
                        }}
                      >
                        {event.icon || getCategoryIcon(event.category) || getEventIcon(event.type)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '14px',
                              fontWeight: event.read ? 500 : 600,
                              color: '#101025',
                              flex: 1,
                            }}
                          >
                            {event.title}
                          </Typography>
                          <Typography
                            sx={{
                              fontFamily: 'Lato, sans-serif',
                              fontSize: '11px',
                              color: '#87879b',
                              ml: 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {getTimeAgo(event.timestamp)}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          {event.description && (
                            <Typography
                              sx={{
                                fontFamily: 'Lato, sans-serif',
                                fontSize: '13px',
                                color: '#87879b',
                                mt: 0.25,
                              }}
                            >
                              {event.description}
                            </Typography>
                          )}
                          {event.action && (
                            <Button
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                event.action?.handler();
                              }}
                              sx={{
                                fontFamily: 'Lato, sans-serif',
                                fontSize: '12px',
                                textTransform: 'none',
                                color: '#4c6ef5',
                                mt: 0.5,
                                p: 0,
                                '&:hover': { textDecoration: 'underline', backgroundColor: 'transparent' },
                              }}
                            >
                              {event.action.label}
                            </Button>
                          )}
                        </Box>
                      }
                    />
                    {!event.read && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: getEventColor(event.type),
                          flexShrink: 0,
                          ml: 1,
                        }}
                      />
                    )}
                  </ListItem>
                ))}
              </Box>
            )}
          </Box>
        </Fade>
      </Popover>

      {/* Snackbar уведомления */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 7 }}
      >
        <Alert 
          severity={snackbar.severity} 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          sx={{ 
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default Header;