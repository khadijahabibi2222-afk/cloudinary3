/**
 * lib/logger.js — Structured logging (Winston + Morgan)
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('DB error', { err: err.message });
 *
 *   // In server.js — HTTP request logging:
 *   app.use(require('./lib/logger').httpMiddleware);
 */

const winston = require('winston');
const morgan  = require('morgan');
const path    = require('path');

const isProd = process.env.NODE_ENV === 'production';

// ── Winston logger ───────────────────────────────────────────
const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    isProd
      ? winston.format.json()                         // JSON in prod (for log aggregators)
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
            return `${timestamp} [${level}] ${message}${extra}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
    // In production also write to files (Render shows console, files are optional)
    ...(isProd ? [
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/error.log'),
        level: 'error',
        maxsize: 5_242_880,  // 5 MB
        maxFiles: 3,
      }),
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/combined.log'),
        maxsize: 10_485_760, // 10 MB
        maxFiles: 3,
      }),
    ] : []),
  ],
});

// ── Morgan HTTP middleware (feeds into Winston) ───────────────
const stream = { write: (msg) => logger.http(msg.trim()) };

logger.httpMiddleware = morgan(
  isProd
    ? ':remote-addr :method :url :status :res[content-length] - :response-time ms'
    : 'dev',
  { stream }
);

module.exports = logger;
