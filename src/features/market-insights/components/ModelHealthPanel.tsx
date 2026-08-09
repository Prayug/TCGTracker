import { Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import {
  CalibrationHorizonStatus,
  DataQualityCheckResult,
  DataQualityStatusResponse,
} from '../types';

interface Props {
  calibration: CalibrationHorizonStatus[] | null;
  dataQuality: DataQualityStatusResponse | null;
  loading: boolean;
  error: string | null;
}

function formatBias(bias: number | null): string {
  if (bias == null) return '—';
  const pct = bias * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatRunAt(runAt: string | null): string {
  if (!runAt) return 'Never';
  try {
    const d = new Date(runAt.includes('T') ? runAt : `${runAt.replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return runAt;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return runAt;
  }
}

function StatusIcon({ status }: { status: DataQualityCheckResult['status'] }) {
  if (status === 'fail') return <XCircle className="h-3.5 w-3.5 text-red-400" aria-hidden />;
  if (status === 'warn') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
}

export function ModelHealthPanel({ calibration, dataQuality, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-center text-sm text-red-300">
        {error}
      </div>
    );
  }

  const checks = dataQuality?.data ?? [];
  const failed = dataQuality?.failed ?? checks.filter((c) => c.status === 'fail').length;
  const warned = dataQuality?.warned ?? checks.filter((c) => c.status === 'warn').length;
  const passed = dataQuality?.passed ?? checks.filter((c) => c.status === 'pass').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold text-white">Model health</h2>
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">
          Calibration · data quality
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border-default bg-surface-raised p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Calibration by horizon
          </h3>
          {!calibration?.length ? (
            <p className="py-4 text-center text-sm text-ink-muted">No calibration models yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-ink-muted">
                    <th className="pb-2 pr-3 font-medium">Horizon</th>
                    <th className="pb-2 pr-3 font-medium">Samples</th>
                    <th className="pb-2 pr-3 font-medium">Bias</th>
                    <th className="pb-2 font-medium">Built</th>
                  </tr>
                </thead>
                <tbody>
                  {calibration.map((row) => (
                    <tr key={row.horizon} className="border-b border-border-subtle/60 last:border-0">
                      <td className="py-2 pr-3 font-mono text-ink-primary">{row.horizon}d</td>
                      <td className="py-2 pr-3 tabular-nums text-ink-secondary">
                        {row.sampleCount.toLocaleString()}
                      </td>
                      <td
                        className={`py-2 pr-3 tabular-nums ${
                          row.bias == null
                            ? 'text-ink-muted'
                            : Math.abs(row.bias) > 0.05
                              ? 'text-amber-300'
                              : 'text-ink-secondary'
                        }`}
                      >
                        {formatBias(row.bias)}
                      </td>
                      <td className="py-2 text-ink-muted">
                        {row.builtAt ? formatRunAt(row.builtAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border-default bg-surface-raised p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Data quality
            </h3>
            <span className="text-[11px] text-ink-muted">
              Last run: {formatRunAt(dataQuality?.runAt ?? null)}
            </span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
              {failed} fail
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
              {warned} warn
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              {passed} pass
            </span>
          </div>

          {!checks.length ? (
            <p className="py-4 text-center text-sm text-ink-muted">
              No quality checks recorded yet. They run with prediction jobs.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {checks.slice(0, 8).map((check) => (
                <li
                  key={check.checkName}
                  className="flex items-start gap-2 rounded-lg bg-surface-inset/60 px-2.5 py-1.5"
                >
                  <StatusIcon status={check.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] text-ink-secondary">
                      {check.checkName}
                    </p>
                    <p className="text-[10px] text-ink-muted">
                      {check.status}
                      {check.threshold != null
                        ? ` · value ${Number(check.metricValue).toFixed(3)} / thr ${check.threshold}`
                        : ` · ${Number(check.metricValue).toFixed(3)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
