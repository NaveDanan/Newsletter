import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as communityText from '../../src/lib/community-text.ts';

const baseComment = {
  id: 'reply-one', kind: 'reply', status: 'published', body: '', entities: [], media: [],
  createdAt: '2026-10-05T10:00:00Z', likeCount: 0, replyCount: 0,
  author: { userId: 'author', handle: 'writer', displayName: 'Writer', avatarUrl: '' },
};
const poll = { id: 'reply-poll', question: 'Which date?', options: [{ id: 'monday', text: 'Monday', votes: 0, voterUserIds: [] }, { id: 'tuesday', text: 'Tuesday', votes: 0, voterUserIds: [] }] };
const event = { id: 'reply-event', title: 'Team meeting', startDate: '2026-10-09T10:00:00Z', attendees: [] };
const linkPreview = { url: 'https://example.com/guide', title: 'Helpful guide', description: 'Guide description', imageUrl: '', siteName: 'Example' };
const quotedPost = { ...baseComment, id: 'quoted-one', kind: 'post', body: 'Quoted original content' };

function harness({ authenticated = true, callbacks = false } = {}) {
  const loaded = new Map(), votes = [], rsvps = [], openedPosts = [];
  let authRequests = 0;
  const context = { isAuthenticated: authenticated, canModerate: false, requireAuth: () => { authRequests++; }, openProfile() {}, openHashtag() {}, openReport() {}, openPost: (id) => openedPosts.push(id) };
  const locale = { t: (key) => key, formatNumber: String, formatDate: String, formatRelativeTime: () => 'now', isRTL: false };
  const user = authenticated ? { id: 'reader', name: 'Reader' } : null;
  const react = callbacks ? { ...React, useState: (value) => [typeof value === 'function' ? value() : value, () => {}], useMemo: (factory) => factory(), useRef: (value) => ({ current: value }), useEffect() {} } : React;
  const child = (props) => props.children ?? null;
  function load(file) {
    if (loaded.has(file)) return loaded.get(file);
    const exports = {};
    loaded.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = (name) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (name.endsWith('NewsletterPollCard')) return load('src/components/newsletter/NewsletterPollCard.tsx');
      if (name.endsWith('NewsletterEventCard')) return load('src/components/newsletter/NewsletterEventCard.tsx');
      if (name.endsWith('CommunityLinkPreviewCard')) return load('src/sections/community/CommunityLinkPreviewCard.tsx');
      if (name.endsWith('CommunityQuotedPost')) return load('src/sections/community/CommunityQuotedPost.tsx');
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ user }) };
      if (name.endsWith('LocaleContext')) return { useLocale: () => locale };
      if (name.endsWith('CommunityContext')) return { useCommunity: () => context };
      if (name.endsWith('community-comments')) return { formatCompactTime: () => 'now' };
      if (name.endsWith('community-text')) return communityText;
      if (name.endsWith('/community')) return { resolveCommunityFileUrl: (url) => url, getPocketBaseErrorMessage: (_, fallback) => fallback };
      if (name.endsWith('/utils')) return { cn: (...values) => values.filter(Boolean).join(' ') };
      if (name.endsWith('CommunityBody')) return { CommunityBody: ({ body }) => React.createElement('span', null, body) };
      if (name.endsWith('CommunityMediaGrid')) return { CommunityMediaGrid: () => React.createElement('div', { 'data-media-grid': true }) };
      if (name.includes('core-free-icons')) return new Proxy({}, { get: () => [] });
      if (name === '@hugeicons/react') return { HugeiconsIcon: () => null };
      if (name === 'sonner') return { toast: { success() {}, error() {} } };
      return new Proxy({}, { get: () => child });
    };
    vm.runInNewContext(code, { exports, require, URL, console });
    return exports;
  }
  const Component = load('src/sections/community/CommunityCommentItem.tsx').CommunityCommentItem;
  const actions = { votePoll: async (...args) => votes.push(args), rsvpEvent: async (...args) => rsvps.push(args), toggleLike() {}, editPost() {}, deletePost() {} };
  const props = (comment) => ({ node: { comment, children: [] }, actions, onReplyAdded() {} });
  const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
  function tree(comment) {
    const nodes = [];
    function visit(node, ancestors = []) {
      if (Array.isArray(node)) { node.forEach((child) => visit(child, ancestors)); return; }
      if (!React.isValidElement(node)) return;
      nodes.push({ node, ancestors });
      if (typeof node.type === 'function') visit(node.type(node.props), ancestors);
      else visit(node.props.children, [...ancestors, node]);
    }
    visit(React.createElement(Component, props(comment)));
    return nodes;
  }
  return { render: (comment) => renderToStaticMarkup(React.createElement(Component, props(comment))), tree, text, votes, rsvps, openedPosts, authRequests: () => authRequests };
}

test('addon-only replies render their poll question/options and event details', () => {
  const app = harness();
  const pollMarkup = app.render({ ...baseComment, poll });
  assert.match(pollMarkup, /Which date\?/);
  assert.match(pollMarkup, /Monday/);
  const eventMarkup = app.render({ ...baseComment, event });
  assert.match(eventMarkup, /Team meeting/);
  assert.match(eventMarkup, /viewer\.attend/);
});

test('reply addon cards vote and RSVP against the reply, with click isolation', async () => {
  const app = harness({ callbacks: true });
  const comment = { ...baseComment, poll, event };
  const nodes = app.tree(comment);
  const vote = nodes.find(({ node }) => node.type === 'button' && app.text(node).includes('Monday'));
  const rsvp = nodes.find(({ node }) => node.type === 'button' && app.text(node).includes('viewer.attend'));
  assert.ok(vote, 'poll option must be interactive');
  assert.ok(rsvp, 'event must expose RSVP');
  await vote.node.props.onClick(); await rsvp.node.props.onClick();
  assert.equal(app.votes[0][0], comment); assert.equal(app.votes[0][1], 'monday');
  assert.equal(app.rsvps[0][0], comment);
  for (const interaction of [vote, rsvp]) {
    const boundary = interaction.ancestors.find((node) => node.type === 'div' && typeof node.props.onClick === 'function');
    let stopped = false;
    assert.ok(boundary, 'addon interaction needs an event boundary');
    boundary.props.onClick({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
  }
});

test('anonymous reply poll and event interactions require auth without writing', async () => {
  const app = harness({ authenticated: false, callbacks: true });
  const nodes = app.tree({ ...baseComment, poll, event });
  const vote = nodes.find(({ node }) => node.type === 'button' && app.text(node).includes('Monday'));
  const rsvp = nodes.find(({ node }) => node.type === 'button' && app.text(node).includes('viewer.signInToAttend'));
  assert.ok(vote); assert.ok(rsvp);
  await vote.node.props.onClick(); await rsvp.node.props.onClick();
  assert.equal(app.authRequests(), 2);
  assert.equal(app.votes.length, 0); assert.equal(app.rsvps.length, 0);
});

test('replies show link previews without media and quoted posts navigate to the original', () => {
  const app = harness({ callbacks: true });
  const comment = { ...baseComment, linkPreview, quotedPost };
  const nodes = app.tree(comment);
  const preview = nodes.find(({ node }) => node.type === 'a' && node.props.href === linkPreview.url);
  assert.ok(preview); assert.equal(preview.node.props.rel, 'noopener noreferrer nofollow ugc');
  const quote = nodes.find(({ node }) => node.type === 'button' && app.text(node).includes(quotedPost.body));
  assert.ok(quote);
  quote.node.props.onClick({ stopPropagation() {} });
  assert.deepEqual(app.openedPosts, ['quoted-one']);
  assert.equal(app.tree({ ...comment, media: [{ id: 'image-one', kind: 'image' }] }).some(({ node }) => node.type === 'a' && node.props.href === linkPreview.url), false);
});

test('removed, deleted and unavailable replies never reveal addons', () => {
  const app = harness();
  for (const patch of [{ status: 'removed' }, { status: 'deleted' }, { author: null }]) {
    const markup = app.render({ ...baseComment, poll, event, linkPreview, quotedPost, ...patch });
    assert.doesNotMatch(markup, /Which date|Team meeting|Helpful guide|Quoted original content/);
    assert.match(markup, /community\.post\.(removed|unavailable)/);
  }
});
