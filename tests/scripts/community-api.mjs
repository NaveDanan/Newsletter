// Run against a disposable PocketBase instance with pb_hooks/community.pb.js loaded.
// Every assertion goes through the hook routes rather than the record API, because
// the community collections lock every write rule and the hooks are the only writer.
import assert from 'node:assert/strict';
import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from '../../scripts/pocketbase/app-schema.mjs';
import { parseCommunityEntities } from '../../src/lib/community-text.ts';

const url = process.env.COMMUNITY_TEST_PB_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Set COMMUNITY_TEST_PB_URL to a disposable local PocketBase instance.');
const root = new PocketBase(url);
root.autoCancellation(false);
await root.collection('_superusers').authWithPassword('community-test@example.com', 'test-only-password-12345');
for (const schema of APP_COLLECTION_SCHEMAS) {
  try { await root.collections.getOne(schema.name); } catch { await root.collections.create(schema); }
}
const users = await root.collections.getOne('users');
if (!users.fields.some((f) => f.name === 'role')) await root.collections.update(users.id, { fields: [...users.fields, { name: 'role', type: 'text' }] });

// Four accounts cover the three permission tiers the hooks distinguish: an
// ordinary member, a second member for follows and blocks, an author who must
// NOT reach moderation, and a manager who must.
const ACCOUNTS = [['viewer', 'viewer'], ['second', 'viewer'], ['author', 'author'], ['manager', 'manager']];
for (const [name, role] of ACCOUNTS) {
  const email = `community-${name}@example.com`;
  try {
    const existing = await root.collection('users').getFirstListItem(`email = "${email}"`);
    if (existing.role !== role) await root.collection('users').update(existing.id, { role });
  } catch {
    await root.collection('users').create({ email, password: 'test-only-password-12345', passwordConfirm: 'test-only-password-12345', name: `Community ${name}`, role, verified: true });
  }
}

// Each run starts from an empty community so counters and pagination are exact.
for (const collection of ['community_reports', 'community_notifications', 'community_likes', 'community_reposts', 'community_bookmarks', 'community_follows', 'community_blocks', 'community_media', 'community_posts', 'community_hashtags', 'community_rate_limits', 'community_profiles']) {
  for (const record of await root.collection(collection).getFullList({ batch: 500 })) await root.collection(collection).delete(record.id);
}

const clients = {};
for (const [name] of ACCOUNTS) {
  const client = new PocketBase(url);
  client.autoCancellation(false);
  await client.collection('users').authWithPassword(`community-${name}@example.com`, 'test-only-password-12345');
  clients[name] = client;
}
const { viewer, second, author, manager } = clients;
const anonymous = new PocketBase(url);
anonymous.autoCancellation(false);
const post = (client, path, body) => client.send(path, { method: 'POST', body: body ?? {} });
const patch = (client, path, body) => client.send(path, { method: 'PATCH', body: body ?? {} });
const get = (client, path) => client.send(path, { method: 'GET' });
const denied = (e) => [401, 403].includes(e.status);

// --- Sessions and lazy profiles --------------------------------------------

await assert.rejects(get(anonymous, '/api/community/me'), denied);
const sessions = {};
for (const name of ['viewer', 'second', 'author', 'manager']) sessions[name] = await get(clients[name], '/api/community/me');
assert.equal(sessions.viewer.canModerate, false);
assert.equal(sessions.author.canModerate, false, 'an author writes newsletters but never moderates the community');
assert.equal(sessions.manager.canModerate, true);
assert.equal(sessions.viewer.unreadNotifications, 0);
for (const name of ['viewer', 'second', 'author', 'manager']) assert.match(sessions[name].profile.handle, /^[0-9a-z_]{3,30}$/);
assert.equal(new Set(Object.values(sessions).map((s) => s.profile.handle)).size, 4, 'suggestHandle must not hand two accounts the same handle');
assert.equal(sessions.viewer.profile.isSelf, true);
assert.equal(sessions.viewer.profile.followerCount, 0);

const viewerProfile = await patch(viewer, '/api/community/me', { handle: 'test_viewer', displayName: 'Test Viewer', bio: 'Bio line', location: 'Tel Aviv', website: 'example.com' });
assert.equal(viewerProfile.profile.handle, 'test_viewer');
assert.equal(viewerProfile.profile.website, 'https://example.com', 'a bare host is normalized to an absolute https URL');
await patch(second, '/api/community/me', { handle: 'test_second', displayName: 'Test Second' });
await patch(author, '/api/community/me', { handle: 'test_author', displayName: 'Test Author' });
await patch(manager, '/api/community/me', { handle: 'test_manager', displayName: 'Test Manager' });
await assert.rejects(patch(second, '/api/community/me', { handle: 'test_viewer' }), (e) => e.status === 400);
for (const handle of ['ab', 'has-a-dash', 'has a space', '12345678', '1234567890123456789012345678901']) {
  await assert.rejects(patch(second, '/api/community/me', { handle }), (e) => e.status === 400);
}
// A leading @ is how a handle is written everywhere else in the UI, so it is
// stripped rather than refused.
assert.equal((await patch(second, '/api/community/me', { handle: '@test_second' })).profile.handle, 'test_second');
await assert.rejects(patch(viewer, '/api/community/me', { website: 'javascript:alert(1)' }), (e) => e.status === 400);

// --- Anonymous reads work, anonymous writes do not -------------------------

assert.equal((await get(anonymous, '/api/community/feed')).items.length, 0);
assert.equal((await get(anonymous, '/api/community/profiles/test_viewer')).profile.handle, 'test_viewer');
assert.equal((await get(anonymous, '/api/community/trends')).trends.length, 0);
for (const [path, body] of [['/api/community/posts', { body: 'nope' }], ['/api/community/profiles/test_viewer/follow', {}], ['/api/community/reports', { handle: 'test_viewer', reason: 'spam' }], ['/api/community/notifications/read', {}]]) {
  await assert.rejects(post(anonymous, path, body), denied);
}
for (const path of ['/api/community/bookmarks', '/api/community/notifications', '/api/community/moderation/reports']) {
  await assert.rejects(get(anonymous, path), denied);
}
await assert.rejects(get(anonymous, '/api/community/feed?tab=following'), denied);

// --- Posting, entities and duplicate suppression ---------------------------

const BODY = 'Launch day for #Newsletter and #קהילה, thanks @test_second https://example.com/launch';
const created = await post(viewer, '/api/community/posts', { body: BODY, clientId: 'client-1' });
assert.equal(created.kind, 'post');
assert.equal(created.status, 'published');
assert.equal(created.body, BODY);
assert.equal(created.author.handle, 'test_viewer');
assert.equal(created.isAuthor, true);
assert.equal(created.depth, 0);
assert.deepEqual(created.hashtags, ['newsletter', 'קהילה']);

// src/lib/community-text.ts mirrors the hook scanner so the composer can
// highlight before the post exists. The two must agree on every offset.
const mirrored = parseCommunityEntities(BODY);
assert.deepEqual(
  created.entities.map(({ type, start, end }) => ({ type, start, end })),
  mirrored.map(({ type, start, end }) => ({ type, start, end })),
  'server entity offsets must match src/lib/community-text.ts',
);
assert.deepEqual(created.entities.map((e) => e.value), mirrored.map((e) => e.value));
for (const entity of created.entities) assert.equal(BODY.slice(entity.start, entity.end).replace(/^[#@]/, ''), entity.display);

// A retried request carrying the same clientId returns the first post.
assert.equal((await post(viewer, '/api/community/posts', { body: 'different text', clientId: 'client-1' })).id, created.id);
assert.equal((await get(anonymous, '/api/community/feed')).items.length, 1);

await assert.rejects(post(viewer, '/api/community/posts', { body: '   ' }), (e) => e.status === 400);
await assert.rejects(post(viewer, '/api/community/posts', { body: 'x'.repeat(5001) }), (e) => e.status === 400);
await assert.rejects(post(viewer, '/api/community/posts', { body: 'orphan reply', parentId: 'nonexistentid00' }), (e) => e.status === 404);
await assert.rejects(post(viewer, '/api/community/posts', { body: 'ghost quote', quotedPostId: 'nonexistentid00' }), (e) => e.status === 404);

// --- Replies, quotes and thread assembly -----------------------------------

const reply = await post(second, '/api/community/posts', { body: 'Congratulations!', parentId: created.id });
assert.equal(reply.kind, 'reply');
assert.equal(reply.parentId, created.id);
assert.equal(reply.rootId, created.id);
assert.equal(reply.depth, 1);
const nested = await post(viewer, '/api/community/posts', { body: 'Thank you', parentId: reply.id });
assert.equal(nested.rootId, created.id, 'rootId is inherited from the parent, not recomputed');
assert.equal(nested.depth, 2);

const quote = await post(second, '/api/community/posts', { body: 'Worth reading', quotedPostId: created.id });
assert.equal(quote.kind, 'quote');
assert.equal(quote.quotedPost.id, created.id);
assert.equal(quote.quotedPost.body, BODY);
assert.equal(quote.quotedPost.quotedPost, null, 'a quote inside a quote is not expanded a second time');

const thread = await get(anonymous, `/api/community/posts/${created.id}`);
assert.equal(thread.post.id, created.id);
assert.equal(thread.post.replyCount, 1, 'only direct replies increment replyCount');
assert.equal(thread.post.quoteCount, 1);
assert.deepEqual(thread.ancestors, []);
assert.deepEqual(thread.replies.map((p) => p.id), [reply.id]);
const nestedThread = await get(anonymous, `/api/community/posts/${nested.id}`);
assert.deepEqual(nestedThread.ancestors.map((p) => p.id), [created.id, reply.id], 'ancestors read root-first');
await assert.rejects(get(anonymous, '/api/community/posts/nonexistentid00'), (e) => e.status === 404);

// Replies are excluded from the feed but not from the thread.
const feedIds = (await get(anonymous, '/api/community/feed?tab=latest')).items.map((p) => p.id);
assert.deepEqual(feedIds, [quote.id, created.id]);

// --- Likes, reposts, bookmarks and their counters --------------------------

for (const [action, countKey] of [['like', 'likeCount'], ['repost', 'repostCount'], ['bookmark', 'bookmarkCount']]) {
  const on = await post(second, `/api/community/posts/${created.id}/${action}`);
  assert.equal(on.postId, created.id);
  assert.equal(on.active, true);
  assert.equal(on[countKey], 1);
  // A repeated toggle must not double-count in either direction.
  const off = await post(second, `/api/community/posts/${created.id}/${action}`);
  assert.equal(off.active, false);
  assert.equal(off[countKey], 0);
  assert.equal((await post(second, `/api/community/posts/${created.id}/${action}`))[countKey], 1);
  await assert.rejects(post(anonymous, `/api/community/posts/${created.id}/${action}`), denied);
  await assert.rejects(post(second, `/api/community/posts/nonexistentid00/${action}`), (e) => e.status === 404);
}
const engaged = (await get(second, `/api/community/posts/${created.id}`)).post;
assert.deepEqual([engaged.liked, engaged.reposted, engaged.bookmarked], [true, true, true]);
const unengaged = (await get(author, `/api/community/posts/${created.id}`)).post;
assert.deepEqual([unengaged.liked, unengaged.reposted, unengaged.bookmarked], [false, false, false], 'viewer state is per reader');
assert.deepEqual((await get(second, '/api/community/bookmarks')).items.map((p) => p.id), [created.id]);
assert.equal((await get(viewer, '/api/community/bookmarks')).items.length, 0);

// --- Follows, the following feed and self-follow ---------------------------

await assert.rejects(post(viewer, '/api/community/profiles/test_viewer/follow'), (e) => e.status === 400);
await assert.rejects(post(viewer, '/api/community/profiles/no_such_handle/follow'), (e) => e.status === 404);
const followed = await post(viewer, '/api/community/profiles/test_second/follow');
assert.equal(followed.isFollowing, true);
assert.equal(followed.followerCount, 1);
assert.equal((await get(viewer, '/api/community/profiles/test_second')).profile.isFollowing, true);
assert.equal((await get(second, '/api/community/profiles/test_viewer')).profile.isFollowedBy, true);
assert.deepEqual((await get(anonymous, '/api/community/profiles/test_second/followers')).items.map((p) => p.handle), ['test_viewer']);
assert.deepEqual((await get(anonymous, '/api/community/profiles/test_viewer/following')).items.map((p) => p.handle), ['test_second']);
// The following feed carries the reader's own posts plus the accounts they follow.
const followingIds = (await get(viewer, '/api/community/feed?tab=following')).items.map((p) => p.id);
assert.deepEqual(followingIds, [quote.id, created.id]);
assert.equal((await get(author, '/api/community/feed?tab=following')).items.length, 0);

// --- Media uploads ----------------------------------------------------------

// A real 1x1 PNG: PocketBase validates the declared MIME type against the bytes.
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const uploadMedia = async (client, name = 'pixel.png') => {
  const form = new FormData();
  form.append('file', new File([PNG_BYTES], name, { type: 'image/png' }));
  form.append('kind', 'image');
  form.append('altText', 'A single pixel');
  form.append('width', '1');
  form.append('height', '1');
  return client.send('/api/community/media', { method: 'POST', body: form, requestKey: null });
};

const media = await uploadMedia(viewer);
assert.equal(media.kind, 'image');
assert.equal(media.altText, 'A single pixel');
assert.deepEqual([media.width, media.height], [1, 1]);
assert.equal(media.byteSize, PNG_BYTES.length);
assert.match(media.url, /^\/api\/files\/[^/]+\/[^/]+\/.+\.png$/, 'media URLs stay root-relative so they survive an origin change');
await assert.rejects(uploadMedia(anonymous), denied);

// POST /api/community/posts carries only ids under its 128 KB body limit; the
// bytes travelled separately through the bodyLimit(0) media route.
const withMedia = await post(viewer, '/api/community/posts', { body: 'One pixel', mediaIds: [media.id] });
assert.equal(withMedia.media.length, 1);
assert.equal(withMedia.media[0].id, media.id);
assert.equal(withMedia.media[0].url, media.url);
await assert.rejects(post(viewer, '/api/community/posts', { body: 'Reused', mediaIds: [media.id] }), (e) => e.status === 400);
const strangerMedia = await uploadMedia(second, 'stranger.png');
await assert.rejects(post(viewer, '/api/community/posts', { body: 'Stolen', mediaIds: [strangerMedia.id] }), denied);
await assert.rejects(post(viewer, '/api/community/posts', { body: 'Missing', mediaIds: ['nonexistentid00'] }), (e) => e.status === 400);
assert.equal((await get(anonymous, '/api/community/profiles/test_viewer/posts?tab=media')).items.length, 1);

// --- Keyset pagination ------------------------------------------------------

// Twenty-five posts exceed the default page of twenty, so the cursor has to
// carry the reader across a boundary without repeating or skipping a row.
const bulkIds = [];
for (let index = 0; index < 25; index += 1) {
  bulkIds.push((await post(author, '/api/community/posts', { body: `Bulk post ${index}` })).id);
}
const firstPage = await get(anonymous, '/api/community/feed?tab=latest&perPage=10');
assert.equal(firstPage.items.length, 10);
assert.equal(firstPage.hasMore, true);
assert.match(firstPage.cursor, /.+/);
const seen = [...firstPage.items.map((p) => p.id)];
let cursor = firstPage.cursor;
let guard = 0;
while (cursor && guard < 10) {
  guard += 1;
  const page = await get(anonymous, `/api/community/feed?tab=latest&perPage=10&cursor=${encodeURIComponent(cursor)}`);
  seen.push(...page.items.map((p) => p.id));
  cursor = page.hasMore ? page.cursor : '';
}
assert.equal(new Set(seen).size, seen.length, 'a keyset cursor must never repeat a row across pages');
assert.equal(seen.length, 28, '25 bulk posts, the original, its quote and the media post');
assert.deepEqual(seen.slice(0, 25), bulkIds.slice().reverse(), 'newest first, in stable creation order');
assert.equal(new Set(seen).size, new Set([...bulkIds, created.id, quote.id, withMedia.id]).size);
// perPage is clamped, never trusted.
assert.equal((await get(anonymous, '/api/community/feed?tab=latest&perPage=500')).items.length, 28);
assert.equal((await get(anonymous, '/api/community/feed?tab=latest&perPage=-4')).items.length, 20);

// --- Notifications ----------------------------------------------------------

// The author of the original post has by now been replied to, quoted, liked,
// reposted, mentioned and followed.
const inbox = await get(viewer, '/api/community/notifications');
const byKind = inbox.items.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {});
for (const kind of ['like', 'repost', 'reply', 'quote']) assert.equal(byKind[kind], 1, `expected exactly one ${kind} notification`);
assert.equal(byKind.follow ?? 0, 0, 'the follow went the other way, so it notifies test_second');
assert.equal(inbox.unreadCount, inbox.items.length);
assert.ok(inbox.items.every((item) => item.isRead === false));
assert.ok(inbox.items.every((item) => item.actorHandle && item.actorId !== sessions.viewer.profile.userId), 'nobody is notified about their own action');
assert.deepEqual((await get(viewer, '/api/community/notifications?kind=reply')).items.map((i) => i.kind), ['reply']);
const mentioned = await get(second, '/api/community/notifications?kind=mention');
assert.equal(mentioned.items.length, 1, '@test_second was mentioned in the launch post');
assert.equal(mentioned.items[0].postId, created.id);
assert.equal((await get(second, '/api/community/notifications?kind=follow')).items.length, 1);

assert.equal((await post(viewer, '/api/community/notifications/read', { ids: [inbox.items[0].id] })).updated, 1);
assert.equal((await post(viewer, '/api/community/notifications/read', { ids: [inbox.items[0].id] })).updated, 0, 'an already-read notification is not counted twice');
assert.equal((await get(viewer, '/api/community/notifications')).unreadCount, inbox.items.length - 1);
assert.equal((await post(viewer, '/api/community/notifications/read')).updated, inbox.items.length - 1);
assert.equal((await get(viewer, '/api/community/me')).unreadNotifications, 0);
// A reader may only mark their own notifications read.
assert.equal((await post(author, '/api/community/notifications/read', { ids: inbox.items.map((i) => i.id) })).updated, 0);
assert.equal((await get(second, '/api/community/notifications')).unreadCount > 0, true);
// Unliking withdraws the notification it created.
await post(second, `/api/community/posts/${created.id}/like`);
assert.equal((await get(viewer, '/api/community/notifications?kind=like')).items.length, 0);
await post(second, `/api/community/posts/${created.id}/like`);

// --- Search, hashtags and trends -------------------------------------------

assert.deepEqual((await get(anonymous, '/api/community/search?q=')).items, []);
const postHits = await get(anonymous, '/api/community/search?q=Launch%20day&type=posts');
assert.equal(postHits.type, 'posts');
assert.deepEqual(postHits.items.map((p) => p.id), [created.id]);
const peopleHits = await get(anonymous, '/api/community/search?q=test_sec&type=people');
assert.equal(peopleHits.type, 'people');
assert.deepEqual(peopleHits.items.map((p) => p.handle), ['test_second']);
assert.deepEqual((await get(anonymous, '/api/community/search?q=Test%20Author&type=people')).items.map((p) => p.handle), ['test_author']);
const tagHits = await get(anonymous, '/api/community/search?q=newslet&type=hashtags');
assert.deepEqual(tagHits.items.map((h) => h.tag), ['newsletter']);
assert.equal(tagHits.items[0].postCount, 1);
// A leading hash switches the post search onto the hashtag index.
assert.deepEqual((await get(anonymous, '/api/community/search?q=%23newsletter')).items.map((p) => p.id), [created.id]);
assert.deepEqual((await get(anonymous, '/api/community/hashtags/newsletter')).items.map((p) => p.id), [created.id]);
assert.equal((await get(anonymous, '/api/community/hashtags/NewsLetter')).tag, 'newsletter', 'hashtag lookups are case-insensitive');
assert.equal((await get(anonymous, '/api/community/hashtags/%D7%A7%D7%94%D7%99%D7%9C%D7%94')).items.length, 1, 'a Hebrew hashtag survives the round trip');
assert.equal((await get(anonymous, '/api/community/hashtags/never_used')).items.length, 0);
const trends = await get(viewer, '/api/community/trends');
assert.ok(trends.trends.some((h) => h.tag === 'newsletter'));
assert.ok(trends.suggestions.every((p) => p.handle !== 'test_viewer' && p.handle !== 'test_second'), 'the reader and the accounts they already follow are not suggested');

// A filter-string injection attempt is a literal search term, not syntax.
assert.equal((await get(anonymous, '/api/community/search?q=%22%20%7C%7C%20id%20!%3D%20%22')).items.length, 0);

// --- Blocks -----------------------------------------------------------------

await assert.rejects(post(viewer, '/api/community/profiles/test_viewer/block'), (e) => e.status === 400);
const blocked = await post(author, '/api/community/profiles/test_viewer/block');
assert.equal(blocked.isBlocked, true);
assert.ok(!(await get(author, '/api/community/feed?tab=latest&perPage=50')).items.some((p) => p.author.handle === 'test_viewer'));
// The exclusion is symmetric: the blocked account stops seeing the blocker too.
assert.ok(!(await get(viewer, '/api/community/feed?tab=latest&perPage=50')).items.some((p) => p.author.handle === 'test_author'));
assert.ok((await get(second, '/api/community/feed?tab=latest&perPage=50')).items.some((p) => p.author.handle === 'test_viewer'), 'a block is private to the two accounts involved');
assert.equal((await post(author, '/api/community/profiles/test_viewer/block')).isBlocked, false);
assert.ok((await get(author, '/api/community/feed?tab=latest&perPage=50')).items.some((p) => p.author.handle === 'test_viewer'));
// Blocking severs the follow edges in both directions the way X does.
await post(author, '/api/community/profiles/test_second/follow');
assert.equal((await get(author, '/api/community/profiles/test_second')).profile.followerCount, 2);
await post(author, '/api/community/profiles/test_second/block');
assert.equal((await get(second, '/api/community/profiles/test_second')).profile.followerCount, 1);
assert.equal((await get(author, '/api/community/profiles/test_second')).profile.isFollowing, false);
await post(author, '/api/community/profiles/test_second/block');

// --- Reports and moderation -------------------------------------------------

const reported = await post(second, '/api/community/reports', { postId: created.id, reason: 'spam', details: 'Looks like an advert.' });
assert.deepEqual(reported, { reported: true, duplicate: false });
assert.deepEqual(await post(second, '/api/community/reports', { postId: created.id, reason: 'abuse' }), { reported: true, duplicate: true });
await post(second, '/api/community/reports', { handle: 'test_viewer', reason: 'harassment' });
await assert.rejects(post(second, '/api/community/reports', {}), (e) => e.status === 400);
await assert.rejects(post(second, '/api/community/reports', { postId: 'nonexistentid00', reason: 'spam' }), (e) => e.status === 404);
await assert.rejects(post(second, '/api/community/reports', { handle: 'no_such_handle', reason: 'spam' }), (e) => e.status === 404);

// canModerateCommunity in src/lib/auth/permissions.ts mirrors MODERATOR_ROLES
// in pb_hooks/lib/community-core.js, so an author is refused on both sides.
for (const client of [viewer, author]) {
  await assert.rejects(get(client, '/api/community/moderation/reports'), denied);
  await assert.rejects(patch(client, `/api/community/moderation/posts/${created.id}`, { reason: 'no' }), denied);
  await assert.rejects(patch(client, '/api/community/moderation/profiles/test_viewer', { suspend: true }), denied);
}

const queue = await get(manager, '/api/community/moderation/reports');
assert.equal(queue.items.length, 2);
assert.ok(queue.items.every((r) => r.status === 'open' && r.reporterHandle === 'test_second'));
const postReport = queue.items.find((r) => r.post);
const profileReport = queue.items.find((r) => !r.post);
assert.equal(postReport.post.id, created.id);
assert.equal(postReport.reason, 'spam');
assert.equal(postReport.details, 'Looks like an advert.');
assert.equal(profileReport.subjectHandle, 'test_viewer');
assert.equal((await get(manager, '/api/community/moderation/reports?status=resolved')).items.length, 0);

// Removing a post hides the body from everyone except its author and a moderator.
assert.equal((await patch(manager, `/api/community/moderation/posts/${created.id}`, { reason: 'Advertising' })).status, 'removed');
assert.equal((await get(anonymous, `/api/community/posts/${created.id}`)).post.body, '');
assert.equal((await get(anonymous, `/api/community/posts/${created.id}`)).post.status, 'removed');
assert.equal((await get(viewer, `/api/community/posts/${created.id}`)).post.body, BODY, 'the author still sees what was removed');
assert.equal((await get(manager, `/api/community/posts/${created.id}`)).post.body, BODY);
assert.ok(!(await get(anonymous, '/api/community/feed?tab=latest&perPage=50')).items.some((p) => p.id === created.id));
assert.equal((await patch(manager, `/api/community/moderation/posts/${created.id}`, { restore: true })).status, 'published');
assert.equal((await get(anonymous, `/api/community/posts/${created.id}`)).post.body, BODY);

// A suspended account cannot write, but its handle still resolves for readers.
assert.equal((await patch(manager, '/api/community/moderation/profiles/test_viewer', { suspend: true, reason: 'Advertising' })).isSuspended, true);
await assert.rejects(post(viewer, '/api/community/posts', { body: 'Still here' }), denied);
await assert.rejects(post(viewer, '/api/community/profiles/test_second/follow'), denied);
assert.equal((await get(viewer, '/api/community/me')).profile.isSuspended, true);
assert.equal((await get(anonymous, '/api/community/profiles/test_viewer')).profile.isSuspended, true);
assert.equal((await get(anonymous, '/api/community/search?q=test_view&type=people')).items.length, 0, 'a suspended account leaves people search');
assert.equal((await patch(manager, '/api/community/moderation/profiles/test_viewer', { suspend: false })).isSuspended, false);
assert.equal((await post(viewer, '/api/community/posts', { body: 'Back again' })).status, 'published');

assert.equal((await patch(manager, `/api/community/moderation/reports/${postReport.id}`, { status: 'resolved', resolution: 'Removed' })).status, 'resolved');
await patch(manager, `/api/community/moderation/reports/${profileReport.id}`, { status: 'dismissed', resolution: 'No action' });
assert.equal((await get(manager, '/api/community/moderation/reports')).items.length, 0, 'a reviewed report leaves the open queue');
assert.deepEqual((await get(manager, '/api/community/moderation/reports?status=resolved')).items.map((r) => r.id), [postReport.id]);
assert.deepEqual((await get(manager, '/api/community/moderation/reports?status=dismissed')).items.map((r) => r.id), [profileReport.id]);
await assert.rejects(patch(manager, '/api/community/moderation/reports/nonexistentid00', { status: 'resolved' }), (e) => e.status === 404);

// --- Deletion ---------------------------------------------------------------

const remove = (client, id) => client.send(`/api/community/posts/${id}`, { method: 'DELETE' });
await assert.rejects(remove(second, created.id), denied);
await assert.rejects(remove(anonymous, created.id), denied);
await assert.rejects(remove(viewer, 'nonexistentid00'), (e) => e.status === 404);

// A post with replies is tombstoned rather than deleted, so the replies below
// it stay reachable.
assert.deepEqual(await remove(viewer, created.id), { deleted: true, id: created.id });
const tombstone = await get(anonymous, `/api/community/posts/${created.id}`);
assert.equal(tombstone.post.status, 'deleted');
assert.equal(tombstone.post.body, '');
assert.deepEqual(tombstone.post.media, []);
assert.deepEqual(tombstone.replies.map((p) => p.id), [reply.id]);
assert.equal((await get(anonymous, '/api/community/hashtags/newsletter')).items.length, 0, 'the hashtag index drops a deleted post');

// A childless post is deleted outright, and its media goes with it.
await remove(viewer, withMedia.id);
await assert.rejects(get(anonymous, `/api/community/posts/${withMedia.id}`), (e) => e.status === 404);
await assert.rejects(root.collection('community_media').getOne(media.id), (e) => e.status === 404);
// A moderator may delete somebody else's post.
assert.equal((await remove(manager, bulkIds[0])).deleted, true);
await assert.rejects(get(anonymous, `/api/community/posts/${bulkIds[0]}`), (e) => e.status === 404);

console.log('Passed: anonymous read access with 12 rejected writes, lazy unique profiles, entity offsets matching src/lib/community-text.ts, clientId retry suppression, three-level threads, like/repost/bookmark counters across repeated toggles, follows and the following feed, 10 MB-capped media travelling separately from the 128 KB post body, 28 rows of keyset pagination with no repeats, six notification kinds with withdrawal on unlike, post/people/hashtag search including Hebrew, symmetric blocks that sever follows, and the moderation queue refusing a viewer and an author while a manager removes, restores, suspends and resolves.');
