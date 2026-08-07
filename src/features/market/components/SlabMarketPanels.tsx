import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Bell, Loader2, Scale, TrendingUp } from 'lucide-react';
import {
  CrossGraderArbRow,
  fetchCrossGraderArbs,
  fetchPremiumMovers,
  GradedSpreadRow,
  PremiumMoverRow,
} from '../../../services/gradedPricesApi';
import { formatCurrency } from '../../../utils/cardDisplay';
import { FilterChip } from '../../../components/layout/PageShell';
import { useCardModal } from '../../../contexts/CardModalContext';
import type { PokemonCard } from '../../../types/pokemon';
import { SlabEmpty, SlabPanelHeader, SlabRow } from './SlabRow';

function openStubCard(
  open: (card: PokemonCard) => void,
  row: {
    cardId: string;
    cardName: string | null;
    setId?: string | null;
    setName: string | null;
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

export function LiquidityBadge({
  score,
  tier,
  label,
}: {
  score?: number | null;
  tier?: 'strong' | 'ok' | 'thin' | 'illiquid' | null;
  label?: string | null;
}) {
  if (score == null && !tier) return null;
  const t =
    tier ??
    (score != null && score >= 70
      ? 'strong'
      : score != null && score >= 45
        ? 'ok'
        : score != null && score >= 25
          ? 'thin'
          : 'illiquid');
  const text =
    label ??
    (t === 'strong' ? 'Liquid' : t === 'ok' ? 'Tradeable' : t === 'thin' ? 'Thin' : 'Illiquid');
  const cls =
    t === 'strong'
      ? 'bg-gain/15 text-gain'
      : t === 'ok'
        ? 'bg-accent/15 text-accent'
        : t === 'thin'
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-loss/15 text-loss';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={score != null ? `Liquidity ${score}/100` : undefined}
    >
      {text}
      {score != null ? ` ${score}` : ''}
    </span>
  );
}

export const PremiumMoversPanel: React.FC<{
  onAlertPremium?: (card: {
    cardId: string;
    cardName: string;
    premiumPct: number;
    rawPrice: number;
  }) => void;
}> = ({ onAlertPremium }) => {
  const { openCard } = useCardModal();
  const [days, setDays] = useState<7 | 30>(30);
  const [rows, setRows] = useState<PremiumMoverRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPremiumMovers({ days, limit: 12 }).then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const expanding = rows.filter((r) => r.direction === 'expanding').slice(0, 6);
  const compressing = rows.filter((r) => r.direction === 'compressing').slice(0, 6);

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        icon={<TrendingUp className="h-4 w-4 text-accent" aria-hidden />}
        title="PSA 10 premium movers"
        subtitle="Premium vs raw over the window"
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
        <SlabEmpty>Need graded + raw history to show premium momentum.</SlabEmpty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <MoverColumn
            title="Expanding"
            icon={<ArrowUpRight className="h-3.5 w-3.5 text-gain" />}
            rows={expanding}
            empty="No expanding premiums"
            onOpen={(r) => openStubCard(openCard, r)}
            onAlert={onAlertPremium}
          />
          <MoverColumn
            title="Compressing"
            icon={<ArrowDownRight className="h-3.5 w-3.5 text-loss" />}
            rows={compressing}
            empty="No compressing premiums"
            onOpen={(r) => openStubCard(openCard, r)}
            onAlert={onAlertPremium}
          />
        </div>
      )}
    </div>
  );
};

function MoverColumn({
  title,
  icon,
  rows,
  empty,
  onOpen,
  onAlert,
}: {
  title: string;
  icon: React.ReactNode;
  rows: PremiumMoverRow[];
  empty: string;
  onOpen: (row: PremiumMoverRow) => void;
  onAlert?: (card: {
    cardId: string;
    cardName: string;
    premiumPct: number;
    rawPrice: number;
  }) => void;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {icon}
          {title}
        </p>
        <p className="text-xs text-ink-muted">{empty}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <SlabRow
            key={row.cardId}
            name={row.cardName || row.cardId}
            setName={row.setName}
            primary={
              <>
                {row.premiumPctDelta >= 0 ? '+' : ''}
                {row.premiumPctDelta.toFixed(0)} pp
              </>
            }
            primaryTone={row.premiumPctDelta >= 0 ? 'gain' : 'loss'}
            secondary={
              <>
                {row.premiumPctPrev.toFixed(0)}% → {row.premiumPct.toFixed(0)}%
              </>
            }
            onClick={() => {
              onOpen(row);
            }}
            trailing={
              onAlert ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="Alert on premium"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlert({
                      cardId: row.cardId,
                      cardName: row.cardName || row.cardId,
                      premiumPct: row.premiumPct,
                      rawPrice: row.rawPrice,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onAlert({
                        cardId: row.cardId,
                        cardName: row.cardName || row.cardId,
                        premiumPct: row.premiumPct,
                        rawPrice: row.rawPrice,
                      });
                    }
                  }}
                  className="cursor-pointer rounded p-1 text-ink-muted hover:text-accent"
                >
                  <Bell className="h-3.5 w-3.5" aria-label="Alert on premium" />
                </span>
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

export const CrossGraderArbPanel: React.FC = () => {
  const { openCard } = useCardModal();
  const [rows, setRows] = useState<CrossGraderArbRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchCrossGraderArbs(10).then((data) => {
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
        title="Cross-grader 10 arb"
        subtitle="PSA 10 vs CGC / BGS / SGC 10"
      />
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : rows.length === 0 ? (
        <SlabEmpty>No multi-grader 10 quotes with a meaningful gap yet.</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => (
            <SlabRow
              key={`${row.cardId}-${row.altGrader}-${row.altGrade}`}
              name={row.cardName || row.cardId}
              setName={row.setName}
              primary={
                <>
                  {row.spreadPct >= 0 ? '+' : ''}
                  {row.spreadPct.toFixed(0)}% vs alt
                </>
              }
              primaryTone={row.spreadPct >= 0 ? 'gain' : 'loss'}
              secondary={
                <>
                  PSA {formatCurrency(row.psa10)} · {row.altGrader}{' '}
                  {formatCurrency(row.altPrice)}
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

export function TopPremiumsPanel({
  rows,
  onAlertPremium,
  tradeableOnly,
  onTradeableOnlyChange,
}: {
  rows: GradedSpreadRow[];
  onAlertPremium?: (card: {
    cardId: string;
    cardName: string;
    premiumPct: number;
    rawPrice: number;
  }) => void;
  tradeableOnly?: boolean;
  onTradeableOnlyChange?: (v: boolean) => void;
}) {
  const { openCard } = useCardModal();
  if (rows.length === 0 && !tradeableOnly) return null;

  return (
    <div className="card-glass-scene">
      <SlabPanelHeader
        title="Top PSA 10 premiums"
        subtitle="Pure premium leaders"
        actions={
          onTradeableOnlyChange ? (
            <FilterChip
              active={!!tradeableOnly}
              onClick={() => onTradeableOnlyChange(!tradeableOnly)}
              className="text-xs"
            >
              Tradeable only
            </FilterChip>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <SlabEmpty>No tradeable premiums match.</SlabEmpty>
      ) : (
        <div className="space-y-0.5">
          {rows.slice(0, 8).map((row) => (
            <SlabRow
              key={`${row.cardId}-${row.grader}-${row.grade}`}
              name={row.cardName || row.cardId}
              setName={row.setName}
              primary={
                row.premiumPct != null
                  ? `${row.premiumPct >= 0 ? '+' : ''}${row.premiumPct.toFixed(0)}%`
                  : '—'
              }
              primaryTone="accent"
              secondary={
                <>
                  {formatCurrency(row.gradedPrice)}
                  {row.rawPrice != null ? ` / ${formatCurrency(row.rawPrice)}` : ''}
                </>
              }
              onClick={() => openStubCard(openCard, row)}
              trailing={
                onAlertPremium && row.premiumPct != null && row.rawPrice != null ? (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Alert on premium"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAlertPremium({
                        cardId: row.cardId,
                        cardName: row.cardName || row.cardId,
                        premiumPct: row.premiumPct!,
                        rawPrice: row.rawPrice!,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onAlertPremium({
                          cardId: row.cardId,
                          cardName: row.cardName || row.cardId,
                          premiumPct: row.premiumPct!,
                          rawPrice: row.rawPrice!,
                        });
                      }
                    }}
                    className="cursor-pointer rounded p-1 text-ink-muted hover:text-accent"
                  >
                    <Bell className="h-3.5 w-3.5" aria-label="Alert on premium" />
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
