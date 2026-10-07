// Internal derived data keeps page reads from loading embedded article images.
// Original article bodies, covers, timestamps and access rules are preserved.
onBootstrap(function (e) {
  e.next();
  var collection;
  try { collection = e.app.findCollectionByNameOrId('newsletters'); } catch (_) { return; }
  var changed = false;
  if (!collection.fields.getByName('searchText')) {
    collection.fields.add(new TextField({ name: 'searchText', max: 20000000, hidden: true }));
    changed = true;
  }
  var indexes = Array.from(collection.indexes || []);
  ['CREATE INDEX idx_newsletters_read_status ON newsletters (status, created DESC)',
    'CREATE INDEX idx_newsletters_read_owner ON newsletters (createdById, created DESC)'].forEach(function (index) {
    if (!indexes.some(function (current) { return current.indexOf(index.split(' ')[2]) !== -1; })) { indexes.push(index); changed = true; }
  });
  if (changed) { collection.indexes = indexes; e.app.save(collection); }
  try {
    var script = String($os.getenv('APP_ROOT') || __hooks + '/..') + '/scripts/pocketbase/newsletter-search.mjs';
    $os.cmd(String($os.getenv('NODE_BINARY') || 'node'), script, $filepath.join(e.app.dataDir(), 'data.db')).output();
  } catch (_) {
    // PocketBase can perform the one-time backfill itself without Node.
    var records = e.app.findRecordsByFilter('newsletters', 'searchText = "" && content != ""', '', 0, 0);
    records.forEach(function (record) {
      var text = require(__hooks + '/lib/api-manager.js').readableNewsletterText(record.getString('content'));
      e.app.db().newQuery('UPDATE newsletters SET searchText = {:text} WHERE id = {:id}').bind({ text: text, id: record.id }).execute();
    });
  }
});

function deriveSearchText(e) {
  var content = e.record.getString('content');
  var previous = e.record.original();
  var text = previous && previous.getString('content') === content
    ? previous.getString('searchText') : require(__hooks + '/lib/api-manager.js').readableNewsletterText(content);
  e.record.set('searchText', text);
  return e.next();
}
onRecordCreate(deriveSearchText, 'newsletters');
onRecordUpdate(deriveSearchText, 'newsletters');

function invalidateSummaries(e) {
  require(__hooks + '/lib/newsletter-read-cache.js').invalidate(e.app);
  return e.next();
}
onRecordAfterCreateSuccess(invalidateSummaries, 'newsletters');
onRecordAfterUpdateSuccess(invalidateSummaries, 'newsletters');
onRecordAfterDeleteSuccess(invalidateSummaries, 'newsletters');
