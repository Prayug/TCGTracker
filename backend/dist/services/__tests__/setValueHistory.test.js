"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const setTrackerService_1 = require("../setTrackerService");
describe('trimUnreliableSetValueHistory', () => {
    it('drops leading sparse days before coverage and value look legit', () => {
        const history = [
            { date: '2026-03-28', setValue: 12.29, cardsPriced: 2 },
            { date: '2026-05-27', setValue: 2994, cardsPriced: 140 },
            { date: '2026-06-26', setValue: 3595.47, cardsPriced: 172 },
        ];
        const trimmed = (0, setTrackerService_1.trimUnreliableSetValueHistory)(history, 172);
        expect(trimmed[0].date).toBe('2026-05-27');
        expect(trimmed).toHaveLength(2);
    });
});
