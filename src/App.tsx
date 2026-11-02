import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AppHeader, AppRail, MobileNav } from './components/exchange/AppShellNav';
import { ScrollMemory } from './components/exchange/ScrollMemory';
import { PageShell } from './components/layout/PageShell';
import { CommandPalette } from './components/common/CommandPalette';
import { SignInModal } from './components/auth/SignInModal';
import { CardModalProvider } from './contexts/CardModalContext';
import { GameProvider } from './contexts/GameContext';
import { useAuth } from './hooks/useAuth';
import { env } from './config/env';
import { BrowsePage } from './pages/BrowsePage';
import { HomePage } from './features/home/HomePage';
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
const InsightsClarityDemo = import.meta.env.DEV
  ? lazy(() =>
      import('./features/market-insights/dev/InsightsClarityDemoPage').then((m) => ({
        default: m.InsightsClarityDemoPage,
      }))
    )
  : null;
const InvestmentsPage = lazy(() =>
  import('./features/investments/components/InvestmentsPage').then((m) => ({
    default: m.InvestmentsPage,
  }))
);
const DealsPage = lazy(() =>
  import('./features/deals/components/DealsPage').then((m) => ({
    default: m.DealsPage,
  }))
);
const MoneyFlowPage = lazy(() =>
  import('./features/money-flow/components/MoneyFlowPage').then((m) => ({
    default: m.MoneyFlowPage,
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
const TradePage = lazy(() =>
  import('./features/trade/components/TradePage').then((m) => ({ default: m.TradePage }))
);
const BindersIndex = lazy(() =>
  import('./features/binders/components/BindersIndex').then((m) => ({ default: m.BindersIndex }))
);
const CardResearchPage = lazy(() =>
  import('./features/card-research/CardResearchPage').then((m) => ({
    default: m.CardResearchPage,
  }))
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

function ShellPage({
  children,
  wide,
  fluid,
  flush,
  plain,
  atmosphere,
}: {
  children: ReactNode;
  wide?: boolean;
  fluid?: boolean;
  flush?: boolean;
  plain?: boolean;
  atmosphere?: 'default' | 'subtle';
}) {
  return (
    <PageShell wide={wide} fluid={fluid} flush={flush} plain={plain} atmosphere={atmosphere}>
      {children}
    </PageShell>
  );
}

function AppRoutes() {
  const location = useLocation();
  return (
    <div className="min-w-0">
      <Suspense fallback={<RouteFallback />}>
        <ErrorBoundary key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/card/:id" element={<CardResearchPage />} />
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
                <ShellPage wide fluid>
                  <MarketInsightsDashboard />
                </ShellPage>
              }
            />
            {InsightsClarityDemo ? (
              <Route
                path="/dev/insights-clarity"
                element={
                  <ShellPage wide fluid>
                    <InsightsClarityDemo />
                  </ShellPage>
                }
              />
            ) : null}
            <Route
              path="/investments"
              element={
                <ShellPage wide>
                  <InvestmentsPage />
                </ShellPage>
              }
            />
            <Route
              path="/deals"
              element={
                <ShellPage wide>
                  <DealsPage />
                </ShellPage>
              }
            />
            <Route
              path="/money-flow"
              element={
                <ShellPage fluid flush plain atmosphere="subtle">
                  <MoneyFlowPage />
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
              path="/trade"
              element={
                <ShellPage wide>
                  <TradePage />
                </ShellPage>
              }
            />
            <Route
              path="/trade/:shareToken"
              element={
                <ShellPage wide>
                  <TradePage />
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
                <ShellPage wide>
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
    </div>
  );
}

function AppShell() {
  const location = useLocation();
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
    <div className="min-h-screen min-w-0 bg-surface-base text-ink-primary">
      <ScrollMemory />
      <a
        href="#main-content"
        className="sr-only z-[95] rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <AppRail />

      <div className="flex min-h-screen min-w-0 flex-col md:pl-[var(--rail-w)]">
        <AppHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="relative min-w-0 flex-1 pb-20 outline-none md:pb-0"
        >
          <AppRoutes />
        </main>
      </div>

      <MobileNav />
      <CommandPalette />
    </div>
  );
}

function App() {
  const { authModalOpen, authModalMode, closeAuthModal, setAuthModalMode } = useAuth();

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
