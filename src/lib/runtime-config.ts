const runtimeConfig = typeof window !== 'undefined'
  ? ((window as Window & { __APP_CONFIG__?: Record<string, unknown> }).__APP_CONFIG__ ?? {})
  : {};

const buildTimeConfig = {
  VITE_POCKETBASE_URL: import.meta.env.VITE_POCKETBASE_URL,
};

export function getAppConfigValue(name: keyof typeof buildTimeConfig): string | undefined {
  const runtimeValue = runtimeConfig[name];
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  const buildTimeValue = buildTimeConfig[name];
  if (typeof buildTimeValue === 'string' && buildTimeValue.trim()) {
    return buildTimeValue.trim();
  }

  return undefined;
}

export function getDefaultPocketBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8090';
  }

  return `${window.location.protocol}//${window.location.hostname}:8090`;
}

export function getPocketBaseUrl(): string {
  return getAppConfigValue('VITE_POCKETBASE_URL') || getDefaultPocketBaseUrl();
}

export function isTelemetryEnabled(): boolean {
  const runtimeValue = runtimeConfig['NEWSLETTER_TELEMETRY'];
  if (typeof runtimeValue === 'boolean') {
    return runtimeValue;
  }
  if (typeof runtimeValue === 'string') {
    const v = runtimeValue.toLowerCase();
    return v === 'true' || v === '1';
  }

  const buildValue = import.meta.env.VITE_NEWSLETTER_TELEMETRY;
  if (typeof buildValue === 'string') {
    const v = buildValue.toLowerCase();
    return v === 'true' || v === '1';
  }

  return false;
}