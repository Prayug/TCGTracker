export function MarketBreadth({ chased, cooled }: { chased: number; cooled: number }) {
  const c = Math.max(0, Math.min(100, chased));
  const o = Math.max(0, Math.min(100, cooled));
  return (
    <div
      className="mf-term__breadth"
      role="img"
      aria-label={`Market breadth ${Math.round(c)} percent chased, ${Math.round(o)} percent cooled`}
    >
      <div className="mf-term__breadth-labels">
        <span className="is-up">{Math.round(c)}% chased</span>
        <span className="is-down">{Math.round(o)}% cooled</span>
      </div>
      <div className="mf-term__breadth-track">
        <span className="mf-term__breadth-in" style={{ width: `${c}%` }} />
        <span className="mf-term__breadth-out" style={{ width: `${o}%` }} />
      </div>
    </div>
  );
}
