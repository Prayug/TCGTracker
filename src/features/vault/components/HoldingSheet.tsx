import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CardCondition, VaultCard } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { closeLot, fetchLots, type PortfolioLot } from '../../../services/portfolioApiService';
import { useAuth } from '../../../hooks/useAuth';
import { Modal } from '../../../components/common/Modal';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { CardArt } from '../../../components/exchange/CardArt';
import { Basis, Delta, Price } from '../../../components/exchange/Price';
import { cardPath } from '../../../contexts/CardModalContext';
import { formatCurrency } from '../../../utils/cardDisplay';
import {
  hasKnownCost,
  holdingMarketValue,
  knownHoldingProfit,
  marketUnitPrice,
} from '../../../utils/vaultCost';
import { CONDITION_LABEL, costUpdate, parseCostInput } from '../ledger';
import { cn } from '@/lib/utils';

type Mode = 'edit' | 'sell';

/**
 * Holding detail. The card's identity (what it is, what it is worth) is
 * kept apart from the holding (what you paid, how many, what state), and
 * the research page is one link away rather than duplicated here.
 */
export function HoldingSheet({
  holding,
  onClose,
  onSold,
  game,
}: {
  game: 'pokemon' | 'onepiece';
  holding: VaultCard | null;
  onClose: () => void;
  onSold?: (realizedPnl: number | null) => void;
}) {
  const { isAuthenticated } = useAuth();
  const id = useId();
  const [mode, setMode] = useState<Mode>('edit');
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [condition, setCondition] = useState<CardCondition>('raw');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sell state
  const [lot, setLot] = useState<PortfolioLot | null>(null);
  const [lotState, setLotState] = useState<'idle' | 'loading' | 'missing' | 'error'>('idle');
  const [salePrice, setSalePrice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!holding) return;
    setMode('edit');
    setQty(String(holding.quantity));
    setCost(hasKnownCost(holding) ? holding.purchasePrice.toFixed(2) : '');
    setCondition(holding.condition);
    setDate(holding.purchaseDate ? holding.purchaseDate.slice(0, 10) : '');
    setNotes(holding.notes ?? '');
    setError(null);
    setLot(null);
    setLotState('idle');
  }, [holding]);

  if (!holding) return null;

  const card = holding.card;
  const unit = marketUnitPrice(card);
  const value = holdingMarketValue(holding);
  const pl = knownHoldingProfit(holding);
  const known = hasKnownCost(holding);

  const save = () => {
    const q = Number.parseInt(qty, 10);
    if (!Number.isFinite(q) || q < 1) return setError('Quantity must be at least 1.');
    const parsed = parseCostInput(cost);
    if (parsed === undefined) return setError('Enter a cost of $0 or more, or leave it blank.');
    const when = date ? new Date(`${date}T12:00:00`) : null;
    vaultService.updateVaultCard(
      holding.id,
      {
        quantity: q,
        condition,
        notes: notes.trim() || undefined,
        ...costUpdate(parsed),
        ...(when && !Number.isNaN(when.getTime()) ? { purchaseDate: when.toISOString() } : {}),
      },
      game
    );
    onClose();
  };

  const startSell = async () => {
    setMode('sell');
    setError(null);
    setSalePrice(unit > 0 ? unit.toFixed(2) : '');
    setLotState('loading');
    try {
      const lots = await fetchLots(true);
      const matches = lots.filter((l) => l.card_id === card.id);
      const match =
        matches.find((l) => (l.condition || 'raw') === (holding.condition || 'raw')) ??
        matches[0] ??
        null;
      setLot(match);
      setLotState(match ? 'idle' : 'missing');
    } catch {
      setLotState('error');
    }
  };

  /**
   * closeLot marks the server lot sold but does not rewrite the collection,
   * so the local entry is reduced or removed to stop the next sync from
   * re-creating an open lot for the sold copies.
   */
  const confirmSell = async () => {
    if (!lot) return;
    const price = parseCostInput(salePrice);
    if (price == null) return setError('Enter the sale price per card.');
    setBusy(true);
    setError(null);
    try {
      const closed = await closeLot(lot.id, price);
      if (holding.quantity <= lot.quantity) vaultService.removeFromVault(holding.id, game);
      else
        vaultService.updateVaultCard(
          holding.id,
          { quantity: holding.quantity - lot.quantity },
          game
        );
      onSold?.(closed.realized_pnl ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The sale could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  const salePnl =
    lot && parseCostInput(salePrice) != null
      ? ((parseCostInput(salePrice) as number) - lot.cost_basis) * lot.quantity
      : null;

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        size="large"
        ariaLabel={`${card.name} holding`}
        footer={
          mode === 'edit' ? (
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <button type="button" className="btn-primary" onClick={save}>
                Save holding
              </button>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <span className="ml-auto flex gap-1">
                {isAuthenticated ? (
                  <button type="button" className="btn-secondary" onClick={() => void startSell()}>
                    Record a sale
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost text-loss"
                  onClick={() => setConfirmDelete(true)}
                >
                  Remove
                </button>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !lot}
                onClick={() => void confirmSell()}
              >
                {busy ? 'Recording…' : 'Confirm sale'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setMode('edit')}>
                Back
              </button>
            </div>
          )
        }
      >
        <div className="grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
          {/* Identity */}
          <div className="flex gap-4 sm:block">
            <div className="w-24 shrink-0 sm:w-full">
              <CardArt card={card} />
            </div>
            <div className="min-w-0 sm:mt-3">
              <h2 className="font-display text-[22px] leading-tight">{card.name}</h2>
              <p className="text-meta text-ink-muted">
                {card.set?.name}
                {card.number ? ` · No. ${card.number}` : ''}
              </p>
              <Link
                to={cardPath(card.id)}
                state={{ card }}
                onClick={onClose}
                className="mt-2 inline-block text-[13px] text-accent hover:underline"
              >
                Open card research →
              </Link>
            </div>
          </div>

          {/* Holding */}
          <div className="min-w-0">
            <dl className="grid grid-cols-3 gap-x-4 border-b border-rule pb-3">
              <div>
                <dt className="text-meta text-ink-muted">Market / card</dt>
                <dd>
                  <Price value={unit} size="md" />
                </dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">Holding value</dt>
                <dd>
                  <Price value={value} size="md" />
                </dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">Unrealized</dt>
                <dd>
                  {pl ? (
                    <Delta pct={pl.profitPct} amount={pl.profit} />
                  ) : (
                    <span className="text-[13px] text-ink-muted">
                      {known ? 'No market price' : 'Cost not recorded'}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <Basis
              kind="Market estimate"
              source="TCGplayer"
              detail="Near Mint, raw"
              className="mt-1.5"
            />

            {mode === 'edit' ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block" htmlFor={`${id}-cost`}>
                  <span className="mb-1 block text-[13px] font-medium">Paid per card</span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-muted">
                      $
                    </span>
                    <input
                      id={`${id}-cost`}
                      inputMode="decimal"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="Unknown"
                      className="input h-10 pl-7 font-mono tabular-nums"
                      aria-describedby={`${id}-cost-help`}
                    />
                  </span>
                  <span id={`${id}-cost-help`} className="mt-1 block text-[12px] text-ink-muted">
                    Leave blank if you don’t know it. Enter 0 for a gift or pack pull.
                  </span>
                </label>
                <label className="block" htmlFor={`${id}-qty`}>
                  <span className="mb-1 block text-[13px] font-medium">Copies</span>
                  <input
                    id={`${id}-qty`}
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="input h-10 font-mono tabular-nums"
                  />
                </label>
                <label className="block" htmlFor={`${id}-cond`}>
                  <span className="mb-1 block text-[13px] font-medium">Condition</span>
                  <select
                    id={`${id}-cond`}
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as CardCondition)}
                    className="input h-10"
                  >
                    {(Object.keys(CONDITION_LABEL) as CardCondition[]).map((c) => (
                      <option key={c} value={c}>
                        {CONDITION_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block" htmlFor={`${id}-date`}>
                  <span className="mb-1 block text-[13px] font-medium">Acquired</span>
                  <input
                    id={`${id}-date`}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input h-10"
                  />
                </label>
                <label className="block sm:col-span-2" htmlFor={`${id}-notes`}>
                  <span className="mb-1 block text-[13px] font-medium">Notes</span>
                  <textarea
                    id={`${id}-notes`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="input min-h-[4rem] py-2"
                    placeholder="Where it came from, centering, anything worth remembering"
                  />
                </label>
                {holding.gradingResult ? (
                  <p className="text-[12.5px] text-ink-secondary sm:col-span-2">
                    Photo grade estimate:{' '}
                    <span className="font-mono">{holding.gradingResult.grade}</span> (not a graded
                    slab)
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <h3 className="text-h3">Record a sale</h3>
                {lotState === 'loading' ? (
                  <p className="text-meta text-ink-muted">Looking up the open lot…</p>
                ) : lotState === 'missing' ? (
                  <p className="text-[13px] text-warn">
                    No open lot was found on the server for this card. Sync your collection, then
                    try again.
                  </p>
                ) : lotState === 'error' ? (
                  <p className="text-[13px] text-loss">The server did not return your lots.</p>
                ) : lot ? (
                  <p className="text-[13px] text-ink-secondary">
                    Closes the open lot of <span className="font-mono">{lot.quantity}</span> at a
                    cost of <span className="font-mono">{formatCurrency(lot.cost_basis)}</span> per
                    card.
                  </p>
                ) : null}
                <label className="block max-w-xs" htmlFor={`${id}-sale`}>
                  <span className="mb-1 block text-[13px] font-medium">Sale price per card</span>
                  <input
                    id={`${id}-sale`}
                    inputMode="decimal"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="input h-10 font-mono tabular-nums"
                  />
                </label>
                {salePnl != null ? (
                  <p
                    className={cn(
                      'font-mono text-[13.5px] tabular-nums',
                      salePnl >= 0 ? 'text-gain' : 'text-loss'
                    )}
                  >
                    Realized {formatCurrency(salePnl, { signed: true })}
                  </p>
                ) : null}
              </div>
            )}
            {error ? (
              <p className="mt-3 text-[13px] text-loss" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={confirmDelete}
        onConfirm={() => {
          vaultService.removeFromVault(holding.id, game);
          setConfirmDelete(false);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
        title={`Remove ${card.name}?`}
        message="This removes the holding and its cost record from your collection."
        confirmLabel="Remove"
        variant="destructive"
      />
    </>
  );
}
