// A short, bounded cache for identical summary reads. Every newsletter write
// advances the generation, including writes from scheduled document imports.
var PREFIX = 'newsletter:summary:';
var GENERATION = PREFIX + 'generation';
var KEYS = PREFIX + 'keys';
var TTL = 5000;
var LIMIT = 64;

function read(app, key, compute) {
  if (typeof app.store !== 'function') return compute();
  var store = app.store(), name = PREFIX + key;
  var generation = store.get(GENERATION) || '';
  var entry = store.get(name);
  if (entry && entry.generation === generation && entry.expiresAt > Date.now()) return entry.value;
  var value = compute();
  if ((store.get(GENERATION) || '') !== generation) return value;
  store.set(name, { generation: generation, expiresAt: Date.now() + TTL, value: value });
  var evicted = [];
  store.setFunc(KEYS, function (previous) {
    var keys;
    try { keys = JSON.parse(previous || '[]'); } catch (_) { keys = []; }
    keys = keys.filter(function (current) { return current !== name; });
    keys.push(name);
    while (keys.length > LIMIT) evicted.push(keys.shift());
    return JSON.stringify(keys);
  });
  evicted.forEach(function (previous) { store.remove(previous); });
  return value;
}

function invalidate(app) { app.store().set(GENERATION, $security.randomString(24)); }
module.exports = { read: read, invalidate: invalidate };
