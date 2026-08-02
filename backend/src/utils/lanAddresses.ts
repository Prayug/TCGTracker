import os from 'os';

function isPrivateIpv4(address: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(address)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 16 && second <= 31;
}

function rankAddress(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  return 2;
}

/** Local Wi‑Fi/LAN IPv4 addresses the phone can likely reach. */
export function getLanIpv4Addresses(): string[] {
  const nets = os.networkInterfaces();
  const found: string[] = [];

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.internal) continue;
      if (entry.family !== 'IPv4' && (entry.family as unknown) !== 4) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      if (entry.address.startsWith('169.254.')) continue;
      found.push(entry.address);
    }
  }

  return [...new Set(found)].sort((a, b) => rankAddress(a) - rankAddress(b) || a.localeCompare(b));
}
