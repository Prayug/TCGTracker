import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';

export interface BinderRow {
  id: number;
  user_id: number;
  name: string;
  game: string;
  pages: number;
  slots_per_page: number;
  theme_description: string | null;
  budget_cents: number | null;
  constraints_json: string | null;
  total_cost_cents: number | null;
  created_at: string;
  updated_at: string;
}

export interface BinderSlotRow {
  id: number;
  binder_id: number;
  page_number: number;
  slot_position: number;
  card_id: string;
  card_snapshot: string | null;
  market_price_cents: number | null;
  notes: string | null;
  created_at: string;
}

export interface BinderWithSlots extends BinderRow {
  slots: BinderSlotRow[];
}

export interface CreateBinderInput {
  name?: string;
  game?: string;
  pages?: number;
  slots_per_page?: number;
  theme_description?: string;
  budget_cents?: number;
  constraints_json?: string;
}

export interface SlotInput {
  page_number: number;
  slot_position: number;
  card_id: string;
  card_snapshot?: string;
  market_price_cents?: number;
  notes?: string;
}

export class BinderService {
  constructor(private db: Database) {}

  async createBinder(userId: number, input: CreateBinderInput, slots?: SlotInput[]): Promise<BinderWithSlots> {
    const { lastID } = await runDb(
      this.db,
      `INSERT INTO binders (user_id, name, game, pages, slots_per_page, theme_description, budget_cents, constraints_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.name ?? 'My Binder',
        input.game ?? 'pokemon',
        input.pages ?? 1,
        input.slots_per_page ?? 9,
        input.theme_description ?? null,
        input.budget_cents ?? null,
        input.constraints_json ?? null,
      ]
    );

    if (slots && slots.length > 0) {
      for (const slot of slots) {
        await runDb(
          this.db,
          `INSERT INTO binder_slots (binder_id, page_number, slot_position, card_id, card_snapshot, market_price_cents, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            lastID,
            slot.page_number,
            slot.slot_position,
            slot.card_id,
            slot.card_snapshot ?? null,
            slot.market_price_cents ?? null,
            slot.notes ?? null,
          ]
        );
      }
    }

    return this.getBinderWithSlots(lastID, userId) as Promise<BinderWithSlots>;
  }

  async getBinder(binderId: number, userId: number): Promise<BinderRow | undefined> {
    return getDbRow<BinderRow>(
      this.db,
      'SELECT * FROM binders WHERE id = ? AND user_id = ?',
      [binderId, userId]
    );
  }

  async getBinderWithSlots(binderId: number, userId: number): Promise<BinderWithSlots | undefined> {
    const binder = await this.getBinder(binderId, userId);
    if (!binder) return undefined;

    const slots = await allDbRows<BinderSlotRow>(
      this.db,
      'SELECT * FROM binder_slots WHERE binder_id = ? ORDER BY page_number, slot_position',
      [binderId]
    );

    return { ...binder, slots };
  }

  async listBinders(userId: number): Promise<BinderRow[]> {
    return allDbRows<BinderRow>(
      this.db,
      'SELECT * FROM binders WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
  }

  async updateBinder(
    binderId: number,
    userId: number,
    updates: Partial<BinderRow>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    const allowedFields = ['name', 'game', 'pages', 'slots_per_page', 'theme_description', 'budget_cents', 'constraints_json', 'total_cost_cents'];

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(binderId, userId);

    await runDb(
      this.db,
      `UPDATE binders SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
  }

  async deleteBinder(binderId: number, userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM binders WHERE id = ? AND user_id = ?', [binderId, userId]);
  }

  async updateSlot(
    slotId: number,
    binderId: number,
    userId: number,
    updates: Partial<BinderSlotRow>
  ): Promise<void> {
    const binder = await this.getBinder(binderId, userId);
    if (!binder) throw new Error('Binder not found');

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.card_id !== undefined) {
      fields.push('card_id = ?');
      values.push(updates.card_id);
    }
    if (updates.card_snapshot !== undefined) {
      fields.push('card_snapshot = ?');
      values.push(updates.card_snapshot);
    }
    if (updates.market_price_cents !== undefined) {
      fields.push('market_price_cents = ?');
      values.push(updates.market_price_cents);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) return;

    values.push(slotId);
    await runDb(this.db, `UPDATE binder_slots SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async commitToVault(binderId: number, userId: number): Promise<number> {
    const binder = await this.getBinderWithSlots(binderId, userId);
    if (!binder) throw new Error('Binder not found');

    let added = 0;
    for (const slot of binder.slots) {
      if (!slot.card_id) continue;
      const snapshot = slot.card_snapshot ? JSON.parse(slot.card_snapshot) : {};
      const cardName = snapshot.cardName || snapshot.name || slot.card_id;

      await runDb(
        this.db,
        `INSERT INTO user_collections
           (user_id, card_id, card_name, quantity, purchase_price, condition, notes, card_data)
         VALUES (?, ?, ?, 1, ?, 'NM', ?, ?)
         ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
           quantity = quantity + 1,
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          slot.card_id,
          cardName,
          slot.market_price_cents ? slot.market_price_cents / 100 : null,
          `Added from binder: ${binder.name}`,
          slot.card_snapshot ?? null,
        ]
      );
      added++;
    }

    return added;
  }

  async commitToWishlist(binderId: number, userId: number): Promise<BinderSlotRow[]> {
    const binder = await this.getBinderWithSlots(binderId, userId);
    if (!binder) throw new Error('Binder not found');
    return binder.slots.filter(s => s.card_id);
  }

  async getSlot(slotId: number): Promise<BinderSlotRow | undefined> {
    return getDbRow<BinderSlotRow>(
      this.db,
      'SELECT * FROM binder_slots WHERE id = ?',
      [slotId]
    );
  }
}
