import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as dateFns from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';

// Execute the actual App -> dashboard -> shell callbacks with deterministic hooks.
// Unrelated views and the editor are boundary doubles; routing and guards are real.
function appHarness({ navigationOnly = false, realEditor = false, gantt = false, authLoading = false, ganttTasks = [], update } = {}) {
  const hooks = new Map(), modules = new Map(), stubs = new Map();
  let current, cursor, nodes = [], mounted = new Set();
  const newsletter = { id: 'published-one', title: 'Published', subtitle: '', content: '<p>Published content</p>', author: 'Admin', coverImage: '', status: 'published', tags: [], ownerId: 'admin' };
  const editor = { dirty: true, prepares: 0, saves: 0 };
  const location = { pathname: gantt ? '/gantt-editor/project-one' : '/manager', hash: '' };
  const window = { location, history: { state: null, pushState(state, _, path) { this.state = state; location.pathname = path; location.hash = ''; }, replaceState(state, _, path) { this.state = state; location.pathname = path; location.hash = ''; } }, dispatchEvent() {}, setTimeout, addEventListener() {}, removeEventListener() {} };
  const user = { id: 'admin', role: 'admin', name: 'Admin' };
  const react = {
    useState(initial) { const index = cursor++; current[index] ??= { value: typeof initial === 'function' ? initial() : initial }; const slot = current[index]; return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useRef(initial) { const index = cursor++; current[index] ??= { current: initial }; return current[index]; },
    useMemo: (factory) => factory(), useCallback: (callback) => callback,
    useEffect(effect, deps) { const index = cursor++; const slot = current[index]; if (!slot || deps?.some((value, i) => value !== slot.deps?.[i])) { slot?.cleanup?.(); current[index] = { deps, cleanup: effect() }; } },
    useSyncExternalStore: (_, snapshot) => snapshot(),
    startTransition: (action) => action(),
    forwardRef: (component) => {
      const wrapper = (props) => component(props, props.ref);
      wrapper.displayName = component.name;
      return wrapper;
    },
    useImperativeHandle: (ref, create) => { ref.current = create(); },
  };
  const jsx = (type, props) => ({ type, props });
  function stub(name) {
    if (!stubs.has(name)) {
      const component = (props) => {
        if (name === 'NewsletterEditor') props.ref.current = {
          prepareToLeave() { editor.prepares++; return { requiresConfirmation: editor.dirty }; },
          async savePublishedChanges() { editor.saves++; return Boolean(await props.onUpdate(newsletter.id, { title: 'Edited' })); },
        };
        return props.children ?? null;
      };
      component.displayName = name;
      stubs.set(name, component);
    }
    return stubs.get(name);
  }
  const locale = { t: (key) => key, isRTL: false, locale: 'en', formatNumber: String, formatDate: (date) => String(date) };
  const data = {
    newsletters: [newsletter], hasNewsletterList: true, isLoaded: true, refreshNewsletters() {},
    updateNewsletter: update ?? (() => Promise.resolve(newsletter)),
  };
  const managed = { id: 'managed', dropdownId: 'resources', name: 'Managed resource', description: 'Resource description', url: 'https://resource.example/guide', iconUrl: '', order: 0, hidden: false };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = (name) => {
      if (name === 'react') return react;
      if (name.endsWith('navigation-warmup')) return { warmHomeNavigation: () => () => {} };
      if (name.endsWith('pocketbase/client')) return { getPocketBase: () => ({ authStore: { isValid: false } }) };
      if (name.endsWith('preload-route')) return load('src/lib/preload-route.ts');
      if (name.endsWith('route-components')) return load('src/lib/route-components.tsx');
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name.endsWith('lazy-component')) return { lazyComponent(factory) {
        const componentName = factory.toString().match(/default:\s*module\.(\w+)/)?.[1];
        const component = componentName === 'ManagerDashboard' ? load('src/sections/ManagerDashboard.tsx').ManagerDashboard
          : componentName === 'GanttEditorPage' ? load('src/sections/manager/GanttEditorPage.tsx').GanttEditorPage
          : componentName === 'NewsletterEditor' && realEditor ? load('src/sections/manager/NewsletterEditor.tsx').NewsletterEditor
          : stub(componentName);
        const deferred = (props) => jsx(component, props);
        deferred.displayName = componentName; deferred.preload = () => {};
        return deferred;
      } };
      if (name === 'date-fns') return dateFns;
      if (name === 'date-fns/locale') return { enUS, he: enUS };
      if (name === '@fortawesome/free-solid-svg-icons') return new Proxy({}, { get: () => ({ icon: [1, 1, null, null, ''] }) });
      if (name.endsWith('AppStageShell')) return load('src/components/AppStageShell.tsx');
      if (name.endsWith('ManagerDashboard')) return load('src/sections/ManagerDashboard.tsx');
      if (name.endsWith('GanttEditorPage')) return load('src/sections/manager/GanttEditorPage.tsx');
      if (name.endsWith('/gantt')) return load('src/lib/gantt.ts');
      if (realEditor && name.endsWith('NewsletterEditor')) return load('src/sections/manager/NewsletterEditor.tsx');
      if (name.endsWith('/Navigation')) return load('src/components/Navigation.tsx');
      if (name.endsWith('/navigation-link')) return load('src/types/navigation-link.ts');
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ isAuthenticated: true, isLoading: authLoading, user, logout() {} }) };
      if (name.endsWith('LocaleContext')) return { useLocale: () => locale };
      if (name.endsWith('ThemeContext')) return { useTheme: () => ({ deviceMode: 'mobile' }) };
      if (name.endsWith('NavigationDataContext')) return { useNavigationData: () => ({ dropdowns: [], links: [managed] }) };
      if (name.endsWith('useNewsletters')) return { useNewsletters: () => data };
      if (name.endsWith('useProjects')) return { useProjects: () => ({ isLoading: false, projects: [{ id: 'project-one', title: 'Project', department: '', gantt: { tasks: ganttTasks, resources: [], roles: [], zoom: 'day', lastEditedAt: null } }], updateProjectGantt: update ?? (() => Promise.resolve({ id: 'project-one' })) }) };
      if (name.endsWith('useSubscriberCount')) return { useSubscriberCount: () => ({ subscriberCount: 0, publishedNewsletterCount: 1 }) };
      if (name.endsWith('useCollapsingLabels')) return { useCollapsingLabels() {} };
      if (name.endsWith('permissions')) return new Proxy({}, { get: () => () => true });
      if (name.endsWith('community-routes')) return { parseCommunityRoute: (path) => path.startsWith('/community') ? { pathname: path } : null };
      if (name.endsWith('bootLogger')) return { bootLogger: new Proxy({}, { get: () => () => {} }) };
      if (name.endsWith('/utils')) return { cn: (...values) => values.join(' ') };
      if (name === 'sonner') return { Toaster: stub('Toaster'), toast: { error() {}, success() {} } };
      return new Proxy({}, { get: (_, key) => stub(String(key)) });
    };
    vm.runInNewContext(code, { exports, require, window, Event, setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout, console });
    return exports;
  }
  const app = navigationOnly ? load('src/components/Navigation.tsx').Navigation : load('src/App.tsx').default;
  function visit(element) {
    if (Array.isArray(element)) { element.forEach(visit); return; }
    if (!element || typeof element !== 'object') return;
    nodes.push(element);
    if (typeof element.type === 'function') {
      const previous = current, previousCursor = cursor;
      current = hooks.get(element.type) ?? [];
      hooks.set(element.type, current); mounted.add(element.type); cursor = 0;
      visit(element.type(element.props));
      current = previous; cursor = previousCursor;
    } else visit(element.props?.children);
  }
  function render() {
    const previous = mounted; mounted = new Set(); nodes = [];
    visit(jsx(app, navigationOnly ? { activeTab: 'home', isAuthenticated: true, onHomeClick() {}, onCommunityClick() { location.pathname = '/community'; }, onManagerClick() { location.pathname = '/manager'; }, onProfileClick() {}, onSignInClick() {}, onSignOut() {} } : {}));
    for (const component of previous) if (!mounted.has(component)) {
      for (const slot of hooks.get(component) ?? []) slot?.cleanup?.();
      hooks.delete(component);
    }
  }
  const find = (predicate) => nodes.find(predicate);
  const named = (name) => find((node) => node.type?.displayName === name);
  const button = (title) => find((node) => node.type === 'button' && (node.props.title === title || node.props['aria-label'] === title));
  const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node?.props?.children ?? '');
  const textButton = (label) => find((node) => node.type === 'button' && text(node).trim() === label);
  render();
  return { render, find, named, button, textButton, nodes: () => nodes, location, editor, data, openEditor() { named('NewsletterList').props.onEdit(newsletter); render(); render(); assert.ok(named('NewsletterEditor')); }, editGantt() { textButton('ganttEditor.weekly').props.onClick(); render(); } };
}

for (const [title, target, hash] of [['Feed', '/', ''], ['Explore Topics', '/', '#topics'], ['Community', '/community', ''], ['Profile', '/profile', '']]) {
  test(`mobile ${title} preserves published edits on cancel and leaves after discard`, () => {
    const app = appHarness(); app.openEditor();
    app.button(title).props.onClick(); app.render();
    assert.equal(app.location.pathname, '/manager', 'navigation must wait for a decision');
    assert.equal(app.location.hash, '', 'hash must also wait');
    assert.equal(app.named('AlertDialog').props.open, true);
    app.named('AlertDialog').props.onOpenChange(false); app.render();
    assert.ok(app.named('NewsletterEditor'), 'cancel keeps the editor mounted');
    app.button(title).props.onClick(); app.render();
    app.find((node) => node.type?.displayName === 'AlertDialogAction' && node.props.children === 'manager.discardChanges').props.onClick(); app.render();
    assert.equal(app.location.pathname, target); assert.equal(app.location.hash, hash);
    assert.equal(app.editor.saves, 0);
  });
}

test('mobile Save waits for persistence, preserves edits on failure, and ignores an unmounted dashboard', async () => {
  let finish;
  const app = appHarness({ update: () => new Promise((resolve) => { finish = resolve; }) });
  app.openEditor(); app.button('Community').props.onClick(); app.render();
  const save = () => app.find((node) => node.type?.displayName === 'AlertDialogAction' && node.props.children === 'manager.saveChanges').props.onClick({ preventDefault() {} });
  const pending = save();
  assert.equal(app.location.pathname, '/manager', 'save must finish before routing');
  finish(null); await pending; app.render();
  assert.ok(app.named('NewsletterEditor'), 'failed save keeps the edits');
  const retry = save();
  app.location.pathname = '/profile'; app.render();
  finish({ id: 'published-one' }); await retry; app.render();
  assert.equal(app.location.pathname, '/profile', 'late save cannot navigate an unmounted dashboard');
});

test('real published editor awaits persistence, preserves failed edits and saves before mobile navigation', async () => {
  let finish;
  const app = appHarness({ realEditor: true, update: () => new Promise((resolve) => { finish = resolve; }) });
  app.openEditor();
  app.find((node) => node.type === 'input' && node.props.value === 'Published').props.onChange({ target: { value: 'Edited published title' } });
  app.render(); app.button('Community').props.onClick(); app.render();
  const save = () => app.find((node) => node.type?.displayName === 'AlertDialogAction' && node.props.children === 'manager.saveChanges').props.onClick({ preventDefault() {} });
  const first = save();
  assert.equal(app.location.pathname, '/manager');
  finish(null); await first; app.render();
  assert.equal(app.location.pathname, '/manager');
  assert.ok(app.find((node) => node.type === 'input' && node.props.value === 'Edited published title'));
  assert.equal(app.named('AlertDialog').props.open, true);
  const second = save();
  assert.equal(app.location.pathname, '/manager');
  finish({ id: 'published-one' }); await second; app.render();
  assert.equal(app.location.pathname, '/community');
});

test('mobile Save navigates after successful persistence', async () => {
  const app = appHarness(); app.openEditor(); app.button('Community').props.onClick(); app.render();
  await app.find((node) => node.type?.displayName === 'AlertDialogAction' && node.props.children === 'manager.saveChanges').props.onClick({ preventDefault() {} });
  app.render(); assert.equal(app.location.pathname, '/community'); assert.equal(app.editor.saves, 1);
});

test('hamburger renders resource groups, managed links and builtin actions', () => {
  const app = appHarness({ navigationOnly: true });
  app.button('nav.openMenu').props.onClick(); app.render();
  const menu = app.find((node) => node.props?.id === 'mobile-navigation-menu');
  assert.ok(menu, 'expanded hamburger exposes its controlled panel');
  const resource = app.find((node) => node.type === 'a' && node.props.href === 'https://resource.example/guide');
  assert.ok(resource, 'managed resource is reachable below the desktop breakpoint');
  assert.equal(resource.props.children.props.children[0].props.children, 'Managed resource');
  let prevented = false;
  resource.props.onClick({ preventDefault() { prevented = true; } }); app.render();
  assert.equal(prevented, false, 'external resources keep normal anchor navigation');
  app.button('nav.openMenu').props.onClick(); app.render();
  const manager = app.find((node) => node.type === 'button' && node.props.children?.props?.children?.[0]?.props?.children === 'navDropdown.resources.managerLabel');
  assert.ok(manager, 'builtin callbacks render as buttons');
  manager.props.onClick({ preventDefault() {} }); app.render();
  assert.equal(app.location.pathname, '/manager');
  assert.equal(app.find((node) => node.props?.id === 'mobile-navigation-menu'), undefined);
});

for (const [title, target, hash] of [['Feed', '/', ''], ['Explore Topics', '/', '#topics'], ['Community', '/community', ''], ['Profile', '/profile', ''], ['Create Post or Manage', '/manager', '']]) {
  test(`Gantt mobile ${title} preserves edits on cancel and leaves after discard`, () => {
    const app = appHarness({ gantt: true }); app.editGantt();
    app.button(title).props.onClick(); app.render();
    assert.equal(app.location.pathname, '/gantt-editor/project-one', 'dirty Gantt needs a decision before routing');
    assert.equal(app.location.hash, '');
    assert.ok(app.find((node) => node.type?.displayName === 'Dialog' && node.props.open));
    app.textButton('manager.keepEditing').props.onClick(); app.render();
    assert.ok(app.find((node) => node.props?.children === 'ganttEditor.unsavedChanges'), 'cancel preserves dirty draft');
    app.button(title).props.onClick(); app.render();
    app.textButton('ganttEditor.leaveWithoutSaving').props.onClick(); app.render();
    assert.equal(app.location.pathname, target); assert.equal(app.location.hash, hash);
  });
}

test('Gantt Save waits for persistence and preserves dirty state on failure before retrying navigation', async () => {
  let finish;
  const app = appHarness({ gantt: true, update: () => new Promise((resolve) => { finish = resolve; }) });
  app.editGantt(); app.button('Community').props.onClick(); app.render();
  const pending = app.textButton('manager.saveChanges').props.onClick();
  assert.equal(app.location.pathname, '/gantt-editor/project-one');
  finish(null); await pending; app.render();
  assert.equal(app.location.pathname, '/gantt-editor/project-one');
  assert.ok(app.find((node) => node.props?.children === 'ganttEditor.unsavedChanges'));
  const retry = app.textButton('manager.saveChanges').props.onClick();
  finish({ id: 'project-one' }); await retry; app.render();
  assert.equal(app.location.pathname, '/community');
});

test('Gantt ignores successful save responses after the editor unmounts', async () => {
  let finish;
  const app = appHarness({ gantt: true, update: () => new Promise((resolve) => { finish = resolve; }) });
  app.editGantt(); app.button('Community').props.onClick(); app.render();
  const pending = app.textButton('manager.saveChanges').props.onClick();
  app.location.pathname = '/profile'; app.render();
  finish({ id: 'project-one' }); await pending; app.render();
  assert.equal(app.location.pathname, '/profile');
});

test('Gantt Save Schedule keeps unsaved status on failure and preserves edits made during persistence', async () => {
  let finish;
  const app = appHarness({ gantt: true, update: () => new Promise((resolve) => { finish = resolve; }) });
  app.editGantt();
  const first = app.textButton('ganttEditor.saveSchedule').props.onClick();
  finish(null); await first; app.render();
  assert.ok(app.find((node) => node.props?.children === 'ganttEditor.unsavedChanges'));
  const second = app.textButton('ganttEditor.saveSchedule').props.onClick();
  app.textButton('ganttEditor.monthly').props.onClick(); app.render();
  finish({ id: 'project-one' }); await second; app.render();
  assert.ok(app.find((node) => node.props?.children === 'ganttEditor.unsavedChanges'), 'newer draft remains unsaved');
  assert.match(app.textButton('ganttEditor.monthly').props.className, /shadow-sm/, 'newer zoom was not overwritten');
});

test('Gantt Save and Leave keeps blank-task confirmation and routes only after Save Anyway succeeds', async () => {
  const blankTask = { id: 'task-one', name: '', startDate: '2026-10-05', endDate: '2026-10-06', durationDays: 2, progress: 0, status: 'pending', indentLevel: 0, predecessorIds: [], resourceId: null, milestone: false };
  let calls = 0;
  const app = appHarness({ gantt: true, ganttTasks: [blankTask], update: async () => { calls++; return { id: 'project-one' }; } });
  app.editGantt(); app.button('Community').props.onClick(); app.render();
  await app.textButton('manager.saveChanges').props.onClick(); app.render();
  assert.equal(calls, 0, 'blank task warning precedes persistence');
  assert.equal(app.location.pathname, '/gantt-editor/project-one');
  await app.textButton('ganttEditor.saveAnyway').props.onClick(); app.render();
  assert.equal(calls, 1); assert.equal(app.location.pathname, '/community');
});


test('restored authenticated manager and Gantt screens render while the session validates', () => {
  const manager = appHarness({ authLoading: true });
  assert.ok(manager.named('ManagerDashboard'));
  const gantt = appHarness({ authLoading: true, gantt: true });
  assert.ok(gantt.named('GanttEditorPage'));
});

test('publishing a newsletter keeps the updated count when leaving the newsletter tab', () => {
  const app = appHarness();
  app.data.newsletters.push({ ...app.data.newsletters[0], id: 'newly-published' }); app.render();
  app.textButton('manager.projects').props.onClick(); app.render();
  const counters = app.nodes().filter(node => node.type === 'span' && node.props.className === 'font-bold text-sm text-[var(--text-primary)]');
  assert.equal(counters[0].props.children, '2', 'an older stats response cannot hide the new publication');
});

test('the Gantt route fills its viewport without the surrounding newsletter gutters', () => {
  const app = appHarness({ gantt: true });
  assert.equal(app.find((node) => node.type?.name === 'AppStageShell').props.fullViewport, true);
  const frame = app.find((node) => typeof node.props?.className === 'string' && node.props.className.split(/\s+/).includes('app-stage-full'));
  assert.ok(frame, 'The editor owns the full viewport frame');
  assert.doesNotMatch(frame.props.className, /(?:^|\s)(?:\w+:)*(?:px|py)-\d/, 'Responsive newsletter gutters must not constrain the editor');
});
