import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, Copy, Link2, RotateCcw, Save } from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageShell';
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
import { evaluateTrade, VERDICT_COPY } from '../fairness';
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

  const verdictTone =
    evaluation.kind === 'fair'
      ? 'border-accent/40 bg-accent/10 text-accent'
      : evaluation.favors === 'you'
        ? 'border-gain/30 bg-gain-muted text-gain'
        : evaluation.favors === 'them'
          ? 'border-loss/30 bg-loss-muted text-loss'
          : 'border-border-subtle bg-surface-inset text-ink-secondary';

  return (
    <div className="section-stack">
      <PageHeader
        eyebrow="Collector tools"
        title="Fair trade"
        description={`Line up what you give and what you get. ${gameLabel} market quotes decide whether the offer is even — cash optional.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => persist(clearDraft(game))}
            >
              <RotateCcw className="h-4 w-4" />
              New
            </button>
            <button
              type="button"
              className="btn-secondary"
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
              <ArrowLeftRight className="h-4 w-4" />
              Swap
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void copyShareLink()}
              disabled={saving}
            >
              <Copy className="h-4 w-4" />
              Copy link
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        }
      />

      <input
        type="text"
        value={draft.title}
        onChange={(e) => persist({ ...draft, title: e.target.value })}
        placeholder="Optional title — e.g. Charizard for two chase hits"
        className="input max-w-xl"
        aria-label="Trade title"
      />

      {shareNotice && (
        <p className="rounded-xl border border-border-subtle bg-surface-inset px-3 py-2 text-sm text-ink-secondary">
          {shareNotice}
        </p>
      )}

      <div className={`rounded-2xl border px-4 py-4 sm:px-5 ${verdictTone}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] opacity-80">Verdict</p>
            <p className="mt-1 font-display text-2xl font-semibold">{copy.title}</p>
            <p className="mt-1 max-w-xl text-sm opacity-80">{copy.hint}</p>
          </div>
          {evaluation.kind !== 'empty' && evaluation.kind !== 'incomplete' && (
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatCurrency(evaluation.delta, { signed: true })}
              </p>
              <p className="text-xs opacity-80">
                {formatPercent(evaluation.imbalancePct, { signed: true })} vs larger side
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TradeSideColumn
          title="You give"
          hint="Cards and cash leaving your side"
          lines={draft.give}
          cash={draft.cashGive}
          total={evaluation.give.value}
          missing={evaluation.give.missing}
          vaultCount={vaultCount}
          onAdd={() => setPickerSide('give')}
          onAddFromVault={() => setVaultSide('give')}
          onCash={(cashGive) => persist({ ...draft, cashGive })}
          onQty={(id, quantity) => persist(applyLine(draft, 'give', id, { quantity }))}
          onOverride={(id, priceOverride) =>
            persist(applyLine(draft, 'give', id, { priceOverride }))
          }
          onRemove={(id) =>
            persist({ ...draft, give: draft.give.filter((line) => line.id !== id) })
          }
        />
        <TradeSideColumn
          title="You get"
          hint="Cards and cash coming in"
          lines={draft.get}
          cash={draft.cashGet}
          total={evaluation.get.value}
          missing={evaluation.get.missing}
          vaultCount={vaultCount}
          onAdd={() => setPickerSide('get')}
          onAddFromVault={() => setVaultSide('get')}
          onCash={(cashGet) => persist({ ...draft, cashGet })}
          onQty={(id, quantity) => persist(applyLine(draft, 'get', id, { quantity }))}
          onOverride={(id, priceOverride) =>
            persist(applyLine(draft, 'get', id, { priceOverride }))
          }
          onRemove={(id) => persist({ ...draft, get: draft.get.filter((line) => line.id !== id) })}
        />
      </div>

      {isAuthenticated && saved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-primary">Saved trades</h2>
          <ul className="divide-y divide-border-subtle rounded-2xl border border-border-subtle">
            {saved
              .filter((row) => row.game === game)
              .map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-primary">
                      {row.title || 'Untitled trade'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Give {formatCurrency(row.giveTotal)} · Get {formatCurrency(row.getTotal)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
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
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
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
                    <Link2 className="h-3.5 w-3.5" />
                    Link
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-ink-muted hover:text-loss"
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
                    ×
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

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
    </div>
  );
}
