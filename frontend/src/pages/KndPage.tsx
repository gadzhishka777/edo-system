import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import KndDashboard from './knd/KndDashboard';
import KndAccountPage from './knd/KndAccountPage';
import KndObjectFormPage from './knd/KndObjectFormPage';
import KndKnmPage from './knd/KndKnmPage';
import KndAppealsPage from './knd/KndAppealsPage';
import KndSectionPage from './knd/KndSectionPage';
import { KND_HOME_PATH } from '../theme/knd';

/**
 * Корень модуля «ТОР Контроль».
 *
 * Внешний маршрут объявлен как `/knd/*`, поэтому вложенные пути здесь
 * относительные. Так модуль целиком живёт в своём контуре и не пересекается
 * с маршрутами ТОР ЭДО.
 *
 * Маршруты:
 *   /knd                        — главный экран с плитками разделов
 *   /knd/account                — реестры контролируемых лиц и объектов контроля
 *   /knd/account/objects/new    — форма создания объекта контроля
 *   /knd/knm                    — единый реестр контрольных (надзорных) мероприятий
 *   /knd/appeals                — подсистема досудебного обжалования
 *   /knd/section/:slug          — каркас раздела, который ещё не реализован
 */
const KndPage: React.FC = () => (
  <Routes>
    <Route index element={<KndDashboard />} />
    <Route path="account/objects/new" element={<KndObjectFormPage />} />
    <Route path="account" element={<KndAccountPage />} />
    <Route path="knm" element={<KndKnmPage />} />
    <Route path="appeals" element={<KndAppealsPage />} />
    <Route path="section/:slug" element={<KndSectionPage />} />
    <Route path="*" element={<Navigate to={KND_HOME_PATH} replace />} />
  </Routes>
);

export default KndPage;
