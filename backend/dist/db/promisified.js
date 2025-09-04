"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbRun = dbRun;
exports.dbGet = dbGet;
exports.dbAll = dbAll;
const database_1 = require("./database");
function dbRun(sql, params = []) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err)
                reject(err);
            else
                resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}
function dbGet(sql, params = []) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
}
function dbAll(sql, params = []) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve((rows !== null && rows !== void 0 ? rows : []));
        });
    });
}
