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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_cron_1 = __importDefault(require("node-cron"));
const priceHistory_1 = __importDefault(require("./routes/priceHistory"));
const database_1 = require("./db/database");
const dataFetcher_1 = require("./services/dataFetcher");
const alertService_1 = require("./services/alertService");
const app = (0, express_1.default)();
const port = 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Initialize the database
console.log('Initializing database...');
(0, database_1.initializeDatabase)();
// Schedule daily data updates at 2 AM
node_cron_1.default.schedule('0 2 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Running scheduled daily price data update...');
    yield (0, dataFetcher_1.updatePriceData)();
}), {
    timezone: "America/New_York"
});
// Schedule price alert checks every 30 minutes
node_cron_1.default.schedule('*/30 * * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Running scheduled price alert check...');
    yield alertService_1.alertService.checkPriceAlerts();
}));
// Run initial data update on startup (after a short delay)
setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Running initial price data update...');
    yield (0, dataFetcher_1.updatePriceData)();
}), 5000);
// Run initial alert check on startup
setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Running initial price alert check...');
    yield alertService_1.alertService.checkPriceAlerts();
}), 10000);
app.use('/api/prices', priceHistory_1.default);
// Manual update endpoint
app.post('/api/update', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Manual price data update requested...');
        (0, dataFetcher_1.updatePriceData)(); // Don't await - let it run in background
        res.status(202).json({
            success: true,
            message: 'Data update process started in background.'
        });
    }
    catch (error) {
        console.error('Error starting manual update:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start update process'
        });
    }
}));
// Manual alert check endpoint
app.post('/api/check-alerts', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Manual alert check requested...');
        yield alertService_1.alertService.checkPriceAlerts();
        res.json({
            success: true,
            message: 'Price alerts checked successfully.'
        });
    }
    catch (error) {
        console.error('Error checking alerts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check alerts'
        });
    }
}));
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});
// Get server status
app.get('/api/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const alertHistory = yield alertService_1.alertService.getAlertHistory(1); // Last 24 hours
        res.json({
            status: 'running',
            timestamp: new Date().toISOString(),
            scheduledTasks: {
                dataUpdate: 'Daily at 2:00 AM EST',
                alertCheck: 'Every 30 minutes'
            },
            recentAlerts: alertHistory.length,
            endpoints: {
                prices: '/api/prices',
                manualUpdate: '/api/update',
                alertCheck: '/api/check-alerts',
                health: '/api/health'
            }
        });
    }
    catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            status: 'error',
            error: 'Failed to get status'
        });
    }
}));
app.get('/', (req, res) => {
    res.json({
        message: 'TCGTracker Backend is running!',
        version: '1.0.0',
        endpoints: {
            prices: '/api/prices',
            status: '/api/status',
            health: '/api/health'
        }
    });
});
app.listen(port, () => {
    console.log(`🚀 TCGTracker Backend server running on http://localhost:${port}`);
    console.log(`📈 Price data updates scheduled daily at 2:00 AM EST`);
    console.log(`🚨 Price alerts checked every 30 minutes`);
    console.log(`📊 API documentation available at http://localhost:${port}/api/status`);
});
