import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import EmployeesPage from './EmployeesPage';
import VacanciesPage from './VacanciesPage';

type RegistryTab = 'employees' | 'vacancies';

const RegistriesPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<RegistryTab>('employees');

  // Определяем активную вкладку из URL
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('vacancies')) {
      setActiveTab('vacancies');
    } else {
      // «Документы» (documents) упразднены — редирект на «Сотрудники»
      setActiveTab('employees');
    }
  }, [location.pathname]);

  const handleTabChange = (_: React.ChangeEvent<{}>, newValue: RegistryTab) => {
    setActiveTab(newValue);
    navigate(`/registries/${newValue}`);
  };

  return (
    <Box>
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{
          borderBottom: '1px solid #eaebf0',
          mb: 0,
          '& .MuiTab-root': {
            fontFamily: 'Lato, sans-serif',
            fontSize: '14px',
            fontWeight: 500,
            textTransform: 'none',
            minHeight: 48,
          },
        }}
      >
        <Tab value="employees" label="Сотрудники" />
        <Tab value="vacancies" label="Вакансии" />
      </Tabs>

      {activeTab === 'employees' && <EmployeesPage />}
      {activeTab === 'vacancies' && <VacanciesPage />}
    </Box>
  );
};

export default RegistriesPage;
