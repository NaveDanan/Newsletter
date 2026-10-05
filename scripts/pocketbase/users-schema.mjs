// The app-managed shape of PocketBase's built-in users collection. Every script
// that writes this collection's fields or rules imports it, so running one
// after another can never restore an older, weaker rule set.

export const USER_ROLES = ['viewer', 'author', 'manager', 'general_manager', 'admin'];
export const USER_LOCALES = ['he', 'en'];
export const THEME_PREFERENCES = ['system', 'dark', 'light'];
export const ACCENT_PRESETS = ['red', 'yellow', 'lime', 'cyan', 'purple', 'pink', 'orange', 'custom'];

// Each sync merges these over whatever is stored, keeping the field id so
// PocketBase updates the column in place instead of dropping and re-adding it.
export const USER_FIELDS = [
  { name: 'role', type: 'select', required: false, hidden: false, maxSelect: 1, values: USER_ROLES },
  { name: 'locale', type: 'select', required: false, hidden: false, maxSelect: 1, values: USER_LOCALES },
  { name: 'themePreference', type: 'select', required: false, hidden: false, maxSelect: 1, values: THEME_PREFERENCES },
  { name: 'accentPreset', type: 'select', required: false, hidden: false, maxSelect: 1, values: ACCENT_PRESETS },
  { name: 'accentCustomHex', type: 'text', required: false, hidden: false, max: 7, pattern: '^#[0-9a-fA-F]{6}$' },
  // Membership in the homepage "Our Writers" row. Admin-curated only: holding a
  // writing role never sets it, and the rules below stop users setting it.
  { name: 'featuredWriter', type: 'bool', required: false, hidden: false },
];

// Self-service writes may not touch privilege-bearing fields; only an admin can.
export const OWNER_LOCKED_FIELDS = ['role', 'featuredWriter'];

export const USERS_RULES = {
  createRule: '(@request.body.role:isset = false || @request.body.role = "viewer")'
    + ' && (@request.body.featuredWriter:isset = false || @request.body.featuredWriter = false)',
  listRule: 'id = @request.auth.id || @request.auth.role = "admin"',
  viewRule: 'id = @request.auth.id || @request.auth.role = "admin"',
  updateRule: `(@request.auth.id = id && ${OWNER_LOCKED_FIELDS.map((name) => `@request.body.${name}:changed = false`).join(' && ')})`
    + ' || @request.auth.role = "admin"',
  deleteRule: 'id = @request.auth.id || @request.auth.role = "admin"',
  manageRule: '@request.auth.role = "admin"',
};

function upsertField(fields, definition) {
  const existingIndex = fields.findIndex((field) => field.name === definition.name);
  if (existingIndex === -1) {
    return [...fields, definition];
  }

  const existingField = fields[existingIndex];
  const nextFields = [...fields];
  nextFields[existingIndex] = {
    ...existingField,
    ...definition,
    id: existingField.id,
  };

  return nextFields;
}

// The update payload that brings a stored users collection up to date.
export function buildUsersCollectionUpdate(storedFields = []) {
  return {
    fields: USER_FIELDS.reduce(upsertField, storedFields),
    ...USERS_RULES,
  };
}
