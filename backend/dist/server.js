"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
exports.shutdown = shutdown;
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
let server = null;
function startServer(app) {
    server = app.listen(env_1.env.port, () => {
        logger_1.logger.info(`TCGTracker Backend server running on http://${env_1.env.host}:${env_1.env.port}`);
        logger_1.logger.info(`Price data updates scheduled daily at 2:00 AM EST`);
        logger_1.logger.info(`API documentation available at http://${env_1.env.host}:${env_1.env.port}/api-docs`);
        logger_1.logger.info(`Environment: ${env_1.env.nodeEnv}`);
        void Promise.resolve().then(() => __importStar(require('./services/ebayBrowseClient'))).then(({ probeEbayBrowseAuth, isEbayBrowseConfigured }) => {
            if (!isEbayBrowseConfigured())
                return;
            void probeEbayBrowseAuth().then((probe) => {
                if (probe.ok) {
                    logger_1.logger.info('eBay Browse API authenticated', { sandbox: probe.sandbox });
                }
                else {
                    logger_1.logger.warn('eBay Browse API not usable yet', { sandbox: probe.sandbox, error: probe.error });
                }
            });
        });
    });
    return server;
}
function shutdown(signal) {
    logger_1.logger.info(`${signal} received — shutting down gracefully`);
    if (server) {
        server.close(() => {
            logger_1.logger.info('HTTP server closed');
            process.exit(0);
        });
        setTimeout(() => {
            logger_1.logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    }
    else {
        process.exit(0);
    }
}
