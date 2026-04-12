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
  }
}

const BOOT_LOG_QUERY_PARAM = 'bootLog';
const BOOT_LOG_STORAGE_KEY = 'newsletter:boot-log-enabled';
const BOOT_LOG_STYLE_ID = 'newsletter-boot-log-style';
const MAX_LOG_ENTRIES = 300;
const AUTO_HIDE_DELAY_MS = 8000;
const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

type UiElements = {
  host: HTMLDivElement;
  toggleButton: HTMLButtonElement;
  panel: HTMLDivElement;
  status: HTMLSpanElement;
  list: HTMLDivElement;
  copyButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
};

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

function safeSerialize(value: unknown) {
  if (value === undefined) {
    return '';
  }

  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }

        if (currentValue instanceof Error) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack,
          };
        }

        if (typeof currentValue === 'object' && currentValue !== null) {
          if (seen.has(currentValue)) {
            return '[Circular]';
          }

          seen.add(currentValue);
        }

        return currentValue;
      },
      2,
    );
  } catch {
    return String(value);
  }
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
  private ui: UiElements | null = null;
  private expanded = false;
  private ready = false;
  private hasError = false;
  private debugEnabled = false;
  private userInteracted = false;
  private styleInjected = false;
  private autoHideTimer: number | null = null;
  private onceKeys = new Set<string>();
  private globalHandlersBound = false;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    this.debugEnabled = readDebugPreference();
    this.expanded = this.debugEnabled;
    this.bindGlobalHandlers();
    this.ensureUi();
    window.__NEWSLETTER_BOOT_LOGS__ = this.entries;
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
    this.hasError = true;
    this.expanded = true;
    this.log('error', scope, message, data);
  }

  fatal(scope: string, message: string, data?: unknown) {
    this.hasError = true;
    this.expanded = true;
    this.log('fatal', scope, message, data);
  }

  markReady(scope: string, message = 'Initial load complete', data?: unknown) {
    if (this.ready) {
      return;
    }

    this.ready = true;
    this.log('success', scope, message, data);
    this.scheduleAutoHide();
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

    const consoleMethod = level === 'fatal'
      ? 'error'
      : level === 'error'
        ? 'error'
        : level === 'warn'
          ? 'warn'
          : 'log';

    if (data === undefined) {
      console[consoleMethod](`[boot:${scope}] ${message}`);
    } else {
      console[consoleMethod](`[boot:${scope}] ${message}`, data);
    }

    this.ensureUi();
    this.renderUi();
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

  private scheduleAutoHide() {
    if (this.debugEnabled || this.hasError || this.userInteracted) {
      return;
    }

    if (this.autoHideTimer !== null) {
      window.clearTimeout(this.autoHideTimer);
    }

    this.autoHideTimer = window.setTimeout(() => {
      if (!this.debugEnabled && !this.hasError && !this.userInteracted && this.ready && this.ui) {
        this.ui.host.style.display = 'none';
      }
    }, AUTO_HIDE_DELAY_MS);
  }

  private ensureStyle() {
    if (this.styleInjected || typeof document === 'undefined') {
      return;
    }

    if (document.getElementById(BOOT_LOG_STYLE_ID)) {
      this.styleInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = BOOT_LOG_STYLE_ID;
    style.textContent = `
      .newsletter-boot-log {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      .newsletter-boot-log button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }

      .newsletter-boot-log__toggle {
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(23, 23, 23, 0.92);
        color: #fafafa;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
      }

      .newsletter-boot-log__panel {
        width: min(92vw, 680px);
        max-height: min(70vh, 520px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(23, 23, 23, 0.1);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.98);
        color: #171717;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(12px);
      }

      .newsletter-boot-log__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(23, 23, 23, 0.08);
      }

      .newsletter-boot-log__title {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .newsletter-boot-log__status {
        font-size: 12px;
        color: #737373;
      }

      .newsletter-boot-log__actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .newsletter-boot-log__action {
        padding: 8px 10px;
        border-radius: 10px;
        background: #f5f5f5;
        color: #171717;
      }

      .newsletter-boot-log__list {
        padding: 10px 12px 12px;
        overflow: auto;
        background:
          linear-gradient(180deg, rgba(250, 250, 250, 0.96), rgba(255, 255, 255, 0.98)),
          radial-gradient(circle at top right, rgba(217, 58, 58, 0.12), transparent 28%);
      }

      .newsletter-boot-log__entry {
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(250, 250, 250, 0.95);
        border: 1px solid rgba(23, 23, 23, 0.08);
      }

      .newsletter-boot-log__entry + .newsletter-boot-log__entry {
        margin-top: 8px;
      }

      .newsletter-boot-log__entry[data-level='warn'] {
        border-color: rgba(217, 119, 6, 0.3);
        background: rgba(255, 251, 235, 0.95);
      }

      .newsletter-boot-log__entry[data-level='error'],
      .newsletter-boot-log__entry[data-level='fatal'] {
        border-color: rgba(220, 38, 38, 0.3);
        background: rgba(254, 242, 242, 0.96);
      }

      .newsletter-boot-log__entry[data-level='success'] {
        border-color: rgba(22, 163, 74, 0.28);
        background: rgba(240, 253, 244, 0.96);
      }

      .newsletter-boot-log__meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #737373;
      }

      .newsletter-boot-log__scope {
        color: #d93a3a;
        font-weight: 700;
      }

      .newsletter-boot-log__message {
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .newsletter-boot-log__data {
        margin-top: 8px;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(23, 23, 23, 0.05);
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;

    document.head.appendChild(style);
    this.styleInjected = true;
  }

  private ensureUi() {
    if (typeof document === 'undefined') {
      return;
    }

    this.ensureStyle();

    if (this.ui) {
      return;
    }

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this.ensureUi(), { once: true });
      return;
    }

    const host = document.createElement('div');
    host.className = 'newsletter-boot-log';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'newsletter-boot-log__toggle';
    toggleButton.addEventListener('click', () => {
      this.userInteracted = true;
      this.expanded = !this.expanded;
      host.style.display = 'flex';
      this.renderUi();
    });

    const panel = document.createElement('div');
    panel.className = 'newsletter-boot-log__panel';

    const header = document.createElement('div');
    header.className = 'newsletter-boot-log__header';

    const title = document.createElement('div');
    title.className = 'newsletter-boot-log__title';

    const heading = document.createElement('strong');
    heading.textContent = 'Startup log';

    const status = document.createElement('span');
    status.className = 'newsletter-boot-log__status';

    title.append(heading, status);

    const actions = document.createElement('div');
    actions.className = 'newsletter-boot-log__actions';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'newsletter-boot-log__action';
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', async () => {
      this.userInteracted = true;
      const payload = this.entries
        .map((entry) => {
          const headerText = `${entry.elapsedLabel} [${entry.level.toUpperCase()}] ${entry.scope}: ${entry.message}`;
          const dataText = entry.data === undefined ? '' : `\n${safeSerialize(entry.data)}`;
          return `${headerText}${dataText}`;
        })
        .join('\n\n');

      try {
        await navigator.clipboard.writeText(payload);
        this.step('boot-log', 'Startup log copied to clipboard');
      } catch (error) {
        this.warn('boot-log', 'Failed to copy startup log', normalizeError(error));
      }
    });

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'newsletter-boot-log__action';
    clearButton.textContent = 'Hide';
    clearButton.addEventListener('click', () => {
      this.userInteracted = false;
      this.expanded = false;
      if (this.ready && !this.debugEnabled && !this.hasError) {
        host.style.display = 'none';
      }
      this.renderUi();
    });

    actions.append(copyButton, clearButton);
    header.append(title, actions);

    const list = document.createElement('div');
    list.className = 'newsletter-boot-log__list';

    panel.append(header, list);
    host.append(toggleButton, panel);
    document.body.appendChild(host);

    this.ui = {
      host,
      toggleButton,
      panel,
      status,
      list,
      copyButton,
      clearButton,
    };

    this.renderUi();
  }

  private renderUi() {
    if (!this.ui) {
      return;
    }

    const isVisible = this.debugEnabled || !this.ready || this.hasError || this.userInteracted;
    this.ui.host.style.display = isVisible ? 'flex' : 'none';

    if (!isVisible) {
      return;
    }

    this.ui.toggleButton.textContent = this.expanded
      ? `Hide startup log (${this.entries.length})`
      : `Startup log (${this.entries.length})`;
    this.ui.panel.style.display = this.expanded ? 'flex' : 'none';
    this.ui.status.textContent = this.hasError
      ? 'Errors detected during startup'
      : this.ready
        ? 'Startup completed'
        : 'Collecting startup events';
    this.ui.copyButton.disabled = this.entries.length === 0;

    this.ui.list.replaceChildren(
      ...this.entries.map((entry) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'newsletter-boot-log__entry';
        wrapper.dataset.level = entry.level;

        const meta = document.createElement('div');
        meta.className = 'newsletter-boot-log__meta';
        meta.innerHTML = `<span>${entry.elapsedLabel}</span><span class="newsletter-boot-log__scope">${entry.scope}</span><span>${entry.level}</span>`;

        const message = document.createElement('div');
        message.className = 'newsletter-boot-log__message';
        message.textContent = entry.message;

        wrapper.append(meta, message);

        if (entry.data !== undefined) {
          const data = document.createElement('pre');
          data.className = 'newsletter-boot-log__data';
          data.textContent = safeSerialize(entry.data);
          wrapper.appendChild(data);
        }

        return wrapper;
      }),
    );

    this.ui.list.scrollTop = this.ui.list.scrollHeight;
  }
}

export const bootLogger = new BootLogger();
