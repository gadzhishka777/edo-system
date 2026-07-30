import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Mail as MailIcon,
  Description as DocumentsIcon,
  Contacts as ContactsIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 280;

const StyledDrawer = styled(Drawer)({
  width: DRAWER_WIDTH,
  flexShrink: 0,
  '& .MuiDrawer-paper': {
    width: DRAWER_WIDTH,
    boxSizing: 'border-box',
    backgroundColor: '#2b3858',
    color: '#ffffff',
    borderRight: 'none',
    paddingTop: '0px', // ✅ Убран отступ сверху
    borderRadius: 0,
  },
});

const StyledListItemButton = styled(ListItemButton)(({ theme, selected }) => ({
  borderRadius: '8px',
  margin: '2px 8px',
  padding: '10px 16px',
  backgroundColor: selected ? 'rgba(71, 148, 255, 0.2)' : 'transparent',
  color: selected ? '#ffffff' : '#a0aec0',
  '&:hover': {
    backgroundColor: 'rgba(71, 148, 255, 0.1)',
    color: '#ffffff',
  },
  '& .MuiListItemIcon-root': {
    color: selected ? '#4794ff' : '#a0aec0',
    minWidth: '40px',
  },
  '& .MuiListItemText-primary': {
    fontFamily: 'Lato, sans-serif',
    fontSize: '15px',
    fontWeight: selected ? 600 : 400,
  },
}));

const LogoContainer = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 20px', // ✅ Уменьшен вертикальный отступ
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  marginBottom: '4px', // ✅ Уменьшен отступ снизу
  marginTop: '0px', // ✅ Без отступа сверху
});

// ✅ Прямоугольник на всю ширину
const LogoBox = styled(Box)({
  flex: 1,
  height: '56px',
  borderRadius: '10px',
  backgroundColor: '#4794ff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  lineHeight: 1.2,
  padding: '4px 8px',
});

const LogoText = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  fontWeight: 700,
  color: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.2,
});

const LogoSubText = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  fontWeight: 400,
  color: 'rgba(255, 255, 255, 0.85)',
  textAlign: 'center',
  lineHeight: 1.2,
});

const VersionText = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '11px',
  color: 'rgba(255, 255, 255, 0.3)',
  flexShrink: 0,
  marginLeft: '12px',
});

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  mobile?: boolean;
}

const menuItems = [
  { path: '/mail', label: 'Почта', icon: MailIcon },
  { path: '/documents', label: 'Документы', icon: DocumentsIcon },
  { path: '/contacts', label: 'Контакты', icon: ContactsIcon },
  { path: '/about', label: 'О приложении', icon: InfoIcon },
];

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose, mobile = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (path: string) => {
    navigate(path);
    if (mobile) {
      onClose();
    }
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <LogoContainer>
        {/* ✅ Прямоугольник на всю ширину */}
        <LogoBox>
          <LogoText variant="caption">ТОР ЭДО</LogoText>
          <LogoSubText variant="caption">электронный документооборот</LogoSubText>
        </LogoBox>
        <VersionText variant="caption">v0.2</VersionText>
      </LogoContainer>

      <List sx={{ flex: 1, px: 1 }}>
        {menuItems.map((item) => {
          const isSelected = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding>
              <StyledListItemButton
                selected={isSelected}
                onClick={() => handleNavigate(item.path)}
              >
                <ListItemIcon>
                  <item.icon />
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </StyledListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'Lato, sans-serif',
            color: 'rgba(255, 255, 255, 0.3)',
            fontSize: '11px',
            textAlign: 'center',
            display: 'block',
          }}
        >
          © МРОО "СНПМ"
        </Typography>
      </Box>
    </Box>
  );

  if (mobile) {
    return (
      <StyledDrawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
      >
        {drawerContent}
      </StyledDrawer>
    );
  }

  return (
    <StyledDrawer variant="permanent" open>
      {drawerContent}
    </StyledDrawer>
  );
};