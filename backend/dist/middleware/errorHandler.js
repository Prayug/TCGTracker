"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = exports.AppError = void 0;
const logger_1 = require("../utils/logger");
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
const errorHandler = (err, req, res, next) => {
    let statusCode = 500;
    let message = 'Internal server error';
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
    }
    logger_1.logger.error('Error occurred', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
    });
    res.status(statusCode).json(Object.assign({ error: message }, (process.env.NODE_ENV === 'development' && { stack: err.stack })));
};
exports.errorHandler = errorHandler;
const notFoundHandler = (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.url,
    });
};
exports.notFoundHandler = notFoundHandler;
