import {
  HORIZON_HISTORY_REQUIREMENTS,
  isHorizonSupported,
  isHorizonExperimental,
  windowToHorizonDays,
  type HorizonSupportStatus,
} from '../horizonSupport';

function status(historyDays: number): HorizonSupportStatus {
  const supported: HorizonSupportStatus['supported'] = [];
  const experimental: HorizonSupportStatus['experimental'] = [];
  const unsupported: HorizonSupportStatus['unsupported'] = [];
  for (const h of [7, 30, 90, 180, 365] as const) {
    const need = HORIZON_HISTORY_REQUIREMENTS[h];
    if (historyDays >= need) supported.push(h);
    else if (historyDays >= Math.floor(need * 0.55)) experimental.push(h);
    else unsupported.push(h);
  }
  return {
    historyDays,
    historyMinDate: null,
    historyMaxDate: null,
    supported,
    experimental,
    unsupported,
    requirements: { ...HORIZON_HISTORY_REQUIREMENTS },
  };
}

describe('horizonSupport', () => {
  it('marks 180/365 unsupported with ~104 days of history', () => {
    const s = status(104);
    expect(isHorizonSupported(s, 7)).toBe(true);
    expect(isHorizonSupported(s, 30)).toBe(true);
    expect(isHorizonExperimental(s, 90)).toBe(true);
    expect(s.unsupported).toContain(180);
    expect(s.unsupported).toContain(365);
  });

  it('supports 90d once history is long enough', () => {
    const s = status(130);
    expect(isHorizonSupported(s, 90)).toBe(true);
    expect(isHorizonExperimental(s, 180)).toBe(true);
  });

  it('maps window strings to days', () => {
    expect(windowToHorizonDays('7d')).toBe(7);
    expect(windowToHorizonDays('365d')).toBe(365);
  });
});
