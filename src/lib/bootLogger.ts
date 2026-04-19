import { isTelemetryEnabled } from './runtime-config';

type BootLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'success';

export interface BootLogEntry {
  id: number;
  elapsedMs: number;
  elapsedLabel: string;
  timestamp: string;
  level: BootLogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

declare global {
  interface Window {
    __NEWSLETTER_BOOT_LOGS__?: BootLogEntry[];
    __NEWSLETTER_DUMP_BOOT_LOGS__?: () => void;
  }
}

const BOOT_LOG_QUERY_PARAM = 'bootLog';
const BOOT_LOG_STORAGE_KEY = 'newsletter:boot-log-enabled';
const MAX_LOG_ENTRIES = 300;
const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

function getElapsedMs() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
}

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1000) {
    return `+${elapsedMs.toFixed(1)}ms`;
  }

  return `+${(elapsedMs / 1000).toFixed(2)}s`;
}

function formatTimestamp() {
  return new Date().toISOString();
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

function readDebugPreference() {
  if (typeof window === 'undefined') {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const queryValue = searchParams.get(BOOT_LOG_QUERY_PARAM)?.toLowerCase();

  if (queryValue === '1' || queryValue === 'true' || queryValue === 'yes') {
    window.localStorage.setItem(BOOT_LOG_STORAGE_KEY, '1');
    return true;
  }

  if (queryValue === '0' || queryValue === 'false' || queryValue === 'no') {
    window.localStorage.removeItem(BOOT_LOG_STORAGE_KEY);
    return false;
  }

  return window.localStorage.getItem(BOOT_LOG_STORAGE_KEY) === '1';
}

class BootLogger {
  private entries: BootLogEntry[] = [];
  private ready = false;
  private debugEnabled = false;
  private onceKeys = new Set<string>();
  private globalHandlersBound = false;
  private dumpHelperRegistered = false;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    this.debugEnabled = readDebugPreference();
    this.bindGlobalHandlers();
    this.registerDumpHelper();
    window.__NEWSLETTER_BOOT_LOGS__ = this.entries;

    if (isTelemetryEnabled()) {
      console.info(
        '[boot] Startup logger initialized. Inspect window.__NEWSLETTER_BOOT_LOGS__ or run window.__NEWSLETTER_DUMP_BOOT_LOGS__() in the browser console.',
      );
    }
  }

  once(key: string, callback: () => void) {
    if (this.onceKeys.has(key)) {
      return;
    }

    this.onceKeys.add(key);
    callback();
  }

  debug(scope: string, message: string, data?: unknown) {
    this.log('debug', scope, message, data);
  }

  step(scope: string, message: string, data?: unknown) {
    this.log('info', scope, message, data);
  }

  success(scope: string, message: string, data?: unknown) {
    this.log('success', scope, message, data);
  }

  warn(scope: string, message: string, data?: unknown) {
    this.log('warn', scope, message, data);
  }

  error(scope: string, message: string, data?: unknown) {
    this.log('error', scope, message, data);
  }

  fatal(scope: string, message: string, data?: unknown) {
    this.log('fatal', scope, message, data);
  }

  markReady(scope: string, message = 'Initial load complete', data?: unknown) {
    if (this.ready) {
      return;
    }

    this.ready = true;
    this.log('success', scope, message, data);

    if (this.debugEnabled) {
      this.dumpToConsole('startup-complete');
    }
  }

  getEntries() {
    return [...this.entries];
  }

  private log(level: BootLogLevel, scope: string, message: string, data?: unknown) {
    const elapsedMs = getElapsedMs();
    const entry: BootLogEntry = {
      id: this.entries.length + 1,
      elapsedMs,
      elapsedLabel: formatElapsed(elapsedMs),
      timestamp: formatTimestamp(),
      level,
      scope,
      message,
      data,
    };

    this.entries = [...this.entries.slice(-(MAX_LOG_ENTRIES - 1)), entry];

    if (typeof window !== 'undefined') {
      window.__NEWSLETTER_BOOT_LOGS__ = this.entries;
    }

    if (isTelemetryEnabled()) {
      const consoleMethod = level === 'fatal'
        ? 'error'
        : level === 'error'
          ? 'error'
          : level === 'warn'
            ? 'warn'
            : 'log';

      const prefix = `${entry.elapsedLabel} [boot:${scope}] ${message}`;

      if (data === undefined) {
        console[consoleMethod](prefix);
      } else {
        console.groupCollapsed(prefix);
        console[consoleMethod](data);
        console.groupEnd();
      }

      if (level === 'fatal') {
        this.dumpToConsole('fatal-error');
      }
    }
  }

  private bindGlobalHandlers() {
    if (this.globalHandlersBound || typeof window === 'undefined') {
      return;
    }

    this.globalHandlersBound = true;

    window.addEventListener('error', (event) => {
      this.fatal('window', 'Unhandled error event', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: normalizeError(event.error),
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.fatal('window', 'Unhandled promise rejection', normalizeError(event.reason));
    });
  }

  private registerDumpHelper() {
    if (this.dumpHelperRegistered || typeof window === 'undefined') {
      return;
    }

    this.dumpHelperRegistered = true;
    window.__NEWSLETTER_DUMP_BOOT_LOGS__ = () => {
      this.dumpToConsole('manual-dump');
    };
  }

  private dumpToConsole(reason: string) {
    if (!isTelemetryEnabled()) {
      return;
    }

    if (this.entries.length === 0) {
      console.info(`[boot] No startup logs collected for ${reason}.`);
      return;
    }

    console.group(`[boot] Startup log dump (${reason})`);
    console.table(this.entries.map((entry) => ({
      id: entry.id,
      elapsed: entry.elapsedLabel,
      level: entry.level,
      scope: entry.scope,
      message: entry.message,
      timestamp: entry.timestamp,
    })));

    for (const entry of this.entries) {
      if (entry.data === undefined) {
        continue;
      }

      console.groupCollapsed(`${entry.elapsedLabel} [boot:${entry.scope}] details`);
      console.log(entry.data);
      console.groupEnd();
    }

    console.groupEnd();
  }
}

export const bootLogger = new BootLogger();
