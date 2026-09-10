// Shared PocketBase field builders used by the application collection schemas.
// Keeping them in one module lets large feature areas declare their collections
// in separate files without importing each other.

export const withFieldOptions = (base, options = {}) => ({
  ...base,
  ...options,
});

export const text = (name, max = 0, options = {}) => withFieldOptions({
  name,
  type: 'text',
  required: false,
  max,
}, options);

export const number = (name, min = 0, options = {}) => withFieldOptions({
  name,
  type: 'number',
  required: false,
  min,
  onlyInt: false,
}, options);

export const bool = (name, options = {}) => withFieldOptions({
  name,
  type: 'bool',
  required: false,
}, options);

export const file = (name, maxSelect = 1, maxSize = 10485760, mimeTypes = [], options = {}) => withFieldOptions({
  name,
  type: 'file',
  required: false,
  maxSelect,
  maxSize,
  mimeTypes,
}, options);

export const email = (name, options = {}) => withFieldOptions({
  name,
  type: 'email',
  required: true,
}, options);

export const json = (name, options = {}) => withFieldOptions({
  name,
  type: 'json',
  required: false,
  maxSize: 5000000,
}, options);

export const autodate = (name, onCreate = true, onUpdate = false, options = {}) => withFieldOptions({
  name,
  type: 'autodate',
  required: false,
  onCreate,
  onUpdate,
}, options);
