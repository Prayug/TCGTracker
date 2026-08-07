import React from 'react';

export function StatusChip({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'gain' | 'accent' | 'amber' | 'loss' | 'muted';
}) {
  const cls =
    tone === 'gain'
      ? 'bg-gain/15 text-gain'
      : tone === 'accent'
        ? 'bg-accent/15 text-accent'
        : tone === 'amber'
          ? 'bg-amber-500/15 text-amber-300'
          : tone === 'loss'
            ? 'bg-loss/15 text-loss'
            : 'bg-surface-hover text-ink-muted';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {children}
    </span>
  );
}

/** Compact list row: identity left, one primary + one secondary metric right. */
export function SlabRow({
  name,
  setName,
  chip,
  primary,
  primaryTone = 'default',
  secondary,
  onClick,
  trailing,
  active,
}: {
  name: string;
  setName?: string | null;
  chip?: React.ReactNode;
  primary: React.ReactNode;
  primaryTone?: 'gain' | 'loss' | 'accent' | 'default';
  secondary?: React.ReactNode;
  onClick?: () => void;
  trailing?: React.ReactNode;
  active?: boolean;
}) {
  const primaryCls =
    primaryTone === 'gain'
      ? 'text-gain'
      : primaryTone === 'loss'
        ? 'text-loss'
        : primaryTone === 'accent'
          ? 'text-accent'
          : 'text-ink-primary';

  const shell = active
    ? 'bg-accent-muted shadow-[inset_0_0_0_1px_var(--accent)]'
    : 'hover:bg-surface-hover/70';

  const identity = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="truncate text-sm font-medium text-ink-primary">{name}</p>
        {chip}
      </div>
      {setName ? <p className="truncate text-[11px] text-ink-muted">{setName}</p> : null}
    </div>
  );

  const metrics = (
    <div className="shrink-0 text-right text-xs tabular-nums">
      <p className={`text-sm font-semibold ${primaryCls}`}>{primary}</p>
      {secondary != null ? <p className="text-[11px] text-ink-muted">{secondary}</p> : null}
    </div>
  );

  if (onClick && trailing) {
    return (
      <div className={`flex w-full items-center gap-1 rounded-lg px-1 py-0.5 transition-colors ${shell}`}>
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left"
        >
          {identity}
          {metrics}
        </button>
        <div className="shrink-0">{trailing}</div>
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors ${shell}`}
      >
        {identity}
        {metrics}
      </button>
    );
  }

  return (
    <div className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 ${shell}`}>
      {identity}
      {metrics}
      {trailing}
    </div>
  );
}

export function SlabPanelHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          {icon}
          {title}
        </h3>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function SlabEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-center text-xs text-ink-muted">{children}</p>;
}
