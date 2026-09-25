import { extractChartDataBlob, parseSoldGuideSeries } from '../soldGuideHistoryParse';

describe('soldGuideHistory parser', () => {
  const sampleHtml = `
    <html><body>
    <div product-id="630417"></div>
    <script>
    chart_data = {"used":[[1606806000000,37044],[1609484400000,40279]],"graded":[[1606806000000,327500],[1609484400000,310000]],"boxonly":[]};
    </script>
    </body></html>
  `;

  it('extracts chart_data JSON', () => {
    const data = extractChartDataBlob(sampleHtml);
    expect(data).not.toBeNull();
    expect(data!.used).toHaveLength(2);
    expect(data!.graded[0][1]).toBe(327500);
  });

  it('parses ungraded and PSA10 sold-guide points in dollars', () => {
    const parsed = parseSoldGuideSeries(sampleHtml);
    expect(parsed.productId).toBe('630417');
    expect(parsed.ungraded).toHaveLength(2);
    expect(parsed.ungraded[0].price).toBeCloseTo(370.44, 2);
    expect(parsed.psa10[0].price).toBeCloseTo(3275, 1);
    expect(parsed.ungraded[0].condition).toBe('ungraded');
  });

  it('returns empty series when chart_data missing', () => {
    const parsed = parseSoldGuideSeries('<html></html>');
    expect(parsed.ungraded).toHaveLength(0);
    expect(parsed.psa10).toHaveLength(0);
  });
});
