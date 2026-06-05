import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { HeroSection } from './components/common/HeroSection';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { BottomTabBar } from './components/layout/BottomTabBar';
import { CommandPalette } from './components/common/CommandPalette';
import { OnboardingChecklist } from './components/common/OnboardingChecklist';
import { CardModalProvider } from './contexts/CardModalContext';
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
const SetIndex = lazy(() =>
  import('./features/sets/components/SetIndex').then((m) => ({ default: m.SetIndex }))
);
const SetDetail = lazy(() =>
  import('./features/sets/components/SetDetail').then((m) => ({ default: m.SetDetail }))
);

const PAGE_CONTAINER = 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8';

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

function App() {
  return (
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

          <main id="main-content" className="min-w-0 flex-1 pb-20 md:pb-0">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>

          <OnboardingChecklist />
          <Footer />
        </div>

        <BottomTabBar />
        <CommandPalette />
      </div>
    </CardModalProvider>
  );
}

export default App;
