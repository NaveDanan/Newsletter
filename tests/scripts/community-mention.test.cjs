const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function mentionHarness() {
  let viewer = 'alice';
  let current;
  const requests = [];
  const react = {
    useState(initial) {
      const instance = current;
      const index = instance.cursor++;
      if (!(index in instance.hooks)) instance.hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [instance.hooks[index], (next) => {
        instance.hooks[index] = typeof next === 'function' ? next(instance.hooks[index]) : next;
        instance.dirty = true;
      }];
    },
    useEffect(effect, deps) {
      const instance = current;
      const index = instance.cursor++;
      const previous = instance.hooks[index];
      if (!previous || deps.some((item, offset) => !Object.is(item, previous.deps[offset]))) {
        instance.effects.push(() => {
          previous?.cleanup?.();
          instance.hooks[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const followButton = () => null;
  const overrides = {
    react,
    'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    '@/contexts/AuthContext': { useAuth: () => ({ user: viewer ? { id: viewer } : null }) },
    '@/contexts/LocaleContext': { useLocale: () => ({ t: (key) => key, formatNumber: String }) },
    '@/lib/pocketbase/community': {
      fetchCommunityProfile(handle) {
        return new Promise((resolve) => requests.push({ viewer, handle, resolve }));
      },
    },
    './CommunityContext': { useCommunity: () => ({ openProfile() {} }) },
    './CommunityFollowButton': { CommunityFollowButton: followButton },
    './CommunityAvatar': { CommunityAvatar: () => null },
    '@/components/ui/skeleton': { Skeleton: 'skeleton' },
    '@/components/ui/hover-card': { HoverCard: 'hover-card', HoverCardContent: 'hover-content', HoverCardTrigger: 'hover-trigger' },
  };
  const filename = 'src/sections/community/CommunityMentionCard.tsx';
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => overrides[id] ?? require(id) }, { filename });
  const createInstance = () => ({ hooks: [], effects: [], cursor: 0, dirty: true, child: null, tree: null });
  function render(instance, component, props) {
    while (instance.dirty || instance.effects.length) {
      if (instance.dirty) {
        instance.dirty = false;
        instance.cursor = 0;
        current = instance;
        instance.tree = component(props);
        if (typeof instance.tree.type === 'function') {
          const next = instance.tree;
          if (!instance.child || instance.child.key !== next.key) {
            for (const hook of instance.child?.instance.hooks ?? []) hook?.cleanup?.();
            instance.child = { key: next.key, instance: createInstance() };
          }
          instance.child.instance.dirty = true;
          instance.tree = render(instance.child.instance, next.type, next.props);
        }
      }
      for (const effect of instance.effects.splice(0)) effect();
    }
    return instance.tree;
  }
  const findFollow = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === followButton) return node.props;
    for (const child of [node.props?.children].flat()) {
      const found = findFollow(child);
      if (found) return found;
    }
    return null;
  };
  return {
    requests,
    setViewer(next) { viewer = next; },
    mount(handle = 'alice') {
      const instance = createInstance();
      const component = module.exports.CommunityMentionCard;
      const props = { handle, children: 'mention' };
      const draw = () => { instance.dirty = true; return render(instance, component, props); };
      return {
        open() { draw().props.onOpenChange(true); return draw(); },
        get follow() { return findFollow(draw()); },
        refresh: draw,
      };
    },
    async complete(index) {
      const request = requests[index];
      request.resolve({ handle: request.handle, displayName: 'Alice', bio: '', isSelf: request.viewer === 'alice', isFollowing: false, isFollowedBy: false, followerCount: 0, followingCount: 0 });
      for (let index = 0; index < 4; index++) await Promise.resolve();
    },
  };
}

test('mention relationships are fetched for the new viewer after account switch and remount', async () => {
  const harness = mentionHarness();
  const aliceCard = harness.mount();
  aliceCard.open();
  await harness.complete(0);
  assert.equal(aliceCard.follow, null);
  harness.setViewer('bob');
  const bobCard = harness.mount();
  bobCard.open();
  assert.equal(harness.requests.length, 2, 'Bob cannot reuse Alice\'s isSelf relationship');
  await harness.complete(1);
  assert.equal(bobCard.follow.handle, 'alice');
});

test('a mention card already mounted resets its relationship state when the viewer changes', async () => {
  const harness = mentionHarness();
  const card = harness.mount();
  card.open();
  await harness.complete(0);
  assert.equal(card.follow, null);
  harness.setViewer('bob');
  card.refresh();
  card.open();
  assert.equal(harness.requests.length, 2);
  await harness.complete(1);
  assert.equal(card.follow.handle, 'alice');
});
