import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { NotConfigured } from './components/Wallpaper';
import { isConfigured } from './lib/api';
import { Admin } from './pages/Admin';
import { Portal } from './pages/Portal';
import { Settings } from './pages/Settings';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Portal />} />
          <Route path="/settings/:personId" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
);
