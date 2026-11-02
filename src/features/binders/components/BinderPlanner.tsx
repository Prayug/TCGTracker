import React, { useState, useEffect } from 'react';
import {
  Shuffle,
  Flame,
  Sun,
  Snowflake,
  Droplet,
  Leaf,
  Palette,
  Moon,
  Flower2,
  Zap,
  TreePine,
  Gem,
  Crown,
  type LucideIcon,
} from 'lucide-react';
import type { BinderPlan, ConstraintOptions } from '../types';
import type { PlanRequest } from '../services/binderService';

const THEME_ICON: Record<string, LucideIcon> = {
  warm: Flame,
  sunny: Sun,
  icy: Snowflake,
  cool: Droplet,
  earthy: Leaf,
  colorful: Palette,
  dark: Moon,
  pastel: Flower2,
  neon: Zap,
  nature: TreePine,
  mystic: Gem,
  royal: Crown,
};

interface BinderPlannerProps {
  loading: boolean;
  error: string | null;
  plan: BinderPlan | null;
  constraintOptions: ConstraintOptions | null;
  generatePlan: (data: PlanRequest) => Promise<BinderPlan | null>;
  fetchConstraints: () => Promise<ConstraintOptions | null>;
  clearError: () => void;
}

export const BinderPlanner: React.FC<BinderPlannerProps> = ({
  loading,
  error,
  plan,
  constraintOptions,
  generatePlan,
  fetchConstraints,
  clearError,
}) => {
  const [prompt, setPrompt] = useState('');
  const [budget, setBudget] = useState('');
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);

  useEffect(() => {
    if (!constraintOptions) {
      void fetchConstraints();
    }
  }, [constraintOptions, fetchConstraints]);

  const handleThemeToggle = (themeId: string) => {
    setSelectedThemes((prev) =>
      prev.includes(themeId) ? prev.filter((t) => t !== themeId) : [...prev, themeId]
    );
  };

  const handleTypeToggle = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleRarityToggle = (rarity: string) => {
    setSelectedRarities((prev) =>
      prev.includes(rarity) ? prev.filter((r) => r !== rarity) : [...prev, rarity]
    );
  };

  const handleRuleToggle = (ruleId: string) => {
    setSelectedRules((prev) =>
      prev.includes(ruleId) ? prev.filter((r) => r !== ruleId) : [...prev, ruleId]
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && selectedThemes.length === 0) return;

    await generatePlan({
      prompt: prompt.trim() || `Theme: ${selectedThemes.join(', ')}`,
      budgetDollars: budget ? parseFloat(budget) : undefined,
      themeKeywords: selectedThemes.length > 0 ? selectedThemes : undefined,
      pokemonTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
      rarityPreferences: selectedRarities.length > 0 ? selectedRarities : undefined,
      compositionRules: selectedRules.length > 0 ? selectedRules : undefined,
    });
  };

  const chip = (active: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
      active
        ? 'border-ink-primary bg-ink-primary text-surface-base'
        : 'border-border-strong text-ink-secondary hover:border-ink-muted hover:text-ink-primary'
    }`;

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <fieldset className="border-t border-rule pt-3">
      <legend className="float-left mb-2 w-full text-h3">{title}</legend>
      <div className="clear-both flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2">Describe the page</h2>
        <p className="text-meta text-ink-muted">
          The planner picks real catalog cards that fit, priced at today’s market.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <label className="block" htmlFor="binder-prompt">
          <span className="mb-1 block text-[13px] font-medium">Theme</span>
          <textarea
            id="binder-prompt"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              clearError();
            }}
            placeholder="Warm colours, mostly fire types, a mix of holos and full arts"
            className="input min-h-[5rem] py-2"
            rows={3}
          />
        </label>
        <label className="block" htmlFor="binder-budget">
          <span className="mb-1 block text-[13px] font-medium">Budget</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-muted">
              $
            </span>
            <input
              id="binder-budget"
              type="number"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="No limit"
              className="input h-10 pl-7 font-mono tabular-nums"
              min="0"
              step="5"
            />
          </span>
        </label>
      </div>

      {constraintOptions?.themes ? (
        <Group title="Mood">
          {constraintOptions.themes.map((theme) => {
            const ThemeIcon = THEME_ICON[theme.id];
            const on = selectedThemes.includes(theme.id);
            return (
              <button
                key={theme.id}
                type="button"
                aria-pressed={on}
                onClick={() => handleThemeToggle(theme.id)}
                className={chip(on)}
              >
                {ThemeIcon ? <ThemeIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                {theme.label}
              </button>
            );
          })}
        </Group>
      ) : null}

      {constraintOptions?.pokemonTypes ? (
        <Group title="Types">
          {constraintOptions.pokemonTypes.map((type) => {
            const on = selectedTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={on}
                onClick={() => handleTypeToggle(type)}
                className={chip(on)}
              >
                {type}
              </button>
            );
          })}
        </Group>
      ) : null}

      {constraintOptions?.rarities ? (
        <Group title="Rarity">
          {constraintOptions.rarities.map((rarity) => {
            const on = selectedRarities.includes(rarity);
            return (
              <button
                key={rarity}
                type="button"
                aria-pressed={on}
                onClick={() => handleRarityToggle(rarity)}
                className={chip(on)}
              >
                {rarity}
              </button>
            );
          })}
        </Group>
      ) : null}

      {constraintOptions?.compositionRules ? (
        <Group title="Layout rules">
          {constraintOptions.compositionRules.map((rule) => {
            const on = selectedRules.includes(rule.id);
            return (
              <button
                key={rule.id}
                type="button"
                aria-pressed={on}
                onClick={() => handleRuleToggle(rule.id)}
                className={chip(on)}
              >
                {rule.label}
              </button>
            );
          })}
        </Group>
      ) : null}

      {error ? (
        <p
          className="border-l-2 border-loss bg-loss-muted px-3 py-2 text-[13px] text-ink-primary"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading || (!prompt.trim() && selectedThemes.length === 0)}
          className="btn-primary"
        >
          {loading ? (
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}
          {loading ? 'Planning…' : plan ? 'Plan again' : 'Plan the page'}
        </button>
        {plan ? (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="btn-secondary"
          >
            <Shuffle className="h-4 w-4" aria-hidden />
            Different picks
          </button>
        ) : null}
      </div>

      {plan && plan.filledSlots === 0 ? (
        <p className="border-l-2 border-warn bg-warn-muted px-3 py-2 text-[13px] text-ink-secondary">
          No cards matched. Remove a type or rarity, or raise the budget.
        </p>
      ) : null}
    </div>
  );
};
