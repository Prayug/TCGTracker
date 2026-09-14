import { PredictionRunStatus } from '../types';

const PHASE_COPY: Record<string, string> = {
  starting: 'Starting the model…',
  loading: 'Loading graded history…',
  scoring: 'Scoring',
  finishing: 'Saving outcomes…',
};

function formatElapsed(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rem}s` : `${rem}s`;
}

export function runCompletionPercent(status: PredictionRunStatus | null): number | null {
  const total = status?.progress?.total ?? 0;
  const processed = status?.progress?.processed ?? 0;
  if (total <= 0) return null;
  return Math.min(100, Math.round((processed / total) * 100));
}

interface Props {
  status: PredictionRunStatus | null;
  running: boolean;
  unitLabel: string;
}

export function PredictionRunProgress({ status, running, unitLabel }: Props) {
  if (!status) return null;
  if (!running && !status.last && !status.progress) return null;

  const percent = runCompletionPercent(status);
  const progress = status.progress;
  const last = status.last;
  const elapsed = running ? formatElapsed(status.startedAt) : null;
  const phase = progress?.phase ?? 'starting';
  const phaseLabel = PHASE_COPY[phase] ?? 'Working…';

  return (
    <div
      className="mb-4 rounded-xl border border-border-default bg-surface-raised px-4 py-3"
      aria-live="polite"
    >
      {running ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink-primary">
              {phase === 'scoring' && progress && progress.total > 0
                ? `${phaseLabel} ${progress.processed.toLocaleString()} of ${progress.total.toLocaleString()} ${unitLabel}`
                : `${phaseLabel}`}
            </p>
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              {percent != null && (
                <span className="tabular-nums font-semibold text-accent">{percent}%</span>
              )}
              {elapsed && <span className="tabular-nums">{elapsed} elapsed</span>}
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
            {percent != null ? (
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/70" />
            )}
          </div>
          {progress && (progress.succeeded > 0 || progress.failed > 0) && (
            <p className="text-[11px] text-ink-muted">
              {progress.succeeded.toLocaleString()} scored
              {progress.failed > 0 ? ` · ${progress.failed.toLocaleString()} skipped` : ''}
            </p>
          )}
        </div>
      ) : last ? (
        <p className="text-sm text-ink-secondary">
          Last run scored{' '}
          <span className="font-medium text-ink-primary">{last.succeeded.toLocaleString()}</span> of{' '}
          {last.total.toLocaleString()} {unitLabel}
          {last.failed > 0 ? ` · ${last.failed.toLocaleString()} skipped` : ''}.
        </p>
      ) : null}
    </div>
  );
}
