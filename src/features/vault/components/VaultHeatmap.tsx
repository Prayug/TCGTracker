import React from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { VaultCard } from '../../../types/pokemon';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';

interface VaultHeatmapProps {
  vaultCards: VaultCard[];
  onOpenSet?: (setId: string) => void;
}

interface SetSlice {
  name: string;
  setId: string;
  size: number;
  cost: number;
  profit: number;
  profitPct: number;
}

/** 5-step gain/loss intensity scale. Neutral slate in the ±5% dead zone. */
function heatFill(profitPct: number): string {
  if (profitPct >= 15) return 'rgba(52, 211, 153, 0.45)';
  if (profitPct >= 5) return 'rgba(52, 211, 153, 0.25)';
  if (profitPct > -5) return 'rgba(148, 163, 184, 0.16)';
  if (profitPct > -15) return 'rgba(248, 113, 113, 0.25)';
  return 'rgba(248, 113, 113, 0.45)';
}

function buildSlices(vaultCards: VaultCard[]): SetSlice[] {
  const bySet = new Map<string, SetSlice>();
  for (const entry of vaultCards) {
    const set = entry.card.set;
    const marketPrice = entry.card.marketPrice ?? 0;
    const current = marketPrice * entry.quantity;
    const cost = entry.purchasePrice * entry.quantity;
    const slice = bySet.get(set.id) ?? {
      name: set.name,
      setId: set.id,
      size: 0,
      cost: 0,
      profit: 0,
      profitPct: 0,
    };
    slice.size += current > 0 ? current : cost;
    slice.cost += cost;
    slice.profit += current - cost;
    bySet.set(set.id, slice);
  }
  const slices = Array.from(bySet.values()).filter((slice) => slice.size > 0);
  for (const slice of slices) {
    slice.profitPct = slice.cost > 0 ? (slice.profit / slice.cost) * 100 : 0;
  }
  return slices.sort((a, b) => b.size - a.size);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HeatCell: React.FC<any> = (props) => {
  const { x, y, width, height, name, profitPct, onOpenSet, setId } = props;
  if (width <= 0 || height <= 0 || profitPct === undefined) return null;
  const showLabel = width > 72 && height > 36;
  return (
    <g
      onClick={onOpenSet && setId ? () => onOpenSet(setId) : undefined}
      style={{ cursor: onOpenSet ? 'pointer' : 'default' }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={heatFill(profitPct)}
        stroke="#090d14"
        strokeWidth={2}
      />
      {showLabel && (
        <>
          <text
            x={x + 8}
            y={y + 18}
            fill="#f1f5f9"
            fontSize={11}
            fontWeight={600}
            pointerEvents="none"
          >
            {String(name).length > Math.floor(width / 7)
              ? `${String(name).slice(0, Math.floor(width / 7))}…`
              : name}
          </text>
          <text
            x={x + 8}
            y={y + 33}
            fill={profitPct >= 0 ? '#34d399' : '#f87171'}
            fontSize={11}
            fontWeight={700}
            pointerEvents="none"
          >
            {formatPercent(profitPct, { signed: true })}
          </text>
        </>
      )}
    </g>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HeatTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload as SetSlice;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm">
      <p className="font-semibold text-ink-primary">{slice.name}</p>
      <p className="tabular-nums text-ink-secondary">{formatCurrency(slice.size)} held</p>
      <p className={`font-semibold tabular-nums ${slice.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
        {formatCurrency(slice.profit, { signed: true })} ({formatPercent(slice.profitPct, { signed: true })})
      </p>
    </div>
  );
};

/**
 * Treemap of holdings: cell area = current value, color = P&L intensity.
 * One glance answers "what is making me money".
 */
export const VaultHeatmap: React.FC<VaultHeatmapProps> = ({ vaultCards, onOpenSet }) => {
  const slices = buildSlices(vaultCards);
  if (slices.length < 2) return null;

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionLabel>P&L heatmap</SectionLabel>
          <p className="mt-0.5 text-xs text-ink-muted">
            Sized by current value · colored by unrealized gain/loss · click a set to open it
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(-20) }} />
          loss
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(0) }} />
          flat
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: heatFill(20) }} />
          gain
        </div>
      </div>
      <div className="overflow-hidden rounded-lg bg-surface-inset p-1">
        <ResponsiveContainer width="100%" height={240}>
          <Treemap
            data={slices.map((slice) => ({ ...slice, onOpenSet }))}
            dataKey="size"
            nameKey="name"
            isAnimationActive={false}
            content={<HeatCell />}
          >
            <Tooltip content={<HeatTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
