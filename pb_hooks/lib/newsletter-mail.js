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

function normalizeTextAlignment(value) {
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }

  return '';
}

function inferTextAlignmentFromHtml(html) {
  var counts = {
    left: 0,
    center: 0,
    right: 0,
  };
  var stylePattern = /text-align\s*:\s*(left|center|right|justify)\b/gi;
  var match = null;

  while ((match = stylePattern.exec(html)) !== null) {
    var value = String(match[1] || '').toLowerCase();
    if (value === 'left' || value === 'center' || value === 'right') {
      counts[value] += 1;
    }
  }

  var highestCount = Math.max(counts.left, counts.center, counts.right);
  if (highestCount > 0) {
    if (counts.center === highestCount && counts.center > counts.left && counts.center > counts.right) {
      return 'center';
    }

    if (counts.right === highestCount && counts.right > counts.left) {
      return 'right';
    }

    if (counts.left === highestCount && counts.left > counts.right) {
      return 'left';
    }
  }

  var directionMatches = Array.from(String(html || '').matchAll(/\bdir\s*=\s*["']?(rtl|ltr)\b/gi));
  var lastDirection = directionMatches.length > 0
    ? String(directionMatches[directionMatches.length - 1][1] || '').toLowerCase()
    : '';

  if (lastDirection === 'rtl') {
    return 'right';
  }

  if (lastDirection === 'ltr') {
    return 'left';
  }

  return /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(stripHtml(html)) ? 'right' : 'left';
}

function getNewsletterTextAlignment(record) {
  var storedAlignment = normalizeTextAlignment(record.getString('textAlignment'));

  if (storedAlignment) {
    return storedAlignment;
  }

  return inferTextAlignmentFromHtml(record.getString('content'));
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

function readBooleanEnv(name) {
  var value = String($os.getenv(name) || '').trim().toLowerCase();

  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function shouldSkipSmtpTlsVerification() {
  return readBooleanEnv('POCKETBASE_SMTP_INSECURE_SKIP_VERIFY');
}

function getInsecureMailerScriptPath() {
  var explicitPath = String($os.getenv('POCKETBASE_INSECURE_MAILER_SCRIPT') || '').trim();
  if (explicitPath) {
    return explicitPath;
  }

  var appRoot = String($os.getenv('APP_ROOT') || '').trim();
  if (appRoot) {
    return appRoot.replace(/\/+$/, '') + '/scripts/pocketbase/send-mail.mjs';
  }

  return String(__hooks).replace(/[\\\/]pb_hooks$/, '') + '/scripts/pocketbase/send-mail.mjs';
}

function getNodeBinaryPath() {
  return String($os.getenv('NODE_BIN') || 'node').trim() || 'node';
}

function createTempMailPayload(payload) {
  var tempDir = String($os.tempDir() || '/tmp').replace(/[\\\/]+$/, '');
  var suffix = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000));
  var path = tempDir + '/pocketbase-mail-' + suffix + '.json';

  $os.writeFile(path, JSON.stringify(payload), 384);

  return path;
}

function serializeAddressList(value) {
  if (!value || !value.length) {
    return [];
  }

  var result = [];
  for (var i = 0; i < value.length; i += 1) {
    if (value[i] && value[i].address) {
      result.push({
        address: String(value[i].address),
        name: value[i].name ? String(value[i].name) : '',
      });
    }
  }

  return result;
}

function serializeMessage(message, app) {
  var sender = message && message.from && message.from.address ? message.from : getSender(app);

  return {
    from: {
      address: String(sender.address || ''),
      name: sender.name ? String(sender.name) : '',
    },
    to: serializeAddressList(message ? message.to : []),
    cc: serializeAddressList(message ? message.cc : []),
    bcc: serializeAddressList(message ? message.bcc : []),
    subject: message && message.subject ? String(message.subject) : '',
    html: message && message.html ? String(message.html) : '',
    text: message && message.text ? String(message.text) : '',
    headers: message && message.headers ? message.headers : {},
  };
}

function sendMailWithInsecureTlsVerification(app, message) {
  if (!shouldSkipSmtpTlsVerification()) {
    return false;
  }

  var settings = app.settings();
  var smtp = settings && settings.smtp ? settings.smtp : {};

  if (!smtp.enabled) {
    return false;
  }

  var payloadPath = createTempMailPayload({
    insecureSkipVerify: true,
    smtp: {
      host: String(smtp.host || ''),
      port: Number(smtp.port || 0),
      username: String(smtp.username || ''),
      password: String(smtp.password || ''),
      authMethod: String(smtp.authMethod || 'PLAIN'),
      tls: Boolean(smtp.tls),
      localName: String(smtp.localName || ''),
    },
    message: serializeMessage(message, app),
  });

  var errFilePath = payloadPath + '.err';

  try {
    var cmd = $os.cmd(getNodeBinaryPath(), getInsecureMailerScriptPath(), payloadPath);
    var output = String(cmd.combinedOutput() || '').trim();

    if (output) {
      console.log(output);
    }
  } catch (sendError) {
    var detail = '';
    try {
      detail = String($os.readFile(errFilePath) || '').trim();
    } catch (_) {}

    var errMsg = detail || (sendError && sendError.message ? sendError.message : String(sendError));
    console.error('Insecure mailer script failed: ' + errMsg);
    throw new Error('Failed to send email via insecure mailer: ' + errMsg);
  } finally {
    try { $os.remove(payloadPath); } catch (_) {}
    try { $os.remove(errFilePath); } catch (_) {}
  }

  return true;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmailDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\.+$/, '');
}

function getEmailDomain(value) {
  var email = normalizeEmail(value);
  var atIndex = email.lastIndexOf('@');

  if (atIndex <= 0 || atIndex >= email.length - 1) {
    return '';
  }

  return normalizeEmailDomain(email.slice(atIndex + 1));
}

function findFirstRecordByFilterOrNull(app, collectionName, filter, params) {
  try {
    return app.findFirstRecordByFilter(collectionName, filter, params || {});
  } catch (error) {
    return null;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isAllowedEmailDomain(app, email) {
  var domain = getEmailDomain(email);

  if (!domain) {
    return false;
  }

  return Boolean(findFirstRecordByFilterOrNull(app, 'valid_emails_domains', 'domain = {:domain}', {
    domain: domain,
  }));
}

function normalizeLocale(value) {
  return value === 'he' ? 'he' : 'en';
}

function getSubscribeErrorMessage(code, locale) {
  var isHebrew = normalizeLocale(locale) === 'he';

  if (code === 'invalid_domain') {
    return isHebrew
      ? 'כתובת האימייל הזו אינה מאושרת עדיין. בדקו אותה שוב ונסו להירשם מחדש.'
      : 'This email address domain is not approved yet. Please check it again and try subscribing once more.';
  }

  return isHebrew
    ? 'שמירת ההרשמה נכשלה'
    : 'Failed to save your subscription';
}

function normalizeSource(value) {
  return String(value || 'sidebar').trim().slice(0, 100) || 'sidebar';
}

function getRecordEmail(record) {
  if (!record) {
    return '';
  }

  if (typeof record.email === 'function') {
    return normalizeEmail(record.email());
  }

  if (typeof record.getString === 'function') {
    return normalizeEmail(record.getString('email'));
  }

  return '';
}

function findSubscriberByEmail(app, email) {
  return findFirstRecordByFilterOrNull(app, 'newsletter_subscribers', 'email = {:email}', {
    email: normalizeEmail(email),
  });
}

function findUnsubscribeByEmail(app, email) {
  return findFirstRecordByFilterOrNull(app, 'newsletter_unsubscribes', 'email = {:email}', {
    email: normalizeEmail(email),
  });
}

function isEmailSuppressed(app, email) {
  return Boolean(findUnsubscribeByEmail(app, email));
}

function suppressEmail(app, email) {
  email = normalizeEmail(email);

  if (!isValidEmail(email)) {
    return null;
  }

  var suppression = findUnsubscribeByEmail(app, email);

  if (!suppression) {
    var collection = app.findCollectionByNameOrId('newsletter_unsubscribes');
    suppression = new Record(collection);
    suppression.set('email', email);
  }

  app.save(suppression);

  return suppression;
}

function removeEmailSuppression(app, email) {
  var suppression = findUnsubscribeByEmail(app, email);

  if (!suppression) {
    return false;
  }

  app.delete(suppression);
  return true;
}

function upsertSubscriber(app, email, options) {
  email = normalizeEmail(email);
  options = options || {};

  if (!isValidEmail(email)) {
    return null;
  }

  var subscriber = null;
  subscriber = findSubscriberByEmail(app, email);

  if (!subscriber) {
    var collection = app.findCollectionByNameOrId('newsletter_subscribers');
    subscriber = new Record(collection);
    subscriber.set('email', email);
  }

  subscriber.set('locale', normalizeLocale(options.locale));
  subscriber.set('isActive', true);
  subscriber.set('source', normalizeSource(options.source || 'registered_account'));

  app.save(subscriber);

  return subscriber;
}

function subscribeEmail(app, email, options) {
  email = normalizeEmail(email);

  if (!isValidEmail(email)) {
    return {
      status: 'invalid_email',
      subscriber: null,
    };
  }

  var existingSubscriber = findSubscriberByEmail(app, email);

  if (existingSubscriber) {
    return {
      status: 'already_subscribed',
      subscriber: upsertSubscriber(app, email, options),
    };
  }

  if (!isAllowedEmailDomain(app, email)) {
    return {
      status: 'invalid_domain',
      subscriber: null,
    };
  }

  removeEmailSuppression(app, email);

  return {
    status: 'subscribed',
    subscriber: upsertSubscriber(app, email, options),
  };
}

function upsertSubscriberForUser(app, user) {
  var email = getRecordEmail(user);

  if (!email || isEmailSuppressed(app, email)) {
    return null;
  }

  return upsertSubscriber(app, email, {
    locale: 'en',
    source: 'registered_account',
  });
}

function syncRegisteredUsersAsSubscribers(app) {
  var users = app.findRecordsByFilter('users', '', '', 0, 0);
  var syncedCount = 0;

  for (var i = 0; i < users.length; i += 1) {
    if (upsertSubscriberForUser(app, users[i])) {
      syncedCount += 1;
    }
  }

  return syncedCount;
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

function buildUnsubscribeUrl(subscriber) {
  var baseUrl = getFrontendPublicUrl();
  var subscriberId = subscriber && subscriber.id ? String(subscriber.id) : '';
  var email = subscriber ? normalizeEmail(subscriber.getString('email')) : '';
  var locale = subscriber ? normalizeLocale(subscriber.getString('locale')) : 'en';

  if (!baseUrl || !subscriberId || !email) {
    return '';
  }

  return baseUrl
    + '/unsubscribe?subscriber=' + encodeURIComponent(subscriberId)
    + '&email=' + encodeURIComponent(email)
    + '&locale=' + encodeURIComponent(locale);
}

function buildUnsubscribeFooter(locale, unsubscribeUrl) {
  var unsubscribeLabel = locale === 'he' ? 'הסרה מהרשימה' : 'Unsubscribe';
  var unsubscribeCopy = locale === 'he'
    ? 'אם אינכם רוצים לקבל עדכוני ניוזלטר נוספים, אפשר להסיר את עצמכם כאן.'
    : 'If you no longer want newsletter updates, you can unsubscribe here.';

  if (!unsubscribeUrl) {
    return '<p style="margin:8px 0 0;color:#A3A3A3;font-size:12px;line-height:1.6">' + unsubscribeCopy + '</p>';
  }

  return ''
    + '<p style="margin:8px 0 0;color:#A3A3A3;font-size:12px;line-height:1.6">'
    + unsubscribeCopy
    + ' <a href="' + escapeHtml(unsubscribeUrl) + '" style="color:#D93A3A;text-decoration:underline;font-weight:600">' + unsubscribeLabel + '</a>'
    + '</p>';
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
  var unsubscribeUrl = buildUnsubscribeUrl(subscriber);
  var ctaLabel = locale === 'he' ? 'לקריאת הניוזלטר' : 'Read the newsletter';
  var intro = locale === 'he'
    ? 'ניוזלטר חדש פורסם באתר.'
    : 'A new newsletter has just been published.';
  var textAlign = getNewsletterTextAlignment(record);

  return {
    subject: subject,
    html: ''
      + '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#171717;line-height:1.6;text-align:' + textAlign + '">'
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
      + buildUnsubscribeFooter(locale, unsubscribeUrl)
      + '</div>',
  };
}

function buildNewsletterUpdateEmail(app, record, subscriber) {
  var locale = normalizeLocale(subscriber.getString('locale'));
  var appName = getAppName(app);
  var subject = locale === 'he'
    ? '\u05e0\u05d9\u05d5\u05d6\u05dc\u05d8\u05e8 \u05d7\u05d3\u05e9 \u05de-' + appName
    : 'A new newsletter from ' + appName;
  var title = escapeHtml(record.getString('title'));
  var subtitle = escapeHtml(record.getString('subtitle'));
  var excerptSource = stripHtml(record.getString('excerpt') || record.getString('content'));
  var excerpt = escapeHtml(excerptSource.slice(0, 320));
  var articleUrl = buildArticleUrl(record);
  var coverImage = escapeHtml(record.getString('coverImage'));
  var publishedAt = escapeHtml(record.getString('publishedAt'));
  var readTime = escapeHtml(record.getString('readTime'));
  var direction = locale === 'he' ? 'rtl' : 'ltr';
  var textAlign = getNewsletterTextAlignment(record);
  var accentSide = textAlign === 'right' ? 'right' : 'left';
  var ctaLabel = locale === 'he'
    ? '\u05dc\u05e7\u05e8\u05d9\u05d0\u05ea \u05d4\u05e0\u05d9\u05d5\u05d6\u05dc\u05d8\u05e8'
    : 'Read the newsletter';
  var latestLabel = locale === 'he'
    ? '\u05e4\u05d5\u05e8\u05e1\u05dd \u05e2\u05db\u05e9\u05d9\u05d5 \u05d1\u05d0\u05ea\u05e8'
    : 'Fresh on the site';
  var footerText = locale === 'he'
    ? '\u05e7\u05d9\u05d1\u05dc\u05ea\u05dd \u05d0\u05ea \u05d4\u05d4\u05d5\u05d3\u05e2\u05d4 \u05db\u05d9 \u05e0\u05e8\u05e9\u05de\u05ea\u05dd \u05dc\u05e2\u05d3\u05db\u05d5\u05e0\u05d9 \u05d4\u05e0\u05d9\u05d5\u05d6\u05dc\u05d8\u05e8.'
    : 'You received this email because you subscribed to newsletter updates.';
  var intro = locale === 'he'
    ? '\u05e0\u05d9\u05d5\u05d6\u05dc\u05d8\u05e8 \u05d7\u05d3\u05e9 \u05e2\u05dc\u05d4 \u05dc\u05d0\u05ea\u05e8 \u05e2\u05dd \u05ea\u05d5\u05d1\u05e0\u05d5\u05ea \u05d5\u05e2\u05d3\u05db\u05d5\u05e0\u05d9\u05dd \u05e9\u05db\u05d3\u05d0\u05d9 \u05dc\u05e4\u05ea\u05d5\u05d7.'
    : 'A new newsletter is live on the site, with the latest signals and practical takeaways.';
  var meta = [publishedAt, readTime].filter(function (value) { return Boolean(value); }).join(' / ');
  var calloutStyle = textAlign === 'center'
    ? 'padding-top:18px;border-top:4px solid #D93A3A;text-align:center'
    : 'padding-' + accentSide + ':18px;border-' + accentSide + ':4px solid #D93A3A;text-align:' + textAlign;
  var unsubscribeUrl = buildUnsubscribeUrl(subscriber);

  return {
    subject: subject,
    html: ''
      + '<div dir="' + direction + '" style="margin:0;background:#ffffff;color:#171717;font-family:Inter,Arial,sans-serif;line-height:1.6;text-align:' + textAlign + '">'
      + '<div style="height:6px;background:#D93A3A;line-height:6px;font-size:1px">&nbsp;</div>'
      + '<div style="max-width:680px;margin:0 auto;padding:28px 24px 0">'
      + '<p style="margin:0 0 12px;color:#D93A3A;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">' + escapeHtml(appName) + '</p>'
      + '<p style="margin:0 0 22px;color:#737373;font-size:13px;font-weight:600">' + latestLabel + (meta ? ' / ' + meta : '') + '</p>'
      + '<h1 style="margin:0 0 18px;color:#171717;font-size:42px;line-height:1.05;font-weight:800;letter-spacing:0">' + title + '</h1>'
      + (subtitle ? '<p style="margin:0 0 26px;color:#404040;font-size:20px;line-height:1.45;font-weight:500">' + subtitle + '</p>' : '')
      + '</div>'
      + (coverImage
        ? '<div style="max-width:880px;margin:0 auto 28px"><img src="' + coverImage + '" alt="' + title + '" width="880" style="display:block;width:100%;height:auto;border:0" /></div>'
        : '<div style="height:1px;max-width:680px;margin:0 auto 28px;background:#E5E5E5;line-height:1px;font-size:1px">&nbsp;</div>')
      + '<div style="max-width:680px;margin:0 auto;padding:0 24px 32px">'
      + '<div style="' + calloutStyle + '">'
      + '<p style="margin:0 0 16px;color:#171717;font-size:17px;line-height:1.65">' + intro + '</p>'
      + (excerpt ? '<p style="margin:0;color:#525252;font-size:16px;line-height:1.75">' + excerpt + '</p>' : '')
      + '</div>'
      + (articleUrl
        ? '<p style="margin:30px 0 34px"><a href="' + escapeHtml(articleUrl) + '" style="display:inline-block;background:#D93A3A;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:6px;font-size:15px;font-weight:800">' + ctaLabel + '</a></p>'
        : '')
      + '<div style="height:1px;background:#E5E5E5;line-height:1px;font-size:1px">&nbsp;</div>'
      + '<p style="margin:18px 0 0;color:#737373;font-size:13px;line-height:1.6">' + footerText + '</p>'
      + buildUnsubscribeFooter(locale, unsubscribeUrl)
      + '</div>'
      + '</div>',
  };
}

function unsubscribeSubscriber(app, subscriberId, email) {
  var normalizedSubscriberId = String(subscriberId || '').trim();
  var normalizedEmail = normalizeEmail(email);
  var subscriber = null;

  if (!normalizedSubscriberId) {
    return { status: 'invalid_request' };
  }

  try {
    subscriber = app.findRecordById('newsletter_subscribers', normalizedSubscriberId);
  } catch (error) {
    subscriber = null;
  }

  if (!subscriber) {
    if (normalizedEmail && isEmailSuppressed(app, normalizedEmail)) {
      return { status: 'already_unsubscribed' };
    }

    return { status: 'invalid_request' };
  }

  var subscriberEmail = normalizeEmail(subscriber.getString('email'));

  if (normalizedEmail && subscriberEmail !== normalizedEmail) {
    return { status: 'invalid_request' };
  }

  app.delete(subscriber);
  suppressEmail(app, subscriberEmail);

  return {
    status: 'unsubscribed',
    email: subscriberEmail,
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
  var mail = buildNewsletterUpdateEmail(app, record, subscriber);

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

function sendNewsletterNotifications(app, record, options) {
  options = options || {};

  if (record.getString('status') !== 'published') {
    return { sentCount: 0, skipped: 'not_published' };
  }

  if (record.getString('notificationSentAt') && !options.force) {
    return {
      sentCount: record.getInt ? record.getInt('notificationRecipientCount') : 0,
      skipped: 'already_sent',
    };
  }

  syncRegisteredUsersAsSubscribers(app);

  var subscribers = app.findRecordsByFilter('newsletter_subscribers', 'isActive = true', '', 0, 0);
  if (!subscribers.length) {
    markNotificationSent(app, record, 0);
    return { sentCount: 0 };
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

  return { sentCount: sentCount };
}

module.exports = {
  buildPasswordResetEmail: buildPasswordResetEmail,
  buildPasswordResetUrl: buildPasswordResetUrl,
  getFrontendPublicUrl: getFrontendPublicUrl,
  getSubscribeErrorMessage: getSubscribeErrorMessage,
  isValidEmail: isValidEmail,
  normalizeEmail: normalizeEmail,
  normalizeLocale: normalizeLocale,
  normalizeSource: normalizeSource,
  sendMailWithInsecureTlsVerification: sendMailWithInsecureTlsVerification,
  sendNewsletterNotifications: sendNewsletterNotifications,
  shouldSkipSmtpTlsVerification: shouldSkipSmtpTlsVerification,
  subscribeEmail: subscribeEmail,
  syncRegisteredUsersAsSubscribers: syncRegisteredUsersAsSubscribers,
  unsubscribeSubscriber: unsubscribeSubscriber,
  upsertSubscriber: upsertSubscriber,
  upsertSubscriberForUser: upsertSubscriberForUser,
};
