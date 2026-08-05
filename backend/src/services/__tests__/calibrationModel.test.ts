import {
  calibrateReturn,
  biasCorrectionForHorizon,
  returnCapForHorizon,
  CalibrationModel,
} from '../returnCalibration';

function makeModel(overrides: Partial<CalibrationModel> = {}): CalibrationModel {
  return {
    horizon: 30,
    bias: 0.05,
    marketMedianReturn: 0.02,
    marketStdReturn: 0.15,
    sampleCount: 100,
    builtAt: '2026-07-01T00:00:00Z',
    buckets: [
      { signalMin: -Infinity, signalMax: -0.1, meanActualReturn: -0.01, stdActualReturn: 0.1, sampleCount: 10 },
      { signalMin: -0.1, signalMax: 0.05, meanActualReturn: 0.015, stdActualReturn: 0.08, sampleCount: 40 },
      { signalMin: 0.05, signalMax: 0.2, meanActualReturn: 0.04, stdActualReturn: 0.1, sampleCount: 35 },
      { signalMin: 0.2, signalMax: Infinity, meanActualReturn: 0.07, stdActualReturn: 0.18, sampleCount: 15 },
    ],
    ...overrides,
  };
}

describe('calibrateReturn', () => {
  it('maps a predicted return into its bucket', () => {
    const r = calibrateReturn(0.12, makeModel());
    expect(r).not.toBeNull();
    expect(r!.expectedReturn).toBeCloseTo(0.04);
    expect(r!.sampleCount).toBe(35);
  });

  it('clamps out-of-range signals to the edge buckets', () => {
    const model = makeModel();
    expect(calibrateReturn(0.99, model)!.expectedReturn).toBeCloseTo(0.07);
    expect(calibrateReturn(-0.99, model)!.expectedReturn).toBeCloseTo(-0.01);
  });

  it('returns null when no model or empty buckets', () => {
    expect(calibrateReturn(0.1, null)).toBeNull();
    expect(calibrateReturn(0.1, undefined)).toBeNull();
    expect(calibrateReturn(0.1, makeModel({ buckets: [] }))).toBeNull();
  });

  it('uses a boundary-inclusive bucket (signalMin <= x < signalMax)', () => {
    const r = calibrateReturn(0.05, makeModel());
    expect(r!.expectedReturn).toBeCloseTo(0.04);
    expect(calibrateReturn(0.2, makeModel())!.expectedReturn).toBeCloseTo(0.07);
  });
});

describe('biasCorrectionForHorizon', () => {
  it('uses the model bias directly when the horizon is modeled', () => {
    const models = { 30: makeModel() };
    expect(biasCorrectionForHorizon(30, models)).toBeCloseTo(0.05);
  });

  it('scales the nearest modeled bias by sqrt(horizon ratio)', () => {
    const models = { 30: makeModel() };
    // 90/30 = 3 -> 0.05 * sqrt(3)
    expect(biasCorrectionForHorizon(90, models)).toBeCloseTo(0.05 * Math.sqrt(3));
  });

  it('returns 0 when no model exists at all', () => {
    expect(biasCorrectionForHorizon(365, {})).toBe(0);
  });
});

describe('returnCapForHorizon', () => {
  it('caps at |median| + 3*std when a model exists', () => {
    const cap = returnCapForHorizon(30, makeModel(), 0.25);
    expect(cap).toBeCloseTo(Math.abs(0.02) + 0.15 * 3);
  });

  it('never caps below the fallback', () => {
    const model = makeModel({ marketMedianReturn: 0, marketStdReturn: 0.01 });
    expect(returnCapForHorizon(30, model, 0.25)).toBe(0.25);
    expect(returnCapForHorizon(30, null, 0.45)).toBe(0.45);
  });
});
