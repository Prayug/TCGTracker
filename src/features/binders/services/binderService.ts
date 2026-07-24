import { env } from '../../../config/env';
import type { Binder, BinderPlan, ConstraintOptions } from '../types';

const API = () => env.apiUrl;

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tcgtracker_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...getAuthHeaders(),
    ...(options?.headers as Record<string, string>),
  };
  const res = await fetch(`${API()}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface PlanRequest {
  prompt: string;
  budgetDollars?: number;
  pokemonTypes?: string[];
  rarityPreferences?: string[];
  eraBias?: string;
  specificSets?: string[];
  excludeSets?: string[];
  themeKeywords?: string[];
  compositionRules?: string[];
  maxSingleCardPrice?: number;
}

export const binderService = {
  async getConstraints(): Promise<ConstraintOptions> {
    return request('/api/binders/plan/constraints');
  },

  async generatePlan(data: PlanRequest): Promise<BinderPlan> {
    const res = await request<{ plan: BinderPlan }>('/api/binders/plan', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.plan;
  },

  async listBinders(): Promise<Binder[]> {
    const res = await request<{ binders: Binder[] }>('/api/binders');
    return res.binders;
  },

  async getBinder(id: number): Promise<Binder> {
    const res = await request<{ binder: Binder }>(`/api/binders/${id}`);
    return res.binder;
  },

  async createBinder(data: {
    name?: string;
    game?: string;
    themeDescription?: string;
    budgetCents?: number;
    constraintsJson?: string;
    slots?: { pageNumber: number; slotPosition: number; cardId: string; cardSnapshot?: string; marketPriceCents?: number }[];
  }): Promise<Binder> {
    const res = await request<{ binder: Binder }>('/api/binders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.binder;
  },

  async updateBinder(id: number, data: Partial<Binder>): Promise<Binder> {
    const res = await request<{ binder: Binder }>(`/api/binders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.binder;
  },

  async deleteBinder(id: number): Promise<void> {
    await request(`/api/binders/${id}`, { method: 'DELETE' });
  },

  async commitToVault(id: number): Promise<number> {
    const res = await request<{ cardsAdded: number }>(`/api/binders/${id}/commit/vault`, { method: 'POST' });
    return res.cardsAdded;
  },

  async commitToWishlist(id: number): Promise<{ cardId: string; cardSnapshot: any; marketPrice: number | null }[]> {
    const res = await request<{ cards: { cardId: string; cardSnapshot: any; marketPrice: number | null }[] }>(
      `/api/binders/${id}/commit/wishlist`, { method: 'POST' }
    );
    return res.cards;
  },

  async updateSlot(binderId: number, slotId: number, data: {
    cardId?: string;
    cardSnapshot?: string;
    marketPriceCents?: number;
    notes?: string;
  }): Promise<Binder> {
    const res = await request<{ binder: Binder }>(`/api/binders/${binderId}/slots/${slotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.binder;
  },

  async refreshBinder(id: number): Promise<{ binder: Binder; plan: BinderPlan }> {
    return request(`/api/binders/${id}/refresh`, { method: 'POST' });
  },
};
