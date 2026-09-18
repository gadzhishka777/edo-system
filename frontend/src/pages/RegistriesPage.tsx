import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import EmployeesPage from './EmployeesPage';
import VacanciesPage from './VacanciesPage';
import ClassesPage from './ClassesPage';
import ProgramsPage from './ProgramsPage';
import { authApi } from '../api/edoApi';

type RegistryTab = 'employees' | 'vacancies' | 'classes' | 'programs';

// Вкладки, доступные только организациям с признаком «Является школой»
const SCHOOL_TABS: RegistryTab[] = ['classes', 'programs'];

const RegistriesPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<RegistryTab>('employees');

  // Признак «Является школой»: от него зависит вкладка «Классы».
  // null — ещё не загрузили, чтобы вкладка не мигала у не-школ.
  const [isSchool, setIsSchool] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    authApi.getCurrentOrg()
      .then((org) => {
        if (active) setIsSchool(!!org.is_school);
      })
      .catch(() => {
        // Не смогли определить — считаем, что не школа: вкладку не показываем
        if (active) setIsSchool(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Определяем активную вкладку из URL
  useEffect(() => {
    const path = location.pathname;
    const requested: RegistryTab = path.includes('programs')
      ? 'programs'
      : path.includes('vacancies')
        ? 'vacancies'
        : path.includes('classes')
          ? 'classes'
          : 'employees';

    // Вкладки для школ недоступны остальным — уводим на «Сотрудники»
    if (SCHOOL_TABS.includes(requested) && isSchool === false) {
      navigate('/registries/employees', { replace: true });
      setActiveTab('employees');
      return;
    }

    setActiveTab(requested);
  }, [location.pathname, isSchool, navigate]);

  const handleTabChange = (_: React.ChangeEvent<{}>, newValue: RegistryTab) => {
    setActiveTab(newValue);
    navigate(`/registries/${newValue}`);
  };

  const showSchoolTabs = isSchool === true;
  const activeTabHidden = SCHOOL_TABS.includes(activeTab) && !showSchoolTabs;

  return (
    <Box>
      <Tabs
        value={activeTabHidden ? false : activeTab}
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
        {showSchoolTabs && <Tab value="classes" label="Классы" />}
        {showSchoolTabs && <Tab value="programs" label="Программы" />}
      </Tabs>

      {activeTab === 'employees' && <EmployeesPage />}
      {activeTab === 'vacancies' && <VacanciesPage />}
      {activeTab === 'classes' && showSchoolTabs && <ClassesPage />}
      {activeTab === 'programs' && showSchoolTabs && <ProgramsPage />}
    </Box>
  );
};

export default RegistriesPage;
