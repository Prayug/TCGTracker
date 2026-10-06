import type { MoneyFlowBreadthBucket } from '@tcgtracker/shared';

export function BreadthBuckets({ buckets }: { buckets: MoneyFlowBreadthBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <section className="mf-term__panel" aria-label="Return distribution">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">Return buckets</h2>
        <span className="mf-term__panel-hint">Share of chase prints by move</span>
      </div>
      <div className="mf-term__buckets">
        {buckets.map((b) => {
          const neg = b.maxPct != null && b.maxPct <= 0;
          return (
            <div key={b.key} className="mf-term__bucket">
              <div className="mf-term__bucket-top">
                <span>{b.label}</span>
                <span className="mf-term__mono">
                  {b.count} · {Math.round(b.sharePct)}%
                </span>
              </div>
              <div className="mf-term__bucket-track">
                <span
                  className={`mf-term__bucket-fill ${neg ? 'is-down' : 'is-up'}`}
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
