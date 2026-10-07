#!/usr/bin/env node
const http = require('http');
const fixture = require('./money-flow-fixture.cjs');

const port = Number(process.env.PORT || 3001);

function normalizeDays(raw) {
  const n = Number(raw);
  if (n === 90) return 90;
  if (n === 30) return 30;
  return 7;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${port}`);
  if (url.pathname === '/api/prices/money-flow') {
    const days = normalizeDays(url.searchParams.get('days'));
    const body = {
      ...fixture,
      days,
      generatedAt: new Date().toISOString(),
      headline: {
        ...fixture.headline,
        windowDays: days,
        summary:
          days === 90
            ? 'Longer tape: Vintage still leads · modern raw soft'
            : days === 30
              ? 'Vintage still ahead · PSA 10 lead softens on 30d'
              : fixture.headline.summary,
        rawSampleSize: days === 90 ? 96 : days === 30 ? 88 : fixture.headline.rawSampleSize,
        slabSampleSize: days === 90 ? 62 : days === 30 ? 56 : fixture.headline.slabSampleSize,
      },
      summary: {
        ...fixture.summary,
        trackedCount:
          days === 90 ? 158 : days === 30 ? 144 : fixture.summary.trackedCount,
      },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mock: 'money-flow' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`money-flow mock listening on :${port}`);
});
