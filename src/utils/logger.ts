const COLORS = {
    reset: '\x1b[0m',
    grey: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug' | 'event' | 'worker';

const LEVEL_CONFIG: Record<LogLevel, { color: string; icon: string; label: string }> = {
    info: { color: COLORS.blue, icon: 'ℹ', label: 'INFO   ' },
    success: { color: COLORS.green, icon: '✅', label: 'SUCCESS' },
    warn: { color: COLORS.yellow, icon: '⚠️', label: 'WARN   ' },
    error: { color: COLORS.red, icon: '❌', label: 'ERROR  ' },
    debug: { color: COLORS.grey, icon: '🔍', label: 'DEBUG  ' },
    event: { color: COLORS.magenta, icon: '📡', label: 'EVENT  ' },
    worker: { color: COLORS.cyan, icon: '⚙️', label: 'WORKER ' },
};

function formatTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(level: LogLevel, context: string, message: string, meta?: unknown): void {
    const isDev = process.env.NODE_ENV !== 'production';
    if (level === 'debug' && !isDev) return;

    const cfg = LEVEL_CONFIG[level];
    const ts = `${COLORS.grey}${formatTimestamp()}${COLORS.reset}`;
    const lvl = `${cfg.color}${COLORS.bold}[${cfg.label}]${COLORS.reset}`;
    const ctx = `${COLORS.grey}[${context}]${COLORS.reset}`;
    const msg = `${cfg.icon}  ${message}`;

    if (meta !== undefined) {
        console.log(`${ts} ${lvl} ${ctx} ${msg}`, meta);
    } else {
        console.log(`${ts} ${lvl} ${ctx} ${msg}`);
    }
}

export const logger = {
    info: (ctx: string, msg: string, meta?: unknown) => log('info', ctx, msg, meta),
    success: (ctx: string, msg: string, meta?: unknown) => log('success', ctx, msg, meta),
    warn: (ctx: string, msg: string, meta?: unknown) => log('warn', ctx, msg, meta),
    error: (ctx: string, msg: string, meta?: unknown) => log('error', ctx, msg, meta),
    debug: (ctx: string, msg: string, meta?: unknown) => log('debug', ctx, msg, meta),
    event: (ctx: string, msg: string, meta?: unknown) => log('event', ctx, msg, meta),
    worker: (ctx: string, msg: string, meta?: unknown) => log('worker', ctx, msg, meta),
};
