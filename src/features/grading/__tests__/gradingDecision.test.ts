import { describe, expect, it } from 'vitest';
import { GradingResult } from '../../../types/grading';
import {
  buildGradeDecision,
  disputeDefect,
  formatPsaRange,
  humanizeDefect,
  isKnockoutText,
  marketplaceFromDefects,
  psaRangeFromGrade,
  snapPsaDown,
  snapPsaUp,
} from '../gradingDecision';

function result(partial: Partial<GradingResult> = {}): GradingResult {
  const cat = (score: number, defects: string[] = [], details = '') => ({
    score,
    details,
    defects,
    deviations: { leftRight: 58, topBottom: 57 },
  });
  return {
    id: '1',
    cardId: '',
    cardName: 'Graded Card',
    game: 'pokemon',
    centering: cat(9.3),
    corners: cat(6.9, ['Heavy whitening on top-left corner']),
    edges: cat(6.1, ['Heavy whitening on left edge (51%)']),
    surface: cat(
      6.1,
      ['Major crease/fold damage detected (7 lines)'],
      'Surface specialist model - 6.1/10. Scratch index 0.003. Severe surface damage.'
    ),
    totalScore: 350,
    grade: 3.5,
    gradeLabel: 'VG-EX',
    imageUrl: '',
    backImageUrl: 'back.jpg',
    timestamp: '',
    confidence: 0.76,
    ...partial,
  };
}

describe('PSA snapping', () => {
  it('maps 3.5 to a 3–4 range, never a 3.5 grade', () => {
    expect(snapPsaDown(3.5)).toBe(3);
    expect(snapPsaUp(3.5)).toBe(4);
    expect(formatPsaRange(psaRangeFromGrade(3.5, { knockout: true }))).toBe('PSA 3–4');
  });

  it('keeps PSA 1.5 as a real half-grade', () => {
    expect(snapPsaDown(1.4)).toBe(1);
    expect(snapPsaUp(1.4)).toBe(1.5);
  });
});

describe('knockouts and marketplace condition', () => {
  it('treats a crease as damaged, not HP-from-score', () => {
    expect(isKnockoutText('Major crease/fold damage detected (7 lines)')).toBe(true);
    const decision = buildGradeDecision(result({}), { identified: true });
    expect(decision.marketplace).toBe('damaged');
    expect(decision.knockout).toBe(true);
    expect(decision.recommendation).toBe('list');
    expect(decision.recommendationTitle).toMatch(/Do not submit/i);
    expect(decision.psaRangeLabel).toBe('PSA 3–4');
  });

  it('does not use a generic 0.75× multiplier as the decision', () => {
    const decision = buildGradeDecision(result({}), {
      identified: true,
      market: { raw: 25, psa: { 8: 40, 9: 55, 10: 90 } },
    });
    expect(decision.economics?.expectedUpside).toBeNull();
    expect(decision.recommendationBody).toMatch(/cannot reach/i);
  });

  it('humanizes model artifacts out of seller copy', () => {
    expect(humanizeDefect('Major crease/fold damage detected (7 lines)')).toBe(
      'Major crease/fold damage'
    );
    const decision = buildGradeDecision(result({ cardName: 'Thundurus' }), { identified: true });
    expect(decision.sellerCopy).toMatch(/Damaged/);
    expect(decision.sellerCopy).toMatch(/crease/i);
    expect(decision.sellerCopy).not.toMatch(/7 lines/);
    expect(decision.sellerCopy).toMatch(/not a professional grade/i);
  });
});

describe('identity and photo gate', () => {
  it('can say do-not-submit on a knockout without identity', () => {
    const decision = buildGradeDecision(result({ cardName: 'Graded Card' }));
    expect(decision.identified).toBe(false);
    expect(decision.recommendation).toBe('list');
    expect(decision.displayName).toBe('Unidentified card');
  });

  it('refuses a PSA estimate with no back photo', () => {
    const decision = buildGradeDecision(
      result({ backImageUrl: undefined, back: undefined, cardName: 'Thundurus' }),
      { identified: true }
    );
    expect(decision.psaEstimateAllowed).toBe(false);
    expect(decision.psaRange).toBeNull();
    expect(decision.refuseReason).toMatch(/back photo/i);
  });

  it('refuses a PSA estimate when a retake is recommended', () => {
    const decision = buildGradeDecision(
      result({ retakeRecommended: true, cardName: 'Thundurus' }),
      {
        identified: true,
      }
    );
    expect(decision.psaEstimateAllowed).toBe(false);
    expect(decision.confidence).toBe('low');
  });

  it('asks to identify when condition is high enough that money might matter', () => {
    const clean = result({
      cardName: 'Graded Card',
      grade: 9,
      gradeLabel: 'Mint',
      centering: {
        score: 9.4,
        details: '',
        defects: [],
        deviations: { leftRight: 52, topBottom: 51 },
      },
      corners: { score: 9.1, details: '', defects: [] },
      edges: { score: 9.0, details: '', defects: [] },
      surface: { score: 9.2, details: '', defects: [] },
    });
    const decision = buildGradeDecision(clean);
    expect(decision.recommendation).toBe('identify');
    expect(decision.marketplace).toBe('near-mint');
  });
});

describe('economics', () => {
  it('recommends submit when owner EV clears the fee on a clean high-spread card', () => {
    const clean = result({
      cardName: 'Umbreon VMAX',
      grade: 9.2,
      centering: {
        score: 9.5,
        details: '',
        defects: [],
        deviations: { leftRight: 52, topBottom: 51 },
      },
      corners: { score: 9.2, details: '', defects: [] },
      edges: { score: 9.1, details: '', defects: [] },
      surface: { score: 9.3, details: '', defects: [] },
      confidence: 0.9,
    });
    const decision = buildGradeDecision(clean, {
      identified: true,
      market: { raw: 200, psa: { 8: 260, 9: 340, 10: 1500 } },
    });
    expect(decision.knockout).toBe(false);
    expect(decision.showDistribution).toBe(true);
    expect(decision.economics?.highStakes).toBe(true);
    expect(decision.recommendation).toBe('submit');
    expect(decision.economics?.fee).toBeGreaterThan(70);
  });
});

describe('disputes', () => {
  it('lets the user knock out a false crease without making grading tedious', () => {
    const base = buildGradeDecision(result({ cardName: 'Thundurus' }), { identified: true });
    expect(base.marketplace).toBe('damaged');
    const disputes = disputeDefect(
      [],
      'Major crease/fold damage detected (7 lines)',
      'not-damage',
      'foil'
    );
    const adjusted = buildGradeDecision(result({ cardName: 'Thundurus' }), {
      identified: true,
      disputes,
    });
    expect(adjusted.userAdjusted).toBe(true);
    expect(adjusted.knockout).toBe(false);
    expect(adjusted.marketplace).toBe('heavily-played');
  });
});

describe('marketplaceFromDefects', () => {
  it('does not treat a high centering score as NM when a crease is present', () => {
    const r = result({});
    const decision = buildGradeDecision(r, { identified: true });
    expect(marketplaceFromDefects(r, decision.impacts)).toBe('damaged');
  });
});

describe('surface uncertainty', () => {
  it('does not let a refused surface destroy the grade', () => {
    const r = result({
      cardName: 'Thundurus',
      grade: 7.2,
      surfaceRefused: true,
      surfaceRetakeRecommended: true,
      psaRange: { low: 6, high: 8 },
      quality: {
        ok: true,
        surfaceOk: false,
        glareRatio: 0.18,
        surfaceMessage: 'Surface analysis unreliable — glare detected over 18% of the card.',
      },
      surface: {
        score: null,
        details: 'Surface analysis unreliable — glare detected over 18% of the card.',
        defects: [],
        withheld: true,
        withheldReason: 'Surface analysis unreliable — glare detected over 18% of the card.',
      },
      backImageUrl: 'back.jpg',
      confidence: 0.7,
    });
    const decision = buildGradeDecision(r, { identified: true });
    expect(decision.knockout).toBe(false);
    expect(decision.marketplace).not.toBe('damaged');
    expect(decision.surfaceUnknown).toBe(true);
    expect(decision.psaEstimateAllowed).toBe(true);
    expect(decision.psaRangeLabel).toMatch(/PSA /);
    expect(decision.confidenceReason).toMatch(/glare/i);
  });

  it('does not treat a 58% crease call as a fact that knocks the card to damaged', () => {
    const r = result({
      cardName: 'Thundurus',
      grade: 8,
      surface: {
        score: 7.4,
        details: '',
        defects: ['Possible crease or fold line (58%)'],
        detections: [
          {
            label: 'Crease or fold line',
            kind: 'crease',
            category: 'surface',
            severity: 'moderate',
            confidence: 0.58,
          },
        ],
      },
      corners: { score: 9, details: '', defects: [] },
      edges: { score: 8.5, details: '', defects: [] },
    });
    const decision = buildGradeDecision(r, { identified: true });
    expect(decision.knockout).toBe(false);
    expect(decision.marketplace).not.toBe('damaged');
  });
});
