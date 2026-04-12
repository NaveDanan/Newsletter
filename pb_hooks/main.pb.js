routerAdd('POST', '/api/newsletter/subscribe', function (e) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  var body = e.requestInfo().body || {};
  var email = helpers.normalizeEmail(body.email);

  if (!helpers.isValidEmail(email)) {
    throw new BadRequestError('A valid email address is required.');
  }

  var locale = helpers.normalizeLocale(body.locale);
  var source = helpers.normalizeSource(body.source);
  var subscriber = null;

  try {
    subscriber = e.app.findFirstRecordByFilter('newsletter_subscribers', 'email = {:email}', {
      email: email,
    });
  } catch (error) {
    subscriber = null;
  }

  if (!subscriber) {
    var collection = e.app.findCollectionByNameOrId('newsletter_subscribers');
    subscriber = new Record(collection);
    subscriber.set('email', email);
  }

  subscriber.set('locale', locale);
  subscriber.set('isActive', true);
  subscriber.set('source', source);

  e.app.save(subscriber);

  return e.json(200, { status: 'ok' });
}, $apis.bodyLimit(16384), $apis.skipSuccessActivityLog());

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