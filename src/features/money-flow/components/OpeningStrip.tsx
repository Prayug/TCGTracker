import type { MoneyFlowResponse, MoneyFlowWindowDays } from '@tcgtracker/shared';
import { useGame } from '../../../contexts/GameContext';
import { formatDate, formatPct, gameMarketLabel, moveTone } from '../lib/format';

const WINDOWS: MoneyFlowWindowDays[] = [7, 30, 90];

export function OpeningStrip({
  data,
  days,
  onDaysChange,
  refreshing,
}: {
  data: MoneyFlowResponse;
  days: MoneyFlowWindowDays;
  onDaysChange: (d: MoneyFlowWindowDays) => void;
  refreshing: boolean;
}) {
  const { game } = useGame();
  const { summary } = data;
  const tracked = summary.trackedCount;
  const risingShare = tracked > 0 ? Math.round((summary.risingCount / tracked) * 100) : 0;
  const fallingShare = tracked > 0 ? Math.round((summary.fallingCount / tracked) * 100) : 0;
  const barUp = Math.max(0, Math.min(100, risingShare));
  const barDown = Math.max(0, Math.min(100 - barUp, fallingShare));
  const barFlat = Math.max(0, 100 - barUp - barDown);

  return (
    <header className="mf__open">
      <div className="mf__mast">
        <div>
          <h1 className="mf__title">Money Flow</h1>
          <p className="mf__dateline">
            {gameMarketLabel(game)} · {formatDate(data.date || data.headline.asOfDate)}
            {refreshing ? ' · updating' : ''}
          </p>
        </div>
        <div className="mf__windows" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className="mf__win"
              aria-pressed={days === w}
              onClick={() => onDaysChange(w)}
            >
              {w}D
            </button>
          ))}
        </div>
      </div>

      <div className="mf__kicker">Market breadth</div>
      <dl className="mf__facts">
        <div>
          <dd className="is-up">{risingShare}%</dd>
          <dt>rising</dt>
        </div>
        <div>
          <dd className="is-down">{fallingShare}%</dd>
          <dt>falling</dt>
        </div>
        <div>
          <dd className={`is-${moveTone(summary.medianMovePct)}`}>
            {formatPct(summary.medianMovePct)}
          </dd>
          <dt>median</dt>
        </div>
        <div>
          <dd>{tracked}</dd>
          <dt>tracked</dt>
        </div>
      </dl>

      <div
        className="mf__breadth"
        role="img"
        aria-label={`${risingShare} percent rising, ${fallingShare} percent falling`}
      >
        <span className="is-up" style={{ width: `${barUp}%` }} />
        {barFlat > 0 ? <span className="is-flat" style={{ width: `${barFlat}%` }} /> : null}
        <span className="is-down" style={{ width: `${barDown}%` }} />
      </div>
      <div className="mf__breadth-cap" aria-hidden>
        <span>rising</span>
        <span>falling</span>
      </div>
    </header>
  );
}
