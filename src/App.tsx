import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { HeroSection } from './components/common/HeroSection';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { BottomTabBar } from './components/layout/BottomTabBar';
import { CommandPalette } from './components/common/CommandPalette';
import { OnboardingChecklist } from './components/common/OnboardingChecklist';
import { CardModalProvider } from './contexts/CardModalContext';
import { GameProvider } from './contexts/GameContext';
import { BrowsePage } from './pages/BrowsePage';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { VIEW_PATHS, browseSearchPath } from './utils/routes';

const PriceTrackingDashboard = lazy(() =>
  import('./features/market/components/PriceTrackingDashboard').then((m) => ({
    default: m.PriceTrackingDashboard,
  }))
);
const MarketInsightsDashboard = lazy(() =>
  import('./features/market-insights/components/MarketInsightsDashboard').then((m) => ({
    default: m.MarketInsightsDashboard,
  }))
);
const VaultView = lazy(() =>
  import('./features/vault/components/VaultView').then((m) => ({ default: m.VaultView }))
);
const PackShop = lazy(() =>
  import('./features/packs/components/PackShop').then((m) => ({ default: m.PackShop }))
);
const CardScanner = lazy(() =>
  import('./features/scanner/components/CardScanner').then((m) => ({ default: m.CardScanner }))
);
const GradingPage = lazy(() =>
  import('./features/grading/components/GradingPage').then((m) => ({ default: m.GradingPage }))
);
const SetIndex = lazy(() =>
  import('./features/sets/components/SetIndex').then((m) => ({ default: m.SetIndex }))
);
const SetDetail = lazy(() =>
  import('./features/sets/components/SetDetail').then((m) => ({ default: m.SetDetail }))
);

const PAGE_CONTAINER = 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8';

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();
  return (
    <HeroSection
      onStartSearch={(query) => navigate(browseSearchPath(query))}
      onViewChange={(view) => navigate(VIEW_PATHS[view])}
    />
  );
}

function SetsPage() {
  const { setId } = useParams();
  const navigate = useNavigate();
  return (
    <div className={PAGE_CONTAINER}>
      {setId ? (
        <SetDetail setId={setId} onBack={() => navigate('/sets')} />
      ) : (
        <SetIndex onSelectSet={(id: string) => navigate(`/sets/${id}`)} />
      )}
    </div>
  );
}

function VaultPage() {
  const navigate = useNavigate();
  return (
    <div className={PAGE_CONTAINER}>
      <VaultView onOpenSet={(setId) => navigate(`/sets/${setId}`)} />
    </div>
  );
}

// Enter-only CSS transition keyed by pathname. AnimatePresence mode="wait" was
// tried here and reverted: it deadlocks (old page never unmounts) when the
// incoming lazy route suspends, since the exit handshake never completes.
function AppRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="min-w-0 animate-fade-in">
      <Suspense fallback={<RouteFallback />}>
        <ErrorBoundary>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route
              path="/prices"
              element={
                <div className={PAGE_CONTAINER}>
                  <PriceTrackingDashboard />
                </div>
              }
            />
            <Route
              path="/market-insights"
              element={
                <div className={PAGE_CONTAINER}>
                  <MarketInsightsDashboard />
                </div>
              }
            />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/sets" element={<SetsPage />} />
            <Route path="/sets/:setId" element={<SetsPage />} />
            <Route
              path="/packs"
              element={
                <div className={PAGE_CONTAINER}>
                  <PackShop />
                </div>
              }
            />
            <Route
              path="/scanner"
              element={
                <div className={PAGE_CONTAINER}>
                  <CardScanner />
                </div>
              }
            />
            <Route
              path="/grading"
              element={
                <div className={PAGE_CONTAINER}>
                  <GradingPage />
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <GameProvider>
        <CardModalProvider>
          <div className="flex min-h-screen min-w-0 bg-surface-base text-ink-primary">
            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col">
              <a
                href="#main-content"
                className="sr-only z-[95] rounded-md bg-accent px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
              >
                Skip to content
              </a>

              <Header />

              <main id="main-content" className="relative min-w-0 flex-1 pb-20 md:pb-0">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/[0.04] to-transparent"
                  aria-hidden="true"
                />
                <AppRoutes />
              </main>

              <OnboardingChecklist />
              <Footer />
            </div>

            <BottomTabBar />
            <CommandPalette />
          </div>
        </CardModalProvider>
      </GameProvider>
    </MotionConfig>
  );
}

export default App;
