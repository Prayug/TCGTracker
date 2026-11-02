import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Box, ChevronDown, Layers, Package, Zap } from 'lucide-react';
import { PageHeader, PageShell } from '../../../components/layout/PageShell';
import { OddsRow, OpenedPack, PullCard, BoxSession, BulkOpenSession } from '../types';
import { onePiecePackService, sortPullsBestFirst } from '../services/onePiecePackService';
import { BOXES_PER_CASE, OnePieceSetOddsConfig } from '../data/setConfigs';
import { PackRevealModal } from './PackRevealModal';
import { BoxSessionModal } from './BoxSessionModal';
import { BulkOpenModal } from './BulkOpenModal';
import { PullsCollection } from './PullsCollection';
import { PullCardView } from './PullCardView';
import { formatCurrency } from '../../../utils/cardDisplay';
import { fanCardsForPack } from '../services/packOdds';

export const OpenPacksPage: React.FC = () => {
  const [sets, setSets] = useState<OnePieceSetOddsConfig[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [isLoadingSets, setIsLoadingSets] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [odds, setOdds] = useState<OddsRow[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);

  const [sessionPacks, setSessionPacks] = useState<OpenedPack[]>([]);
  const [boxSession, setBoxSession] = useState<BoxSession | null>(null);
  const [bulkSession, setBulkSession] = useState<BulkOpenSession | null>(null);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [boxModalOpen, setBoxModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [pullsRefresh, setPullsRefresh] = useState(0);
  const [selectedPack, setSelectedPack] = useState<OpenedPack | null>(null);
  const [bulkCount, setBulkCount] = useState(5);
  const [lastBulkCount, setLastBulkCount] = useState(5);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const available = await onePiecePackService.getOpenableSets();
        if (!mounted) return;
        setSets(available);
        const saved = localStorage.getItem('op_sim_selected_set');
        const initial = available.some((s) => s.code === saved)
          ? saved!
          : (available.find((s) => s.code === 'OP-05')?.code ?? available[0]?.code ?? '');
        setSelectedCode(initial);
      } catch (error) {
        console.error('Failed to load One Piece sets:', error);
      } finally {
        if (mounted) setIsLoadingSets(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedSet = useMemo(
    () => sets.find((s) => s.code === selectedCode) ?? null,
    [sets, selectedCode]
  );

  useEffect(() => {
    if (!selectedCode) return;
    localStorage.setItem('op_sim_selected_set', selectedCode);
    setOddsLoading(true);
    onePiecePackService
      .getOdds(selectedCode)
      .then(({ rows }) => setOdds(rows))
      .catch(() => setOdds([]))
      .finally(() => setOddsLoading(false));
  }, [selectedCode]);

  const handleOpenPack = async () => {
    if (!selectedCode || isOpening) return;
    setIsOpening(true);
    try {
      const pack = await onePiecePackService.openSinglePack(selectedCode);
      setSelectedPack(pack);
      setSessionPacks((prev) => [pack, ...prev]);
      setPackModalOpen(true);
    } catch (error) {
      console.error('Failed to open pack:', error);
    } finally {
      setIsOpening(false);
    }
  };

  const handleOpenBox = async () => {
    if (!selectedCode || isOpening) return;
    setIsOpening(true);
    try {
      const session = await onePiecePackService.openBoosterBox(selectedCode);
      setBoxSession(session);
      setSessionPacks((prev) => [...session.packs, ...prev]);
      setBoxModalOpen(true);
    } catch (error) {
      console.error('Failed to open booster box:', error);
    } finally {
      setIsOpening(false);
    }
  };

  const handleBulkOpen = async (count: number) => {
    if (!selectedCode || isOpening) return;
    setIsOpening(true);
    setLastBulkCount(count);
    try {
      const session = await onePiecePackService.openBulkBoxes(selectedCode, count);
      setBulkSession(session);
      setSessionPacks((prev) => [...session.boxes.flatMap((b) => b.packs), ...prev]);
      setBulkModalOpen(true);
    } catch (error) {
      console.error('Failed to bulk-open boxes:', error);
    } finally {
      setIsOpening(false);
    }
  };

  const handleSave = useCallback((cards: PullCard[], code: string, setName: string): boolean => {
    if (cards.length === 0) return false;
    onePiecePackService.savePulls(cards, code, setName);
    setPullsRefresh((n) => n + 1);
    return true;
  }, []);

  const sessionCards = useMemo(
    () => sortPullsBestFirst(sessionPacks.flatMap((p) => fanCardsForPack(p))),
    [sessionPacks]
  );
  const sessionUnique = useMemo(() => {
    const counts = new Map<string, { card: PullCard; count: number }>();
    for (const card of sessionCards) {
      const entry = counts.get(card.id);
      if (entry) entry.count += 1;
      else counts.set(card.id, { card, count: 1 });
    }
    return [...counts.values()];
  }, [sessionCards]);
  // Only priced cards count toward the value; unpriced ones are reported, not zeroed.
  const sessionValue = useMemo(() => {
    let sum = 0;
    let unpriced = 0;
    for (const c of sessionCards) {
      if (c.marketPrice != null && Number.isFinite(c.marketPrice) && c.marketPrice > 0)
        sum += c.marketPrice;
      else unpriced += 1;
    }
    return { sum, unpriced };
  }, [sessionCards]);

  return (
    <PageShell>
      <PageHeader
        title="One Piece booster simulator"
        meta="Simulated"
        description="Pick a set and open a pack, box or case using community-estimated rates for that set. Save pulls to your collection."
      />

      <p className="text-[13px] text-ink-muted">
        Looking for play-money packs with value brackets?{' '}
        <Link to="/packs" className="text-accent hover:underline">
          Go to the pack shop
        </Link>
      </p>

      {/* Set selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="op-set-select" className="text-[13px] font-medium">
          Set
        </label>
        <div className="relative min-w-[15rem]">
          <select
            id="op-set-select"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            disabled={isLoadingSets || sets.length === 0}
            className="input h-10 w-full cursor-pointer appearance-none pr-10"
          >
            {sets.length === 0 && <option value="">Loading sets…</option>}
            {sets.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>
        {oddsLoading && <span className="text-xs text-ink-muted">Loading pull rates…</span>}
      </div>

      {/* What to open */}
      <section aria-labelledby="open-title" className="space-y-4 border-y border-rule py-5">
        <div>
          <h2 id="open-title" className="text-h2">
            {selectedSet ? `${selectedSet.code} · ${selectedSet.name}` : 'Pick a set to begin'}
          </h2>
          <p className="text-[13px] text-ink-muted">
            One pack holds 12 cards; a booster box is {selectedSet?.boxPacks ?? 24} packs. Every
            pull is simulated from the rates below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenPack}
            disabled={isOpening || !selectedSet}
            className="btn-primary"
          >
            <Package className="h-4 w-4" aria-hidden />
            Open a pack
          </button>
          <button
            type="button"
            onClick={handleOpenBox}
            disabled={isOpening || !selectedSet}
            className="btn-secondary"
          >
            <Box className="h-4 w-4" aria-hidden />
            Open a booster box
          </button>
          <button
            type="button"
            onClick={() => handleBulkOpen(BOXES_PER_CASE)}
            disabled={isOpening || !selectedSet}
            className="btn-secondary"
          >
            <Layers className="h-4 w-4" aria-hidden />
            Open a case ({BOXES_PER_CASE} boxes)
          </button>
          <span className="inline-flex items-center gap-1.5">
            <label htmlFor="bulk-box-count" className="sr-only">
              Boxes to open at once
            </label>
            <select
              id="bulk-box-count"
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value))}
              disabled={isOpening || !selectedSet}
              className="input h-10 w-auto"
            >
              {[1, 3, 5, 10, 12, 24].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'box' : 'boxes'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleBulkOpen(bulkCount)}
              disabled={isOpening || !selectedSet}
              className="btn-ghost"
            >
              <Zap className="h-4 w-4" aria-hidden />
              Open all at once
            </button>
          </span>
        </div>
        <p className="text-[12px] text-ink-muted">
          Cases and bulk opens skip the pack-by-pack reveal and go straight to the hits.
        </p>
      </section>

      {/* Odds disclosure */}
      <details className="group/odds border-b border-rule">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="text-[14px] font-medium">
            All pull rates
            {selectedSet && (
              <span className="ml-2 text-xs font-medium text-ink-muted">
                {selectedSet.code} — {selectedSet.name}
              </span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open/odds:rotate-180" />
        </summary>
        <div className="border-t border-border-subtle px-5 py-4">
          <div className="overflow-x-auto" role="table" aria-label="Pull rates">
            <div className="grid min-w-[36rem] grid-cols-[1fr_8rem_10rem_10rem] gap-2 px-2 pb-2 text-[12px] font-bold text-ink-muted">
              <span role="columnheader">Rarity</span>
              <span role="columnheader" className="text-right">
                Per pack
              </span>
              <span role="columnheader" className="text-right">
                Per box
              </span>
              <span role="columnheader" className="text-right">
                Per case (12 boxes)
              </span>
            </div>
            {odds.map((row) => (
              <div
                key={row.label}
                role="row"
                className="grid min-w-[36rem] grid-cols-[1fr_8rem_10rem_10rem] items-center gap-2 rounded-lg px-2 py-2 odd:bg-surface-hover/40"
              >
                <span role="cell" className="text-sm font-medium text-ink-primary">
                  {row.label}
                  {row.note && (
                    <span className="ml-2 text-[10px] font-normal text-ink-muted">
                      ({row.note})
                    </span>
                  )}
                </span>
                <span role="cell" className="text-right text-sm tabular-nums text-ink-secondary">
                  {row.perPack === null ? '—' : `${row.perPack.toFixed(2)}%`}
                </span>
                <span role="cell" className="text-right text-sm tabular-nums text-ink-secondary">
                  {row.perBox ?? '—'}
                </span>
                <span role="cell" className="text-right text-sm tabular-nums text-ink-secondary">
                  {row.perCase ?? '—'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-[72ch] text-[12.5px] leading-relaxed text-ink-muted">
            Simulated odds based on community pull-rate estimates compiled from large sample
            openings. Bandai publishes no official rates. Every roll uses exactly these
            probabilities; booster boxes are case-mapped so box-level averages hold. This fan-made
            simulator is not affiliated with or endorsed by Bandai, Shueisha or Toei Animation.
          </p>
        </div>
      </details>

      {/* Session pulls */}
      {sessionPacks.length > 0 && (
        <section aria-labelledby="session-pulls-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 id="session-pulls-title" className="text-h2">
                Your pulled cards
              </h3>
              <span className="rounded-md border border-border-subtle bg-surface-hover px-1.5 py-0.5 text-[11.5px] font-medium text-ink-muted">
                This session
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="tabular-nums text-ink-muted">{sessionCards.length} cards</span>
              <span className="tabular-nums text-ink-secondary">
                {formatCurrency(sessionValue.sum)} market
                {sessionValue.unpriced ? (
                  <span className="text-ink-muted"> · {sessionValue.unpriced} unpriced</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => {
                  const byCode = new Map<string, { cards: PullCard[]; setName: string }>();
                  sessionPacks.forEach((p) => {
                    const entry = byCode.get(p.code) ?? { cards: [], setName: p.setName };
                    entry.cards.push(...fanCardsForPack(p));
                    byCode.set(p.code, entry);
                  });
                  byCode.forEach(({ cards, setName }, code) => {
                    if (cards.length > 0) onePiecePackService.savePulls(cards, code, setName);
                  });
                  setPullsRefresh((n) => n + 1);
                }}
                className="btn-secondary h-9"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Save all session pulls
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {sessionUnique.slice(0, 48).map(({ card, count }) => (
              <PullCardView key={card.id} card={card} count={count} />
            ))}
          </div>
          {sessionUnique.length > 48 && (
            <p className="text-xs text-ink-muted">
              Showing the first 48 of {sessionUnique.length} unique session cards.
            </p>
          )}
        </section>
      )}

      {/* Saved collection */}
      <section aria-labelledby="collection-title" className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 id="collection-title" className="text-h2">
            Saved collection
          </h3>
          <span className="rounded-md border border-border-subtle bg-surface-hover px-1.5 py-0.5 text-[11.5px] font-medium text-ink-muted">
            This browser
          </span>
        </div>
        <PullsCollection refreshKey={pullsRefresh} />
      </section>

      <section
        aria-labelledby="about-sim"
        className="max-w-[72ch] space-y-2 text-[13px] text-ink-secondary"
      >
        <h2 id="about-sim" className="text-h3">
          About this simulator
        </h2>
        <p>
          Pick a supported set, open one virtual pack or a 24-pack booster box, reveal the cards,
          then save pulls to your collection. Booster boxes are case-mapped so box-level hits stay
          realistic.
        </p>
        <p>
          English packs are 7C + 3UC + 1R + 1 hit (EB: 10C). Chase treatments are split out of base
          SEC: Super Alt Art ≈ manga (about 1 in 5 cases), Red Super Alt Art ≈ 1 in 200 boxes. Base
          SEC stays about ⅔ per box.
        </p>
        <p className="text-ink-muted">
          Fan-made and unofficial. Rates are community estimates (OP.LOG and case openings), not
          real pull data. For fun and collecting practice only.
        </p>
      </section>

      <PackRevealModal
        pack={selectedPack}
        isOpen={packModalOpen}
        onClose={() => setPackModalOpen(false)}
        onSave={handleSave}
        onOpenAnother={() => {
          setPackModalOpen(false);
          handleOpenPack();
        }}
      />
      <BoxSessionModal
        session={boxSession}
        isOpen={boxModalOpen}
        onClose={() => setBoxModalOpen(false)}
        onSave={handleSave}
      />
      <BulkOpenModal
        session={bulkSession}
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSave={handleSave}
        onRipAgain={() => {
          setBulkModalOpen(false);
          void handleBulkOpen(lastBulkCount);
        }}
      />
    </PageShell>
  );
};
