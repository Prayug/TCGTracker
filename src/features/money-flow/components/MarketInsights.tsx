import type { MoneyFlowInsight } from '@tcgtracker/shared';

export function MarketInsights({ insights }: { insights: MoneyFlowInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <section className="mf-term__panel mf-term__insights" aria-label="What changed">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">What changed</h2>
      </div>
      <ul className="mf-term__insight-list">
        {insights.map((i) => (
          <li key={i.id}>{i.text}</li>
        ))}
      </ul>
    </section>
  );
}
