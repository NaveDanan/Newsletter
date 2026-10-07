import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('compose attachments survive lazy screen loading and the pending request is consumed once', () => {
  const exports = {}, events = [];
  vm.runInNewContext(ts.transpileModule(readFileSync('src/sections/community/compose-request.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, window: { dispatchEvent: (event) => events.push(event) }, CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
  });
  const files = [{ name: 'attachment.png' }];
  exports.queueComposeRequest(files);
  const request = exports.takeQueuedComposeRequest();
  assert.equal(request.files, files);
  assert.equal(events[0].type, 'community:compose');
  assert.equal(events[0].detail.files, files);
  assert.equal(exports.takeQueuedComposeRequest(), null, 'StrictMode replay cannot open it twice');
  const handled = exports.consumeComposeRequest(request, null);
  assert.equal(handled.files, files);
  assert.equal(exports.consumeComposeRequest(request, handled.handledId), null);
  const newer = exports.createComposeRequest();
  assert.equal(exports.releaseComposeRequest(newer, handled.handledId), newer, 'late acknowledgements retain newer intent');
});
