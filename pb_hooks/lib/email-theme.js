// Colours for outgoing email, matching the site's light and dark themes and
// the recipient's accent preference (users.themePreference, accentPreset,
// accentCustomHex). Values mirror src/index.css and src/context/ThemeContext.tsx;
// emails need plain hex colours because Outlook ignores CSS variables and rgba.

var ACCENT_PRESETS = {
  red: '#ff3b53',
  yellow: '#ffe600',
  lime: '#10f57a',
  cyan: '#00e5ff',
  purple: '#b066ff',
  pink: '#ff2a85',
  orange: '#ff7a00',
};
var DEFAULT_ACCENT = ACCENT_PRESETS.red;
var HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

var LIGHT = {
  mode: 'light',
  outer: '#f1f3f7',
  card: '#ffffff',
  surface: '#f8f9fc',
  border: '#e3e6ec',
  text: '#121318',
  textSecondary: '#5a5e6d',
  textMuted: '#888d9d',
};

var DARK = {
  mode: 'dark',
  outer: '#090a0d',
  card: '#18191d',
  surface: '#212226',
  border: '#2a2b32',
  text: '#ffffff',
  textSecondary: '#8e909d',
  textMuted: '#6b6c77',
};

function hexToRgb(hex) {
  var value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(rgb) {
  return '#' + [rgb.r, rgb.g, rgb.b].map(function (part) {
    var text = Math.max(0, Math.min(255, Math.round(part))).toString(16);
    return text.length === 1 ? '0' + text : text;
  }).join('');
}

// Same perceived-luminance rule the site uses to pick the accent's text colour.
function luminance(hex) {
  var rgb = hexToRgb(hex);
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

function mix(hex, target, amount) {
  var from = hexToRgb(hex);
  var to = hexToRgb(target);
  return rgbToHex({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
}

function resolveAccent(preset, customHex) {
  preset = String(preset || '');
  customHex = String(customHex || '');

  if (preset === 'custom' && HEX_COLOR.test(customHex)) return customHex.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ACCENT_PRESETS, preset)) return ACCENT_PRESETS[preset];
  return DEFAULT_ACCENT;
}

function buildTheme(preferences) {
  preferences = preferences || {};
  var base = preferences.themePreference === 'dark' ? DARK : LIGHT;
  var accent = resolveAccent(preferences.accentPreset, preferences.accentCustomHex);
  var accentIsLight = luminance(accent) > 0.58;
  var theme = {};

  for (var key in base) theme[key] = base[key];

  theme.accent = accent;
  theme.accentContrast = accentIsLight ? '#121214' : '#ffffff';
  // Yellow, lime or cyan text is unreadable on white, so light themes darken
  // the accent wherever it is used for text; fills keep the exact colour.
  theme.accentText = base.mode === 'light' && accentIsLight ? mix(accent, '#000000', 0.45) : accent;
  // A faint accent wash for callouts, pre-mixed because Outlook has no rgba.
  theme.accentWash = mix(accent, base.surface, base.mode === 'light' ? 0.9 : 0.85);

  return theme;
}

function readPreferences(record) {
  if (!record || typeof record.getString !== 'function') return {};
  return {
    themePreference: record.getString('themePreference'),
    accentPreset: record.getString('accentPreset'),
    accentCustomHex: record.getString('accentCustomHex'),
  };
}

// Subscribers without an account (sidebar sign-ups) get the site defaults.
function themeForEmail(app, email) {
  var user = null;
  email = String(email || '').trim().toLowerCase();

  if (email) {
    try {
      user = app.findAuthRecordByEmail('users', email);
    } catch (_) {
      user = null;
    }
  }

  return buildTheme(readPreferences(user));
}

module.exports = {
  ACCENT_PRESETS: ACCENT_PRESETS,
  buildTheme: buildTheme,
  readPreferences: readPreferences,
  resolveAccent: resolveAccent,
  themeForEmail: themeForEmail,
};
