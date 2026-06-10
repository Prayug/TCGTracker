"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const OLD_ENV = process.env;
(0, globals_1.beforeEach)(() => {
    globals_1.jest.resetModules();
    process.env = Object.assign({}, OLD_ENV);
    globals_1.jest.spyOn(process, 'exit').mockImplementation((() => { }));
    globals_1.jest.spyOn(console, 'error').mockImplementation(() => { });
    globals_1.jest.spyOn(console, 'warn').mockImplementation(() => { });
});
(0, globals_1.afterAll)(() => {
    process.env = OLD_ENV;
    globals_1.jest.restoreAllMocks();
});
(0, globals_1.describe)('env validation', () => {
    (0, globals_1.it)('parses valid environment variables successfully', () => {
        process.env.JWT_SECRET = 'a'.repeat(32);
        process.env.NODE_ENV = 'development';
        (0, globals_1.expect)(() => {
            require('../env');
        }).not.toThrow();
    });
    (0, globals_1.it)('rejects missing JWT_SECRET (less than 32 chars)', () => {
        process.env.JWT_SECRET = 'short';
        process.env.NODE_ENV = 'development';
        (0, globals_1.expect)(() => {
            require('../env');
        }).toThrow();
    });
    (0, globals_1.it)('rejects invalid NODE_ENV', () => {
        process.env.JWT_SECRET = 'a'.repeat(32);
        process.env.NODE_ENV = 'invalid';
        (0, globals_1.expect)(() => {
            require('../env');
        }).toThrow();
    });
});
