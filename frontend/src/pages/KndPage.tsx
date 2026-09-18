import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

import KndLogo from '../components/KndLogo';
import { authApi } from '../api/edoApi';
import {
  KND_ACCENT,
  KND_ACCENT_HOVER,
  KND_BG,
  KND_BORDER,
  KND_LOGIN_PATH,
  KND_SURFACE,
  KND_TEXT,
  KND_TEXT_MUTED,
} from '../theme/knd';

// ===== СТИЛИ =====

const PageWrapper = styled(Box)({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: KND_BG,
  fontFamily: 'Lato, sans-serif',
});

const TopBar = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '24px',
  flexWrap: 'wrap',
  padding: '16px 32px',
  backgroundColor: KND_SURFACE,
  borderBottom: `1px solid ${KND_BORDER}`,
});

const BrandGroup = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
});

const TopBarTitle = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '19px',
  fontWeight: 700,
  lineHeight: 1.2,
});

const UserGroup = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
});

const UserText = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  textAlign: 'right',
});

const UserName = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: 1.3,
});

const UserOrg = styled(Typography)({
  color: KND_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  lineHeight: 1.3,
});

const LogoutButton = styled(Button)({
  color: KND_TEXT,
  borderColor: KND_BORDER,
  borderRadius: '4px',
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
  textTransform: 'none',
  padding: '6px 16px',
  '&:hover': {
    borderColor: KND_TEXT,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
});

const Content = styled(Box)({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
});

const StubCard = styled(Box)({
  width: '100%',
  maxWidth: '620px',
  padding: '40px',
  boxSizing: 'border-box',
  backgroundColor: KND_SURFACE,
  border: `1px solid ${KND_BORDER}`,
  borderRadius: '8px',
});

const StatusBadge = styled(Box)({
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '4px',
  backgroundColor: 'rgba(11, 99, 246, 0.22)',
  color: '#a8ccff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
});

const StubTitle = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '28px',
  fontWeight: 700,
  marginTop: '18px',
});

const StubText = styled(Typography)({
  color: KND_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '15px',
  lineHeight: 1.6,
  marginTop: '12px',
});

const SessionBlock = styled(Box)({
  marginTop: '28px',
  paddingTop: '20px',
  borderTop: `1px solid ${KND_BORDER}`,
});

const SessionRow = styled(Box)({
  display: 'flex',
  gap: '12px',
  fontSize: '14px',
  lineHeight: 1.7,
});

const SessionLabel = styled(Typography)({
  color: KND_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  minWidth: '150px',
});

const SessionValue = styled(Typography)({
  color: KND_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  fontWeight: 600,
});

const BackToLoginButton = styled(Button)({
  marginTop: '28px',
  height: '44px',
  padding: '0 24px',
  backgroundColor: KND_ACCENT,
  borderRadius: '4px',
  color: '#ffffff',
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  fontWeight: 600,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { backgroundColor: KND_ACCENT_HOVER, boxShadow: 'none' },
});

// ===== КОМПОНЕНТ =====

/**
 * Заглушка модуля «ТОР Контроль».
 *
 * Авторизация через ЕИС уже работает — страница показывает данные текущей
 * сессии, чтобы это было видно. Функциональные блоки (проверки, предписания
 * и т.п.) появятся отдельными задачами.
 */
const KndPage: React.FC = () => {
  const navigate = useNavigate();

  const employeeName = authApi.getEmployeeName();
  const orgName = authApi.getOrgName();
  const employeeId = authApi.getEmployeeId();
  const roles = authApi.getEmployeeRoles();

  const handleLogout = async () => {
    await authApi.logout();
    // Полная перезагрузка: модуль держит данные сессии в localStorage,
    // частичный переход оставил бы интерфейс в неопределённом состоянии.
    window.location.href = KND_LOGIN_PATH;
  };

  return (
    <PageWrapper>
      <TopBar>
        <BrandGroup>
          <KndLogo size={30} />
          <TopBarTitle>ТОР Контроль</TopBarTitle>
        </BrandGroup>
        <UserGroup>
          <UserText>
            <UserName>{employeeName || 'Пользователь'}</UserName>
            <UserOrg>{orgName || '—'}</UserOrg>
          </UserText>
          <LogoutButton variant="outlined" onClick={handleLogout}>
            Выйти
          </LogoutButton>
        </UserGroup>
      </TopBar>

      <Content>
        <StubCard>
          <StatusBadge>Модуль в разработке</StatusBadge>
          <StubTitle>Контрольная деятельность</StubTitle>
          <StubText>
            Типовое облачное решение по осуществлению контрольной деятельности.
            Вход через ЕИС уже работает — функциональные блоки модуля появятся
            в следующих релизах.
          </StubText>

          <SessionBlock>
            <SessionRow>
              <SessionLabel>Организация</SessionLabel>
              <SessionValue>{orgName || '—'}</SessionValue>
            </SessionRow>
            <SessionRow>
              <SessionLabel>Пользователь</SessionLabel>
              <SessionValue>{employeeName || '—'}</SessionValue>
            </SessionRow>
            <SessionRow>
              <SessionLabel>Идентификатор</SessionLabel>
              <SessionValue>{employeeId || '—'}</SessionValue>
            </SessionRow>
            <SessionRow>
              <SessionLabel>Роли</SessionLabel>
              <SessionValue>{roles.length ? roles.join(', ') : '—'}</SessionValue>
            </SessionRow>
          </SessionBlock>

          <BackToLoginButton variant="contained" disableElevation onClick={() => navigate(KND_LOGIN_PATH)}>
            Вернуться к странице входа
          </BackToLoginButton>
        </StubCard>
      </Content>
    </PageWrapper>
  );
};

export default KndPage;
