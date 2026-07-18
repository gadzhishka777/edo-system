import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import LoginPage from './pages/LoginPage';
import AboutPage from './pages/AboutPage';
import MailPage from './pages/MailPage';
import DocumentsPage from './pages/DocumentsPage';
import ContactsPage from './pages/ContactsPage';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import Footer from './components/Layout/Footer';
import { authApi } from './api/edoApi';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setIsAuthenticated(authApi.isAuthenticated());
  }, []);

  const handleLogin = () => setIsAuthenticated(true);

  const handleLogout = async () => {
    await authApi.logout();
    setIsAuthenticated(false);
  };

  const handleToggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <BrowserRouter>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route
            path="/*"
            element={
              isAuthenticated ? (
                <Box sx={{ display: 'flex', flex: 1 }}>
                  <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100vh' }}>
                    <Header onMenuToggle={handleToggleSidebar} onLogout={handleLogout} />
                    <Box sx={{ mt: '64px', flex: 1, backgroundColor: '#f4f4f8' }}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/about" replace />} />
                        <Route path="/documents" element={<DocumentsPage />} />
                        <Route path="/mail" element={<MailPage />} />
                        <Route path="/contacts" element={<ContactsPage />} />
                        <Route path="/about" element={<AboutPage />} />
                      </Routes>
                    </Box>
                    <Footer />
                  </Box>
                </Box>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </Box>
    </BrowserRouter>
  );
}

export default App;