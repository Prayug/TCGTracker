import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Droplets,
  GitCompareArrows,
  Layers,
  Loader2,
  Plus,
  Scale,
  Trash2,
  Waves,
} from 'lucide-react';
import {
  CrackRegradeRow,
  fetchCrackRegrade,
  fetchGradeLadder,
  fetchPopRegime,
  fetchSetSlabHeatmap,
  fetchSlabMarks,
  fetchSubmitVsBuy,
  GradeLadderRow,
  PopShockRow,
  SetSlabHeatmapRow,
  SlabMark,
  SubmitVsBuyRow,
} from '../../../services/gradedPricesApi';
import { slabBookService, SlabGrader, SlabLot } from '../../../services/slabBookService';
import { formatCurrency } from '../../../utils/cardDisplay';
import { FilterChip } from '../../../components/layout/PageShell';
import { useCardModal } from '../../../contexts/CardModalContext';
import type { PokemonCard } from '../../../types/pokemon';
import { SlabEmpty, SlabPanelHeader, SlabRow, StatusChip } from './SlabRow';

function openStubCard(
  open: (card: PokemonCard) => void,
  row: {
    cardId: string;
    cardName: string | null;
    setId?: string | null;
    setName?: string | null;
    rawPrice?: number | null;
  }
) {
  open({
    id: row.cardId,
    name: row.cardName || row.cardId,
    images: { small: '', large: '' },
    set: {
      id: row.setId || '',
      name: row.setName || 'Unknown set',
      releaseDate: '',
      total: 0,
    },
    number: '',
    marketPrice: row.rawPrice ?? 0,
  });
}

export const SubmitVsBuyPanel: React.FC = () => {
  const { openCard } = useCardModal();
  const [rows, setRows] = useState<SubmitVsBuyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'submit' | 'buy'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchSubmitVsBuy({ limit: 12 }).then((data) => {
      if (!cancelled) {
        setRows(data?.rows ?? []);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = rows.filter((r) =>
    filter === 'all' ? true : r.recommendation === filter
  );

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<GitCompareArrows className="h-4 w-4 text-accent" aria-hidden />}
        title="Submit vs buy PSA 10"
        subtitle="Raw + submit EV vs buying the slab (~45d)"
        actions={
          <div className="flex gap-1.5">
            {(['all', 'submit', 'buy'] as const).map((f) => (
              <FilterChip
                key={f}
                active={filter === f}
                onClick={() => setFilter(f)}
                className="text-xs"
              >
                {f === 'all' ? 'All' : f === 'submit' ? 'Submit' : 'Buy'}
              </FilterChip>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : visible.length === 0 ? (
        <SlabEmpty>Need verified PSA 10 + pop + raw to compare paths.</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {visible.map((row) => (
            <SlabRow
              key={row.cardId}
              name={row.cardName || row.cardId}
              setName={row.setName}
              chip={
                <StatusChip
                  tone={
                    row.recommendation === 'submit'
                      ? 'gain'
                      : row.recommendation === 'buy'
                        ? 'accent'
                        : 'muted'
                  }
                >
                  {row.recommendation === 'toss_up' ? 'Toss-up' : row.recommendation}
                </StatusChip>
              }
              primary={
                <>
                  EV {row.submitEV >= 0 ? '+' : ''}
                  {formatCurrency(row.submitEV)}
                </>
              }
              primaryTone={row.submitEV >= 0 ? 'gain' : 'loss'}
              secondary={
                <>
                  Buy {formatCurrency(row.buyCost)} · gem {row.gemRatePct.toFixed(0)}%
                </>
              }
              onClick={() => openStubCard(openCard, { ...row, rawPrice: row.rawPrice })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SetSlabHeatmapPanel: React.FC<{
  onSelectSet?: (setId: string, setName: string) => void;
  selectedSetId?: string;
  onClear?: () => void;
}> = ({ onSelectSet, selectedSetId, onClear }) => {
  const [rows, setRows] = useState<SetSlabHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchSetSlabHeatmap({ limit: 16, minCards: 3 }).then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<Layers className="h-4 w-4 text-foil" aria-hidden />}
        title="Set regimes"
        subtitle="Median PSA 10 premium — tap to filter grade list"
        actions={
          selectedSetId && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer text-xs text-accent hover:underline"
            >
              Clear filter
            </button>
          ) : null
        }
      />
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : rows.length === 0 ? (
        <SlabEmpty>Not enough graded coverage to map set regimes yet.</SlabEmpty>
      ) : (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
          {rows.map((row) => {
            const active = selectedSetId === row.setId;
            return (
              <button
                key={row.setId}
                type="button"
                onClick={() => onSelectSet?.(row.setId, row.setName)}
                className={`shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? 'border-accent bg-accent/15'
                    : 'border-border-subtle hover:bg-surface-hover/60'
                }`}
              >
                <p className="max-w-[9rem] truncate text-xs font-medium text-ink-primary">
                  {row.setName}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-accent">
                  {row.medianPremiumPct >= 0 ? '+' : ''}
                  {row.medianPremiumPct.toFixed(0)}%
                  {row.premiumPctDelta30d != null && (
                    <span
                      className={
                        row.premiumPctDelta30d >= 0
                          ? 'ml-1.5 text-gain'
                          : 'ml-1.5 text-loss'
                      }
                    >
                      {row.premiumPctDelta30d >= 0 ? '+' : ''}
                      {row.premiumPctDelta30d.toFixed(0)}pp
                    </span>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const PopRegimePanel: React.FC = () => {
  const { openCard } = useCardModal();
  const [days, setDays] = useState<7 | 30>(30);
  const [rows, setRows] = useState<PopShockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPopRegime({ days, limit: 12 }).then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<Waves className="h-4 w-4 text-accent" aria-hidden />}
        title="Pop regime"
        subtitle="PSA 10 population shocks"
        actions={
          <div className="flex gap-1.5">
            <FilterChip active={days === 7} onClick={() => setDays(7)} className="text-xs">
              7d
            </FilterChip>
            <FilterChip active={days === 30} onClick={() => setDays(30)} className="text-xs">
              30d
            </FilterChip>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : rows.length === 0 ? (
        <SlabEmpty>Need population history snapshots (builds as pops refresh).</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => (
            <SlabRow
              key={row.cardId}
              name={row.cardName || row.cardId}
              setName={row.setName}
              chip={
                row.regime !== 'neutral' ? (
                  <StatusChip
                    tone={row.regime === 'scarcity_breaking' ? 'loss' : 'gain'}
                  >
                    {row.regime === 'scarcity_breaking' ? 'Breaking' : 'Tightening'}
                  </StatusChip>
                ) : undefined
              }
              primary={
                <>
                  {row.psa10DeltaPct >= 0 ? '+' : ''}
                  {row.psa10DeltaPct.toFixed(0)}% pop10
                </>
              }
              primaryTone={row.psa10DeltaPct >= 0 ? 'loss' : 'gain'}
              secondary={
                <>
                  {row.psa10Prev.toLocaleString()} → {row.psa10Now.toLocaleString()}
                  {row.premiumPctDelta != null
                    ? ` · prem ${row.premiumPctDelta >= 0 ? '+' : ''}${row.premiumPctDelta.toFixed(0)}pp`
                    : ''}
                </>
              }
              onClick={() => openStubCard(openCard, row)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const GradeLadderPanel: React.FC = () => {
  const { openCard } = useCardModal();
  const [rows, setRows] = useState<GradeLadderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchGradeLadder({ limit: 10 }).then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<Scale className="h-4 w-4 text-foil" aria-hidden />}
        title="Grade ladder EV"
        subtitle="Raw → 8 → 9 → 10 economics"
      />
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : rows.length === 0 ? (
        <SlabEmpty>Need PSA 8/9/10 quotes on the same card.</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => {
            const path = row.steps
              .filter((s) => s.price != null)
              .map((s) =>
                s.grade === 'raw' ? `Raw ${formatCurrency(s.price!)}` : `${s.grade} ${formatCurrency(s.price!)}`
              )
              .join(' → ');
            return (
              <SlabRow
                key={row.cardId}
                name={row.cardName || row.cardId}
                setName={row.setName}
                chip={
                  row.psa9Mispriced ? (
                    <StatusChip tone="amber">9 misprice</StatusChip>
                  ) : undefined
                }
                primary={
                  row.expectedNet != null ? (
                    <>
                      EV {row.expectedNet >= 0 ? '+' : ''}
                      {formatCurrency(row.expectedNet)}
                    </>
                  ) : (
                    '—'
                  )
                }
                primaryTone={
                  row.expectedNet == null
                    ? 'default'
                    : row.expectedNet >= 0
                      ? 'gain'
                      : 'loss'
                }
                secondary={
                  path ||
                  (row.gemRatePct != null ? `Gem ${row.gemRatePct.toFixed(0)}%` : undefined)
                }
                onClick={() =>
                  openStubCard(openCard, { ...row, rawPrice: row.rawPrice })
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CrackRegradePanel: React.FC = () => {
  const { openCard } = useCardModal();
  const [rows, setRows] = useState<CrackRegradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchCrackRegrade(10).then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<Droplets className="h-4 w-4 text-accent" aria-hidden />}
        title="Crack & regrade"
        subtitle="Alt-grader 10 → PSA after fees"
      />
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : rows.length === 0 ? (
        <SlabEmpty>No cross-grader gaps that clear resubmit costs yet.</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => (
            <SlabRow
              key={`${row.cardId}-${row.altGrader}-${row.altGrade}`}
              name={row.cardName || row.cardId}
              setName={row.setName}
              chip={
                <StatusChip
                  tone={
                    row.action === 'crack_to_psa'
                      ? 'gain'
                      : row.action === 'buy_psa'
                        ? 'accent'
                        : 'muted'
                  }
                >
                  {row.action === 'crack_to_psa'
                    ? 'Crack'
                    : row.action === 'buy_psa'
                      ? 'Buy PSA'
                      : 'Hold alt'}
                </StatusChip>
              }
              primary={
                <>
                  EV {row.crackEV >= 0 ? '+' : ''}
                  {formatCurrency(row.crackEV)}
                </>
              }
              primaryTone={row.crackEV >= 0 ? 'gain' : 'loss'}
              secondary={
                <>
                  {row.altGrader} {formatCurrency(row.altPrice)} → PSA{' '}
                  {formatCurrency(row.psa10)}
                </>
              }
              onClick={() => openStubCard(openCard, row)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SlabBookPanel: React.FC = () => {
  const { openCard } = useCardModal();
  const [lots, setLots] = useState<SlabLot[]>(() => slabBookService.getLots());
  const [marks, setMarks] = useState<Record<string, SlabMark>>({});
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    cardId: '',
    cardName: '',
    setName: '',
    grader: 'PSA' as SlabGrader,
    grade: '10',
    purchasePrice: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    certNumber: '',
  });

  const refreshMarks = async (nextLots: SlabLot[]) => {
    if (nextLots.length === 0) {
      setMarks({});
      return;
    }
    setLoadingMarks(true);
    const data = await fetchSlabMarks(
      nextLots.map((l) => ({ cardId: l.cardId, grader: l.grader, grade: l.grade }))
    );
    const map: Record<string, SlabMark> = {};
    for (let i = 0; i < nextLots.length; i++) {
      const lot = nextLots[i];
      const mark =
        data.find(
          (m) =>
            m.cardId === lot.cardId &&
            m.grader.toUpperCase() === lot.grader.toUpperCase() &&
            m.grade.toLowerCase() === lot.grade.toLowerCase()
        ) ?? data[i];
      if (mark) map[lot.id] = mark;
    }
    setMarks(map);
    setLoadingMarks(false);
  };

  useEffect(() => {
    void refreshMarks(lots);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load marks once on mount

  const totals = useMemo(() => {
    let cost = 0;
    let mtm = 0;
    for (const lot of lots) {
      cost += lot.purchasePrice * lot.quantity;
      const mark = marks[lot.id]?.price;
      if (mark != null) mtm += mark * lot.quantity;
      else mtm += lot.purchasePrice * lot.quantity;
    }
    return { cost, mtm, pnl: mtm - cost };
  }, [lots, marks]);

  const addLot = () => {
    if (!form.cardId.trim() || !form.cardName.trim() || !form.purchasePrice) return;
    const price = Number(form.purchasePrice);
    if (!Number.isFinite(price) || price < 0) return;
    slabBookService.addLot({
      cardId: form.cardId.trim(),
      cardName: form.cardName.trim(),
      setName: form.setName.trim() || undefined,
      grader: form.grader,
      grade: form.grade.trim() || '10',
      purchasePrice: price,
      purchaseDate: form.purchaseDate,
      certNumber: form.certNumber.trim() || undefined,
    });
    const next = slabBookService.getLots();
    setLots(next);
    setShowForm(false);
    setForm((f) => ({
      ...f,
      cardId: '',
      cardName: '',
      setName: '',
      purchasePrice: '',
      certNumber: '',
    }));
    void refreshMarks(next);
  };

  const removeLot = (id: string) => {
    slabBookService.removeLot(id);
    const next = slabBookService.getLots();
    setLots(next);
    void refreshMarks(next);
  };

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<BookMarked className="h-4 w-4 text-foil" aria-hidden />}
        title="Owned slab book"
        subtitle="Cost basis vs live PriceCharting marks"
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/25"
          >
            <Plus className="h-3.5 w-3.5" />
            Add slab
          </button>
        }
      />

      {lots.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">Cost</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
              {formatCurrency(totals.cost)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">Mark</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
              {loadingMarks ? '…' : formatCurrency(totals.mtm)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">P&amp;L</p>
            <p
              className={`font-mono text-sm font-semibold tabular-nums ${
                totals.pnl >= 0 ? 'text-gain' : 'text-loss'
              }`}
            >
              {totals.pnl >= 0 ? '+' : ''}
              {formatCurrency(totals.pnl)}
            </p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-border-subtle bg-surface-inset p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input text-sm"
              placeholder="Card ID (e.g. sv3-193)"
              value={form.cardId}
              onChange={(e) => setForm({ ...form, cardId: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="Card name"
              value={form.cardName}
              onChange={(e) => setForm({ ...form, cardName: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="Set name"
              value={form.setName}
              onChange={(e) => setForm({ ...form, setName: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="Purchase price"
              type="number"
              min={0}
              step="0.01"
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
            />
            <select
              className="input text-sm"
              value={form.grader}
              onChange={(e) => setForm({ ...form, grader: e.target.value as SlabGrader })}
            >
              {(['PSA', 'CGC', 'BGS', 'SGC', 'TAG', 'ACE'] as SlabGrader[]).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <input
              className="input text-sm"
              placeholder="Grade (10, 9, 10 pristine…)"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            />
            <input
              className="input text-sm"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
            />
            <input
              className="input text-sm"
              placeholder="Cert # (optional)"
              value={form.certNumber}
              onChange={(e) => setForm({ ...form, certNumber: e.target.value })}
            />
          </div>
          <button type="button" onClick={addLot} className="btn-primary cursor-pointer text-sm">
            Save lot
          </button>
        </div>
      )}

      {lots.length === 0 ? (
        <SlabEmpty>Track owned slabs with cost basis for mark-to-market.</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {lots.map((lot) => {
            const mark = marks[lot.id];
            const mtm = mark?.price ?? null;
            const pnl =
              mtm != null ? (mtm - lot.purchasePrice) * lot.quantity : null;
            return (
              <div key={lot.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <SlabRow
                    name={lot.cardName}
                    setName={
                      lot.setName || lot.cardId
                        ? `${lot.setName || lot.cardId}${lot.certNumber ? ` · #${lot.certNumber}` : ''}`
                        : null
                    }
                    chip={
                      <StatusChip tone="muted">
                        {lot.grader} {lot.grade}
                      </StatusChip>
                    }
                    primary={mtm != null ? formatCurrency(mtm) : '—'}
                    primaryTone="default"
                    secondary={
                      <>
                        Cost {formatCurrency(lot.purchasePrice)}
                        {pnl != null
                          ? ` · ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}`
                          : ''}
                      </>
                    }
                    onClick={() =>
                      openStubCard(openCard, {
                        cardId: lot.cardId,
                        cardName: lot.cardName,
                        setName: lot.setName ?? null,
                        rawPrice: mark?.rawPrice,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLot(lot.id)}
                  className="shrink-0 cursor-pointer rounded p-1.5 text-ink-muted hover:bg-loss/10 hover:text-loss"
                  title="Remove lot"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
