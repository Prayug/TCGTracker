import { useState, useCallback } from 'react';
import type { Binder, BinderPlan, ConstraintOptions } from '../types';
import { binderService, type PlanRequest } from '../services/binderService';

export function useBinderPlanner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BinderPlan | null>(null);
  const [constraintOptions, setConstraintOptions] = useState<ConstraintOptions | null>(null);
  const [binders, setBinders] = useState<Binder[]>([]);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);

  const fetchConstraints = useCallback(async () => {
    try {
      const options = await binderService.getConstraints();
      setConstraintOptions(options);
      return options;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const generatePlan = useCallback(async (data: PlanRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await binderService.generatePlan(data);
      setPlan(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const listBinders = useCallback(async () => {
    try {
      const result = await binderService.listBinders();
      setBinders(result);
      return result;
    } catch (err: any) {
      // Guests get 401 — keep empty list without blocking the planner.
      const msg = String(err?.message || '');
      if (!msg.includes('401') && !msg.includes('No token')) {
        setError(msg);
      }
      return [];
    }
  }, []);

  const createBinderWithPlan = useCallback(async (name: string, planToSave?: BinderPlan) => {
    const p = planToSave || plan;
    if (!p) return null;
    setSaving(true);
    setError(null);
    try {
      const slots = p.slots.map((card, i) => ({
        pageNumber: 1,
        slotPosition: i,
        cardId: card.cardId,
        cardSnapshot: JSON.stringify(card),
        marketPriceCents: card.marketPrice ? Math.round(card.marketPrice * 100) : undefined,
      }));

      const binder = await binderService.createBinder({
        name,
        game: 'pokemon',
        themeDescription: p.originalPrompt,
        budgetCents: p.totalCost > 0 ? p.totalCost : undefined,
        constraintsJson: JSON.stringify(p.constraints),
        slots,
      });

      await listBinders();
      return binder;
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('No token')) {
        setError('Sign in to save binders to your account. You can still generate plans as a guest.');
      } else {
        setError(msg);
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [plan, listBinders]);

  const deleteBinder = useCallback(async (id: number) => {
    try {
      await binderService.deleteBinder(id);
      setBinders(prev => prev.filter(b => b.id !== id));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const commitToVault = useCallback(async (id: number) => {
    setCommitting(true);
    try {
      const count = await binderService.commitToVault(id);
      return count;
    } catch (err: any) {
      setError(err.message);
      return 0;
    } finally {
      setCommitting(false);
    }
  }, []);

  const commitToWishlist = useCallback(async (id: number) => {
    setCommitting(true);
    try {
      const cards = await binderService.commitToWishlist(id);
      return cards;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setCommitting(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    loading,
    saving,
    committing,
    error,
    plan,
    setPlan,
    constraintOptions,
    binders,
    fetchConstraints,
    generatePlan,
    createBinderWithPlan,
    listBinders,
    deleteBinder,
    commitToVault,
    commitToWishlist,
    setError,
    clearError,
  };
}
