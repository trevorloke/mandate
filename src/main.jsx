import React from 'react';
import ReactDOM from 'react-dom/client';
import './tokens.css';
import { AuthProvider } from './auth/AuthContext';
import { RealtimeProvider } from './auth/useRealtime';
import { LocaleProvider } from './i18n';
import App2 from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <LocaleProvider>
    <AuthProvider>
      <RealtimeProvider>
        <App2 />
      </RealtimeProvider>
    </AuthProvider>
  </LocaleProvider>
);
