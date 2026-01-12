"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time upload of the local SQLite database to Supabase Storage.
 *
 * Requires in backend/.env:
 *   CLOUD_SYNC_ENABLED=true
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage: npm run upload-db-to-cloud
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cloudBackupService_1 = require("../services/cloudBackupService");
const runDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date());
const dbPath = path_1.default.resolve(process.cwd(), process.env.DATABASE_PATH || './tcg-prices.db');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const sizeMb = (fs_1.default.statSync(dbPath).size / 1024 / 1024).toFixed(1);
        console.log(`Uploading ${dbPath} (${sizeMb} MB) to Supabase...`);
        console.log('Compressing and uploading in <50 MB chunks (Supabase limit). This may take 15–30 minutes.');
        const result = yield (0, cloudBackupService_1.uploadDatabaseFileToCloud)(dbPath, runDate);
        console.log(JSON.stringify(result, null, 2));
        if (!result.uploaded) {
            process.exit(1);
        }
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
