export interface BinderCard {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  types: string;
  imageSmall: string | null;
  imageLarge: string | null;
  marketPrice: number | null;
  score: number;
  slotPosition?: number;
}

export interface BinderSlot {
  id: number;
  binderId: number;
  pageNumber: number;
  slotPosition: number;
  cardId: string;
  cardSnapshot: string | null;
  marketPriceCents: number | null;
  notes: string | null;
  createdAt: string;
}

export interface Binder {
  id: number;
  userId: number;
  name: string;
  game: string;
  pages: number;
  slotsPerPage: number;
  themeDescription: string | null;
  budgetCents: number | null;
  constraintsJson: string | null;
  totalCostCents: number | null;
  createdAt: string;
  updatedAt: string;
  slots: BinderSlot[];
}

export interface BinderPlan {
  slots: BinderCard[];
  totalCost: number;
  remainingBudget: number;
  constraints: BinderConstraints;
  originalPrompt: string;
  filledSlots: number;
  totalSlots: number;
}

export interface BinderConstraints {
  pokemonTypes?: string[];
  rarityPreferences?: string[];
  eraBias?: string;
  specificSets?: string[];
  excludeSets?: string[];
  themeKeywords?: string[];
  compositionRules?: string[];
  maxSingleCardPrice?: number;
}

export interface ThemeOption {
  id: string;
  label: string;
  types: string[];
}

export interface CompositionOption {
  id: string;
  label: string;
}

export interface ConstraintOptions {
  themes: ThemeOption[];
  pokemonTypes: string[];
  rarities: string[];
  compositionRules: CompositionOption[];
}
