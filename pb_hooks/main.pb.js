routerAdd('POST', '/api/newsletter/subscribe', function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  var body = e.requestInfo().body || {};
  var email = helpers.normalizeEmail(body.email);

  if (!helpers.isValidEmail(email)) {
    throw new BadRequestError('A valid email address is required.');
  }

  var result = helpers.subscribeEmail(e.app, email, {
    locale: body.locale,
    source: body.source,
  });

  if (result.status === 'invalid_domain') {
    throw new BadRequestError(helpers.getSubscribeErrorMessage('invalid_domain', body.locale));
  }

  return e.json(200, { status: result.status });
}, $apis.bodyLimit(16384), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/newsletter/unsubscribe', function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  var body = e.requestInfo().body || {};
  var result = helpers.unsubscribeSubscriber(e.app, body.subscriberId, body.email);

  if (result.status === 'invalid_request') {
    throw new BadRequestError('The unsubscribe link is invalid or has expired.');
  }

  return e.json(200, { status: result.status });
}, $apis.bodyLimit(16384), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/newsletter/migrate/inspect', function (e) {
  var migrate = require(__hooks + '/lib/pocketbase-migrate.js');
  migrate.ensureAdminAccess(e);

  try {
    var body = e.requestInfo().body || {};
    var folderFiles = e.findUploadedFiles('sourceFiles');
    if (folderFiles && folderFiles.length) {
      return e.json(200, migrate.inspectUploadedFolder(folderFiles, body.sourceFilePaths));
    }

    var files = e.findUploadedFiles('dataDb');
    if (!files || !files.length) {
      throw new BadRequestError('Upload the PocketBase data.db file first.');
    }

    return e.json(200, migrate.inspectUploadedDatabase(files[0]));
  } catch (error) {
    console.error('PocketBase migration inspect failed:', error);
    throw new BadRequestError(error && error.message ? error.message : String(error));
  }
}, $apis.requireAuth('users'), $apis.bodyLimit(0), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/newsletter/migrate/import', function (e) {
  var migrate = require(__hooks + '/lib/pocketbase-migrate.js');
  migrate.ensureAdminAccess(e);

  try {
    var body = e.requestInfo().body || {};
    var files = e.findUploadedFiles('sourceFiles');
    if (!files || !files.length) {
      throw new BadRequestError('Upload the PocketBase pb_data folder before running migration.');
    }

    return e.json(200, migrate.importUploadedFolder(files, body.sourceFilePaths));
  } catch (error) {
    console.error('PocketBase migration import failed:', error);
    throw new BadRequestError(error && error.message ? error.message : String(error));
  }
}, $apis.requireAuth('users'), $apis.bodyLimit(0), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/newsletter/presentation-upload', function (e) {
  var preview = require(__hooks + '/lib/presentation-preview.js');
  return preview.uploadPresentation(e);
}, $apis.requireAuth('users'), $apis.bodyLimit(0), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/newsletter/stats', function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  helpers.syncRegisteredUsersAsSubscribers(e.app);

  var activeSubscribers = e.app.findRecordsByFilter('newsletter_subscribers', 'isActive = true', '', 0, 0).length;
  var publishedNewsletters = e.app.findRecordsByFilter('newsletters', 'status = "published"', '', 0, 0).length;

  return e.json(200, {
    activeSubscribers: activeSubscribers,
    publishedNewsletters: publishedNewsletters,
  });
}, $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/newsletter/send-update', function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  var auth = e.auth;
  var body = e.requestInfo().body || {};
  var newsletterId = String(body.newsletterId || '').trim();

  if (!auth || auth.getString('role') !== 'admin') {
    throw new ForbiddenError('Admin role is required to send newsletter emails.');
  }

  if (!newsletterId) {
    throw new BadRequestError('A newsletterId is required.');
  }

  var newsletter = e.app.findRecordById('newsletters', newsletterId);

  if (newsletter.getString('status') !== 'published') {
    throw new BadRequestError('Only published newsletters can be emailed.');
  }

  var result = helpers.sendNewsletterNotifications(e.app, newsletter, { force: true });

  return e.json(200, {
    status: 'ok',
    recipientCount: result && typeof result.sentCount === 'number' ? result.sentCount : 0,
  });
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

onRecordAfterCreateSuccess(function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');

  try {
    helpers.sendNewsletterNotifications(e.app, e.record);
  } catch (error) {
    console.error('Newsletter notification send failed after create:', error);
  }

  return e.next();
}, 'newsletters');

onRecordAfterUpdateSuccess(function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');

  try {
    helpers.sendNewsletterNotifications(e.app, e.record);
  } catch (error) {
    console.error('Newsletter notification send failed after update:', error);
  }

  return e.next();
}, 'newsletters');

onRecordAfterCreateSuccess(function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  helpers.upsertSubscriberForUser(e.app, e.record);

  return e.next();
}, 'users');

onRecordAfterUpdateSuccess(function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  helpers.upsertSubscriberForUser(e.app, e.record);

  return e.next();
}, 'users');

onMailerRecordPasswordResetSend(function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  var token = e.meta && e.meta.token ? String(e.meta.token) : '';
  var resetUrl = helpers.buildPasswordResetUrl(token);

  if (!resetUrl) {
    return e.next();
  }

  var mail = helpers.buildPasswordResetEmail(e.app, e.record, resetUrl);
  e.message.subject = mail.subject;
  e.message.html = mail.html;

  return e.next();
}, 'users');

onMailerSend(function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');

  if (e.message && helpers.sendMailWithInsecureTlsVerification(e.app, e.message)) {
    return;
  }

  return e.next();
});
