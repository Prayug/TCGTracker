import React from 'react';
import { GradingResult } from '../../../types/grading';
import { buildGradeDecision } from '../gradingDecision';
import { displayCardName } from '../gradingPresentation';

interface GradingHistoryProps {
  history: GradingResult[];
  onSelect?: (result: GradingResult) => void;
  selectedId?: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const delta = Date.now() - then;
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const GradingHistory: React.FC<GradingHistoryProps> = ({
  history,
  onSelect,
  selectedId,
}) => {
  if (history.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-primary">Recent scans</h2>
        <p className="text-sm text-ink-muted">{history.length} saved</p>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {history.slice(0, 12).map((item) => {
          const active = item.id === selectedId;
          const decision = buildGradeDecision(item);
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect?.(item)}
                className={`flex w-48 cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-border-subtle bg-surface-inset/50 hover:border-border-default'
                }`}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-12 w-9 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-white/5 text-xs text-ink-muted">
                    —
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-primary">
                    {displayCardName(item.cardName)}
                  </p>
                  <p className="truncate text-sm text-ink-secondary">
                    {decision.psaRangeLabel ?? decision.marketplaceAbbr}
                  </p>
                  <p className="text-xs text-ink-muted">{relativeTime(item.timestamp)}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
