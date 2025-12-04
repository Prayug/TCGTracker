import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { ToastProvider } from './components/common/Toast.tsx';
import { ThemeProvider } from './hooks/useTheme.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { initTheme } from './utils/theme.ts';
import { initSentry } from './config/sentry.ts';
import './config/apiClient.ts';
import './index.css';

initTheme();
initSentry();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found. Ensure index.html has <div id="root"></div>.');
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </ToastProvider>
          </MotionConfig>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
