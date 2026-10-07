import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function helper() {
  let updates = 0;
  const jsx = (type, props) => ({ type, props });
  const react = { createElement: jsx, useEffect: (fn) => fn(), useSyncExternalStore: (subscribe, snapshot) => { subscribe(() => updates++); return snapshot(); } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/lazy-component.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: (name) => name === 'react' ? react : { jsx },
  });
  return { ...exports, updates: () => updates };
}

test('pointer preload and navigation share one import; completion immediately exposes the component and its ref', async () => {
  const h = helper(); let finish, imports = 0;
  const Component = () => null;
  const Deferred = h.lazyComponent(() => { imports++; return new Promise((resolve) => { finish = resolve; }); });
  Deferred.preload(); const ref = {};
  assert.equal(Deferred({ ref }).props['aria-busy'], 'true');
  assert.equal(imports, 1);
  finish({ default: Component }); await new Promise((resolve) => setImmediate(resolve));
  const ready = Deferred({ ref });
  assert.equal(ready.type, Component);
  assert.equal(ready.props.ref, ref);
  assert.ok(h.updates() > 0, 'the mounted screen is notified without a fallback timer');
});

test('failed imports surface through the existing render error boundary', async () => {
  const h = helper(), error = new Error('Import unavailable');
  const Deferred = h.lazyComponent(async () => { throw error; });
  Deferred({}); await new Promise((resolve) => setImmediate(resolve));
  assert.throws(() => Deferred({}), (caught) => caught === error);
});

test('interactive fallback keeps its action and passes the pending open state to the loaded menu', async () => {
  const h = helper(); let finish, open = false;
  const Menu = () => null;
  const Deferred = h.lazyComponent(() => new Promise(resolve => { finish = resolve; }), {
    fallback: props => ({ type: 'button', props: { onClick: props.onPendingOpen } }),
  });
  const pending = Deferred({ defaultOpen: open, onPendingOpen: () => { open = true; } });
  pending.props.onClick();
  finish({ default: Menu }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(Deferred({ defaultOpen: open }).props.defaultOpen, true, 'the first click is retained across loading');
});
