"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanIpv4Addresses = getLanIpv4Addresses;
const os_1 = __importDefault(require("os"));
function isPrivateIpv4(address) {
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(address))
        return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address))
        return true;
    const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address);
    if (!m)
        return false;
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
}
function rankAddress(address) {
    if (address.startsWith('192.168.'))
        return 0;
    if (address.startsWith('10.'))
        return 1;
    return 2;
}
/** Local Wi‑Fi/LAN IPv4 addresses the phone can likely reach. */
function getLanIpv4Addresses() {
    const nets = os_1.default.networkInterfaces();
    const found = [];
    for (const entries of Object.values(nets)) {
        if (!entries)
            continue;
        for (const entry of entries) {
            if (entry.internal)
                continue;
            if (entry.family !== 'IPv4' && entry.family !== 4)
                continue;
            if (!isPrivateIpv4(entry.address))
                continue;
            if (entry.address.startsWith('169.254.'))
                continue;
            found.push(entry.address);
        }
    }
    return [...new Set(found)].sort((a, b) => rankAddress(a) - rankAddress(b) || a.localeCompare(b));
}
