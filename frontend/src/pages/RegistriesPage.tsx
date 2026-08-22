import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import EmployeesPage from './EmployeesPage';

const RegistriesPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'employees' | 'documents'>('employees');

  // Определяем активную вкладку из URL
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('employees')) {
      setActiveTab('employees');
    } else if (path.includes('documents')) {
      setActiveTab('documents');
    }
  }, [location.pathname]);

  const handleTabChange = (_: React.ChangeEvent<{}>, newValue: 'employees' | 'documents') => {
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
        <Tab value="documents" label="Документы" disabled />
      </Tabs>

      {activeTab === 'employees' && <EmployeesPage />}
    </Box>
  );
};

export default RegistriesPage;
