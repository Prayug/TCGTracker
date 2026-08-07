"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const horizonSupport_1 = require("../horizonSupport");
function status(historyDays) {
    const supported = [];
    const experimental = [];
    const unsupported = [];
    for (const h of [7, 30, 90, 180, 365]) {
        const need = horizonSupport_1.HORIZON_HISTORY_REQUIREMENTS[h];
        if (historyDays >= need)
            supported.push(h);
        else if (historyDays >= Math.floor(need * 0.55))
            experimental.push(h);
        else
            unsupported.push(h);
    }
    return {
        historyDays,
        historyMinDate: null,
        historyMaxDate: null,
        supported,
        experimental,
        unsupported,
        requirements: { ...horizonSupport_1.HORIZON_HISTORY_REQUIREMENTS },
    };
}
describe('horizonSupport', () => {
    it('marks 180/365 unsupported with ~104 days of history', () => {
        const s = status(104);
        expect((0, horizonSupport_1.isHorizonSupported)(s, 7)).toBe(true);
        expect((0, horizonSupport_1.isHorizonSupported)(s, 30)).toBe(true);
        expect((0, horizonSupport_1.isHorizonExperimental)(s, 90)).toBe(true);
        expect(s.unsupported).toContain(180);
        expect(s.unsupported).toContain(365);
    });
    it('supports 90d once history is long enough', () => {
        const s = status(130);
        expect((0, horizonSupport_1.isHorizonSupported)(s, 90)).toBe(true);
        expect((0, horizonSupport_1.isHorizonExperimental)(s, 180)).toBe(true);
    });
    it('maps window strings to days', () => {
        expect((0, horizonSupport_1.windowToHorizonDays)('7d')).toBe(7);
        expect((0, horizonSupport_1.windowToHorizonDays)('365d')).toBe(365);
    });
});
