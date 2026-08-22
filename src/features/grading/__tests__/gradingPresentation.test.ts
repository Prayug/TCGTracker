import { describe, expect, it } from 'vitest';
import {
  categorySummary,
  displayCardName,
  formatCenteringSplit,
  formatScore,
  humanCategoryNarrative,
  isDefectCrop,
  isProofOrDebugCrop,
  isUnidentifiedCard,
  limitingCategoryKey,
  photoQualityCaption,
  psaWorthItCopy,
  rankedCategories,
  selectEvidenceCrops,
  wearMarkBoxes,
  whyThisGrade,
} from '../gradingPresentation';
import { GradingResult } from '../../../types/grading';

function result(partial: Partial<GradingResult>): GradingResult {
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
    timestamp: '',
    ...partial,
  };
}

describe('displayCardName', () => {
  it('treats placeholder names as unidentified', () => {
    expect(isUnidentifiedCard('Graded Card')).toBe(true);
    expect(isUnidentifiedCard('Unknown Card')).toBe(true);
    expect(displayCardName('Graded Card')).toBe('Unidentified card');
  });

  it('keeps a real catalog name', () => {
    expect(displayCardName('Thundurus 191/182')).toBe('Thundurus 191/182');
  });
});

describe('whyThisGrade', () => {
  it('names crease damage as the limiter even when centering is high', () => {
    expect(whyThisGrade(result({}))).toMatch(/crease/i);
    expect(whyThisGrade(result({}))).toMatch(/Centering is fine/);
  });

  it('falls back when scores are uniformly high', () => {
    const r = result({
      centering: {
        score: 9.5,
        details: '',
        defects: [],
        deviations: { leftRight: 52, topBottom: 51 },
      },
      corners: { score: 9.2, details: '', defects: [] },
      edges: { score: 9.0, details: '', defects: [] },
      surface: { score: 9.1, details: '', defects: [] },
      grade: 9,
      gradeLabel: 'Mint',
    });
    expect(whyThisGrade(r)).toMatch(/No major issues/);
  });
});

describe('limitingCategoryKey', () => {
  it('breaks a score tie toward crease/fold damage', () => {
    expect(limitingCategoryKey(result({}))).toBe('surface');
  });
});

describe('rankedCategories', () => {
  it('sorts worst-first and marks the limiter', () => {
    const rows = rankedCategories(result({}));
    expect(rows[0].key).toBe('surface');
    expect(rows[0].limiting).toBe(true);
    expect(rows.find((r) => r.key === 'centering')?.summary).toBe('No centering issues');
  });
});

describe('humanCategoryNarrative', () => {
  it('strips specialist dumps and keeps a human sentence', () => {
    const text = humanCategoryNarrative('surface', {
      score: 6.1,
      details:
        'Surface specialist model - 6.1/10. Surface uniformity 3.5/10 (hotspot 3.3%, scratch index 0.003). Severe surface damage.',
      defects: ['Major crease/fold damage detected (7 lines)'],
    });
    expect(text.toLowerCase()).toContain('severe surface damage');
    expect(text.toLowerCase()).not.toContain('scratch index');
  });
});

describe('categorySummary', () => {
  it('does not use +N more language', () => {
    expect(
      categorySummary('corners', {
        score: 6.9,
        details: '',
        defects: ['Heavy whitening on top-left corner', 'Whitening on top-right'],
      })
    ).toBe('Heavy whitening on top-left corner');
  });
});

describe('photoQualityCaption', () => {
  it('describes photo quality as a band, not a pipeline percentage', () => {
    expect(photoQualityCaption(0.76)).toMatch(/moderate/i);
    expect(photoQualityCaption(0.4, true)).toMatch(/Retake/);
    expect(photoQualityCaption(0.9)).not.toMatch(/%/);
  });
});

describe('formatCenteringSplit', () => {
  it('flags splits worse than 55/45', () => {
    expect(formatCenteringSplit(58).text).toBe('58/42 (off)');
    expect(formatCenteringSplit(53).text).toBe('53/47 (acceptable)');
  });
});

describe('crop filtering', () => {
  it('drops proof and heatmap crops from the default gallery', () => {
    expect(isProofOrDebugCrop('Centering proof')).toBe(true);
    expect(isProofOrDebugCrop('Surface heatmap (red = defect zone)')).toBe(true);
    expect(isDefectCrop('Defect: Crease')).toBe(true);
    const crops = selectEvidenceCrops([
      { label: 'Centering proof', image: 'a' },
      { label: 'Full card surface', image: 'b' },
      { label: 'Defect: Scratch/scuff', image: 'c' },
      { label: 'Defect: Crease', image: 'd' },
      { label: 'Left edge defect', image: 'e' },
    ]);
    expect(crops).toHaveLength(3);
    expect(crops.every((c) => /defect/i.test(c.label))).toBe(true);
  });
});

describe('wearMarkBoxes', () => {
  it('drops inner-card boxes that would cover printed artwork', () => {
    const boxes = wearMarkBoxes(
      {
        score: 4,
        details: '',
        defects: ['Severe whitening — primarily central area (97%)'],
        crops: [
          {
            label: 'Surface heatmap (red = defect zones)',
            image: 'x',
            location: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
          },
          {
            label: 'Top-right',
            image: 'y',
            location: { x: 0.82, y: 0.02, width: 0.14, height: 0.12 },
          },
        ],
        detections: [
          {
            label: 'Severe whitening — primarily central area',
            location: { x: 0.05, y: 0.05, width: 0.86, height: 0.9 },
          },
          {
            label: 'Whitening on top-right corner',
            location: { x: 0.86, y: 0.0, width: 0.12, height: 0.1 },
          },
        ],
      },
      [],
      'edges',
      'back'
    );
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.width * b.height < 0.4)).toBe(true);
  });
});

describe('psaWorthItCopy', () => {
  it('stays silent until the card is identified', () => {
    expect(psaWorthItCopy(3.5, false)).toBeNull();
  });

  it('discourages submitting a 3.5', () => {
    expect(psaWorthItCopy(3.5, true)).toMatch(/unlikely to add value/);
  });
});

describe('formatScore', () => {
  it('keeps one decimal for half-points', () => {
    expect(formatScore(3.5)).toBe('3.5');
    expect(formatScore(9)).toBe('9');
  });
});
