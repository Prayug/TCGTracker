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
const node_cron_1 = __importDefault(require("node-cron"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const priceHistory_1 = __importDefault(require("./routes/priceHistory"));
const cardSearch_1 = __importDefault(require("./routes/cardSearch"));
const enhancedPacks_1 = __importDefault(require("./routes/enhancedPacks"));
const database_1 = require("./db/database");
const migrations_1 = require("./db/migrations");
const dataFetcher_1 = require("./services/dataFetcher");
const env_1 = require("./config/env");
const swagger_1 = require("./config/swagger");
const security_1 = require("./middleware/security");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
const authService_1 = require("./services/authService");
const alertService_1 = require("./services/alertService");
const portfolioService_1 = require("./services/portfolioService");
const auth_1 = require("./routes/auth");
const alerts_1 = require("./routes/alerts");
const portfolio_1 = require("./routes/portfolio");
const app = (0, express_1.default)();
const port = env_1.env.port;
// Security middleware
app.use((0, security_1.securityMiddleware)());
app.use((0, security_1.corsMiddleware)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Request logging
app.use(logger_1.requestLogger);
// Rate limiting
app.use('/api/', rateLimiter_1.apiLimiter);
// Initialize the database and services
logger_1.logger.info('Initializing database...');
(0, database_1.initializeDatabase)();
const db = (0, database_1.getDb)();
// Initialize set code service on startup (before migrations to ensure it's ready)
const setCodeService_1 = require("./services/setCodeService");
logger_1.logger.info('Initializing set code service...');
// Initialize with retry logic
const initializeSetCodeService = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            yield setCodeService_1.setCodeService.initialize();
            logger_1.logger.info('✅ Set code service initialized successfully');
            return;
        }
        catch (error) {
            logger_1.logger.error(`Failed to initialize set code service (attempt ${i + 1}/${retries})`, {
                error: error.message
            });
            if (i < retries - 1) {
                const delay = (i + 1) * 2000; // 2s, 4s, 6s
                logger_1.logger.info(`Retrying in ${delay}ms...`);
                yield new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    logger_1.logger.error('❌ CRITICAL: Failed to initialize set code service after all retries. Image loading will be impaired.');
});
initializeSetCodeService();
// Run database migrations before creating services
(0, migrations_1.runMigrations)(db)
    .then(() => {
    // Services are created after migrations complete
    const authService = new authService_1.AuthService(db);
    const alertService = new alertService_1.AlertService(db);
    const portfolioService = new portfolioService_1.PortfolioService(db);
    // Set up routes after services are ready
    setupRoutes(authService, alertService, portfolioService);
})
    .catch((error) => {
    logger_1.logger.error('Failed to run migrations', { error });
    process.exit(1);
});
// Move route setup to a function that gets called after migrations
function setupRoutes(authService, alertService, portfolioService) {
    // API Documentation
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
    logger_1.logger.info(`API Documentation available at http://${env_1.env.host}:${port}/api-docs`);
    // Schedule daily data updates at 2 AM
    node_cron_1.default.schedule('0 2 * * *', () => __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.info('Running scheduled daily price data update...');
        try {
            yield (0, dataFetcher_1.updatePriceData)();
            logger_1.logger.info('Daily price data update completed');
        }
        catch (error) {
            logger_1.logger.error('Failed to update price data', { error: error.message });
        }
    }), {
        timezone: "America/New_York"
    });
    // Run initial data update on startup (after a short delay)
    if (env_1.env.isProduction) {
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('Running initial price data update...');
            try {
                yield (0, dataFetcher_1.updatePriceData)();
            }
            catch (error) {
                logger_1.logger.error('Failed initial price update', { error: error.message });
            }
        }), 5000);
    }
    // API Routes
    app.use('/api/auth', rateLimiter_1.authLimiter, (0, auth_1.createAuthRouter)(authService));
    app.use('/api/alerts', (0, alerts_1.createAlertsRouter)(alertService));
    app.use('/api/portfolio', (0, portfolio_1.createPortfolioRouter)(portfolioService));
    app.use('/api/prices', priceHistory_1.default);
    app.use('/api/cards', cardSearch_1.default);
    app.use('/api/packs', enhancedPacks_1.default);
    // Manual update endpoint (admin only in production)
    app.post('/api/update', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            logger_1.logger.info('Manual price data update requested');
            (0, dataFetcher_1.updatePriceData)(); // Don't await - let it run in background
            res.status(202).json({
                success: true,
                message: 'Data update process started in background.'
            });
        }
        catch (error) {
            logger_1.logger.error('Error starting manual update', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to start update process'
            });
        }
    }));
    // Health check endpoint (for Docker)
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
    });
    app.get('/api/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: env_1.env.nodeEnv
        });
    });
    // Get server status
    app.get('/api/status', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            res.json({
                status: 'running',
                timestamp: new Date().toISOString(),
                environment: env_1.env.nodeEnv,
                version: '1.0.0',
                scheduledTasks: {
                    dataUpdate: 'Daily at 2:00 AM EST'
                },
                endpoints: {
                    auth: '/api/auth',
                    alerts: '/api/alerts',
                    prices: '/api/prices',
                    cards: '/api/cards',
                    packs: '/api/packs',
                    docs: '/api-docs',
                    health: '/api/health'
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting status', { error: error.message });
            res.status(500).json({
                status: 'error',
                error: 'Failed to get status'
            });
        }
    }));
    app.get('/', (req, res) => {
        res.json({
            message: 'TCGTracker Backend API',
            version: '1.0.0',
            documentation: '/api-docs',
            endpoints: {
                auth: '/api/auth',
                alerts: '/api/alerts',
                prices: '/api/prices',
                cards: '/api/cards',
                packs: '/api/packs',
                status: '/api/status',
                health: '/api/health'
            }
        });
    });
    // 404 handler
    app.use(errorHandler_1.notFoundHandler);
    // Global error handler
    app.use(errorHandler_1.errorHandler);
    app.listen(port, () => {
        logger_1.logger.info(`🚀 TCGTracker Backend server running on http://${env_1.env.host}:${port}`);
        logger_1.logger.info(`📈 Price data updates scheduled daily at 2:00 AM EST`);
        logger_1.logger.info(`📚 API documentation available at http://${env_1.env.host}:${port}/api-docs`);
        logger_1.logger.info(`🔒 Security features enabled: Helmet, CORS, Rate Limiting`);
        logger_1.logger.info(`Environment: ${env_1.env.nodeEnv}`);
    });
}
