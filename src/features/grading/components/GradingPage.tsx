import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { useToast } from '../../../components/common/Toast';
import { useGame } from '../../../contexts/GameContext';
import {
  checkGradingBackendHealth,
  getGradingHistory,
  gradeCard,
} from '../../../services/gradingService';
import { vaultService } from '../../../services/vaultService';
import { GradingResult, gradeToVaultCondition } from '../../../types/grading';
import { PokemonCard } from '../../../types/pokemon';
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
    // Open card picker via browse modal if available; otherwise create a stub vault entry prompt
    const stub: PokemonCard = {
      id: grading.cardId || grading.id,
      name: grading.cardName || 'Graded Card',
      number: '',
      images: {
        small: grading.imageUrl || '',
        large: grading.imageUrl || '',
      },
      set: { id: '', name: 'Unknown Set', releaseDate: '', total: 0 },
      marketPrice: grading.estimatedGradedValue,
    };

    const condition = (grading.suggestedCondition ||
      gradeToVaultCondition(grading.grade)) as import('../../../types/pokemon').CardCondition;

    const price = grading.estimatedGradedValue || 0;
    const entry = vaultService.addToVault(stub, price, 1, condition, `PSA-style Grade ${grading.grade} ${grading.gradeLabel}`, game);
    vaultService.updateVaultCard(entry.id, { gradingResult: grading }, game);
    showToast('Added graded card to vault', 'success');
  };

  const handleGradeAnother = () => {
    setResult(null);
    setError(null);
    setCaptureKey((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <SectionLabel className="text-accent/90">Tools</SectionLabel>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-h2 text-ink-primary">AI Card Grading</h1>
          {backendOk === true && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gain/30 bg-gain-muted px-2 py-0.5 text-[10px] font-medium text-gain">
              Online
            </span>
          )}
          {backendOk === false && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              Scanner offline
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          PSA-style condition estimate — Centering, Corners, Edges, and Surface on a 10-point
          scale. Specialist computer vision (not a chatbot). Not a substitute for professional
          grading.
        </p>
      </div>

      {backendOk === false && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Grading service not reachable on port 5001.</p>
              <p className="mt-1 text-amber-200/80">
                Start the Python backend: <code className="font-mono text-xs">cd card-scanner-backend && python app.py</code>
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
            <div className="flex items-center justify-center gap-3 rounded-xl border border-border-subtle bg-surface-inset/50 py-10 text-sm text-ink-muted">
              <Sparkles className="h-5 w-5 animate-pulse text-accent" />
              Analyzing centering, corners, edges & surface…
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
    </div>
  );
};
