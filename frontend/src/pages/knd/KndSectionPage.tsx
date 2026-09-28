import React from 'react';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Navigate, useParams } from 'react-router-dom';

import KndShell from '../../components/knd/KndShell';
import { KndBreadcrumb } from '../../components/knd/KndControls';
import {
  KND_APP_BLUE,
  KND_APP_BLUE_SOFT,
  KND_APP_BORDER,
  KND_APP_SURFACE,
  KND_APP_TEXT,
  KND_APP_TEXT_MUTED,
  KND_HOME_PATH,
} from '../../theme/knd';
import { KND_SECTIONS } from './kndSections';

const Content = styled(Box)({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '24px',
});

const StubCard = styled(Box)({
  maxWidth: '760px',
  padding: '32px',
  borderRadius: '3px',
  backgroundColor: KND_APP_SURFACE,
  border: `1px solid ${KND_APP_BORDER}`,
});

const Badge = styled(Box)({
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '3px',
  backgroundColor: KND_APP_BLUE_SOFT,
  color: KND_APP_BLUE,
  fontFamily: 'Lato, sans-serif',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
});

const Title = styled(Typography)({
  marginTop: '14px',
  color: KND_APP_TEXT,
  fontFamily: 'Lato, sans-serif',
  fontSize: '24px',
  fontWeight: 700,
});

const Subtitle = styled(Typography)({
  marginTop: '8px',
  color: KND_APP_TEXT_MUTED,
  fontFamily: 'Lato, sans-serif',
  fontSize: '14px',
  lineHeight: 1.6,
});

/**
 * Раздел модуля, который ещё не реализован.
 *
 * Нужен, чтобы все плитки главного экрана и рельс были рабочими ссылками,
 * а не мёртвыми кнопками: пользователь попадает в каркас раздела и видит,
 * что функциональность появится позже.
 */
const KndSectionPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const section = slug ? KND_SECTIONS[slug] : undefined;

  if (!section) return <Navigate to={KND_HOME_PATH} replace />;

  return (
    <KndShell
      activeRail={slug}
      breadcrumb={<KndBreadcrumb items={[{ label: 'Главная', path: KND_HOME_PATH }, { label: section.title }]} />}
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
          {section.title}
        </Typography>
      }
    >
      <Content>
        <StubCard>
          <Badge>Раздел в разработке</Badge>
          <Title>{section.title}</Title>
          <Subtitle>
            {section.subtitle}. Раздел появится в следующих релизах модуля — сейчас
            реализованы главный экран, реестры контролируемых лиц и объектов контроля,
            единый реестр контрольных (надзорных) мероприятий и досудебное обжалование.
          </Subtitle>
        </StubCard>
      </Content>
    </KndShell>
  );
};

export default KndSectionPage;
