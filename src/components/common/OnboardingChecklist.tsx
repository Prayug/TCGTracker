import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Camera, Check, LayoutGrid, LineChart, X } from 'lucide-react';

const STORAGE_KEY = 'tcg.onboarding';

export type OnboardingStep = 'browse' | 'scan' | 'vault' | 'track';

interface StepDef {
  id: OnboardingStep;
  label: string;
  to: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { id: 'browse', label: 'Browse cards', to: '/browse', icon: LayoutGrid },
  { id: 'scan', label: 'Scan a card', to: '/scanner', icon: Camera },
  { id: 'vault', label: 'Add to vault', to: '/vault', icon: BookOpen },
  { id: 'track', label: 'Track a price', to: '/prices', icon: LineChart },
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

export function markOnboardingStep(step: OnboardingStep) {
  const completed = readCompleted();
  if (completed.has(step)) return;
  completed.add(step);
  writeCompleted(completed);
  window.dispatchEvent(new CustomEvent('tcg:onboarding-update'));
}

export const OnboardingChecklist: React.FC = () => {
  const [completed, setCompleted] = useState<Set<OnboardingStep>>(() => readCompleted());
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(`${STORAGE_KEY}.dismissed`) === '1'
  );

  useEffect(() => {
    const sync = () => setCompleted(readCompleted());
    window.addEventListener('tcg:onboarding-update', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('tcg:onboarding-update', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const doneCount = STEPS.filter((s) => completed.has(s.id)).length;
  const allDone = doneCount === STEPS.length;

  if (dismissed || allDone) return null;

  const dismiss = () => {
    localStorage.setItem(`${STORAGE_KEY}.dismissed`, '1');
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Getting started"
      className="mx-4 mb-20 rounded-lg border border-border-default bg-surface-raised shadow-sm md:mx-auto md:mb-6 md:max-w-7xl"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-primary">Getting started</p>
          <p className="text-xs text-ink-muted">
            {doneCount} of {STEPS.length} done
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-primary"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="grid gap-1 p-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ id, label, to, icon: Icon }) => {
          const done = completed.has(id);
          return (
            <li key={id}>
              {done ? (
                <span className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-ink-muted">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gain-muted text-gain">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="line-through">{label}</span>
                </span>
              ) : (
                <Link
                  to={to}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-hover"
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
    </aside>
  );
};
