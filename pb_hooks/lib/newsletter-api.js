var SUMMARY_FIELDS = [
  'id', 'title', 'subtitle', 'excerpt', 'author', 'publishedAt', 'updated',
  'readTime', 'coverImage', 'status', 'tags', 'likes', 'comments', 'shares',
];

function summarize(article) {
  var summary = {};
  SUMMARY_FIELDS.forEach(function (field) { summary[field] = article[field]; });
  var id = encodeURIComponent(summary.id);
  summary.articlePath = '/article/' + id;
  summary.pagePath = '/api/v1/newsletters/' + id + '/page';
  return summary;
}

function list(e) {
  var result = require(__hooks + '/lib/api-manager.js').listPublishedNewsletters(e);
  result.items = result.items.map(summarize);
  return e.json(200, result);
}

function findPublished(e) {
  var record;
  try { record = e.app.findRecordById('newsletters', e.request.pathValue('id')); }
  catch (_) { throw new NotFoundError('Published newsletter not found.'); }
  if (record.getString('status') !== 'published') throw new NotFoundError('Published newsletter not found.');
  return record;
}

function files(record, field) {
  var prefix = '/api/files/' + encodeURIComponent(record.collection().id) + '/' + encodeURIComponent(record.id) + '/';
  return record.getStringSlice(field).map(function (name) {
    return { name: name, path: prefix + encodeURIComponent(name) };
  });
}

function get(e) {
  var record = findPublished(e);
  var article = summarize(record.publicExport());
  article.content = record.getString('content');
  article.presentationFiles = files(record, 'presentationFiles');
  article.presentationPreviewFiles = files(record, 'presentationPreviewFiles');
  return e.json(200, article);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page(e) {
  var record = findPublished(e);
  var title = escapeHtml(record.getString('title'));
  var subtitle = escapeHtml(record.getString('subtitle'));
  var byline = [record.getString('author'), record.getString('publishedAt')].filter(Boolean).map(escapeHtml).join(' · ');
  var cover = record.getString('coverImage');
  var coverHtml = /^(?:https?:\/\/|\/(?!\/)|data:image\/(?:png|jpe?g|gif|webp|avif);base64,)/i.test(cover)
    ? '<img src="' + escapeHtml(cover) + '" alt="">' : '';
  var attachments = files(record, 'presentationFiles').map(function (file) {
    return '<li><a href="' + escapeHtml(file.path) + '">' + escapeHtml(file.name) + '</a></li>';
  }).join('');

  // The stored body is author HTML. Sandbox the document and block active
  // content while keeping its formatting, images and direct media available.
  var policy = "default-src 'none'; img-src http: https: data:; media-src http: https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  var headers = e.response.header();
  headers.set('Content-Security-Policy', 'sandbox; frame-ancestors \'none\'; ' + policy);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return e.html(200, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="' + escapeHtml(policy) + '"><meta name="referrer" content="no-referrer">' +
    '<title>' + title + '</title><style>main{max-width:72ch;margin:2rem auto;padding:0 1rem}img,video{max-width:100%;height:auto}table,pre{max-width:100%;overflow:auto}body{font:1rem/1.6 system-ui,sans-serif;overflow-wrap:anywhere}</style>' +
    '</head><body><main><article dir="auto"><header><h1>' + title + '</h1>' +
    (subtitle ? '<p>' + subtitle + '</p>' : '') + (byline ? '<p>' + byline + '</p>' : '') + coverHtml +
    '</header><div>' + record.getString('content') + '</div>' +
    (attachments ? '<footer><h2>Presentations</h2><ul>' + attachments + '</ul></footer>' : '') +
    '</article></main></body></html>');
}

module.exports = { list: list, get: get, page: page };
