const withFieldOptions = (base, options = {}) => ({
  ...base,
  ...options,
});

const text = (name, max = 0, options = {}) => withFieldOptions({
  name,
  type: 'text',
  required: false,
  max,
}, options);

const number = (name, min = 0, options = {}) => withFieldOptions({
  name,
  type: 'number',
  required: false,
  min,
  onlyInt: false,
}, options);

const bool = (name, options = {}) => withFieldOptions({
  name,
  type: 'bool',
  required: false,
}, options);

const file = (name, maxSelect = 1, maxSize = 10485760, mimeTypes = [], options = {}) => withFieldOptions({
  name,
  type: 'file',
  required: false,
  maxSelect,
  maxSize,
  mimeTypes,
}, options);

const email = (name, options = {}) => withFieldOptions({
  name,
  type: 'email',
  required: true,
}, options);

const json = (name, options = {}) => withFieldOptions({
  name,
  type: 'json',
  required: false,
  maxSize: 5000000,
}, options);

const autodate = (name, onCreate = true, onUpdate = false, options = {}) => withFieldOptions({
  name,
  type: 'autodate',
  required: false,
  onCreate,
  onUpdate,
}, options);

export const PROJECTS_SCHEMA = {
  name: 'projects',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('title', 10000),
    text('description', 20000000),
    text('department'),
    text('devision'),
    text('field'),
    text('status'),
    bool('isVisibleInGantt'),
    json('gantt'),
  ],
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != ""',
  deleteRule: '@request.auth.id != ""',
};

export const NEWSLETTERS_SCHEMA = {
  name: 'newsletters',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('title', 10000),
    text('subtitle', 10000),
    text('content', 20000000),
    text('excerpt', 20000000),
    text('author'),
    text('authorAvatar', 20000000),
    text('createdById'),
    text('publishedAt'),
    text('readTime'),
    text('coverImage', 20000000),
    file('presentationFiles', 25, 104857600, [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
    ]),
    bool('hasAudio'),
    text('audioDuration'),
    number('likes'),
    number('comments'),
    number('shares'),
    text('status'),
    json('tags'),
    json('likedByUserIds'),
    json('commentItems'),
    text('notificationSentAt', 255, { hidden: true }),
    number('notificationRecipientCount', 0, { hidden: true, onlyInt: true }),
  ],
  listRule: '',
  viewRule: '',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != ""',
  deleteRule: '@request.auth.id != ""',
};

export const NAVIGATION_LINKS_SCHEMA = {
  name: 'navigation_links',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('dropdownId', 500),
    text('name', 1000),
    text('description', 5000),
    text('url', 200000),
    text('iconUrl', 200000),
    file('icon', 1, 10485760, [
      'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
    ]),
    bool('hidden'),
    number('order'),
  ],
  listRule: '',
  viewRule: '',
  createRule: '@request.auth.role = "admin"',
  updateRule: '@request.auth.role = "admin"',
  deleteRule: '@request.auth.role = "admin"',
};

export const NAV_DROPDOWNS_SCHEMA = {
  name: 'nav_dropdowns',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('label', 1000),
    text('dotColor', 50),
    bool('hidden'),
    number('order'),
  ],
  listRule: '',
  viewRule: '',
  createRule: '@request.auth.role = "admin"',
  updateRule: '@request.auth.role = "admin"',
  deleteRule: '@request.auth.role = "admin"',
};

export const NEWSLETTER_SUBSCRIBERS_SCHEMA = {
  name: 'newsletter_subscribers',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    email('email'),
    text('locale', 10),
    bool('isActive'),
    text('source', 100),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers (LOWER(email))',
  ],
  listRule: '@request.auth.role = "manager" || @request.auth.role = "admin"',
  viewRule: '@request.auth.role = "manager" || @request.auth.role = "admin"',
  createRule: '@request.auth.role = "admin"',
  updateRule: '@request.auth.role = "admin"',
  deleteRule: '@request.auth.role = "admin"',
};

export const LINKS_SCHEMA = {
  name: 'links',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('title', 1000, { required: true }),
    text('url', 200000, { required: true }),
    text('description', 10000),
    text('category', 500),
    text('iconUrl', 200000),
    file('icon', 1, 10485760, [
      'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
    ]),
    bool('hidden'),
    number('order'),
  ],
  listRule: '',
  viewRule: '',
  createRule: '@request.auth.role = "admin"',
  updateRule: '@request.auth.role = "admin"',
  deleteRule: '@request.auth.role = "admin"',
};

export const APP_COLLECTION_SCHEMAS = [
  PROJECTS_SCHEMA,
  NEWSLETTERS_SCHEMA,
  NAVIGATION_LINKS_SCHEMA,
  NAV_DROPDOWNS_SCHEMA,
  NEWSLETTER_SUBSCRIBERS_SCHEMA,
  LINKS_SCHEMA,
];