import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { BottomTabBar } from './components/layout/BottomTabBar';
import { PageShell } from './components/layout/PageShell';
import { CommandPalette } from './components/common/CommandPalette';
import { OnboardingChecklist } from './components/common/OnboardingChecklist';
import { SignInModal } from './components/auth/SignInModal';
import { CardModalProvider } from './contexts/CardModalContext';
import { GameProvider } from './contexts/GameContext';
import { useAuth } from './hooks/useAuth';
import { env } from './config/env';
import { BrowsePage } from './pages/BrowsePage';
import { LandingPage } from './pages/LandingPage';
import { LoadingSpinner } from './components/common/LoadingSpinner';

const PriceTrackingDashboard = lazy(() =>
  import('./features/market/components/PriceTrackingDashboard').then((m) => ({
    default: m.PriceTrackingDashboard,
  }))
);
const MarketInsightsDashboard = lazy(() =>
  import('./features/market-insights/components/MarketInsightsPage').then((m) => ({
    default: m.MarketInsightsPage,
  }))
);
const VaultView = lazy(() =>
  import('./features/vault/components/VaultView').then((m) => ({ default: m.VaultView }))
);
const PackShop = lazy(() =>
  import('./features/packs/components/PackShop').then((m) => ({ default: m.PackShop }))
);
const OpenPacksPage = lazy(() =>
  import('./features/open/components/OpenPacksPage').then((m) => ({ default: m.OpenPacksPage }))
);
const CardScanner = lazy(() =>
  import('./features/scanner/components/CardScanner').then((m) => ({ default: m.CardScanner }))
);
const GradingPage = lazy(() =>
  import('./features/grading/components/GradingPage').then((m) => ({ default: m.GradingPage }))
);
const PhoneCapturePage = lazy(() =>
  import('./features/capture/components/PhoneCapturePage').then((m) => ({
    default: m.PhoneCapturePage,
  }))
);
const SetIndex = lazy(() =>
  import('./features/sets/components/SetIndex').then((m) => ({ default: m.SetIndex }))
);
const SetDetail = lazy(() =>
  import('./features/sets/components/SetDetail').then((m) => ({ default: m.SetDetail }))
);
const WishlistView = lazy(() =>
  import('./features/wishlist/components/WishlistView').then((m) => ({ default: m.WishlistView }))
);
const BindersIndex = lazy(() =>
  import('./features/binders/components/BindersIndex').then((m) => ({ default: m.BindersIndex }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

function HomePage() {
  return <LandingPage />;
}

function SetsPage() {
  const { setId } = useParams();
  const navigate = useNavigate();
  return (
    <PageShell wide>
      {setId ? (
        <SetDetail setId={setId} onBack={() => navigate('/sets')} />
      ) : (
        <SetIndex onSelectSet={(id: string) => navigate(`/sets/${id}`)} />
      )}
    </PageShell>
  );
}

function VaultPage() {
  const navigate = useNavigate();
  return (
    <PageShell wide atmosphere="subtle">
      <VaultView onOpenSet={(setId) => navigate(`/sets/${setId}`)} />
    </PageShell>
  );
}

const pageVariants = {
  initial: { opacity: 0, y: 18, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 1.015,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
};

function ShellPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <PageShell wide={wide}>{children}</PageShell>;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0"
      >
        <Suspense fallback={<RouteFallback />}>
          <ErrorBoundary>
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route
                path="/prices"
                element={
                  <ShellPage wide>
                    <PriceTrackingDashboard />
                  </ShellPage>
                }
              />
              <Route
                path="/market-insights"
                element={
                  <ShellPage wide>
                    <MarketInsightsDashboard />
                  </ShellPage>
                }
              />
              <Route path="/vault" element={<VaultPage />} />
              <Route
                path="/wishlist"
                element={
                  <ShellPage>
                    <WishlistView />
                  </ShellPage>
                }
              />
              <Route
                path="/binders"
                element={
                  <ShellPage>
                    <BindersIndex />
                  </ShellPage>
                }
              />
              <Route path="/sets" element={<SetsPage />} />
              <Route path="/sets/:setId" element={<SetsPage />} />
              <Route
                path="/packs"
                element={
                  <ShellPage wide>
                    <PackShop />
                  </ShellPage>
                }
              />
              <Route
                path="/open"
                element={
                  <ShellPage wide>
                    <OpenPacksPage />
                  </ShellPage>
                }
              />
              <Route
                path="/scanner"
                element={
                  <ShellPage>
                    <CardScanner />
                  </ShellPage>
                }
              />
              <Route
                path="/grading"
                element={
                  <ShellPage>
                    <GradingPage />
                  </ShellPage>
                }
              />
              <Route path="/capture/:sessionId" element={<PhoneCapturePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function AppShell() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isPhoneCapture = location.pathname.startsWith('/capture/');

  if (isPhoneCapture) {
    return (
      <div className="min-h-screen min-w-0 bg-surface-base text-ink-primary">
        <main id="main-content" className="relative min-w-0">
          <AppRoutes />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-surface-base text-ink-primary">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href="#main-content"
          className="sr-only z-[95] rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>

        <Header />

        <main
          id="main-content"
          className={
            isHome
              ? 'relative min-w-0 flex-1 overflow-hidden pb-0'
              : 'relative min-w-0 flex-1 pb-20 md:pb-0'
          }
        >
          <AppRoutes />
        </main>

        <OnboardingChecklist />
        {!isHome && <Footer />}
      </div>

      <BottomTabBar />
      <CommandPalette />
    </div>
  );
}

function App() {
  const {
    authModalOpen,
    authModalMode,
    closeAuthModal,
    setAuthModalMode,
  } = useAuth();

  return (
    <MotionConfig reducedMotion="user">
      <GameProvider>
        <CardModalProvider>
          <AppShell />
          {env.enableAuth && (
            <SignInModal
              isOpen={authModalOpen}
              mode={authModalMode}
              onModeChange={setAuthModalMode}
              onClose={closeAuthModal}
            />
          )}
        </CardModalProvider>
      </GameProvider>
    </MotionConfig>
  );
}

export default App;
