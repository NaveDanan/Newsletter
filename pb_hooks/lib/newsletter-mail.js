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

function createTempMailPayloadPath() {
  var tempDir = String($os.tempDir() || '/tmp').replace(/[\\\/]+$/, '');
  var suffix = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000));
  return tempDir + '/pocketbase-mail-' + suffix + '.json';
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

// Inline (cid:) images travel to the Node mailer as temporary files; the
// caller removes them after sending.
function serializeInlineAttachments(message, payloadPath) {
  var result = [];
  var attachments = message && message.inlineAttachments;

  if (!attachments) {
    return result;
  }

  var names = Object.keys(attachments);
  for (var i = 0; i < names.length; i += 1) {
    var path = payloadPath + '.inline-' + i;
    $os.writeFile(path, toBytes(attachments[names[i]]), 384);
    result.push({ cid: String(names[i]), path: path });
  }

  return result;
}

function serializeMessage(message, app, payloadPath) {
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
    inline: serializeInlineAttachments(message, payloadPath),
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

  var payloadPath = createTempMailPayloadPath();
  var serialized = serializeMessage(message, app, payloadPath);
  $os.writeFile(payloadPath, JSON.stringify({
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
    message: serialized,
  }), 384);

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
    for (var i = 0; i < serialized.inline.length; i += 1) {
      try { $os.remove(serialized.inline[i].path); } catch (_) {}
    }
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

function getRecordLocale(record, fallback) {
  try {
    return normalizeLocale(record && record.getString ? record.getString('locale') : fallback);
  } catch (_) {
    return normalizeLocale(fallback);
  }
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

  var locale = normalizeLocale(options.locale);
  var source = normalizeSource(options.source || 'registered_account');
  var subscriber = findSubscriberByEmail(app, email);

  if (!subscriber) {
    var collection = app.findCollectionByNameOrId('newsletter_subscribers');
    subscriber = new Record(collection);
    subscriber.set('email', email);
    subscriber.set('locale', locale);
    subscriber.set('isActive', true);
    subscriber.set('source', source);
    app.save(subscriber);
    return subscriber;
  }

  // An existing row keeps its isActive value: a subscriber an admin switched
  // off in the PocketBase UI must stay off through the registered-user sync,
  // user record updates and repeated subscribe requests.
  if (subscriber.getString('locale') !== locale || subscriber.getString('source') !== source) {
    subscriber.set('locale', locale);
    subscriber.set('source', source);
    app.save(subscriber);
  }

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
    locale: getRecordLocale(user, 'he'),
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

function buildVerificationUrl(token) {
  var baseUrl = getFrontendPublicUrl();
  if (!baseUrl || !token) {
    return '';
  }

  return baseUrl + '/verify-email/' + encodeURIComponent(token);
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

// All emails share one layout tuned for older Outlook desktop: fixed-width
// tables with bgcolor attributes, hex colours only and inline styles. Rounded
// corners and the web font are progressive extras that Outlook skips.
var EMAIL_WIDTH = 880;
var EMAIL_GUTTER = 40;
var EMAIL_CONTENT_WIDTH = EMAIL_WIDTH - EMAIL_GUTTER * 2;
var EMAIL_FONT = "'Plus Jakarta Sans',Heebo,'Segoe UI',Arial,sans-serif";

function emailImages() {
  return require(__hooks + '/lib/email-image.js');
}

function emailThemes() {
  return require(__hooks + '/lib/email-theme.js');
}

function getSubscriberTheme(app, subscriber) {
  return emailThemes().themeForEmail(app, subscriber ? subscriber.getString('email') : '');
}

function buildUnsubscribeFooter(locale, unsubscribeUrl, theme) {
  var unsubscribeLabel = locale === 'he' ? 'הסרה מהרשימה' : 'Unsubscribe';
  var unsubscribeCopy = locale === 'he'
    ? 'אם אינכם רוצים לקבל עדכוני ניוזלטר נוספים, אפשר להסיר את עצמכם כאן.'
    : 'If you no longer want newsletter updates, you can unsubscribe here.';

  return ''
    + '<p style="margin:8px 0 0;color:' + theme.textMuted + ';font-family:' + EMAIL_FONT + ';font-size:12px;line-height:19px">'
    + unsubscribeCopy
    + (unsubscribeUrl
      ? ' <a href="' + escapeHtml(unsubscribeUrl) + '" style="color:' + theme.accentText + ';text-decoration:underline;font-weight:700">' + unsubscribeLabel + '</a>'
      : '')
    + '</p>';
}

// A pill button on the recipient's accent. Outlook ignores padding on links,
// so mso-padding-alt pads the cell there instead.
function buildEmailButton(url, label, align, theme) {
  if (!url) {
    return '';
  }

  return ''
    + '<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="' + align + '" style="border-collapse:separate;margin:0">'
    + '<tr>'
    + '<td align="center" bgcolor="' + theme.accent + '" style="background:' + theme.accent + ';border-radius:9999px;mso-padding-alt:14px 30px">'
    + '<a href="' + escapeHtml(url) + '" style="display:inline-block;padding:14px 30px;border-radius:9999px;color:' + theme.accentContrast + ';font-family:' + EMAIL_FONT + ';font-size:15px;line-height:18px;font-weight:700;text-decoration:none">' + label + '</a>'
    + '</td>'
    + '</tr>'
    + '</table>';
}

function buildDivider(theme) {
  return '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td height="1" bgcolor="' + theme.border + '" style="height:1px;line-height:1px;font-size:1px;background:' + theme.border + '">&nbsp;</td></tr></table>';
}

function buildSpacer(height) {
  return '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td height="' + height + '" style="height:' + height + 'px;line-height:' + height + 'px;font-size:1px">&nbsp;</td></tr></table>';
}

// Covers are usually data URLs; they are compressed and attached inline (cid:)
// when `inlineImages` is given. The record id + update time identify the
// cover, so a send run prepares each image once instead of per subscriber.
function buildCoverImage(app, record, alt, maxWidth, inlineImages, radius) {
  var html = emailImages().buildEmailImage({
    app: app,
    inlineImages: inlineImages,
    src: record.getString('coverImage'),
    alt: alt,
    maxWidth: maxWidth,
    baseUrl: getFrontendPublicUrl(),
    cacheKey: 'newsletter:' + record.id + ':' + record.getString('updated'),
  });

  return radius && html ? html.replace('style="', 'style="border-radius:' + radius + ';') : html;
}

function buildEmailShell(options) {
  var theme = options.theme;
  var direction = options.direction || 'ltr';
  var textAlign = options.textAlign || 'left';
  var locale = direction === 'rtl' ? 'he' : 'en';
  var preheader = options.preheader || '';
  var footerBrand = options.footerBrand || '';

  return ''
    + '<!doctype html>'
    + '<html lang="' + locale + '" dir="' + direction + '" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
    + '<head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    + '<meta name="color-scheme" content="' + theme.mode + '">'
    + '<meta name="supported-color-schemes" content="' + theme.mode + '">'
    // 96 PPI stops Outlook on scaled Windows displays from resizing images
    // and table widths; the font rule avoids its Times New Roman fallback.
    + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>'
    + '<style>table,td,p,a,h1,h2,span,div{font-family:"Segoe UI",Arial,sans-serif !important}</style><![endif]-->'
    + '<style>@media screen and (max-width:640px){.email-gutter{padding-left:20px !important;padding-right:20px !important}.email-title{font-size:30px !important;line-height:36px !important}}</style>'
    + '</head>'
    + '<body bgcolor="' + theme.outer + '" style="margin:0;padding:0;background:' + theme.outer + ';-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">'
    + '<div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;mso-hide:all">' + preheader + '</div>'
    + '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="' + theme.outer + '" style="border-collapse:collapse;background:' + theme.outer + ';width:100%">'
    + '<tr>'
    + '<td align="center" style="padding:32px 12px">'
    + '<table role="presentation" width="' + EMAIL_WIDTH + '" align="center" border="0" cellspacing="0" cellpadding="0" dir="' + direction + '" bgcolor="' + theme.card + '" style="border-collapse:separate;width:100%;max-width:' + EMAIL_WIDTH + 'px;background:' + theme.card + ';border:1px solid ' + theme.border + ';border-radius:22px;text-align:' + textAlign + ';font-family:' + EMAIL_FONT + ';color:' + theme.text + '">'
    + '<tr><td height="6" bgcolor="' + theme.accent + '" style="height:6px;line-height:6px;font-size:1px;background:' + theme.accent + ';border-radius:22px 22px 0 0">&nbsp;</td></tr>'
    + options.body
    + '</table>'
    + (footerBrand
      ? '<table role="presentation" width="' + EMAIL_WIDTH + '" align="center" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:' + EMAIL_WIDTH + 'px"><tr><td align="center" style="padding:20px 12px 0;color:' + theme.textMuted + ';font-family:' + EMAIL_FONT + ';font-size:12px;line-height:18px">' + footerBrand + '</td></tr></table>'
      : '')
    + '</td>'
    + '</tr>'
    + '</table>'
    + '</body></html>';
}

function buildEmailHeader(options) {
  var theme = options.theme;

  return ''
    + '<tr><td class="email-gutter" style="padding:36px ' + EMAIL_GUTTER + 'px 28px;font-family:' + EMAIL_FONT + ';text-align:' + options.textAlign + '">'
    + '<p style="margin:0 0 14px;color:' + theme.accentText + ';font-size:12px;line-height:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase">' + escapeHtml(options.appName) + '</p>'
    + (options.eyebrow ? '<p style="margin:0 0 18px;color:' + theme.textMuted + ';font-size:13px;line-height:18px;font-weight:600">' + options.eyebrow + '</p>' : '')
    + '<h1 class="email-title" style="margin:0;color:' + theme.text + ';font-size:40px;line-height:46px;font-weight:800">' + options.title + '</h1>'
    + (options.subtitle ? '<p style="margin:16px 0 0;color:' + theme.textSecondary + ';font-size:19px;line-height:30px;font-weight:500">' + options.subtitle + '</p>' : '')
    + '</td></tr>';
}

// The accent-tinted callout with a coloured edge on the reading side.
function buildCallout(theme, textAlign, html) {
  var edge = textAlign === 'right' ? 'border-right' : 'border-left';

  return ''
    + '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:separate">'
    + '<tr><td bgcolor="' + theme.accentWash + '" style="background:' + theme.accentWash + ';' + edge + ':4px solid ' + theme.accent + ';border-radius:14px;padding:22px 26px;font-family:' + EMAIL_FONT + ';text-align:' + textAlign + '">'
    + html
    + '</td></tr>'
    + '</table>';
}

function buildNewsletterUpdateEmail(app, record, subscriber, inlineImages) {
  var locale = normalizeLocale(subscriber.getString('locale'));
  var theme = getSubscriberTheme(app, subscriber);
  var appName = getAppName(app);
  var subject = locale === 'he'
    ? 'ניוזלטר חדש מ-' + appName
    : 'A new newsletter from ' + appName;
  var title = escapeHtml(record.getString('title'));
  var subtitle = escapeHtml(record.getString('subtitle'));
  var excerptSource = stripHtml(record.getString('excerpt') || record.getString('content'));
  var excerpt = escapeHtml(excerptSource.slice(0, 320));
  var articleUrl = buildArticleUrl(record);
  var coverImage = buildCoverImage(app, record, title, EMAIL_CONTENT_WIDTH, inlineImages, '18px');
  var publishedAt = escapeHtml(record.getString('publishedAt'));
  var readTime = escapeHtml(record.getString('readTime'));
  var direction = locale === 'he' ? 'rtl' : 'ltr';
  var textAlign = getNewsletterTextAlignment(record);
  var ctaLabel = locale === 'he'
    ? 'לקריאת הניוזלטר'
    : 'Read the newsletter';
  var latestLabel = locale === 'he'
    ? 'פורסם עכשיו באתר'
    : 'Fresh on the site';
  var footerText = locale === 'he'
    ? 'קיבלתם את ההודעה כי נרשמתם לעדכוני הניוזלטר.'
    : 'You received this email because you subscribed to newsletter updates.';
  var intro = locale === 'he'
    ? 'ניוזלטר חדש עלה לאתר עם תובנות ועדכונים שכדאי לפתוח.'
    : 'A new newsletter is live on the site, with the latest signals and practical takeaways.';
  var meta = [publishedAt, readTime].filter(function (value) { return Boolean(value); }).join(' / ');
  var buttonAlign = textAlign === 'right' ? 'right' : textAlign === 'center' ? 'center' : 'left';
  var unsubscribeUrl = buildUnsubscribeUrl(subscriber);
  var body = ''
    + buildEmailHeader({
      theme: theme,
      textAlign: textAlign,
      appName: appName,
      eyebrow: latestLabel + (meta ? ' / ' + meta : ''),
      title: title,
      subtitle: subtitle,
    })
    + (coverImage
      ? '<tr><td class="email-gutter" align="center" style="padding:0 ' + EMAIL_GUTTER + 'px 32px">' + coverImage + '</td></tr>'
      : '<tr><td class="email-gutter" style="padding:0 ' + EMAIL_GUTTER + 'px 32px">' + buildDivider(theme) + '</td></tr>')
    + '<tr><td class="email-gutter" style="padding:0 ' + EMAIL_GUTTER + 'px 36px;font-family:' + EMAIL_FONT + ';text-align:' + textAlign + '">'
    + buildCallout(theme, textAlign, ''
      + '<p style="margin:0' + (excerpt ? ' 0 14px' : '') + ';color:' + theme.text + ';font-size:17px;line-height:28px;font-weight:600">' + intro + '</p>'
      + (excerpt ? '<p style="margin:0;color:' + theme.textSecondary + ';font-size:16px;line-height:28px">' + excerpt + '</p>' : ''))
    + (articleUrl ? '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td align="' + buttonAlign + '" style="padding:32px 0 36px">' + buildEmailButton(articleUrl, ctaLabel, buttonAlign, theme) + '</td></tr></table>' : buildSpacer(32))
    + buildDivider(theme)
    + '<p style="margin:18px 0 0;color:' + theme.textMuted + ';font-size:13px;line-height:21px">' + footerText + '</p>'
    + buildUnsubscribeFooter(locale, unsubscribeUrl, theme)
    + '</td></tr>';

  return {
    subject: subject,
    html: buildEmailShell({
      theme: theme,
      direction: direction,
      textAlign: textAlign,
      preheader: intro,
      body: body,
    }),
  };
}

function buildDigestNewsletterItem(app, record, locale, theme, inlineImages) {
  var title = escapeHtml(record.getString('title'));
  var subtitle = escapeHtml(record.getString('subtitle'));
  var excerptSource = stripHtml(record.getString('excerpt') || record.getString('content'));
  var excerpt = escapeHtml(excerptSource.slice(0, 260));
  var articleUrl = buildArticleUrl(record);
  // The card's 1px border leaves 2px less than the content column.
  var coverImage = buildCoverImage(app, record, title, EMAIL_CONTENT_WIDTH - 2, inlineImages, '18px 18px 0 0');
  var publishedAt = escapeHtml(record.getString('publishedAt'));
  var readTime = escapeHtml(record.getString('readTime'));
  var meta = [publishedAt, readTime].filter(function (value) { return Boolean(value); }).join(' / ');
  var textAlign = locale === 'he' ? 'right' : 'left';
  var arrow = locale === 'he' ? '&larr;' : '&rarr;';
  var ctaLabel = locale === 'he'
    ? 'לקריאת הניוזלטר'
    : 'Read newsletter';
  var banner = coverImage
    ? '<tr><td align="center" style="padding:0;line-height:0;font-size:0">' + coverImage + '</td></tr>'
    : '<tr><td align="center" height="120" bgcolor="' + theme.accent + '" style="height:120px;background:' + theme.accent + ';border-radius:18px 18px 0 0;color:' + theme.accentContrast + ';font-family:' + EMAIL_FONT + ';font-size:14px;line-height:20px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:0 24px">' + (title || escapeHtml(getAppName(app))) + '</td></tr>';

  return ''
    + '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="' + theme.surface + '" style="border-collapse:separate;background:' + theme.surface + ';border:1px solid ' + theme.border + ';border-radius:18px">'
    + banner
    + '<tr><td style="padding:26px 30px 30px;font-family:' + EMAIL_FONT + ';text-align:' + textAlign + '">'
    + (meta ? '<p style="margin:0 0 10px;color:' + theme.textMuted + ';font-size:12px;line-height:17px;font-weight:700">' + meta + '</p>' : '')
    + '<h2 style="margin:0 0 10px;color:' + theme.text + ';font-size:26px;line-height:33px;font-weight:800">' + title + '</h2>'
    + (subtitle ? '<p style="margin:0 0 12px;color:' + theme.textSecondary + ';font-size:16px;line-height:25px;font-weight:600">' + subtitle + '</p>' : '')
    + (excerpt ? '<p style="margin:0 0 18px;color:' + theme.textSecondary + ';font-size:15px;line-height:25px">' + excerpt + '</p>' : '')
    + (articleUrl
      ? '<p style="margin:0"><a href="' + escapeHtml(articleUrl) + '" style="color:' + theme.accentText + ';text-decoration:none;font-size:15px;line-height:20px;font-weight:800">' + ctaLabel + ' ' + arrow + '</a></p>'
      : '')
    + '</td></tr>'
    + '</table>'
    + buildSpacer(24);
}

function buildNewsletterDigestEmail(app, records, subscriber, inlineImages) {
  var locale = 'he';
  var theme = getSubscriberTheme(app, subscriber);
  var appName = getAppName(app);
  var direction = locale === 'he' ? 'rtl' : 'ltr';
  var textAlign = locale === 'he' ? 'right' : 'left';
  var count = records.length;
  var subject = locale === 'he'
    ? 'עדכוני ניוזלטר חדשים מ-' + appName
    : 'New newsletter updates from ' + appName;
  var title = locale === 'he'
    ? 'עדכוני הניוזלטר האחרונים'
    : 'Latest newsletter updates';
  var intro = locale === 'he'
    ? 'ריכזנו עבורכם ' + count + ' פרסומים חדשים שעלו לאתר.'
    : 'Here are ' + count + ' new newsletter publications now available on the site.';
  var footerText = locale === 'he'
    ? 'קיבלתם את ההודעה כי נרשמתם לעדכוני הניוזלטר.'
    : 'You received this email because you subscribed to newsletter updates.';
  var unsubscribeUrl = buildUnsubscribeUrl(subscriber);
  var items = '';

  for (var i = 0; i < records.length; i += 1) {
    items += buildDigestNewsletterItem(app, records[i], locale, theme, inlineImages);
  }
  var body = ''
    + buildEmailHeader({
      theme: theme,
      textAlign: textAlign,
      appName: appName,
      title: title,
      subtitle: intro,
    })
    + '<tr><td class="email-gutter" style="padding:0 ' + EMAIL_GUTTER + 'px 36px;font-family:' + EMAIL_FONT + ';text-align:' + textAlign + '">'
    + items
    + buildDivider(theme)
    + '<p style="margin:18px 0 0;color:' + theme.textMuted + ';font-size:13px;line-height:21px">' + footerText + '</p>'
    + buildUnsubscribeFooter(locale, unsubscribeUrl, theme)
    + '</td></tr>';

  return {
    subject: subject,
    html: buildEmailShell({
      theme: theme,
      direction: direction,
      textAlign: textAlign,
      preheader: intro,
      body: body,
    }),
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
  var locale = getRecordLocale(record, 'he');
  var isHebrew = locale === 'he';

  return buildTransactionalEmailTable(app, {
    subject: isHebrew ? 'איפוס סיסמה ב-' + appName : 'Reset your ' + appName + ' password',
    title: isHebrew ? 'איפוס סיסמה' : 'Reset your password',
    eyebrow: isHebrew ? 'אבטחת החשבון' : 'Account security',
    greeting: isHebrew ? 'שלום ' + displayName + ',' : 'Hello ' + displayName + ',',
    body: isHebrew
      ? 'קיבלנו בקשה לאיפוס הסיסמה לחשבון שלכם ב-' + appName + '. השתמשו בקישור המאובטח כדי לבחור סיסמה חדשה.'
      : 'We received a request to reset your ' + appName + ' password. Use the secure link below to choose a new one.',
    actionUrl: resetUrl,
    actionLabel: isHebrew ? 'בחירת סיסמה חדשה' : 'Set a new password',
    note: isHebrew
      ? 'אם לא ביקשתם את השינוי הזה, אפשר להתעלם מהאימייל. הקישור יפוג בהתאם להגדרות האבטחה של החשבון.'
      : 'If you did not request this change, you can ignore this email. The link expires according to your account security settings.',
    locale: locale,
    theme: emailThemes().buildTheme(emailThemes().readPreferences(record)),
  });
}

function buildVerificationEmail(app, record, verificationUrl) {
  var appName = getAppName(app);
  var displayName = record.getString('name') || record.email();
  var locale = getRecordLocale(record, 'he');
  var isHebrew = locale === 'he';

  return buildTransactionalEmailTable(app, {
    subject: isHebrew ? 'אימות אימייל ב-' + appName : 'Verify your ' + appName + ' email',
    title: isHebrew ? 'אימות כתובת האימייל' : 'Verify your email',
    eyebrow: isHebrew ? 'ברוכים הבאים ל-' + appName : 'Welcome to ' + appName,
    greeting: isHebrew ? 'שלום ' + displayName + ',' : 'Hello ' + displayName + ',',
    body: isHebrew
      ? 'תודה שהצטרפתם ל-' + appName + '. אשרו את כתובת האימייל כדי להשלים את הפעלת החשבון.'
      : 'Thanks for joining ' + appName + '. Confirm your email address so your account is ready to use.',
    actionUrl: verificationUrl,
    actionLabel: isHebrew ? 'אימות האימייל' : 'Verify email',
    note: isHebrew
      ? 'אם לא יצרתם את החשבון הזה, אפשר להתעלם מהאימייל.'
      : 'If you did not create this account, you can ignore this email.',
    locale: locale,
    theme: emailThemes().buildTheme(emailThemes().readPreferences(record)),
  });
}

function buildTransactionalEmailTable(app, options) {
  var appName = getAppName(app);
  var locale = normalizeLocale(options.locale);
  var theme = options.theme || emailThemes().buildTheme();
  var isHebrew = locale === 'he';
  var direction = isHebrew ? 'rtl' : 'ltr';
  var textAlign = isHebrew ? 'right' : 'left';
  var buttonAlign = isHebrew ? 'right' : 'left';
  var fallbackCopy = isHebrew
    ? 'אם הכפתור לא נפתח, אפשר להשתמש בקישור הזה:'
    : 'If the button does not work, open this link:';
  var subject = String(options.subject || appName);
  var title = escapeHtml(options.title || appName);
  var eyebrow = escapeHtml(options.eyebrow || appName);
  var greeting = escapeHtml(options.greeting || 'Hello,');
  var body = escapeHtml(options.body || '');
  var actionUrl = escapeHtml(options.actionUrl || '');
  var actionLabel = escapeHtml(options.actionLabel || 'Open');
  var note = escapeHtml(options.note || '');
  var bodyHtml = ''
    + buildEmailHeader({
      theme: theme,
      textAlign: textAlign,
      appName: appName,
      eyebrow: eyebrow,
      title: title,
    })
    + '<tr><td class="email-gutter" style="padding:0 ' + EMAIL_GUTTER + 'px 36px;font-family:' + EMAIL_FONT + ';text-align:' + textAlign + '">'
    + buildCallout(theme, textAlign, ''
      + '<p style="margin:0 0 12px;color:' + theme.text + ';font-size:16px;line-height:23px;font-weight:700">' + greeting + '</p>'
      + '<p style="margin:0;color:' + theme.textSecondary + ';font-size:16px;line-height:28px">' + body + '</p>')
    + (actionUrl ? '<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td align="' + buttonAlign + '" style="padding:30px 0">' + buildEmailButton(options.actionUrl || '', actionLabel, buttonAlign, theme) + '</td></tr></table>' : buildSpacer(30))
    + (actionUrl ? '<p style="margin:0 0 22px;color:' + theme.textMuted + ';font-size:12px;line-height:20px">' + fallbackCopy + '<br><a href="' + actionUrl + '" style="color:' + theme.accentText + ';text-decoration:underline;word-break:break-all">' + actionUrl + '</a></p>' : '')
    + buildDivider(theme)
    + (note ? '<p style="margin:18px 0 0;color:' + theme.textMuted + ';font-size:13px;line-height:22px">' + note + '</p>' : '')
    + '</td></tr>';

  return {
    subject: subject,
    html: buildEmailShell({
      theme: theme,
      direction: direction,
      textAlign: textAlign,
      preheader: body,
      body: bodyHtml,
      footerBrand: escapeHtml(appName),
    }),
  };
}

// Builds the message, attaches its compressed inline images and sends it.
// `build(inlineImages)` returns { subject, html } and collects the images.
function sendBuiltEmail(app, mailClient, address, build, subjectPrefix) {
  var inlineImages = [];
  var mail = build(inlineImages);
  var message = new MailerMessage({
    from: getSender(app),
    to: [{ address: address }],
    subject: (subjectPrefix || '') + mail.subject,
    html: mail.html,
  });
  var release = emailImages().attachInlineImages(message, inlineImages);

  try {
    mailClient.send(message);
  } finally {
    release();
  }
}

function markNotificationSent(app, record, sentCount) {
  record.set('notificationSentAt', new Date().toISOString());
  record.set('notificationRecipientCount', sentCount);
  app.save(record);
}

function sendNewsletterDigestNotifications(app, records, subscribers) {
  var mailClient = app.newMailClient();
  var sentCount = 0;
  var newsletterIds = [];

  records = records || [];
  subscribers = subscribers || [];

  for (var i = 0; i < records.length; i += 1) {
    newsletterIds.push(records[i].id);
  }

  for (var j = 0; j < subscribers.length; j += 1) {
    var subscriber = subscribers[j];
    var email = normalizeEmail(subscriber.getString('email'));

    if (!isValidEmail(email)) {
      continue;
    }

    try {
      sendBuiltEmail(app, mailClient, email, function (inlineImages) {
        return buildNewsletterDigestEmail(app, records, subscriber, inlineImages);
      });
      sentCount += 1;
    } catch (error) {
      console.error('Failed to send newsletter digest to ' + email + ':', error);
    }
  }

  for (var k = 0; k < records.length; k += 1) {
    markNotificationSent(app, records[k], sentCount);
  }

  return {
    recipientCount: sentCount,
    sentCount: sentCount,
    newsletterCount: records.length,
    newsletterIds: newsletterIds,
  };
}

// Sends one digest to a single address so admins can check the real email
// before subscribers get it. Nothing is marked as sent and no subscriber is
// created; delivery errors are thrown so the caller can report them.
function sendNewsletterDigestTest(app, records, email) {
  email = normalizeEmail(email);

  if (!isValidEmail(email)) {
    throw new BadRequestError('A valid email address is required.');
  }

  var recipient = findSubscriberByEmail(app, email) || {
    id: '',
    getString: function (key) {
      return key === 'email' ? email : '';
    },
  };

  sendBuiltEmail(app, app.newMailClient(), email, function (inlineImages) {
    return buildNewsletterDigestEmail(app, records, recipient, inlineImages);
  }, '[TEST] ');

  return {
    email: email,
    newsletterCount: records.length,
    newsletterIds: records.map(function (record) { return record.id; }),
  };
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
      sendBuiltEmail(app, mailClient, email, function (inlineImages) {
        return buildNewsletterUpdateEmail(app, record, subscriber, inlineImages);
      });
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
  buildVerificationEmail: buildVerificationEmail,
  buildVerificationUrl: buildVerificationUrl,
  getFrontendPublicUrl: getFrontendPublicUrl,
  getSubscribeErrorMessage: getSubscribeErrorMessage,
  isValidEmail: isValidEmail,
  normalizeEmail: normalizeEmail,
  normalizeLocale: normalizeLocale,
  normalizeSource: normalizeSource,
  sendMailWithInsecureTlsVerification: sendMailWithInsecureTlsVerification,
  sendNewsletterDigestNotifications: sendNewsletterDigestNotifications,
  sendNewsletterDigestTest: sendNewsletterDigestTest,
  sendNewsletterNotifications: sendNewsletterNotifications,
  shouldSkipSmtpTlsVerification: shouldSkipSmtpTlsVerification,
  subscribeEmail: subscribeEmail,
  syncRegisteredUsersAsSubscribers: syncRegisteredUsersAsSubscribers,
  unsubscribeSubscriber: unsubscribeSubscriber,
  upsertSubscriber: upsertSubscriber,
  upsertSubscriberForUser: upsertSubscriberForUser,
};
