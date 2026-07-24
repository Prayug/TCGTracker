"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinderService = void 0;
const dbAsync_1 = require("../utils/dbAsync");
class BinderService {
    constructor(db) {
        this.db = db;
    }
    async createBinder(userId, input, slots) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const { lastID } = await (0, dbAsync_1.runDb)(this.db, `INSERT INTO binders (user_id, name, game, pages, slots_per_page, theme_description, budget_cents, constraints_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            userId,
            (_a = input.name) !== null && _a !== void 0 ? _a : 'My Binder',
            (_b = input.game) !== null && _b !== void 0 ? _b : 'pokemon',
            (_c = input.pages) !== null && _c !== void 0 ? _c : 1,
            (_d = input.slots_per_page) !== null && _d !== void 0 ? _d : 9,
            (_e = input.theme_description) !== null && _e !== void 0 ? _e : null,
            (_f = input.budget_cents) !== null && _f !== void 0 ? _f : null,
            (_g = input.constraints_json) !== null && _g !== void 0 ? _g : null,
        ]);
        if (slots && slots.length > 0) {
            for (const slot of slots) {
                await (0, dbAsync_1.runDb)(this.db, `INSERT INTO binder_slots (binder_id, page_number, slot_position, card_id, card_snapshot, market_price_cents, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                    lastID,
                    slot.page_number,
                    slot.slot_position,
                    slot.card_id,
                    (_h = slot.card_snapshot) !== null && _h !== void 0 ? _h : null,
                    (_j = slot.market_price_cents) !== null && _j !== void 0 ? _j : null,
                    (_k = slot.notes) !== null && _k !== void 0 ? _k : null,
                ]);
            }
        }
        return this.getBinderWithSlots(lastID, userId);
    }
    async getBinder(binderId, userId) {
        return (0, dbAsync_1.getDbRow)(this.db, 'SELECT * FROM binders WHERE id = ? AND user_id = ?', [binderId, userId]);
    }
    async getBinderWithSlots(binderId, userId) {
        const binder = await this.getBinder(binderId, userId);
        if (!binder)
            return undefined;
        const slots = await (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM binder_slots WHERE binder_id = ? ORDER BY page_number, slot_position', [binderId]);
        return { ...binder, slots };
    }
    async listBinders(userId) {
        return (0, dbAsync_1.allDbRows)(this.db, 'SELECT * FROM binders WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    }
    async updateBinder(binderId, userId, updates) {
        const fields = [];
        const values = [];
        const allowedFields = ['name', 'game', 'pages', 'slots_per_page', 'theme_description', 'budget_cents', 'constraints_json', 'total_cost_cents'];
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0)
            return;
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(binderId, userId);
        await (0, dbAsync_1.runDb)(this.db, `UPDATE binders SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    }
    async deleteBinder(binderId, userId) {
        await (0, dbAsync_1.runDb)(this.db, 'DELETE FROM binders WHERE id = ? AND user_id = ?', [binderId, userId]);
    }
    async updateSlot(slotId, binderId, userId, updates) {
        const binder = await this.getBinder(binderId, userId);
        if (!binder)
            throw new Error('Binder not found');
        const fields = [];
        const values = [];
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
        if (fields.length === 0)
            return;
        values.push(slotId);
        await (0, dbAsync_1.runDb)(this.db, `UPDATE binder_slots SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    async commitToVault(binderId, userId) {
        var _a;
        const binder = await this.getBinderWithSlots(binderId, userId);
        if (!binder)
            throw new Error('Binder not found');
        let added = 0;
        for (const slot of binder.slots) {
            if (!slot.card_id)
                continue;
            const snapshot = slot.card_snapshot ? JSON.parse(slot.card_snapshot) : {};
            const cardName = snapshot.cardName || snapshot.name || slot.card_id;
            await (0, dbAsync_1.runDb)(this.db, `INSERT INTO user_collections
           (user_id, card_id, card_name, quantity, purchase_price, condition, notes, card_data)
         VALUES (?, ?, ?, 1, ?, 'NM', ?, ?)
         ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
           quantity = quantity + 1,
           updated_at = CURRENT_TIMESTAMP`, [
                userId,
                slot.card_id,
                cardName,
                slot.market_price_cents ? slot.market_price_cents / 100 : null,
                `Added from binder: ${binder.name}`,
                (_a = slot.card_snapshot) !== null && _a !== void 0 ? _a : null,
            ]);
            added++;
        }
        return added;
    }
    async commitToWishlist(binderId, userId) {
        const binder = await this.getBinderWithSlots(binderId, userId);
        if (!binder)
            throw new Error('Binder not found');
        return binder.slots.filter(s => s.card_id);
    }
    async getSlot(slotId) {
        return (0, dbAsync_1.getDbRow)(this.db, 'SELECT * FROM binder_slots WHERE id = ?', [slotId]);
    }
}
exports.BinderService = BinderService;
