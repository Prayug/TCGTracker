import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Box,
  ChevronDown,
  History,
  Layers,
  Package,
  Sparkles,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { OddsRow, OpenedPack, PullCard, BoxSession, BulkOpenSession } from '../types';
import {
  onePiecePackService,
  sortPullsBestFirst,
} from '../services/onePiecePackService';
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
          : available.find((s) => s.code === 'OP-05')?.code ?? available[0]?.code ?? '';
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
      setSessionPacks((prev) => [
        ...session.boxes.flatMap((b) => b.packs),
        ...prev,
      ]);
      setBulkModalOpen(true);
    } catch (error) {
      console.error('Failed to bulk-open boxes:', error);
    } finally {
      setIsOpening(false);
    }
  };

  const handleSave = useCallback(
    (cards: PullCard[], code: string, setName: string): boolean => {
      if (cards.length === 0) return false;
      onePiecePackService.savePulls(cards, code, setName);
      setPullsRefresh((n) => n + 1);
      return true;
    },
    []
  );

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
  const sessionValue = useMemo(
    () => sessionCards.reduce((sum, c) => sum + (c.marketPrice ?? 0), 0),
    [sessionCards]
  );

  return (
    <div className="section-stack">
      {/* Hero */}
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
          One Piece only
        </p>
        <h2 className="font-display text-h1 text-ink-primary">One Piece pack simulator</h2>
        <p className="max-w-2xl text-sm text-ink-secondary">
          Open virtual One Piece TCG booster packs online. Pick a set, reveal 12
          cards, chase manga rares and alternate arts — or rip a full booster box.
          Save pulls to your collection, all in your browser.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-default bg-surface-raised px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-primary">Want the tiered shop instead?</p>
          <p className="text-xs text-ink-secondary">
            Play-money tiers and EV-style packs live at <span className="font-mono text-accent">/packs</span>.
          </p>
        </div>
        <Link
          to="/packs"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
        >
          Open pack shop
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Set selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="op-set-select" className="text-sm font-semibold text-ink-secondary">
          Set
        </label>
        <div className="relative min-w-[15rem]">
          <select
            id="op-set-select"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            disabled={isLoadingSets || sets.length === 0}
            className="w-full cursor-pointer appearance-none rounded-xl border border-border-strong bg-surface-inset px-4 py-2.5 pr-10 text-sm font-semibold text-ink-primary outline-none transition-colors hover:border-border-default focus:border-accent"
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

      {/* Opening hero card */}
      <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-inset shadow-card">
        <div className="holo-texture absolute inset-0 opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-foil">
              Currently opening
            </p>
            <h3 className="font-display text-2xl font-bold text-ink-primary sm:text-3xl">
              {selectedSet ? (
                <>
                  {selectedSet.code} <span className="text-ink-secondary">· {selectedSet.name}</span>
                </>
              ) : (
                'Pick a set to begin'
              )}
            </h3>
            <p className="text-sm text-ink-secondary">
              Pick your experience — just a taste, or the full adventure. One
              pack contains 12 cards; a booster box is {selectedSet?.boxPacks ?? 24} packs.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:shrink-0">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleOpenPack}
                disabled={isOpening || !selectedSet}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-glow-accent transition-all hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Package className="h-4 w-4" />
                Open a pack
              </button>
              <button
                type="button"
                onClick={handleOpenBox}
                disabled={isOpening || !selectedSet}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-foil/40 bg-surface-overlay px-6 py-3.5 text-sm font-bold text-ink-primary transition-all hover:border-foil hover:bg-surface-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Box className="h-4 w-4 text-foil" />
                Open a booster box
              </button>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-overlay/80 p-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => handleBulkOpen(BOXES_PER_CASE)}
                disabled={isOpening || !selectedSet}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold text-ink-primary transition-all hover:border-accent hover:bg-accent/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Layers className="h-4 w-4 text-accent" />
                Open a case ({BOXES_PER_CASE} boxes)
              </button>
              <div className="flex flex-1 items-center gap-2">
                <label htmlFor="bulk-box-count" className="sr-only">
                  Boxes to spam-open
                </label>
                <select
                  id="bulk-box-count"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Number(e.target.value))}
                  disabled={isOpening || !selectedSet}
                  className="cursor-pointer appearance-none rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm font-semibold text-ink-primary outline-none focus:border-accent disabled:opacity-50"
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
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-hover px-4 py-2.5 text-sm font-bold text-ink-primary transition-all hover:border-border-strong hover:bg-surface-raised active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap className="h-4 w-4 text-foil" />
                  Spam open
                </button>
              </div>
            </div>
            <p className="text-[11px] text-ink-muted">
              Case / spam skips pack flips and dumps chase hits + live market value.
            </p>
          </div>
        </div>
      </div>

      {/* Odds disclosure */}
      <details className="group/odds rounded-2xl border border-border-subtle bg-surface-inset">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-bold text-ink-primary">
            Pull rates (full disclosure)
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
            <div className="grid min-w-[36rem] grid-cols-[1fr_8rem_10rem_10rem] gap-2 px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <span role="columnheader">Rarity</span>
              <span role="columnheader" className="text-right">Per pack</span>
              <span role="columnheader" className="text-right">Per box</span>
              <span role="columnheader" className="text-right">Per case (12 boxes)</span>
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
                    <span className="ml-2 text-[10px] font-normal text-ink-muted">({row.note})</span>
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
          <p className="mt-4 rounded-xl border border-border-subtle bg-surface-hover/60 p-3 text-xs leading-relaxed text-ink-muted">
            Simulated odds based on community pull-rate estimates compiled from
            large sample openings — Bandai publishes no official rates. Every
            roll uses exactly these probabilities; booster boxes are case-mapped
            so box-level averages hold. This fan-made simulator is not
            affiliated with or endorsed by Bandai, Shueisha or Toei Animation.
          </p>
        </div>
      </details>

      {/* Session pulls */}
      {sessionPacks.length > 0 && (
        <section aria-labelledby="session-pulls-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-sky-400" />
              <h3 id="session-pulls-title" className="text-lg font-semibold text-ink-primary">
                Your pulled cards
              </h3>
              <span className="rounded-md border border-border-subtle bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                This session
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="tabular-nums text-ink-muted">
                {sessionCards.length} cards
              </span>
              <span className="tabular-nums text-ink-secondary">
                {formatCurrency(sessionValue)}
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
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-surface-hover px-3 py-1.5 text-xs font-bold text-ink-primary transition-colors hover:border-border-strong hover:bg-surface-overlay"
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
          <Sparkles className="h-5 w-5 text-foil" />
          <h3 id="collection-title" className="text-lg font-semibold text-ink-primary">
            Saved collection
          </h3>
          <span className="rounded-md border border-border-subtle bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            This browser
          </span>
        </div>
        <PullsCollection refreshKey={pullsRefresh} />
      </section>

      {/* Info */}
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: 'How it works',
            body: 'Pick a supported set, open one virtual pack or a 24-pack booster box, reveal the cards, then save pulls to your collection. Booster boxes are case-mapped so box-level hits stay realistic.',
          },
          {
            title: 'Rarities & chase cards',
            body: 'English packs are 7C + 3UC + 1R + 1 hit (EB: 10C). Chase treatments are split out of base SEC — Super Alt Art ≈ manga (~1/5 cases), Red Super Alt Art ≈ 1/200 boxes. Base SEC stays ~⅔ per box.',
          },
          {
            title: 'Not official',
            body: 'This fan-made simulator uses simulated pull logic and community-estimated English rates (OP.LOG / case openings). Results are not real-world pull data and are for entertainment and collecting practice only.',
          },
        ].map((item) => (
          <article key={item.title} className="card min-w-0 p-5">
            <h4 className="mb-2 text-sm font-bold text-ink-primary">{item.title}</h4>
            <p className="text-sm leading-relaxed text-ink-secondary">{item.body}</p>
          </article>
        ))}
      </div>

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
    </div>
  );
};
