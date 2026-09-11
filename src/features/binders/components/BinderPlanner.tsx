import React, { useState, useEffect } from 'react';
import { Sparkles, DollarSign, Shuffle } from 'lucide-react';
import type { BinderPlan, ConstraintOptions } from '../types';
import type { PlanRequest } from '../services/binderService';

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink-primary">Binder Planner</h2>
        <p className="text-sm text-ink-muted">Describe your dream binder page and let AI fill it</p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="binder-prompt"
          className="flex items-center gap-2 text-sm font-semibold text-ink-secondary"
        >
          <Sparkles className="h-4 w-4 text-foil" />
          Prompt
        </label>
        <textarea
          id="binder-prompt"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            clearError();
          }}
          placeholder="e.g. warm sunny vibes, mostly fire types, mix of V and holos, under $80 ..."
          className="input w-full p-3"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="binder-budget"
            className="flex items-center gap-2 text-sm font-semibold text-ink-secondary"
          >
            <DollarSign className="h-4 w-4 text-foil" />
            Budget
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
              $
            </span>
            <input
              id="binder-budget"
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="100"
              className="input w-full py-2 pl-7 pr-3"
              min="0"
              step="5"
            />
          </div>
        </div>

        {constraintOptions?.compositionRules && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-secondary">Composition Rules</p>
            <div className="flex flex-wrap gap-1.5">
              {constraintOptions.compositionRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => handleRuleToggle(rule.id)}
                  className={`border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    selectedRules.includes(rule.id)
                      ? 'border-sticker bg-sticker text-felt-ink'
                      : 'border-border-page bg-page text-ink-muted hover:border-foil/40'
                  }`}
                  style={{ borderRadius: 'var(--radius-ui)' }}
                >
                  {rule.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {constraintOptions?.themes && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-secondary">Theme</p>
          <div className="flex flex-wrap gap-1.5">
            {constraintOptions.themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeToggle(theme.id)}
                className={`border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  selectedThemes.includes(theme.id)
                    ? 'border-sticker bg-sticker text-felt-ink'
                    : 'border-border-page bg-page text-ink-muted hover:border-foil/40'
                }`}
                style={{ borderRadius: 'var(--radius-ui)' }}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {constraintOptions?.pokemonTypes && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-secondary">Pokemon Types</p>
          <div className="flex flex-wrap gap-1.5">
            {constraintOptions.pokemonTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeToggle(type)}
                className={`border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  selectedTypes.includes(type)
                    ? 'border-sticker bg-sticker text-felt-ink'
                    : 'border-border-page bg-page text-ink-muted hover:border-foil/40'
                }`}
                style={{ borderRadius: 'var(--radius-ui)' }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {constraintOptions?.rarities && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-secondary">Rarity</p>
          <div className="flex flex-wrap gap-1.5">
            {constraintOptions.rarities.map((rarity) => (
              <button
                key={rarity}
                type="button"
                onClick={() => handleRarityToggle(rarity)}
                className={`border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  selectedRarities.includes(rarity)
                    ? 'border-sticker bg-sticker text-felt-ink'
                    : 'border-border-page bg-page text-ink-muted hover:border-foil/40'
                }`}
                style={{ borderRadius: 'var(--radius-ui)' }}
              >
                {rarity}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div
          className="border border-loss/30 bg-loss-muted p-3 text-sm text-loss"
          style={{ borderRadius: 'var(--radius-ui)' }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading || (!prompt.trim() && selectedThemes.length === 0)}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span
              className="inline-block h-4 w-4 animate-spin border-2 border-felt-ink border-t-transparent"
              style={{ borderRadius: '9999px' }}
            />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? 'Planning...' : 'Generate Plan'}
        </button>

        {plan && (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="btn-secondary"
          >
            <Shuffle className="h-4 w-4" />
            Re-roll
          </button>
        )}
      </div>

      {plan && plan.filledSlots === 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          No cards matched your constraints. Try broadening your criteria — remove some type/rarity
          filters or increase the budget.
        </div>
      )}
    </div>
  );
};
