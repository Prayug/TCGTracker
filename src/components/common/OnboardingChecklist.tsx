import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Layers,
  X,
} from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { useGame } from '../../contexts/GameContext';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'tcg.onboarding';
const DISMISS_KEY = `${STORAGE_KEY}.dismissed`;

export type OnboardingStep = 'browse' | 'scan' | 'vault' | 'slabs';

interface StepDef {
  id: OnboardingStep;
  label: string;
  to: string;
  icon: React.ElementType;
}

export const ONBOARDING_STEPS: StepDef[] = [
  { id: 'browse', label: 'Browse cards', to: '/browse', icon: LayoutGrid },
  { id: 'scan', label: 'Scan a card', to: '/scanner', icon: Camera },
  { id: 'vault', label: 'Add to vault', to: '/vault', icon: BookOpen },
  { id: 'slabs', label: 'Explore market', to: '/prices', icon: Layers },
];

function readCompleted(): Set<OnboardingStep> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as OnboardingStep[]);
  } catch {
    return new Set();
  }
}

function writeCompleted(steps: Set<OnboardingStep>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]));
}

export function isOnboardingDismissed(): boolean {
  return localStorage.getItem(DISMISS_KEY) === '1';
}

export function dismissOnboardingPermanently() {
  localStorage.setItem(DISMISS_KEY, '1');
  window.dispatchEvent(new CustomEvent('tcg:onboarding-update'));
}

export function getOnboardingProgress() {
  const completed = readCompleted();
  const doneCount = ONBOARDING_STEPS.filter((s) => completed.has(s.id)).length;
  return {
    completed,
    doneCount,
    total: ONBOARDING_STEPS.length,
    allDone: doneCount === ONBOARDING_STEPS.length,
    dismissed: isOnboardingDismissed(),
  };
}

export function markOnboardingStep(step: OnboardingStep) {
  const completed = readCompleted();
  if (completed.has(step)) return;
  completed.add(step);
  writeCompleted(completed);
  if (completed.size >= ONBOARDING_STEPS.length) {
    localStorage.setItem(DISMISS_KEY, '1');
  }
  window.dispatchEvent(new CustomEvent('tcg:onboarding-update'));
}

function useOnboardingState() {
  const [completed, setCompleted] = useState<Set<OnboardingStep>>(() => readCompleted());
  const [dismissed, setDismissed] = useState(() => isOnboardingDismissed());

  useEffect(() => {
    const sync = () => {
      const progress = getOnboardingProgress();
      setCompleted(progress.completed);
      setDismissed(progress.dismissed);
      if (progress.allDone && !progress.dismissed) {
        dismissOnboardingPermanently();
        setDismissed(true);
      }
    };
    sync();
    window.addEventListener('tcg:onboarding-update', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('tcg:onboarding-update', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const doneCount = ONBOARDING_STEPS.filter((s) => completed.has(s.id)).length;
  const allDone = doneCount === ONBOARDING_STEPS.length;

  return {
    completed,
    dismissed,
    doneCount,
    allDone,
    active: !dismissed && !allDone,
    dismiss: () => {
      dismissOnboardingPermanently();
      setDismissed(true);
    },
  };
}

function useHasHoldings() {
  const { game } = useGame();
  const [hasHoldings, setHasHoldings] = useState(() => vaultService.getVaultCards(game).length > 0);

  useEffect(() => {
    const refresh = () => setHasHoldings(vaultService.getVaultCards(game).length > 0);
    refresh();
    window.addEventListener('tcg:vault-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('tcg:vault-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [game]);

  return hasHoldings;
}

function StepList({ completed, compact }: { completed: Set<OnboardingStep>; compact?: boolean }) {
  return (
    <ul className={cn('grid gap-1', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4')}>
      {ONBOARDING_STEPS.map(({ id, label, to, icon: Icon }) => {
        const done = completed.has(id);
        return (
          <li key={id}>
            {done ? (
              <span className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-ink-secondary">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gain-muted text-gain">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="line-through">{label}</span>
              </span>
            ) : (
              <Link
                to={to}
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-default bg-surface-inset">
                  <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                </span>
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Home-inline progress card — preferred once the collector has holdings. */
export function OnboardingProgressCard({ className }: { className?: string }) {
  const { completed, doneCount, active, dismiss } = useOnboardingState();
  const [expanded, setExpanded] = useState(false);

  if (!active) return null;

  const collapsed = doneCount >= 2 && !expanded;

  return (
    <section
      aria-label="Getting started"
      className={cn('rounded-xl border border-border-subtle bg-surface-raised/60', className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-primary">Getting started</p>
          <p className="text-xs text-ink-secondary">
            {doneCount} of {ONBOARDING_STEPS.length} done
            {doneCount >= 2 ? ' · Keep going' : ' · A few steps to unlock the dashboard'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {doneCount >= 2 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="cursor-pointer rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
              aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            >
              {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="cursor-pointer rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
            aria-label="Dismiss getting started"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="h-1 w-full bg-surface-inset">
        <div
          className="h-full bg-accent/70 transition-[width] duration-300"
          style={{ width: `${(doneCount / ONBOARDING_STEPS.length) * 100}%` }}
        />
      </div>
      {collapsed ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-ink-secondary">
            Nice progress — finish the rest when you are ready.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="cursor-pointer text-xs font-semibold text-accent hover:underline"
          >
            Show steps
          </button>
        </div>
      ) : (
        <div className="p-2">
          <StepList completed={completed} compact />
        </div>
      )}
    </section>
  );
}

/**
 * Global checklist — shown only for empty vaults.
 * Collapses after 1–2 meaningful actions; dismisses permanently when finished.
 */
export const OnboardingChecklist: React.FC = () => {
  const { completed, doneCount, active, dismiss } = useOnboardingState();
  const hasHoldings = useHasHoldings();
  const [expanded, setExpanded] = useState(false);

  // Prefer Home progress card when the collector already has holdings
  if (!active || hasHoldings) return null;

  const collapsed = doneCount >= 2 && !expanded;

  return (
    <aside
      aria-label="Getting started"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 rounded-xl border border-border-subtle bg-surface-raised/95 shadow-lg backdrop-blur-md md:inset-x-auto md:bottom-6 md:left-1/2 md:w-full md:max-w-xl md:-translate-x-1/2"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-primary">Getting started</p>
          <p className="text-xs text-ink-secondary">
            {doneCount} of {ONBOARDING_STEPS.length} done
          </p>
        </div>
        <div className="flex items-center gap-1">
          {doneCount >= 2 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="cursor-pointer rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
              aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            >
              {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="cursor-pointer rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-1 w-full bg-surface-inset">
        <div
          className="h-full bg-accent/70 transition-[width] duration-300"
          style={{ width: `${(doneCount / ONBOARDING_STEPS.length) * 100}%` }}
        />
      </div>

      {collapsed ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-ink-secondary">
            Nice progress — finish the rest when you are ready.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="cursor-pointer text-xs font-semibold text-accent hover:underline"
          >
            Show steps
          </button>
        </div>
      ) : (
        <div className="p-2">
          <StepList completed={completed} />
        </div>
      )}
    </aside>
  );
};
