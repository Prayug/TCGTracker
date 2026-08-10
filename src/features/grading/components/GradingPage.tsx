import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useToast } from '../../../components/common/Toast';
import { useGame } from '../../../contexts/GameContext';
import {
  checkGradingBackendHealth,
  getGradingHistory,
  gradeCard,
} from '../../../services/gradingService';
import { GradingResult, gradeToVaultCondition } from '../../../types/grading';
import { CardCondition, PokemonCard } from '../../../types/pokemon';
import { AddToVaultModal } from '../../vault/components/AddToVaultModal';
import { CardSearchPickerModal } from './CardSearchPickerModal';
import { GradingCapture } from './GradingCapture';
import { GradingHistory } from './GradingHistory';
import { GradingResultView } from './GradingResultView';

export const GradingPage: React.FC = () => {
  const { game } = useGame();
  const { showToast } = useToast();

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [history, setHistory] = useState<GradingResult[]>([]);
  const [captureKey, setCaptureKey] = useState(0);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingGrading, setPendingGrading] = useState<GradingResult | null>(null);
  const [vaultCard, setVaultCard] = useState<PokemonCard | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);

  const refreshHistory = useCallback(async () => {
    const h = await getGradingHistory();
    setHistory(h);
  }, []);

  useEffect(() => {
    checkGradingBackendHealth().then(setBackendOk);
    void refreshHistory();
  }, [refreshHistory]);

  const handleCapture = async (image: File | string, backImage?: File | string) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    try {
      const grading = await gradeCard(image, {
        game,
        cardName: 'Graded Card',
        backImage,
      });
      setResult(grading);
      await refreshHistory();
      showToast(`Graded ${grading.gradeLabel} (${grading.grade}/10)`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Grading failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddToVault = (grading: GradingResult) => {
    setPendingGrading(grading);
    setVaultCard(null);
    setVaultOpen(false);
    setPickerOpen(true);
  };

  const handleCardPicked = (card: PokemonCard) => {
    setVaultCard(card);
    setPickerOpen(false);
    setVaultOpen(true);
  };

  const closeVaultFlow = () => {
    setVaultOpen(false);
    setVaultCard(null);
    setPendingGrading(null);
  };

  const handleGradeAnother = () => {
    setResult(null);
    setError(null);
    setCaptureKey((k) => k + 1);
    closeVaultFlow();
    setPickerOpen(false);
  };

  const vaultCondition: CardCondition | undefined = pendingGrading
    ? ((pendingGrading.suggestedCondition ||
        gradeToVaultCondition(pendingGrading.grade)) as CardCondition)
    : undefined;

  const vaultNotes = pendingGrading
    ? `PSA-style Grade ${pendingGrading.grade} ${pendingGrading.gradeLabel}`
    : undefined;

  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="mb-8 space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
          Tools
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-h1 text-ink-primary">AI card grading</h1>
          {backendOk === true && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-gain/30 bg-gain-muted px-2 py-0.5 text-[10px] font-medium text-gain">
              Online
            </span>
          )}
          {backendOk === false && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              Scanner offline
            </span>
          )}
        </div>
        <p className="max-w-2xl text-sm text-ink-secondary">
          PSA-style condition estimate — Centering, Corners, Edges, and Surface on a 10-point
          scale. Specialist computer vision (not a chatbot). Not a substitute for professional
          grading.
        </p>
      </div>

      {backendOk === false && (
        <div className="mb-4 rounded-xl border border-accent/25 bg-accent/10 p-4 text-sm text-ink-primary">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Grading service not reachable on port 5001.</p>
              <p className="mt-1 text-amber-200/80">
                Start the Python backend:{' '}
                <code className="font-mono text-xs">cd card-scanner-backend && python app.py</code>
              </p>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={() => checkGradingBackendHealth().then(setBackendOk)}
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {!result && (
            <GradingCapture
              key={captureKey}
              onCapture={handleCapture}
              isProcessing={isProcessing}
              disabled={isProcessing}
            />
          )}

          {isProcessing && (
            <div className="card-glass-scene relative overflow-hidden py-12">
              <div className="animate-shimmer-accent absolute inset-0" />
              <div className="relative flex flex-col items-center justify-center gap-3 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                >
                  <Sparkles className="h-6 w-6 text-accent" />
                </motion.div>
                <p className="text-sm font-medium text-ink-primary">
                  Analyzing centering, corners, edges & surface…
                </p>
                <p className="text-xs text-ink-muted">This takes a few seconds</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {result && (
            <GradingResultView
              result={result}
              rawPrice={undefined}
              onAddToVault={handleAddToVault}
              onGradeAnother={handleGradeAnother}
            />
          )}
        </div>

        <aside>
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Grading history</h2>
          <GradingHistory
            history={history}
            selectedId={result?.id}
            onSelect={(r) => {
              setResult(r);
              setError(null);
            }}
          />
        </aside>
      </div>

      <CardSearchPickerModal
        isOpen={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          if (!vaultOpen) setPendingGrading(null);
        }}
        initialQuery={pendingGrading?.cardName}
        onSelect={handleCardPicked}
      />

      <AddToVaultModal
        card={vaultCard}
        isOpen={vaultOpen}
        onClose={closeVaultFlow}
        onSuccess={closeVaultFlow}
        game={game}
        initialCondition={vaultCondition}
        initialNotes={vaultNotes}
        initialPurchasePrice={pendingGrading?.estimatedGradedValue}
        gradingResult={pendingGrading ?? undefined}
      />
    </div>
  );
};
