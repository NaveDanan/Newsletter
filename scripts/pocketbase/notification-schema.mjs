import { autodate, bool, json, number, text } from './schema-fields.mjs';

const locked = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
export const NOTIFICATION_COLLECTION_SCHEMAS = [
  {
    name: 'notification_push_config', type: 'base', ...locked,
    fields: [text('key', 50, { required: true }), text('publicKey', 200), text('privateKey', 200, { hidden: true })],
    indexes: ['CREATE UNIQUE INDEX idx_notification_push_config_key ON notification_push_config (key)'],
  },
  {
    name: 'notification_push_subscriptions', type: 'base', ...locked,
    fields: [autodate('created'), autodate('updated', true, true), text('userId', 255, { required: true }), text('endpointHash', 100, { required: true }), json('subscription'), text('locale', 10)],
    indexes: ['CREATE UNIQUE INDEX idx_notification_push_endpoint ON notification_push_subscriptions (endpointHash)', 'CREATE INDEX idx_notification_push_user ON notification_push_subscriptions (userId)'],
  },
  {
    name: 'notification_push_jobs', type: 'base', ...locked,
    fields: [autodate('created'), text('notificationId', 255, { required: true }), text('subscriptionId', 255, { required: true }), number('attempts', 0, { onlyInt: true }), text('nextAttemptAt', 40), text('lockedUntil', 40), bool('completed')],
    indexes: ['CREATE UNIQUE INDEX idx_notification_push_job ON notification_push_jobs (notificationId, subscriptionId)', 'CREATE INDEX idx_notification_push_pending ON notification_push_jobs (completed, nextAttemptAt)'],
  },
  {
    name: 'notification_preferences', type: 'base', ...locked,
    fields: [autodate('created'), autodate('updated', true, true), text('userId', 255, { required: true }), json('preferences')],
    indexes: ['CREATE UNIQUE INDEX idx_notification_preferences_user ON notification_preferences (userId)'],
  },
  {
    name: 'notification_jobs', type: 'base', ...locked,
    fields: [autodate('created'), text('key', 500, { required: true }), json('payload'), text('cursor', 255), bool('completed')],
    indexes: ['CREATE UNIQUE INDEX idx_notification_jobs_key ON notification_jobs (key)', 'CREATE INDEX idx_notification_jobs_pending ON notification_jobs (completed, created)'],
  },
];
