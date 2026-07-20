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
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Download latest/tcg-prices-latest.db from Supabase and replace the local DB file.
 * Stop the backend server before running. Restart after completion.
 *
 * Usage: npm run restore-db-from-cloud
 */
const cloudBackupService_1 = require("../src/services/cloudBackupService");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Downloading latest database from Supabase...');
        const result = yield (0, cloudBackupService_1.restoreDatabaseFromCloud)();
        console.log(JSON.stringify(result, null, 2));
        if (!result.restored) {
            process.exit(1);
        }
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
