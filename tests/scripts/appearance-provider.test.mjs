import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const emptyPreferences = () => ({ themePreference: '', accentPreset: '', accentCustomHex: '' });
const account = (userId, preferences = emptyPreferences()) => ({ userId, preferences });

// Run the real provider with controlled auth, storage and timers. A new harness
// is a page reload: hook state is lost, but the browser's storage remains.
function mountProvider(storage, initialAccount = null) {
  let currentAccount = initialAccount;
  let listener;
  let cursor = 0;
  let dirty = true;
  let value;
  let nextTimerId = 0;
  const hooks = [];
  const effects = [];
  const timers = new Map();
  const writes = [];
  const modules = new Map();
  const sameDeps = (left, right) => left && right && left.length === right.length
    && left.every((item, index) => Object.is(item, right[index]));
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (next) => {
        const resolved = typeof next === 'function' ? next(hooks[index]) : next;
        if (!Object.is(resolved, hooks[index])) { hooks[index] = resolved; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) hooks[index] = { deps, callback };
      return hooks[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) {
        effects.push(() => {
          hooks[index]?.cleanup?.();
          hooks[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const profile = {
    currentAccountAppearance: () => currentAccount,
    subscribeToAccountAppearance(callback) { listener = callback; return () => { listener = undefined; }; },
    saveAccountAppearance(userId, patch) {
      return new Promise((resolve) => writes.push({ userId, patch, resolve }));
    },
  };
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, next) => storage.set(key, next),
    removeItem: (key) => storage.delete(key),
  };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setTimeout(callback) { const id = ++nextTimerId; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const document = { documentElement: { classList: { add() {}, remove() {} }, setAttribute() {}, style: { setProperty() {} } } };
  function load(relativePath) {
    if (modules.has(relativePath)) return modules.get(relativePath);
    const filename = path.join(root, relativePath);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    const localRequire = (id) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (id === '@/lib/pocketbase/profile') return profile;
      if (id.startsWith('@/')) return load(`src/${id.slice(2)}${id.endsWith('ThemeContext') ? '.tsx' : '.ts'}`);
      return require(id);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, localStorage, window, document, console }, { filename });
    modules.set(relativePath, module.exports);
    return module.exports;
  }
  const { ThemeProvider } = load('src/context/ThemeProvider.tsx');
  function settle() {
    for (let iteration = 0; dirty || effects.length; iteration++) {
      assert.ok(iteration < 30, 'provider effects must settle');
      if (dirty) { dirty = false; cursor = 0; value = ThemeProvider({ children: null }).props.value; }
      for (const effect of effects.splice(0)) effect();
    }
    return value;
  }
  settle();
  return {
    get value() { return settle(); },
    writes,
    changeAccount(next) { currentAccount = next; listener?.(next); return settle(); },
    runTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } settle(); },
    async completeWrite(index, preferences) {
      const write = writes[index];
      const saved = account(write.userId, preferences);
      if (currentAccount?.userId === write.userId) { currentAccount = saved; listener?.(saved); }
      write.resolve(saved);
      for (let index = 0; index < 6; index++) await Promise.resolve();
      return settle();
    },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('logout and reload cannot give another account the previous account appearance', () => {
  const storage = new Map();
  const first = mountProvider(storage, account('account-a', { themePreference: 'dark', accentPreset: 'purple', accentCustomHex: '' }));
  first.changeAccount(null);
  first.unmount();
  const reloaded = mountProvider(storage);
  reloaded.changeAccount(account('account-b'));
  assert.equal(reloaded.value.theme, 'system');
  assert.equal(reloaded.value.accentKey, 'red');
});

test('an untagged legacy mirror is not assumed to belong to a new account', () => {
  const storage = new Map([['artsocial-theme', 'dark'], ['artsocial-accent-preset', 'purple']]);
  const provider = mountProvider(storage, account('untouched-account'));
  assert.equal(provider.value.theme, 'system');
  assert.equal(provider.value.accentKey, 'red');
});

test('a returning account retains its own unset fields across a reload', () => {
  const storage = new Map();
  const first = mountProvider(storage, account('account-a'));
  first.value.setAccentColor('purple');
  first.unmount();
  const reloaded = mountProvider(storage, account('account-a'));
  assert.equal(reloaded.value.accentKey, 'purple');
});

test('an explicit visitor appearance survives sign-in and a reload', () => {
  const storage = new Map();
  const visitor = mountProvider(storage);
  visitor.value.setTheme('dark');
  visitor.value.setAccentColor('cyan');
  visitor.unmount();
  const reloaded = mountProvider(storage, account('new-account'));
  assert.equal(reloaded.value.theme, 'dark');
  assert.equal(reloaded.value.accentKey, 'cyan');
});

test('a mirror reads ownership and preferences from the same stored snapshot', () => {
  const storage = new Map([
    ['artsocial-appearance', JSON.stringify({ owner: 'account-a', theme: 'dark', accentKey: 'purple', customHex: '#ff3b53' })],
    ['artsocial-theme', 'light'],
    ['artsocial-accent-preset', 'cyan'],
  ]);
  const provider = mountProvider(storage, account('account-a'));
  assert.equal(provider.value.theme, 'dark');
  assert.equal(provider.value.accentKey, 'purple');
});

test('a remote theme during a local accent save is reconciled after the save', async () => {
  const provider = mountProvider(new Map(), account('account-a', { themePreference: 'dark', accentPreset: 'purple', accentCustomHex: '' }));
  provider.value.setAccentColor('yellow');
  provider.changeAccount(account('account-a', { themePreference: 'light', accentPreset: 'purple', accentCustomHex: '' }));
  provider.runTimers();
  const final = await provider.completeWrite(0, { themePreference: 'light', accentPreset: 'yellow', accentCustomHex: '' });
  assert.equal(final.theme, 'light');
  assert.equal(final.accentKey, 'yellow');
});

test('a late write from a previous account cannot replace the new account appearance', async () => {
  const provider = mountProvider(new Map(), account('account-a'));
  provider.value.setTheme('dark');
  provider.runTimers();
  provider.changeAccount(account('account-b', { themePreference: 'light', accentPreset: 'cyan', accentCustomHex: '' }));
  const final = await provider.completeWrite(0, { themePreference: 'dark', accentPreset: '', accentCustomHex: '' });
  assert.equal(final.theme, 'light');
  assert.equal(final.accentKey, 'cyan');
});

test('the custom swatch accepts repeated native input and the HEX field applies only valid colors', () => {
  const filename = path.join(root, 'src/components/profile/AppearanceSettings.tsx');
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const theme = {
    theme: 'system', accentKey: 'red', customHex: '#19e2f6',
    setAccentColor(key, hex) { this.accentKey = key; this.customHex = hex; },
  };
  theme.setAccentColor = theme.setAccentColor.bind(theme);
  const swatch = { value: theme.customHex };
  const state = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: {
      useRef: () => ({ current: swatch }),
      useEffect: effect => effect(),
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], next => { state[index] = next; }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/context/ThemeContext': { ACCENT_PRESETS: {}, useTheme: () => theme },
    '@/context/appearance': { HEX_COLOR: /^#[0-9a-fA-F]{6}$/ },
    '@/contexts/LocaleContext': { useLocale: () => ({ t: key => key }) },
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    '@/components/ui/input': { Input: 'hex-input' },
  };
  vm.runInNewContext(code, { exports, require: id => mocks[id] ?? {} }, { filename });

  function render() {
    cursor = 0;
    const nodes = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node?.props) return;
      nodes.push(node);
      visit(node.props.children);
    }
    visit(exports.AppearanceSettings());
    return {
      picker: nodes.find(node => node.props.type === 'color').props,
      hex: nodes.find(node => node.type === 'hex-input').props,
      form: nodes.find(node => node.type === 'form').props,
    };
  }

  for (const color of ['#11aabb', '#22bbcc']) {
    const { picker } = render();
    assert.equal(picker.value, undefined, 'React leaves the native swatch uncontrolled');
    swatch.value = color;
    picker.onInput({ currentTarget: swatch });
    assert.equal(render().hex.value, color);
  }
  render().hex.onChange({ target: { value: ' C0FFEE ' } });
  render().form.onSubmit({ preventDefault() {} });
  assert.equal(theme.customHex, '#c0ffee');
  assert.equal(render().hex.value, '#c0ffee');
  assert.equal(swatch.value, '#c0ffee');

  render().hex.onChange({ target: { value: '#123x' } });
  render().form.onSubmit({ preventDefault() {} });
  assert.equal(render().hex['aria-invalid'], true);
  assert.equal(theme.customHex, '#c0ffee');
});
