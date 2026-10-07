const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { DOMParser } = require('@xmldom/xmldom');
const text = require('../../src/lib/community-text.ts');

function sourceModule(filename, overrides = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, ...globals,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
  }, { filename });
  return module.exports;
}

const serverModule = { exports: {} };
vm.runInNewContext(fs.readFileSync('pb_hooks/lib/community-core.js', 'utf8'), {
  module: serverModule, exports: serverModule.exports,
});
const server = serverModule.exports;
const formatting = sourceModule('src/lib/comment-formatting.ts', { './community-text': text }, {
  window: {}, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
  DOMParser: class {
    parseFromString(value) {
      const doc = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
      return { body: doc.documentElement };
    }
  },
});
const { CommunityBody } = sourceModule('src/sections/community/CommunityBody.tsx', {
  '@/lib/community-text': text,
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  './CommunityMentionCard': { CommunityMentionCard: ({ children }) => children },
});

function rendered(html) {
  const body = formatting.htmlToCommentMarkup(html);
  const parsed = server.parseEntities(body);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.entities)), text.parseCommunityEntities(body));
  return { body, entities: parsed.entities, html: renderToStaticMarkup(React.createElement(CommunityBody, { body, entities: parsed.entities })) };
}

test('editor formatting can close inside a URL without changing its destination', () => {
  const result = rendered('<p><strong>https://example.com</strong>/article</p>');
  assert.equal(result.body, '**https://example.com**/article');
  assert.equal(result.entities[0].value, 'https://example.com/article');
  assert.equal(result.entities[0].display, 'https://example.com/article');
  assert.equal(result.body.slice(result.entities[0].start, result.entities[0].end), 'https://example.com**/article');
  assert.match(result.html, /href="https:\/\/example\.com\/article"/);
  assert.match(result.html, /<strong[^>]*>https:\/\/example\.com<\/strong>\/article<\/a>/);
  assert.equal(result.html.includes('**'), false);
});

test('editor formatting spans text, hashtags, mentions and URLs', () => {
  const result = rendered('<p><strong>hello #topic and @alice at https://example.com/article</strong></p>');
  assert.equal(result.entities.length, 3);
  assert.equal(result.html.includes('**'), false);
  assert.match(result.html, /<strong[^>]*>hello <\/strong>/);
  assert.match(result.html, /<strong[^>]*>#topic<\/strong>/);
  assert.match(result.html, /<strong[^>]*>@alice<\/strong>/);
  assert.match(result.html, /href="https:\/\/example\.com\/article"[^>]*><strong[^>]*>https:\/\/example\.com\/article<\/strong>/);
});

test('formatting can start outside and change within a URL', () => {
  const result = rendered('<p><strong>https://example.com/<em>article</em></strong></p>');
  assert.equal(result.entities[0].value, 'https://example.com/article');
  assert.equal(result.html.includes('*'), false);
  assert.match(result.html, /<em[^>]*>article<\/em>/);
});

for (const [tag, renderedTag] of [['strong', 'strong'], ['em', 'em'], ['u', 'u'], ['s', 's']]) {
  test(`${tag} can format a selection starting inside a URL path or query`, () => {
    for (const [html, expected] of [
      [`<p>https://example.com/<${tag}>article</${tag}>/tail</p>`, 'https://example.com/article/tail'],
      [`<p>https://example.com/article?q=<${tag}>hello</${tag}>&amp;x=1</p>`, 'https://example.com/article?q=hello&x=1'],
    ]) {
      const result = rendered(html);
      assert.equal(result.entities[0].value, expected);
      assert.equal(result.entities[0].display, expected);
      assert.equal(result.html.includes('\\!'), false);
      assert.match(result.html, new RegExp(`<${renderedTag}(?: [^>]*)?>${expected.endsWith('tail') ? 'article' : 'hello'}</${renderedTag}>`));
      assert.equal((result.html.match(/<a /g) ?? []).length, 1, 'partial styling keeps one interactive link');
    }
  });
}

test('literal rich-editor characters remain literal inside formatted and unformatted URLs', () => {
  for (const html of [
    '<p>https://example.com/a*b*?q=a+b~c</p>',
    '<p><strong>https://example.com/a*b*?q=a+b~c</strong></p>',
  ]) {
    const result = rendered(html);
    assert.equal(result.entities[0].value, 'https://example.com/a*b*?q=a+b~c');
    assert.equal(result.entities[0].display, 'https://example.com/a*b*?q=a+b~c');
    assert.ok(result.html.includes('https://example.com/a*b*?q=a+b~c'));
    assert.equal(result.html.includes('\\'), false);
  }
});

test('stored rich formatting survives HTML rehydration and repeated serialization', () => {
  for (const html of [
    '<p><strong>https://example.com</strong>/article</p>',
    '<p>https://example.com/<strong>article</strong>/tail</p>',
    '<p>https://example.com/article?q=<em>hello</em>&amp;x=1</p>',
    '<p><strong>https://example.com/<em>article</em>/tail</strong></p>',
    '<p>https://example.com/a*b*?q=a+b~c</p>',
    '<p><strong>literal *stars* and C++ at #topic with @alice</strong></p>',
    '<p>literal \\!** and &lt;script&gt;alert(1)&lt;/script&gt;</p>',
  ]) {
    const first = rendered(html);
    const rehydrated = formatting.formatCommentBodyToHtml(first.body);
    const secondBody = formatting.htmlToCommentMarkup(rehydrated);
    const secondEntities = server.parseEntities(secondBody).entities;
    const secondHtml = renderToStaticMarkup(React.createElement(CommunityBody, { body: secondBody, entities: secondEntities }));
    assert.equal(secondHtml, first.html, `visible formatting and links survive ${html}`);
    assert.equal(formatting.htmlToCommentMarkup(formatting.formatCommentBodyToHtml(secondBody)), secondBody, 'serialized escapes do not grow');
    assert.equal(formatting.stripCommentFormatting(secondBody).includes('\\!'), html.includes('literal \\!'), 'explicit opener syntax remains hidden while literal text survives');
  }
});

test('italic formatting survives Shift+Enter without claiming legacy stray markers', () => {
  const result = rendered('<p><em>hello<br />world at https://example.com/article</em></p>');
  assert.equal(result.html.includes('*'), false);
  assert.match(result.html, /<em[^>]*>hello\nworld at <\/em>/);
  assert.match(result.html, /<a [^>]*><em[^>]*>https:\/\/example\.com\/article<\/em><\/a>/);
  const restored = formatting.formatCommunityBodyToHtml(result.body);
  assert.match(restored, /<em>hello<br \/>world at https:\/\/example\.com\/article<\/em>/);
  assert.equal(formatting.htmlToCommentMarkup(restored), result.body);
  const legacy = '*unclosed\nnext https://example.com/a* tail';
  assert.equal(server.parseEntities(legacy).entities[0].value, 'https://example.com/a*');
});

test('community previews decode before truncating and newsletter previews preserve literal titles', () => {
  const body = formatting.htmlToCommentMarkup('<p>C++ at https://example.com/<strong>article</strong> literal *stars*</p>');
  assert.equal(server.buildPreview(body, true), 'C++ at https://example.com/article literal *stars*');
  assert.equal(server.buildPreview('C++ *Newsletter* <HTML>'), 'C++ *Newsletter* <HTML>');
  const long = formatting.htmlToCommentMarkup(`<p><strong>${'x'.repeat(200)}</strong></p>`);
  assert.equal(server.buildPreview(long, true), 'x'.repeat(139) + '\u2026');
});

test('literal URL asterisks and unmatched markers retain their characters', () => {
  for (const body of ['https://example.com/a*b*', 'https://example.com/a**b**', 'https://example.com/a*', '**unfinished #topic']) {
    const parsed = server.parseEntities(body);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.entities)), text.parseCommunityEntities(body));
    const html = renderToStaticMarkup(React.createElement(CommunityBody, { body, entities: parsed.entities }));
    if (body.startsWith('https:')) {
      assert.equal(parsed.entities[0].value, body);
      assert.equal(parsed.entities[0].display, body);
      assert.ok(html.includes(`href="${body}"`));
      assert.ok(html.includes(`>${body}</a>`));
    } else {
      assert.ok(html.includes('**unfinished '));
    }
  }
});

test('records with previously stored formatting markers in their URL render a corrected link', () => {
  const body = '**https://example.com**/article';
  const stale = [{ type: 'url', start: 2, end: body.length, value: 'https://example.com**/article', display: 'https://example.com**/article' }];
  const html = renderToStaticMarkup(React.createElement(CommunityBody, { body, entities: stale }));
  assert.match(html, /href="https:\/\/example\.com\/article"/);
  assert.equal(html.includes('**'), false);
  assert.equal(stale[0].value, 'https://example.com**/article', 'rendering does not mutate the record');
});

test('old partial stored hashtags and mentions link to the full visible entity', () => {
  const oldMention = [{ type: 'mention', start: 0, end: 4, value: 'ali', display: 'ali' }];
  const mentionHtml = renderToStaticMarkup(React.createElement(CommunityBody, { body: '@ali**ce**', entities: oldMention }));
  assert.match(mentionHtml, /<button[^>]*>@ali<strong[^>]*>ce<\/strong><\/button>/);
  assert.equal(oldMention[0].value, 'ali');
  const oldTag = [{ type: 'hashtag', start: 0, end: 4, value: 'top', display: 'top' }];
  const tree = CommunityBody({ body: '#top**ic**', entities: oldTag, onHashtagClick: (value) => assert.equal(value, 'topic') });
  const group = React.Children.toArray(tree.props.children)[0];
  group.props.children.props.onClick({ stopPropagation() {} });
});

test('collapsed bodies preserve full URL destinations and formatting paired beyond the limit', () => {
  const url = 'https://example.com/' + 'a'.repeat(70);
  const body = '**' + 'x'.repeat(170) + ' ' + url + '**';
  const html = renderToStaticMarkup(React.createElement(CommunityBody, { body, entities: server.parseEntities(body).entities, maxLength: 200 }));
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html, /<strong[^>]*>xxxxxxxxx/);
  assert.equal(html.includes('**'), false);
  assert.equal(html.replace(/<[^>]*>/g, '').length, 200, 'limit measures visible characters');
});

test('collapsed comment item passes full source to body rendering and retains the long URL', () => {
  const wrapper = ({ children }) => React.createElement('div', {}, children);
  const empty = () => null;
  const ui = new Proxy({}, { get: () => wrapper });
  const { CommunityCommentItem } = sourceModule('src/sections/community/CommunityCommentItem.tsx', {
    react: { ...React, useState: () => [false, () => {}], useMemo: (factory) => factory() },
    '@hugeicons/react': { HugeiconsIcon: empty }, '@hugeicons/core-free-icons': {}, sonner: { toast: {} },
    '@/components/ui/alert-dialog': ui, '@/components/ui/dropdown-menu': ui,
    '@/contexts/AuthContext': { useAuth: () => ({ user: null }) },
    '@/contexts/LocaleContext': { useLocale: () => ({ isRTL: false, t: (value) => value, formatDate: () => '' }) },
    '@/components/newsletter/NewsletterPollCard': { NewsletterPollCard: empty },
    '@/components/newsletter/NewsletterEventCard': { NewsletterEventCard: empty },
    '@/lib/pocketbase/community': {}, '@/lib/community-text': text,
    '@/lib/lazy-component': { lazyComponent: () => empty },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    './CommunityAvatar': { CommunityAvatar: empty }, './CommunityBody': { CommunityBody },
    './CommunityContext': { useCommunity: () => ({ isAuthenticated: false, canModerate: false }) },
    './CommunityEditPostDialog': { CommunityEditPostDialog: empty }, './CommunityMediaGrid': { CommunityMediaGrid: empty },
    './CommunityLinkPreviewCard': { CommunityLinkPreviewCard: empty }, './CommunityQuotedPost': { CommunityQuotedPost: empty },
    './CommunityReplyInput': { CommunityReplyInput: empty }, '@/lib/community-comments': { formatCompactTime: () => '' },
  });
  const url = 'https://example.com/' + 'a'.repeat(70);
  const body = '**' + 'x'.repeat(170) + ' ' + url + '**';
  const node = { comment: {
    id: 'comment', status: 'published', body, entities: server.parseEntities(body).entities,
    author: { handle: 'alice', displayName: 'Alice' }, media: [],
  }, children: [] };
  const html = renderToStaticMarkup(React.createElement(CommunityCommentItem, { node, actions: {}, onReplyAdded() {} }));
  assert.ok(html.includes(`href="${url}"`), 'the cropped label keeps the complete original destination');
  assert.equal(html.includes('**'), false, 'formatting is paired before cropping');
  assert.ok(html.includes('community.comments.seeMore'));
});

test('site activity displays the same readable community preview', () => {
  const body = formatting.htmlToCommentMarkup('<p>C++ https://example.com/<strong>article</strong> *stars*</p>');
  const store = new Map();
  const app = {
    store: () => ({ get: (key) => store.get(key), set: (key, value) => store.set(key, value) }),
    findRecordsByFilter: (collection) => collection === 'community_posts' ? [{
      id: 'encodedpost', getString: (name) => ({ body, authorId: '', created: '2026-10-05 09:00:00Z' })[name] ?? '', getBool: () => false,
    }] : [],
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('pb_hooks/lib/site.js', 'utf8'), {
    module, exports: module.exports, __hooks: '/hooks', require: () => server,
    $security: { randomString: () => 'token' },
  });
  const result = module.exports.listRecentActivity({ app, requestInfo: () => ({ query: {} }) });
  assert.equal(result.items[0].subjectTitle, 'C++ https://example.com/article *stars*');
});

function replyHarness() {
  const submitted = [];
  let slots = [], slot = 0, dirty = false, tree;
  const effects = [], queuedEffects = [], timers = new Map(), searches = [];
  const input = { value: '', selectionStart: 0, focus() {}, setSelectionRange(start) { this.selectionStart = start; } };
  const hooks = {
    ...React,
    useState(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; dirty = true; }];
    },
    useRef(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback) { return callback; },
    useEffect(callback, dependencies) {
      const index = slot++;
      if (!effects[index] || dependencies.some((value, offset) => value !== effects[index].dependencies[offset])) {
        queuedEffects.push(() => {
          effects[index]?.cleanup?.();
          effects[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const { CommunityReplyInput } = sourceModule('src/sections/community/CommunityReplyInput.tsx', {
    react: hooks,
    '@hugeicons/react': { HugeiconsIcon: () => null },
    '@hugeicons/core-free-icons': { SentIcon: {} },
    '@/contexts/AuthContext': { useAuth: () => ({ user: null }) },
    '@/contexts/LocaleContext': { useLocale: () => ({ t: (key) => key }) },
    '@/lib/pocketbase/community': { searchCommunityPeople: () => new Promise((resolve) => searches.push(resolve)) },
    '@/lib/community-text': text,
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    './CommunityAvatar': { CommunityAvatar: () => null },
  }, { window: {
    setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, requestAnimationFrame(callback) { callback(); },
  } });
  function nodes(element, predicate) {
    if (!React.isValidElement(element)) return [];
    return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, predicate))];
  }
  function render() {
    let attempts = 0;
    do {
      dirty = false; slot = 0;
      tree = CommunityReplyInput({ placeholder: 'Reply', isSubmitting: false, onSubmit: (body) => submitted.push(body), onCancel() {} });
      if (++attempts > 10) throw new Error('reply did not settle');
    } while (dirty);
    const field = nodes(tree, (node) => node.type === 'input')[0];
    input.value = field.props.value;
    field.props.ref.current = input;
    queuedEffects.splice(0).forEach((effect) => effect());
    return field;
  }
  render();
  return {
    change(value) { const field = render(); input.value = value; input.selectionStart = value.length; field.props.onChange({ target: input }); render(); },
    key(key) { render().props.onKeyDown({ key, preventDefault() {} }); render(); },
    startSearch() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
    async resolveSearch(handles) {
      searches.shift()({ items: handles.map((handle) => ({ handle, displayName: handle, avatarUrl: '' })) });
      await Promise.resolve(); await Promise.resolve(); render();
    },
    value: () => render().props.value,
    selected: () => nodes(tree, (node) => node.props.role === 'option' && node.props['aria-selected']).map((node) => node.key),
    submit() { render(); tree.props.onSubmit({ preventDefault() {} }); },
    submitted,
  };
}

test('plain quick replies preserve literal markers instead of creating rich formatting', () => {
  const reply = replyHarness();
  const plain = 'C++ and C++ *stars* https://example.com/a*b*';
  reply.change(plain);
  assert.equal(reply.value(), plain);
  reply.submit();
  assert.equal(reply.submitted.length, 1);
  assert.equal(server.visibleCommunityBody(reply.submitted[0]), plain);
  assert.equal(server.parseEntities(reply.submitted[0]).entities[0].value, 'https://example.com/a*b*');
  assert.equal(formatting.formatCommunityBodyToHtml(reply.submitted[0]), plain);
});

for (const key of ['Enter', 'Tab']) {
  test(`reply ${key} accepts an available mention after pending results narrow`, async () => {
    const reply = replyHarness();
    reply.change('@al'); reply.startSearch();
    await reply.resolveSearch(['alice', 'albert', 'alfred', 'alison', 'alex', 'allan']);
    reply.change('@ali'); reply.startSearch();
    for (let index = 0; index < 5; index += 1) reply.key('ArrowDown');
    await reply.resolveSearch(['alice']);
    assert.equal(reply.selected().length, 1, 'an available result remains selected');
    assert.doesNotThrow(() => reply.key(key));
    assert.equal(reply.value(), '@alice ');
  });
}

test('editing a stored post displays rich text and saves escaped literals and partial URL marks', async () => {
  const original = formatting.htmlToCommentMarkup('<p>https://example.com/<strong>article</strong>/tail literal *stars*</p>');
  const post = { body: original, media: [], sensitive: false, author: null };
  const saved = [];
  let options, tree, index = 0, dirty = false;
  const states = [], effects = [], pending = [];
  const editor = {
    html: '', getHTML() { return this.html; }, setEditable(value) { this.editable = value; },
    commands: { setContent(value) { editor.html = value; }, focus() {} },
  };
  const hooks = {
    ...React,
    useState(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
      return [states[slot], (value) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; dirty = true; }];
    },
    useRef(value) { const slot = index++; return states[slot] ??= { current: value }; },
    useCallback(callback) { return callback; },
    useMemo(callback) { return callback(); },
    useEffect(callback, dependencies = []) {
      const slot = index++;
      if (!effects[slot] || dependencies.some((value, offset) => value !== effects[slot].dependencies[offset])) {
        pending.push(() => { effects[slot]?.cleanup?.(); effects[slot] = { dependencies, cleanup: callback() }; });
      }
    },
  };
  const wrapper = ({ children }) => React.createElement('div', {}, children);
  const { CommunityEditPostDialog } = sourceModule('src/sections/community/CommunityEditPostDialog.tsx', {
    react: hooks,
    '@hugeicons/react': { HugeiconsIcon: () => null },
    '@hugeicons/core-free-icons': {}, sonner: { toast: { error() {} } },
    '@tiptap/extension-placeholder': { default: { configure: () => ({}) } },
    '@tiptap/starter-kit': { default: { configure: () => ({}) } },
    '@tiptap/react': {
      useEditor(value) { options = value; return editor; },
      EditorContent: ({ editor }) => React.createElement('div', { role: 'textbox', dangerouslySetInnerHTML: { __html: editor.html } }),
    },
    '@/components/ui/button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
    '@/components/ui/dialog': { Dialog: wrapper, DialogContent: wrapper, DialogFooter: wrapper, DialogHeader: wrapper, DialogTitle: wrapper },
    '@/contexts/LocaleContext': { useLocale: () => ({ t: (key) => key }) },
    '@/lib/community-media': {}, '@/lib/community-text': text, '@/lib/comment-formatting': formatting,
    '@/lib/pocketbase/community': { resolveCommunityFileUrl: (value) => value },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '@/types/community': { COMMUNITY_MAX_BODY_LENGTH: 5000, COMMUNITY_MAX_MEDIA_PER_POST: 4 },
    './CommunityAvatar': { CommunityAvatar: () => null },
  });
  function render() {
    let attempts = 0;
    do {
      index = 0; dirty = false;
      tree = CommunityEditPostDialog({ open: true, post, onSave: async (patch) => { saved.push(patch); return true; }, onClose() {} });
      if (++attempts > 10) throw new Error('edit did not settle');
    } while (dirty);
    pending.splice(0).forEach((effect) => effect());
  }
  function findForm(element) {
    if (!React.isValidElement(element)) return null;
    if (element.type === 'form') return element;
    return React.Children.toArray(element.props.children).map(findForm).find(Boolean);
  }
  render();
  assert.match(editor.html, /<strong>article<\/strong>/);
  assert.equal(editor.html.includes('\\!'), false);
  assert.ok(editor.html.includes('literal *stars*'));
  const visible = renderToStaticMarkup(tree);
  assert.equal(visible.includes('\\!'), false);
  assert.equal(visible.includes('\\*'), false);
  assert.ok(visible.includes('role="textbox"'));
  assert.equal(visible.includes('<textarea'), false);
  editor.html = '<p>https://example.com/<strong>revised</strong>/tail literal *stars*</p>';
  options.onUpdate({ editor });
  render();
  await findForm(tree).props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1);
  assert.equal(server.parseEntities(saved[0].body).entities[0].value, 'https://example.com/revised/tail');
  const savedHtml = formatting.formatCommunityBodyToHtml(saved[0].body);
  assert.match(savedHtml, /<strong>revised<\/strong>/);
  assert.ok(savedHtml.includes('literal *stars*'));
  assert.deepEqual(saved[0].mediaIds, []);
  assert.equal(saved[0].sensitive, false);
});
