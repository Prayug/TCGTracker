import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, Copy, Link2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { PageHeader, PageShell } from '../../../components/layout/PageShell';
import { CardSearchPickerModal } from '../../grading/components/CardSearchPickerModal';
import { useGame } from '../../../contexts/GameContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../components/common/Toast';
import { vaultService } from '../../../services/vaultService';
import {
  deleteSavedTrade,
  getPublicTrade,
  listSavedTrades,
  saveTrade,
  type SavedTrade,
} from '../../../services/tradesApi';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import type { PokemonCard } from '../../../types/pokemon';
import { cardToLine, lineUnitValue } from '../cardToLine';
import { evaluateTrade, evenOut, FAIR_PCT, unpricedCount, VERDICT_COPY } from '../fairness';
import {
  SHARE_HASH_PREFIX,
  decodeSharePayload,
  draftToSharePayload,
  encodeSharePayload,
  sharePayloadToDraft,
} from '../shareCodec';
import { clearDraft, loadDraft, saveDraft } from '../tradeStorage';
import type { TradeCardLine, TradeDraft, TradeSideKey } from '../types';
import { TradeSideColumn } from './TradeSideColumn';
import { VaultPickerModal } from './VaultPickerModal';
import { TradeStage } from './TradeStage';

function applyLine(
  draft: TradeDraft,
  side: TradeSideKey,
  id: string,
  patch: Partial<TradeCardLine>
): TradeDraft {
  return {
    ...draft,
    [side]: draft[side].map((line) => (line.id === id ? { ...line, ...patch } : line)),
  };
}

export function TradePage() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const { game, isPokemon, setGame } = useGame();
  const { isAuthenticated, openAuthModal } = useAuth();
  const { showToast } = useToast();

  const [draft, setDraft] = useState<TradeDraft>(() => loadDraft(game));
  const [pickerSide, setPickerSide] = useState<TradeSideKey | null>(null);
  const [vaultSide, setVaultSide] = useState<TradeSideKey | null>(null);
  const [saved, setSaved] = useState<SavedTrade[]>([]);
  const [saving, setSaving] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const persist = useCallback((next: TradeDraft) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDraft(stamped);
    saveDraft(stamped);
  }, []);

  useEffect(() => {
    setDraft(loadDraft(game));
  }, [game]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash.startsWith(SHARE_HASH_PREFIX)) {
      const payload = decodeSharePayload(hash.slice(SHARE_HASH_PREFIX.length));
      if (payload) {
        const next = sharePayloadToDraft(payload);
        if (next.game !== game) setGame(next.game);
        persist(next);
        setShareNotice('Loaded a shared trade. Prices are the snapshot from when it was copied.');
        navigate('/trade', { replace: true });
      }
      return;
    }

    if (!shareToken) return;
    let cancelled = false;
    getPublicTrade(shareToken)
      .then((record) => {
        if (cancelled) return;
        const next = sharePayloadToDraft(record.payload);
        next.remoteId = record.id;
        next.shareToken = record.shareToken;
        next.title = record.title;
        if (next.game !== game) setGame(next.game);
        persist(next);
        setShareNotice('Loaded a saved trade link.');
        navigate('/trade', { replace: true });
      })
      .catch(() => {
        if (!cancelled) showToast('That share link is invalid or expired', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken, game, persist, setGame, navigate, showToast]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSaved([]);
      return;
    }
    listSavedTrades()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, [isAuthenticated]);

  const evaluation = useMemo(
    () =>
      evaluateTrade({
        give: draft.give.map((line) => ({
          quantity: line.quantity,
          unitPrice: lineUnitValue(line),
        })),
        get: draft.get.map((line) => ({ quantity: line.quantity, unitPrice: lineUnitValue(line) })),
        cashGive: draft.cashGive,
        cashGet: draft.cashGet,
      }),
    [draft]
  );

  const vaultCount = vaultService.getVaultCards(game).length;
  const copy = VERDICT_COPY[evaluation.kind];
  const gameLabel = isPokemon ? 'Pokémon' : 'One Piece';

  const addCard = (side: TradeSideKey, card: PokemonCard) => {
    const existing = draft[side].find(
      (line) =>
        line.cardId === card.id && (line.uniqueIdentifier || '') === (card.uniqueIdentifier || '')
    );
    if (existing) {
      persist(
        applyLine(draft, side, existing.id, { quantity: Math.min(99, existing.quantity + 1) })
      );
    } else {
      persist({ ...draft, [side]: [...draft[side], cardToLine(card, game)] });
    }
    setPickerSide(null);
    setVaultSide(null);
  };

  const copyShareLink = async () => {
    const payload = draftToSharePayload({ ...draft, title: draft.title });
    const encoded = encodeSharePayload(payload);
    let url = `${window.location.origin}/trade#${SHARE_HASH_PREFIX}${encoded}`;

    if (isAuthenticated) {
      try {
        setSaving(true);
        const record = await saveTrade({
          id: draft.remoteId,
          title: draft.title,
          game: draft.game,
          payload,
          giveTotal: evaluation.give.value,
          getTotal: evaluation.get.value,
        });
        persist({ ...draft, remoteId: record.id, shareToken: record.shareToken });
        url = `${window.location.origin}/trade/${record.shareToken}`;
        setSaved((prev) => {
          const rest = prev.filter((row) => row.id !== record.id);
          return [record, ...rest];
        });
      } catch {
        showToast('Saved a local link instead — sign-in save failed', 'info');
      } finally {
        setSaving(false);
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Trade link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }
    setSaving(true);
    try {
      const record = await saveTrade({
        id: draft.remoteId,
        title: draft.title || `${gameLabel} trade`,
        game: draft.game,
        payload: draftToSharePayload(draft),
        giveTotal: evaluation.give.value,
        getTotal: evaluation.get.value,
      });
      persist({
        ...draft,
        remoteId: record.id,
        shareToken: record.shareToken,
        title: record.title,
      });
      setSaved((prev) => [record, ...prev.filter((row) => row.id !== record.id)]);
      showToast('Trade saved', 'success');
    } catch {
      showToast('Could not save trade', 'error');
    } finally {
      setSaving(false);
    }
  };

  const even = evenOut(evaluation);
  const unpriced = unpricedCount(evaluation);

  const sideProps = (side: TradeSideKey) => ({
    lines: draft[side],
    cash: side === 'give' ? draft.cashGive : draft.cashGet,
    total: evaluation[side].value,
    missing: evaluation[side].missing,
    vaultCount,
    onAdd: () => setPickerSide(side),
    onCash: (v: number) => persist({ ...draft, [side === 'give' ? 'cashGive' : 'cashGet']: v }),
    onQty: (id: string, quantity: number) => persist(applyLine(draft, side, id, { quantity })),
    onOverride: (id: string, priceOverride: number | null) =>
      persist(applyLine(draft, side, id, { priceOverride })),
    onRemove: (id: string) =>
      persist({ ...draft, [side]: draft[side].filter((line) => line.id !== id) }),
  });

  return (
    <PageShell>
      <PageHeader
        title="Trade"
        meta={`${gameLabel} · prices in USD`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => persist(clearDraft(game))}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Start over
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                persist({
                  ...draft,
                  give: draft.get,
                  get: draft.give,
                  cashGive: draft.cashGet,
                  cashGet: draft.cashGive,
                })
              }
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
              Swap sides
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void copyShareLink()}
              disabled={saving}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy link
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <Save className="h-4 w-4" aria-hidden />
              Save
            </button>
          </div>
        }
      />

      {shareNotice ? (
        <p
          className="border-l-2 border-border-strong pl-3 text-[13px] text-ink-secondary"
          role="status"
        >
          {shareNotice}
        </p>
      ) : null}

      <label className="block max-w-md" htmlFor="trade-title">
        <span className="mb-1 block text-[13px] font-medium">Trade name</span>
        <input
          id="trade-title"
          type="text"
          value={draft.title}
          onChange={(e) => persist({ ...draft, title: e.target.value })}
          placeholder="Optional, e.g. Charizard for two chase cards"
          className="input h-10"
        />
      </label>

      {/* The balance: both piles, the beam between them, and how to settle it. */}
      <div>
        <TradeStage
          give={draft.give}
          get={draft.get}
          giveValue={evaluation.give.value}
          getValue={evaluation.get.value}
          cashGive={draft.cashGive}
          cashGet={draft.cashGet}
          verdict={copy.title}
          verdictTone={
            evaluation.favors === 'you' ? 'gain' : evaluation.favors === 'them' ? 'loss' : 'neutral'
          }
          fair={evaluation.kind === 'fair'}
          detail={
            evaluation.kind !== 'empty' && evaluation.kind !== 'incomplete'
              ? evaluation.delta === 0
                ? 'Dead even'
                : `${evaluation.delta > 0 ? 'You get' : 'You give'} ${formatCurrency(Math.abs(evaluation.delta))} more · ${formatPercent(Math.abs(evaluation.imbalancePct))} of the larger side`
              : copy.hint
          }
          onAdd={(side) => setPickerSide(side)}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-muted">
          <p>
            {unpriced > 0
              ? `${unpriced} card${unpriced === 1 ? ' has' : 's have'} no price and ${unpriced === 1 ? 'is' : 'are'} left out, so this balance is incomplete. `
              : ''}
            Values are market prices from when each card was added, or the price you typed. Fair
            means within {FAIR_PCT}%.
          </p>
          {/* Only suggest settling up when every card is priced. */}
          {even && unpriced === 0 && evaluation.kind !== 'fair' ? (
            <button
              type="button"
              className="btn-secondary h-8 text-[13px]"
              onClick={() =>
                persist(
                  even.payer === 'them'
                    ? { ...draft, cashGet: Math.round((draft.cashGet + even.amount) * 100) / 100 }
                    : { ...draft, cashGive: Math.round((draft.cashGive + even.amount) * 100) / 100 }
                )
              }
            >
              {even.payer === 'them' ? 'They add' : 'You add'} {formatCurrency(even.amount)} cash
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <TradeSideColumn
          id="give"
          title="You give"
          {...sideProps('give')}
          onAddFromVault={() => setVaultSide('give')}
        />
        <TradeSideColumn id="get" title="You get" {...sideProps('get')} />
      </div>

      {isAuthenticated && saved.some((row) => row.game === game) ? (
        <section aria-labelledby="saved-trades" className="space-y-2">
          <h2 id="saved-trades" className="text-h2">
            Saved trades
          </h2>
          <table className="ledger ledger-tight">
            <thead>
              <tr>
                <th scope="col">Trade</th>
                <th scope="col" className="num hidden sm:table-cell">
                  You give
                </th>
                <th scope="col" className="num hidden sm:table-cell">
                  You get
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {saved
                .filter((row) => row.game === game)
                .map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="text-left font-normal">
                      <button
                        type="button"
                        className="max-w-[50vw] truncate text-left font-medium hover:underline sm:max-w-none"
                        onClick={() => {
                          const next = sharePayloadToDraft(row.payload);
                          persist({
                            ...next,
                            remoteId: row.id,
                            shareToken: row.shareToken,
                            title: row.title,
                          });
                          showToast('Loaded saved trade', 'info');
                        }}
                      >
                        {row.title || 'Untitled trade'}
                      </button>
                      <span className="block font-mono text-[12px] text-ink-muted sm:hidden">
                        {formatCurrency(row.giveTotal)} for {formatCurrency(row.getTotal)}
                      </span>
                    </th>
                    <td className="num hidden sm:table-cell">{formatCurrency(row.giveTotal)}</td>
                    <td className="num hidden sm:table-cell">{formatCurrency(row.getTotal)}</td>
                    <td className="w-px whitespace-nowrap text-right">
                      <button
                        type="button"
                        className="btn-ghost h-8 text-[13px]"
                        onClick={async () => {
                          const url = `${window.location.origin}/trade/${row.shareToken}`;
                          try {
                            await navigator.clipboard.writeText(url);
                            showToast('Link copied', 'success');
                          } catch {
                            showToast('Could not copy', 'error');
                          }
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" aria-hidden />
                        Link
                      </button>
                      <button
                        type="button"
                        className="ml-1 inline-grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-loss-muted hover:text-loss"
                        aria-label={`Delete ${row.title || 'trade'}`}
                        onClick={async () => {
                          try {
                            await deleteSavedTrade(row.id);
                            setSaved((prev) => prev.filter((item) => item.id !== row.id));
                          } catch {
                            showToast('Could not delete', 'error');
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <CardSearchPickerModal
        isOpen={pickerSide != null}
        onClose={() => setPickerSide(null)}
        onSelect={(card) => pickerSide && addCard(pickerSide, card)}
        title={pickerSide === 'get' ? 'Add a card you get' : 'Add a card you give'}
        description="Search the live catalog. Market price is used unless you override it."
        emptyHint="Type a card name and search the catalog."
      />
      <VaultPickerModal
        isOpen={vaultSide != null}
        game={game}
        onClose={() => setVaultSide(null)}
        onSelect={(card) => vaultSide && addCard(vaultSide, card)}
      />
    </PageShell>
  );
}
