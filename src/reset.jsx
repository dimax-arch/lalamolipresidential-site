import React from 'react';
import { createRoot } from 'react-dom/client';
import ResetPassword from './components/ResetPassword/ResetPassword.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './index.css';

createRoot(document.getElementById('reset-root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ResetPassword />
    </ToastProvider>
  </React.StrictMode>
);
