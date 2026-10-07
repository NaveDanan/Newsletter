import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as dateFns from 'date-fns';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';

test('viewing the spreadsheet loads no file libraries; export/import retain dates, roles and resources', async () => {
  const imported = [], dependencies = [], notifications = [];
  let download;
  const project = {
    id: 'project', title: 'Latency project', department: 'Engineering', devision: 'Platform', field: 'AI', description: 'Test project', status: 'in-progress',
    gantt: {
      tasks: [{ id: 'task', name: 'Deliver', startDate: '2026-10-05', endDate: '2026-10-08', durationDays: 3, progress: 25, status: 'in-progress', resourceId: 'resource', parentId: '', predecessorIds: [], milestone: false }],
      roles: [{ id: 'role', name: 'Engineer', budget: 100, paidBy: 'hourly', currency: 'USD' }],
      resources: [{ id: 'resource', name: 'Alex', role: 'Engineer', roleId: 'role', color: '#123456', capacityPercent: 100 }],
    },
  };
  const jsx = (type, props) => ({ type, props });
  const react = { useState: (value) => [value, () => {}], useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useCallback: (fn) => fn };
  const gantt = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/gantt.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: gantt, require: () => dateFns, Date, crypto });
  const exports = {};
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'date-fns': dateFns,
    '@hugeicons/react': { HugeiconsIcon: () => null }, '@hugeicons/core-free-icons': {},
    sonner: { toast: { success: (text) => notifications.push(text), warning: (text) => notifications.push(text), error: (text) => { throw new Error(text); } } },
    '@/contexts/LocaleContext': { useLocale: () => ({ t: (key) => key, formatNumber: String, formatDate: String, isRTL: false }) },
    '@/hooks/useProjects': { useProjects: () => ({ projects: [project], addProject: async (...args) => imported.push(args) }) },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') }, '@/lib/gantt': gantt,
  };
  vm.runInNewContext(ts.transpileModule(readFileSync('src/sections/manager/SpreadsheetView.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require(name) {
      if (name === 'exceljs') { dependencies.push(name); return { default: ExcelJS }; }
      if (name === 'xlsx') { dependencies.push(name); return XLSX; }
      if (mocks[name]) return mocks[name]; throw new Error(name);
    }, Date, Blob, URL: { createObjectURL: (blob) => { download = blob; return 'blob:export'; }, revokeObjectURL() {} }, document: { createElement: () => ({ click() {} }) }, console,
  });
  const tree = exports.SpreadsheetView(), nodes = [];
  const visit = (node) => { if (Array.isArray(node)) node.forEach(visit); else if (node && typeof node === 'object') { nodes.push(node); visit(node.props?.children); } };
  visit(tree);
  assert.deepEqual(dependencies, []);
  await nodes.find((node) => node.type === 'button' && node.props.children?.includes('manager.exportAll')).props.onClick();
  assert.deepEqual(dependencies, ['exceljs']);
  assert.ok(download.size > 1000);
  const bytes = await download.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  assert.ok(workbook.Sheets['Gantt Visual']);
  await nodes.find((node) => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{ arrayBuffer: async () => bytes }] } });
  assert.deepEqual(dependencies, ['exceljs', 'xlsx']);
  assert.equal(imported.length, 1);
  assert.equal(imported[0][0].title, project.title);
  const data = imported[0][1];
  assert.equal(data.tasks[0].startDate, '2026-10-05');
  assert.equal(data.tasks[0].name, 'Deliver');
  assert.equal(data.roles[0].currency, 'USD');
  assert.equal(data.roles[0].name, 'Engineer');
  assert.equal(data.resources[0].name, 'Alex');
  assert.equal(data.tasks[0].resourceId, data.resources[0].id);
});
