import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import { useToast } from '../../../components/common/Toast';
import { useGame } from '../../../contexts/GameContext';
import { fetchGradedPrices } from '../../../services/gradedPricesApi';
import {
  checkGradingBackendHealth,
  getGradingHistory,
  gradeCard,
  updateLocalHistoryEntry,
} from '../../../services/gradingService';
import { GradingResult } from '../../../types/grading';
import { PokemonCard } from '../../../types/pokemon';
import { formatCurrency } from '../../../utils/cardDisplay';
import { getCardPrice } from '../../../utils/cardPrice';
import { AddToVaultModal } from '../../vault/components/AddToVaultModal';
import {
  buildGradeDecision,
  GradeMarket,
  marketFromPrices,
  vaultConditionFromDecision,
} from '../gradingDecision';
import { isUnidentifiedCard } from '../gradingPresentation';
import {
  loadSubmissionQueue,
  removeFromSubmissionQueue,
  SubmissionQueueItem,
} from '../submissionQueue';
import { CardSearchPickerModal } from './CardSearchPickerModal';
import { GradingCapture } from './GradingCapture';
import { GradingHistory } from './GradingHistory';
import { GradingResultView } from './GradingResultView';
import { GradeCapturePayload } from '../scanProtocol';

export const GradingPage: React.FC = () => {
  const { game } = useGame();
  const { showToast } = useToast();

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [history, setHistory] = useState<GradingResult[]>([]);
  const [captureKey, setCaptureKey] = useState(0);
  const [rawPrice, setRawPrice] = useState<number | undefined>();
  const [market, setMarket] = useState<GradeMarket | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [queue, setQueue] = useState<SubmissionQueueItem[]>(() => loadSubmissionQueue());

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'identify' | 'vault'>('identify');
  const [pendingGrading, setPendingGrading] = useState<GradingResult | null>(null);
  const [vaultCard, setVaultCard] = useState<PokemonCard | null>(null);
  const [identifiedCard, setIdentifiedCard] = useState<PokemonCard | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);

  const refreshHistory = useCallback(async () => {
    const h = await getGradingHistory();
    setHistory(h);
  }, []);

  useEffect(() => {
    checkGradingBackendHealth().then(setBackendOk);
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!result || isUnidentifiedCard(result.cardName) || !result.cardId) {
      setMarket(rawPrice ? marketFromPrices(rawPrice, null) : null);
      setMarketLoading(false);
      return;
    }

    let cancelled = false;
    setMarketLoading(true);
    void fetchGradedPrices({
      cardId: result.cardId,
      cardName: result.cardName,
      setId: identifiedCard?.set?.id,
      setName: identifiedCard?.set?.name,
      cardNumber: identifiedCard?.number,
      language: identifiedCard?.language,
      matchName: identifiedCard?.matchName,
      variant: identifiedCard?.preferredVariant,
    }).then((graded) => {
      if (cancelled) return;
      const raw = rawPrice ?? (identifiedCard ? getCardPrice(identifiedCard) : null);
      setMarket(marketFromPrices(raw, graded?.prices));
      setMarketLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [result, rawPrice, identifiedCard]);

  const handleCapture = async (payload: GradeCapturePayload) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setIdentifiedCard(null);
    setRawPrice(undefined);
    setMarket(null);
    try {
      const grading = await gradeCard(payload.front, {
        game,
        backImage: payload.back,
        extraFrames: payload.extraFrames,
        scanMode: payload.mode,
      });
      setResult(grading);
      await refreshHistory();
      const decision = buildGradeDecision(grading);
      showToast(`${decision.psaRangeLabel ?? decision.marketplaceLabel}`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Grading failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const applyIdentity = (card: PokemonCard, grading: GradingResult) => {
    const price = getCardPrice(card);
    const patch: Partial<GradingResult> = {
      cardName: card.name,
      cardId: card.id,
    };
    const next = { ...grading, ...patch };
    setResult(next);
    setIdentifiedCard(card);
    setRawPrice(price > 0 ? price : undefined);
    updateLocalHistoryEntry(grading.id, patch);
    setHistory((rows) => rows.map((r) => (r.id === grading.id ? { ...r, ...patch } : r)));
    return next;
  };

  const handleIdentify = (grading: GradingResult) => {
    setPendingGrading(grading);
    setPickerMode('identify');
    setPickerOpen(true);
  };

  const handleAddToVault = (grading: GradingResult) => {
    setPendingGrading(grading);
    if (identifiedCard && !isUnidentifiedCard(grading.cardName)) {
      setVaultCard(identifiedCard);
      setVaultOpen(true);
      return;
    }
    setPickerMode('vault');
    setVaultCard(null);
    setVaultOpen(false);
    setPickerOpen(true);
  };

  const handleCardPicked = (card: PokemonCard) => {
    const grading = pendingGrading || result;
    if (!grading) return;
    const next = applyIdentity(card, grading);
    setPickerOpen(false);
    if (pickerMode === 'vault') {
      setVaultCard(card);
      setPendingGrading(next);
      setVaultOpen(true);
    } else {
      showToast(`Identified as ${card.name}`, 'success');
    }
  };

  const closeVaultFlow = () => {
    setVaultOpen(false);
    setVaultCard(null);
    setPendingGrading(null);
  };

  const handleGradeAnother = () => {
    setResult(null);
    setError(null);
    setIdentifiedCard(null);
    setRawPrice(undefined);
    setMarket(null);
    setCaptureKey((k) => k + 1);
    closeVaultFlow();
    setPickerOpen(false);
  };

  const vaultDecision = useMemo(
    () => (pendingGrading ? buildGradeDecision(pendingGrading) : null),
    [pendingGrading]
  );

  return (
    <div className="relative">
      {!result && (
        <div className="mb-8 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-h1 text-ink-primary">AI card grading</h1>
            {backendOk === false && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                Scanner offline
              </span>
            )}
          </div>
          <p className="max-w-xl text-sm text-ink-secondary">
            Photograph the front and back. We’ll return a predicted PSA number from those photos.
            Not a substitute for a slab.
          </p>
        </div>
      )}

      {backendOk === false && (
        <div className="mb-4 rounded-xl border border-accent/25 bg-accent/10 p-4 text-sm text-ink-primary">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Grading service unavailable</p>
              <p className="mt-1 text-sm text-amber-200/80">
                AI card grading requires a local Python backend that processes card images —
                it&apos;s not available on the hosted demo.
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-ink-secondary hover:text-ink-primary">
                  Running locally? Start the backend ↓
                </summary>
                <p className="mt-2 text-xs text-amber-200/80">
                  <code className="font-mono">cd card-scanner-backend && python app.py</code>
                </p>
              </details>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={() => checkGradingBackendHealth().then(setBackendOk)}
              >
                <RefreshCw className="h-4 w-4" />
                Check again
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {!result && (
          <div className="mx-auto max-w-3xl">
            <GradingCapture
              key={captureKey}
              onCapture={handleCapture}
              isProcessing={isProcessing}
              disabled={isProcessing}
            />
          </div>
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
                Checking photos, then centering, corners, edges, and surface…
              </p>
              <p className="text-sm text-ink-muted">This takes a few seconds</p>
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
            market={market}
            marketLoading={marketLoading}
            onAddToVault={handleAddToVault}
            onGradeAnother={handleGradeAnother}
            onIdentifyCard={handleIdentify}
            onRetake={handleGradeAnother}
            onQueueChange={() => setQueue(loadSubmissionQueue())}
          />
        )}

        <SubmissionQueueList
          items={queue}
          onRemove={(id) => setQueue(removeFromSubmissionQueue(id))}
        />

        <GradingHistory
          history={history}
          selectedId={result?.id}
          onSelect={(r) => {
            setResult(r);
            setError(null);
            setIdentifiedCard(null);
            setRawPrice(undefined);
            setMarket(null);
          }}
        />
      </div>

      <CardSearchPickerModal
        isOpen={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          if (!vaultOpen) setPendingGrading(null);
        }}
        initialQuery={isUnidentifiedCard(pendingGrading?.cardName) ? '' : pendingGrading?.cardName}
        title={pickerMode === 'identify' ? 'Identify this card' : 'Match card for vault'}
        description={
          pickerMode === 'identify'
            ? 'Search the catalog so this estimate is attached to the right card.'
            : 'Search the catalog and pick the real card to add.'
        }
        onSelect={handleCardPicked}
      />

      <AddToVaultModal
        card={vaultCard}
        isOpen={vaultOpen}
        onClose={closeVaultFlow}
        onSuccess={closeVaultFlow}
        game={game}
        initialCondition={vaultDecision ? vaultConditionFromDecision(vaultDecision) : undefined}
        initialNotes={vaultDecision?.sellerCopy}
        initialPurchasePrice={rawPrice}
        gradingResult={
          pendingGrading && vaultDecision
            ? { ...pendingGrading, suggestedCondition: vaultDecision.marketplace }
            : (pendingGrading ?? undefined)
        }
      />
    </div>
  );
};

function SubmissionQueueList({
  items,
  onRemove,
}: {
  items: SubmissionQueueItem[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-primary">Submission queue</h2>
        <p className="text-sm text-ink-muted">
          {items.length} card{items.length === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-inset/40 px-3 py-2"
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-12 w-9 shrink-0 rounded bg-white/5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-primary">{item.cardName}</p>
              <p className="text-sm text-ink-muted">
                {item.action === 'submit' ? 'Submit' : 'Consider'} · {item.psaRangeLabel}
                {item.expectedUpside != null
                  ? ` · ${formatCurrency(item.expectedUpside, { signed: true })}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="btn-ghost"
              aria-label={`Remove ${item.cardName} from queue`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
