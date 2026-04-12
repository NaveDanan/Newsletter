function normalizeBaseUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'newsletter';
}

function getAppName(app) {
  var settings = app.settings();
  var meta = settings && settings.meta ? settings.meta : {};
  return meta.appName || $os.getenv('POCKETBASE_APP_NAME') || 'AI-BREAK';
}

function getSender(app) {
  var settings = app.settings();
  var meta = settings && settings.meta ? settings.meta : {};

  return {
    address: meta.senderAddress || '',
    name: meta.senderName || getAppName(app),
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeLocale(value) {
  return value === 'he' ? 'he' : 'en';
}

function normalizeSource(value) {
  return String(value || 'sidebar').trim().slice(0, 100) || 'sidebar';
}

function getFrontendPublicUrl() {
  return normalizeBaseUrl($os.getenv('APP_PUBLIC_URL'));
}

function buildArticleUrl(record) {
  var baseUrl = getFrontendPublicUrl();
  if (!baseUrl) {
    return '';
  }

  return baseUrl + '/article/' + encodeURIComponent(record.id) + '/' + slugify(record.getString('title'));
}

function buildPasswordResetUrl(token) {
  var baseUrl = getFrontendPublicUrl();
  if (!baseUrl || !token) {
    return '';
  }

  return baseUrl + '/reset-password/' + encodeURIComponent(token);
}

function buildNewsletterEmail(app, record, subscriber) {
  var locale = normalizeLocale(subscriber.getString('locale'));
  var appName = getAppName(app);
  var subject = locale === 'he'
    ? 'ניוזלטר חדש מ-' + appName
    : 'A new newsletter from ' + appName;
  var title = escapeHtml(record.getString('title'));
  var subtitle = escapeHtml(record.getString('subtitle'));
  var excerptSource = stripHtml(record.getString('excerpt') || record.getString('content'));
  var excerpt = escapeHtml(excerptSource.slice(0, 320));
  var articleUrl = buildArticleUrl(record);
  var ctaLabel = locale === 'he' ? 'לקריאת הניוזלטר' : 'Read the newsletter';
  var intro = locale === 'he'
    ? 'ניוזלטר חדש פורסם באתר.'
    : 'A new newsletter has just been published.';

  return {
    subject: subject,
    html: ''
      + '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#171717;line-height:1.6">'
      + '<p style="margin:0 0 16px">' + escapeHtml(appName) + '</p>'
      + '<h1 style="margin:0 0 12px;font-size:28px;line-height:1.2">' + title + '</h1>'
      + (subtitle ? '<p style="margin:0 0 16px;font-size:18px;color:#525252">' + subtitle + '</p>' : '')
      + '<p style="margin:0 0 16px">' + intro + '</p>'
      + (excerpt ? '<p style="margin:0 0 24px;color:#404040">' + excerpt + '</p>' : '')
      + (articleUrl
        ? '<p style="margin:0 0 24px"><a href="' + escapeHtml(articleUrl) + '" style="display:inline-block;background:#d93a3a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px">' + ctaLabel + '</a></p>'
        : '')
      + '<p style="margin:0;color:#737373;font-size:14px">'
      + (locale === 'he' ? 'קיבלתם את ההודעה כי נרשמתם לעדכוני הניוזלטר.' : 'You received this email because you subscribed to newsletter updates.')
      + '</p>'
      + '</div>',
  };
}

function buildPasswordResetEmail(app, record, resetUrl) {
  var appName = getAppName(app);
  var displayName = record.getString('name') || record.email();

  return {
    subject: 'Reset your ' + appName + ' password',
    html: ''
      + '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#171717;line-height:1.6">'
      + '<p style="margin:0 0 16px">Hello ' + escapeHtml(displayName) + ',</p>'
      + '<p style="margin:0 0 16px">We received a request to reset your ' + escapeHtml(appName) + ' password.</p>'
      + '<p style="margin:0 0 24px"><a href="' + escapeHtml(resetUrl) + '" style="display:inline-block;background:#d93a3a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px">Set a new password</a></p>'
      + '<p style="margin:0 0 12px;color:#404040">If you did not request this change, you can ignore this email.</p>'
      + '<p style="margin:0;color:#737373;font-size:14px">This link will expire according to your PocketBase auth settings.</p>'
      + '</div>',
  };
}

function createNewsletterMessage(app, record, subscriber) {
  var mail = buildNewsletterEmail(app, record, subscriber);

  return new MailerMessage({
    from: getSender(app),
    to: [{ address: subscriber.getString('email') }],
    subject: mail.subject,
    html: mail.html,
  });
}

function markNotificationSent(app, record, sentCount) {
  record.set('notificationSentAt', new Date().toISOString());
  record.set('notificationRecipientCount', sentCount);
  app.save(record);
}

function sendNewsletterNotifications(app, record) {
  if (record.getString('status') !== 'published' || record.getString('notificationSentAt')) {
    return;
  }

  var subscribers = app.findRecordsByFilter('newsletter_subscribers', 'isActive = true', '', 0, 0);
  if (!subscribers.length) {
    markNotificationSent(app, record, 0);
    return;
  }

  var mailClient = app.newMailClient();
  var sentCount = 0;

  for (var i = 0; i < subscribers.length; i += 1) {
    var subscriber = subscribers[i];
    var email = normalizeEmail(subscriber.getString('email'));

    if (!isValidEmail(email)) {
      continue;
    }

    try {
      mailClient.send(createNewsletterMessage(app, record, subscriber));
      sentCount += 1;
    } catch (error) {
      console.error('Failed to send newsletter notification to ' + email + ':', error);
    }
  }

  markNotificationSent(app, record, sentCount);
}

module.exports = {
  buildPasswordResetEmail: buildPasswordResetEmail,
  buildPasswordResetUrl: buildPasswordResetUrl,
  getFrontendPublicUrl: getFrontendPublicUrl,
  isValidEmail: isValidEmail,
  normalizeEmail: normalizeEmail,
  normalizeLocale: normalizeLocale,
  normalizeSource: normalizeSource,
  sendNewsletterNotifications: sendNewsletterNotifications,
};