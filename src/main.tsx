import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { ThemeProvider } from './hooks/useTheme.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { initTheme } from './utils/theme.ts';
import { initSentry } from './config/sentry.ts';
import './config/apiClient.ts';
import './index.css';

initTheme();
initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MotionConfig reducedMotion="user">
            <App />
          </MotionConfig>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
