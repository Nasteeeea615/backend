"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpLogger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
/**
 * Конфигурация логгера с Winston
 */
// Определяем уровни логирования
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};
// Определяем цвета для каждого уровня
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
};
winston_1.default.addColors(colors);
// Определяем формат логов
const format = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json());
// Формат для консоли (более читаемый)
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize({ all: true }), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}${info.stack ? '\n' + info.stack : ''}`));
// Определяем транспорты (куда писать логи)
const transports = [
    // Консоль
    new winston_1.default.transports.Console({
        format: consoleFormat,
    }),
];
// Файловые транспорты отключены в production (используем только console логи)
// Создаем logger
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    levels,
    format,
    transports,
    // Не выходить из процесса при ошибке
    exitOnError: false,
});
/**
 * Middleware для логирования HTTP запросов
 */
const httpLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.url} ${res.statusCode} - ${duration}ms`;
        if (res.statusCode >= 500) {
            logger.error(message);
        }
        else if (res.statusCode >= 400) {
            logger.warn(message);
        }
        else {
            logger.http(message);
        }
    });
    next();
};
exports.httpLogger = httpLogger;
exports.default = logger;
//# sourceMappingURL=logger.js.map