import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon, FileSpreadsheetIcon, FilterIcon, Search01Icon,
  Building02Icon, Target01Icon, AnalyticsUpIcon, AnalyticsDownIcon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons";
import { useState, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ExcelJS, { type Worksheet } from 'exceljs';
import { format, parseISO, eachDayOfInterval, differenceInCalendarDays, startOfDay, isToday } from 'date-fns';
import { useLocale } from '@/contexts/LocaleContext';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';
import type { GanttTask, GanttRole, GanttResource, ProjectGantt, GanttTaskStatus, GanttRoleBillingPeriod, GanttCurrency } from '@/types/gantt';
import { getTimelineRange, getTaskProgress, getTaskSpanDays, createTaskId, createResourceId, createRoleId, getNextResourceColor, normalizeTask } from '@/lib/gantt';

// ─── Import Parse Helpers ─────────────────────────────────────────────────────

function parseTaskStatus(s: string): GanttTaskStatus {
  const n = s.toLowerCase().trim().replace(/\s+/g, '-');
  if (n === 'completed' || n === 'done') return 'completed';
  if (n === 'in-progress' || n === 'in progress') return 'in-progress';
  if (n === 'delayed' || n === 'late') return 'delayed';
  return 'pending';
}

function parseRolePeriod(s: string): GanttRoleBillingPeriod {
  const v = s.toLowerCase().trim() as GanttRoleBillingPeriod;
  const valid: GanttRoleBillingPeriod[] = ['hourly', 'daily', 'weekly', 'monthly', 'yearly', 'one-time'];
  return valid.includes(v) ? v : 'monthly';
}

function parseCurrency(s: string): GanttCurrency {
  const v = s.toUpperCase().trim() as GanttCurrency;
  return (['ILS', 'USD', 'EUR', 'GBP'] as GanttCurrency[]).includes(v) ? v : 'ILS';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EXCEL_DATE_FORMAT = 'yyyy-mm-dd';
const EXCEL_EDIT_BUFFER_ROWS = 500;

function toExcelDate(value: unknown): Date | null {
  const s = String(value ?? '').trim();
  if (!s || s === '—' || s === '-' || s === 'ג€”') return null;
  const parsed = parseISO(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function fromExcelDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, 'yyyy-MM-dd');
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return format(new Date(parsed.y, parsed.m - 1, parsed.d), 'yyyy-MM-dd');
    }
  }

  const s = String(value ?? '').trim();
  if (!s) return '';

  const iso = parseISO(s);
  if (!Number.isNaN(iso.getTime())) {
    return format(iso, 'yyyy-MM-dd');
  }

  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) {
    return format(fallback, 'yyyy-MM-dd');
  }

  return s;
}

function applyDateCellValidation(cell: ExcelJS.Cell) {
  cell.numFmt = EXCEL_DATE_FORMAT;
  cell.dataValidation = {
    type: 'date',
    operator: 'between',
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'Invalid date',
    error: 'Enter a valid date.',
    formulae: [new Date(1900, 0, 1), new Date(9999, 11, 31)],
  };
}

function applyListCellValidation(cell: ExcelJS.Cell, formula: string, allowBlank = true) {
  cell.dataValidation = {
    type: 'list',
    allowBlank,
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'Invalid selection',
    error: 'Choose a value from the list.',
    formulae: [formula],
  };
}

function getProjectDueDate(project: Project): string {
  const tasks = project.gantt?.tasks ?? [];
  if (tasks.length === 0) return '—';
  return [...tasks].sort(
    (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
  )[0].endDate;
}

function getStatusBadgeClass(status: Project['status']): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'in-progress': return 'bg-[#D93A3A]/10 text-[#D93A3A]';
    case 'pending': return 'bg-[#F3F4F6] text-[#737373]';
    case 'delayed': return 'bg-amber-100 text-amber-700';
  }
}

function fmtStatus(status: string): string {
  return status.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

function generateTaskNumbers(tasks: GanttTask[]): Map<string, string> {
  const numbers = new Map<string, string>();
  const counters: number[] = [];
  for (const task of tasks) {
    const level = task.indentLevel;
    while (counters.length <= level) counters.push(0);
    counters[level]++;
    for (let i = level + 1; i < counters.length; i++) counters[i] = 0;
    numbers.set(task.id, counters.slice(0, level + 1).join('.'));
  }
  return numbers;
}

// ─── Goal Computation ────────────────────────────────────────────────────────

type GoalStatus = 'ahead' | 'on-track' | 'behind';
interface ComputedGoal {
  id: string; projectTitle: string; milestoneName: string;
  milestoneDate: string; progress: number; status: GoalStatus;
}

function goalProgress(tasks: GanttTask[], ms: GanttTask): number {
  const msDate = parseISO(ms.startDate);
  const preceding = tasks.filter(t => t.id !== ms.id && !t.milestone && parseISO(t.endDate) <= msDate);
  const all = [...preceding, ms];
  const total = all.reduce((s, t) => s + getTaskSpanDays(t), 0);
  if (total === 0) return 0;
  return Math.round(all.reduce((s, t) => s + (getTaskSpanDays(t) * getTaskProgress(t)) / 100, 0) / total * 100);
}

function goalStatus(tasks: GanttTask[], ms: GanttTask): GoalStatus {
  if (ms.status === 'completed') return 'ahead';
  const msDate = parseISO(ms.startDate);
  const preceding = tasks.filter(t => t.id !== ms.id && !t.milestone && parseISO(t.endDate) <= msDate);
  if (preceding.some(t => t.status === 'delayed')) return 'behind';
  if (preceding.length > 0 && preceding.every(t => t.status === 'completed')) return 'ahead';
  return 'on-track';
}

// ─── Task Colors ─────────────────────────────────────────────────────────────

function taskColors(t: GanttTask) {
  switch (t.status) {
    case 'completed': return { bg: '#059669', light: '#D1FAE5', text: '#065F46', argbBg: 'FF059669', argbLight: 'FFD1FAE5', argbText: 'FF065F46' };
    case 'in-progress': return { bg: '#D93A3A', light: '#FEE2E2', text: '#991B1B', argbBg: 'FFD93A3A', argbLight: 'FFFEE2E2', argbText: 'FF991B1B' };
    case 'delayed': return { bg: '#D97706', light: '#FEF3C7', text: '#92400E', argbBg: 'FFD97706', argbLight: 'FFFEF3C7', argbText: 'FF92400E' };
    default: return { bg: '#9CA3AF', light: '#F3F4F6', text: '#374151', argbBg: 'FF9CA3AF', argbLight: 'FFF3F4F6', argbText: 'FF374151' };
  }
}

// ─── Excel Gantt Visual Sheet Builder ────────────────────────────────────────

function buildGanttVisualSheet(ws: Worksheet, project: Project, isRTL: boolean) {
  const tasks = project.gantt?.tasks ?? [];
  if (tasks.length === 0) {
    ws.getCell('A1').value = 'No tasks in this project.';
    ws.views = [{ rightToLeft: isRTL }];
    return;
  }

  const { start: rangeStart, end: rangeEnd } = getTimelineRange(tasks);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const taskNums = generateTaskNumbers(tasks);
  const today = startOfDay(new Date());
  const todayOff = differenceInCalendarDays(today, rangeStart);

  // Column widths
  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 28;
  days.forEach((_, i) => { ws.getColumn(i + 3).width = 3.2; });

  // Month header (row 1)
  ws.getCell(1, 1).value = 'ID';
  ws.getCell(1, 2).value = 'Task';
  [1, 2].forEach(c => {
    const cell = ws.getCell(1, c);
    cell.font = { bold: true, size: 9, color: { argb: 'FF6B7280' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const months: { label: string; count: number; startCol: number }[] = [];
  days.forEach((d, i) => {
    const lbl = format(d, 'MMM yyyy');
    if (!months.length || months[months.length - 1].label !== lbl) {
      months.push({ label: lbl, count: 1, startCol: i + 3 });
    } else {
      months[months.length - 1].count++;
    }
  });

  months.forEach(m => {
    const cell = ws.getCell(1, m.startCol);
    cell.value = m.label;
    cell.font = { bold: true, size: 9, color: { argb: 'FFD93A3A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (m.count > 1) {
      ws.mergeCells(1, m.startCol, 1, m.startCol + m.count - 1);
    }
  });

  // Day header (row 2)
  ws.getCell(2, 1).value = '';
  ws.getCell(2, 2).value = '';
  days.forEach((d, i) => {
    const cell = ws.getCell(2, i + 3);
    const isWeekend = d.getDay() === 5 || d.getDay() === 6;
    const isTodayCol = i === todayOff;
    cell.value = d.getDate();
    cell.font = { size: 8, bold: isTodayCol, color: { argb: isTodayCol ? 'FFD93A3A' : isWeekend ? 'FFD1D5DB' : 'FF9CA3AF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isWeekend ? 'FFF3F4F6' : 'FFFAFAFA' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } } };
  });

  // Task rows (starting row 3)
  tasks.forEach((task, rowIdx) => {
    const row = ws.getRow(rowIdx + 3);
    row.height = 18;
    const c = taskColors(task);
    const num = taskNums.get(task.id) ?? '';
    const taskStart = parseISO(task.startDate);
    const taskEnd = parseISO(task.endDate);
    const startOff = differenceInCalendarDays(taskStart, rangeStart);
    const endOff = differenceInCalendarDays(taskEnd, rangeStart);

    // ID cell
    const idCell = row.getCell(1);
    idCell.value = num;
    idCell.font = { size: 8, color: { argb: 'FFA3A3A3' }, italic: true };
    idCell.alignment = { horizontal: isRTL ? 'left' : 'right', vertical: 'middle' };
    idCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    // Name cell
    const nameCell = row.getCell(2);
    nameCell.value = (task.milestone ? '◆ ' : '') + task.name;
    nameCell.font = { size: 9, bold: task.milestone, color: { argb: task.milestone ? c.argbBg : 'FF171717' } };
    nameCell.alignment = { indent: task.indentLevel, vertical: 'middle', horizontal: isRTL ? 'right' : 'left', readingOrder: isRTL ? 'rtl' : 'ltr' };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    nameCell.border = { right: { style: 'thin', color: { argb: 'FFE5E5E5' } } };

    // Day cells
    days.forEach((d, i) => {
      const cell = row.getCell(i + 3);
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      const inRange = i >= startOff && i <= endOff;
      const isFirst = i === startOff;
      const isTodayCol = i === todayOff;

      if (inRange) {
        if (task.milestone && isFirst) {
          cell.value = '◆';
          cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.argbBg } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (!task.milestone) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.argbLight } };
          if (isFirst) {
            cell.value = task.name;
            cell.font = { size: 8, bold: true, color: { argb: c.argbBg } };
          }
          cell.border = {
            top: { style: 'thin', color: { argb: c.argbBg } },
            bottom: { style: 'thin', color: { argb: c.argbBg } },
            ...(i === startOff ? { left: { style: 'thin', color: { argb: c.argbBg } } } : {}),
            ...(i === endOff ? { right: { style: 'thin', color: { argb: c.argbBg } } } : {}),
          };
        }
      } else {
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: isWeekend ? 'FFF3F4F6' : 'FFFFFFFF' },
        };
        if (isTodayCol) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } };
        }
      }
    });
  });

  // Freeze panes
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2, topLeftCell: 'C3', showGridLines: true, rightToLeft: isRTL }];
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 14;
}

// ─── Mini Gantt Viewer (UI) ───────────────────────────────────────────────────

const DAY_W = 26;
const NAME_W = 210;

function MiniGanttViewer({ project }: { project: Project }) {
  const { formatDate, formatNumber, isRTL, t } = useLocale();
  const tasks = project.gantt?.tasks ?? [];
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center gap-2 py-8">
        <HugeiconsIcon icon={FileSpreadsheetIcon} className="w-10 h-10 text-[#E5E5E5]" />
        <p className="text-sm text-[#737373]">{t('manager.noTasksYet')}</p>
        <p className="text-xs text-[#A3A3A3]">{t('manager.openGanttEditorToAddTasks')}</p>
      </div>
    );
  }

  const { start: rangeStart, end: rangeEnd } = getTimelineRange(tasks);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const today = startOfDay(new Date());
  const todayOff = differenceInCalendarDays(today, rangeStart);
  const taskNums = generateTaskNumbers(tasks);
  const timelineWidth = days.length * DAY_W;
  const stickySide = isRTL ? { right: 0 } : { left: 0 };

  const months: { label: string; count: number }[] = [];
  days.forEach(d => {
    const lbl = formatDate(d, { month: 'short', year: 'numeric' });
    if (!months.length || months[months.length - 1].label !== lbl) months.push({ label: lbl, count: 1 });
    else months[months.length - 1].count++;
  });

  return (
    <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'auto', maxHeight: 440 }} dir="ltr">
      <div style={{ minWidth: NAME_W + timelineWidth }} dir={isRTL ? 'rtl' : 'ltr'}>

        {/* Month header */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, borderBottom: '2px solid #E5E5E5' }}>
          <div style={{ width: NAME_W, flexShrink: 0, background: '#F9FAFB', borderRight: isRTL ? undefined : '1px solid #E5E5E5', borderLeft: isRTL ? '1px solid #E5E5E5' : undefined, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', position: 'sticky', ...stickySide, zIndex: 12, textAlign: isRTL ? 'right' : 'left' }}>{t('manager.task')}</div>
          {months.map((m, i) => (
            <div key={i} style={{ width: m.count * DAY_W, flexShrink: 0, background: '#F9FAFB', borderLeft: i > 0 ? '1px solid #E5E5E5' : undefined, padding: '6px 4px', fontSize: 11, fontWeight: 700, color: '#D93A3A', textAlign: 'center' }}>{m.label}</div>
          ))}
        </div>

        {/* Day header */}
        <div style={{ display: 'flex', position: 'sticky', top: 29, zIndex: 9, borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ width: NAME_W, flexShrink: 0, background: '#FAFAFA', borderRight: isRTL ? undefined : '1px solid #E5E5E5', borderLeft: isRTL ? '1px solid #E5E5E5' : undefined, position: 'sticky', ...stickySide, zIndex: 11 }} />
          {days.map((d, i) => {
            const weekend = d.getDay() === 5 || d.getDay() === 6;
            const todayDay = isToday(d);
            return <div key={i} title={formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })} style={{ width: DAY_W, flexShrink: 0, textAlign: 'center', padding: '3px 0', fontSize: 9, fontWeight: todayDay ? 700 : 400, color: todayDay ? '#D93A3A' : weekend ? '#D1D5DB' : '#9CA3AF', background: weekend ? '#F3F4F6' : '#FAFAFA', borderLeft: '1px solid #F3F4F6' }}>{formatNumber(d.getDate())}</div>;
          })}
        </div>

        {/* Task rows */}
        {tasks.map(task => {
          const c = taskColors(task);
          const startOff = differenceInCalendarDays(parseISO(task.startDate), rangeStart);
          const endOff = differenceInCalendarDays(parseISO(task.endDate), rangeStart);
          const barW = Math.max(DAY_W, (endOff - startOff + 1) * DAY_W);
          const barLeft = isRTL ? timelineWidth - (endOff + 1) * DAY_W + 2 : startOff * DAY_W + 2;
          const milestoneLeft = isRTL ? timelineWidth - (startOff + 1) * DAY_W + DAY_W / 2 - 7 : startOff * DAY_W + DAY_W / 2 - 7;
          const todayLeft = isRTL ? timelineWidth - (todayOff + 1) * DAY_W + DAY_W / 2 : todayOff * DAY_W + DAY_W / 2;
          const prog = getTaskProgress(task);
          const isMile = task.milestone;
          const num = taskNums.get(task.id) ?? '';

          return (
            <div key={task.id} style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', height: 36 }}>
              <div style={{ width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: isRTL ? 8 : 12 + task.indentLevel * 14, paddingRight: isRTL ? 12 + task.indentLevel * 14 : 8, fontSize: 12, color: '#171717', fontWeight: isMile ? 600 : 400, borderRight: isRTL ? undefined : '1px solid #E5E5E5', borderLeft: isRTL ? '1px solid #E5E5E5' : undefined, background: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', gap: 4, position: 'sticky', ...stickySide, zIndex: 8 }}>
                <span style={{ color: '#A3A3A3', fontSize: 10, flexShrink: 0, minWidth: 20, fontFamily: 'monospace' }}>{num}</span>
                {isMile && <span style={{ color: c.bg, fontSize: 10, flexShrink: 0 }}>◆</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
              </div>
              <div style={{ flex: 1, minWidth: timelineWidth, height: '100%', position: 'relative', backgroundImage: `repeating-linear-gradient(to right, transparent ${DAY_W - 1}px, #F3F4F6 ${DAY_W - 1}px, #F3F4F6 ${DAY_W}px)` }}>
                {todayOff >= 0 && todayOff < days.length && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayLeft, width: 1.5, background: '#D93A3A', opacity: 0.45, zIndex: 2 }} />
                )}
                {isMile ? (
                  <div title={task.name} style={{ position: 'absolute', top: '50%', left: milestoneLeft, width: 14, height: 14, transform: 'translateY(-50%) rotate(45deg)', background: c.bg, borderRadius: 2, zIndex: 3 }} />
                ) : (
                  <div title={`${task.name} - ${formatNumber(prog)}%`} style={{ position: 'absolute', top: 6, height: 22, left: barLeft, width: barW - 4, background: c.light, border: `1.5px solid ${c.bg}`, borderRadius: 5, overflow: 'hidden', zIndex: 3 }}>
                    <div style={{ height: '100%', width: `${prog}%`, background: c.bg, opacity: 0.65 }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: isRTL ? undefined : 5, paddingRight: isRTL ? 5 : undefined, fontSize: 10, color: c.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>{task.name}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Raw Gantt Table (matches export format) ─────────────────────────────────

function RawGanttTable({ project }: { project: Project }) {
  const { formatNumber, t } = useLocale();
  const tasks = project.gantt?.tasks ?? [];
  const resources = project.gantt?.resources ?? [];
  const resourceById = new Map(resources.map(r => [r.id, r.name]));
  const taskNums = generateTaskNumbers(tasks);

  if (tasks.length === 0) {
    return <div className="py-10 text-center text-sm text-[#737373]">{t('manager.noTasksYet')}</div>;
  }

  const cols = [
    t('manager.taskId'),
    t('manager.taskName'),
    t('manager.startDate'),
    t('manager.endDate'),
    t('manager.durationDays'),
    t('manager.progressPercent'),
    t('manager.status'),
    t('manager.milestone'),
    t('manager.resource'),
    t('manager.pred'),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F9FAFB] border-b border-[#E5E5E5]">
            {cols.map(c => <th key={c} className="text-left py-2.5 px-3 text-xs font-semibold text-[#737373] uppercase tracking-wider whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F3F4F6]">
          {tasks.map(task => {
            const num = taskNums.get(task.id) ?? '';
            const predNums = task.predecessorIds.map(pid => taskNums.get(pid) ?? '').filter(Boolean).join(', ');
            return (
              <tr key={task.id} className="hover:bg-[#FAFAFA]">
                <td className="py-2 px-3 font-mono text-xs text-[#A3A3A3]">{num}</td>
                <td className="py-2 px-3 font-medium text-[#171717] whitespace-nowrap" style={{ paddingLeft: 12 + task.indentLevel * 12 }}>
                  {task.milestone ? '◆ ' : ''}{task.name}
                </td>
                <td className="py-2 px-3 font-mono text-xs text-[#737373] whitespace-nowrap">{task.startDate}</td>
                <td className="py-2 px-3 font-mono text-xs text-[#737373] whitespace-nowrap">{task.endDate}</td>
                <td className="py-2 px-3 text-xs text-[#737373]">{formatNumber(task.durationDays)}d</td>
                <td className="py-2 px-3 text-xs text-[#737373]">{formatNumber(task.progress)}%</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadgeClass(task.status as Project['status'])}`}>{fmtStatus(task.status)}</span>
                </td>
                <td className="py-2 px-3 text-xs text-[#737373]">{task.milestone ? t('manager.yes') : t('manager.no')}</td>
                <td className="py-2 px-3 text-xs text-[#737373] whitespace-nowrap">{task.resourceId ? (resourceById.get(task.resourceId) ?? '—') : '—'}</td>
                <td className="py-2 px-3 font-mono text-xs text-[#737373]">{predNums || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sheet Types ─────────────────────────────────────────────────────────────

type SheetTab = 'gantt' | 'projects' | 'goals' | 'resources' | 'roles';
type ViewMode = 'visual' | 'raw';

const SHEET_TABS: { id: SheetTab; label: string }[] = [
  { id: 'gantt', label: '📊 Gantt' },
  { id: 'projects', label: '📋 Projects' },
  { id: 'goals', label: '🎯 Goals' },
  { id: 'resources', label: '👤 Resources' },
  { id: 'roles', label: '🎭 Roles' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function SpreadsheetView() {
  const { formatDate, formatNumber, isRTL, t } = useLocale();
  const { projects, addProject } = useProjects();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetTab>('gantt');
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const importRef = useRef<HTMLInputElement>(null);

  const filteredProjects = useMemo(
    () => projects.filter(p =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.department.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [projects, searchTerm]
  );

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const allGoals = useMemo<ComputedGoal[]>(() => {
    const result: ComputedGoal[] = [];
    for (const p of projects) {
      const tasks = p.gantt?.tasks ?? [];
      for (const ms of tasks.filter(t => t.milestone)) {
        result.push({
          id: `${p.id}-${ms.id}`, projectTitle: p.title || p.department,
          milestoneName: ms.name, milestoneDate: ms.startDate,
          progress: goalProgress(tasks, ms), status: goalStatus(tasks, ms),
        });
      }
    }
    return result;
  }, [projects]);

  const displayedGoals = useMemo(() => {
    if (!selectedProject) return allGoals;
    const title = selectedProject.title || selectedProject.department;
    return allGoals.filter(g => g.projectTitle === title);
  }, [allGoals, selectedProject]);

  // ── ExcelJS Export ────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const toExport = selectedProject ? [selectedProject] : projects;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Pulse AI';
    wb.calcProperties.fullCalcOnLoad = true;

    const styleHeader = (ws: Worksheet) => {
      ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, size: 9, color: { argb: 'FF737373' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } } };
      });
    };

    const validationNames = new Map<string, { resources: string; roles: string }>();
    toExport.forEach((p, i) => {
      validationNames.set(p.id, {
        resources: `Project${i + 1}Resources`,
        roles: `Project${i + 1}Roles`,
      });
    });
    const resourceRowsByProject = new Map<string, { start: number; end: number }>();
    const roleRowsByProject = new Map<string, { start: number; end: number }>();
    let nextResourceRow = 2;
    let nextRoleRow = 2;
    toExport.forEach(p => {
      const resourceRowCount = (p.gantt?.resources?.length ?? 0) + EXCEL_EDIT_BUFFER_ROWS;
      const roleRowCount = (p.gantt?.roles?.length ?? 0) + EXCEL_EDIT_BUFFER_ROWS;
      resourceRowsByProject.set(p.id, { start: nextResourceRow, end: nextResourceRow + resourceRowCount - 1 });
      roleRowsByProject.set(p.id, { start: nextRoleRow, end: nextRoleRow + roleRowCount - 1 });
      nextResourceRow += resourceRowCount;
      nextRoleRow += roleRowCount;
    });

    // Projects sheet — each project title goes in column A starting row 2
    const projWs = wb.addWorksheet('Projects');
    projWs.columns = [
      { header: 'Title', key: 'title', width: 30 }, { header: 'Department', key: 'dept', width: 20 },
      { header: 'Division', key: 'div', width: 20 }, { header: 'Field', key: 'field', width: 20 },
      { header: 'Description', key: 'desc', width: 40 }, { header: 'Status', key: 'status', width: 15 },
      { header: 'Due Date', key: 'due', width: 15 },
    ];
    styleHeader(projWs);
    // Track each project's row number in the Projects sheet (header = row 1, data starts row 2)
    const projRowNum = new Map<string, number>();
    toExport.forEach((p, i) => {
      projRowNum.set(p.id, i + 2);
      projWs.addRow({
        title: p.title,
        dept: p.department,
        div: p.devision,
        field: p.field,
        desc: p.description,
        status: fmtStatus(p.status),
        due: toExcelDate(getProjectDueDate(p)),
      });
    });
    for (let row = 2; row <= projWs.rowCount; row++) {
      applyDateCellValidation(projWs.getCell(row, 7));
    }

    // Helper: returns a formula cell value referencing the Projects sheet title cell
    const projRef = (p: { id: string; title: string }) => {
      const row = projRowNum.get(p.id) ?? 2;
      return { formula: `Projects!$A$${row}`, result: p.title } as const;
    };

    // Goals sheet
    const goalsForExport = selectedProject
      ? allGoals.filter(g => g.projectTitle === (selectedProject.title || selectedProject.department))
      : allGoals;
    // Build a map from projectTitle -> project object for formula lookup
    const projByTitle = new Map(toExport.map(p => [p.title || p.department, p]));
    const goalsWs = wb.addWorksheet('Goals');
    goalsWs.columns = [
      { header: 'Project', key: 'project', width: 25 }, { header: 'Milestone', key: 'ms', width: 30 },
      { header: 'Date', key: 'date', width: 15 }, { header: 'Progress (%)', key: 'prog', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
    ];
    goalsWs.getColumn(1).hidden = true;
    styleHeader(goalsWs);
    goalsForExport.forEach(g => {
      const p = projByTitle.get(g.projectTitle);
      goalsWs.addRow({ project: p ? projRef(p) : g.projectTitle, ms: g.milestoneName, date: toExcelDate(g.milestoneDate), prog: g.progress, status: g.status });
    });
    for (let row = 2; row <= Math.max(2, goalsWs.rowCount); row++) {
      applyDateCellValidation(goalsWs.getCell(row, 3));
    }

    // Gantt data sheet
    const ganttWs = wb.addWorksheet('Gantt');
    ganttWs.columns = [
      { header: 'Task ID', key: 'num', width: 10 }, { header: 'Project', key: 'proj', width: 25 },
      { header: 'Task Name', key: 'name', width: 30 }, { header: 'Start Date', key: 'start', width: 15 },
      { header: 'Duration (Days)', key: 'dur', width: 16 }, { header: 'Progress (%)', key: 'prog', width: 14 },
      { header: 'Status', key: 'status', width: 15 }, { header: 'Milestone', key: 'ms', width: 12 },
      { header: 'Resource', key: 'res', width: 20 },
      { header: 'PRED', key: 'pred', width: 15 },
    ];
    ganttWs.getColumn(2).hidden = true;
    styleHeader(ganttWs);
    for (const p of toExport) {
      const firstProjectRow = ganttWs.rowCount + 1;
      const tasks = p.gantt?.tasks ?? [];
      const resourceById = new Map((p.gantt?.resources ?? []).map(r => [r.id, r.name]));
      const taskNums = generateTaskNumbers(tasks);
      const names = validationNames.get(p.id);
      for (const t of tasks) {
        const predNums = t.predecessorIds.map(pid => taskNums.get(pid) ?? '').filter(Boolean).join(', ');
        ganttWs.addRow({
          num: taskNums.get(t.id) ?? '', proj: projRef(p), name: t.name,
          start: toExcelDate(t.startDate), dur: t.durationDays,
          prog: t.progress, status: fmtStatus(t.status),
          ms: t.milestone ? 'Yes' : 'No',
          res: t.resourceId ? (resourceById.get(t.resourceId) ?? '') : '',
          pred: predNums,
        });
      }
      for (let i = 0; i < EXCEL_EDIT_BUFFER_ROWS; i++) {
        ganttWs.addRow({ proj: projRef(p) });
      }
      for (let row = firstProjectRow; row <= ganttWs.rowCount; row++) {
        applyDateCellValidation(ganttWs.getCell(row, 4));
        applyListCellValidation(ganttWs.getCell(row, 7), '"Pending,In Progress,Completed,Delayed"');
        applyListCellValidation(ganttWs.getCell(row, 8), '"Yes,No"');
        if (names) {
          applyListCellValidation(ganttWs.getCell(row, 9), `=${names.resources}`);
        }
      }
    }

    // Resources sheet
    const resWs = wb.addWorksheet('Resources');
    resWs.columns = [
      { header: 'Project', key: 'proj', width: 25 }, { header: 'Name', key: 'name', width: 20 },
      { header: 'Role', key: 'role', width: 20 }, { header: 'Color', key: 'color', width: 12 },
      { header: 'Capacity (%)', key: 'cap', width: 14 },
    ];
    resWs.getColumn(1).hidden = true;
    styleHeader(resWs);
    for (const p of toExport) {
      const firstProjectRow = resWs.rowCount + 1;
      const roleById = new Map((p.gantt?.roles ?? []).map(r => [r.id, r.name]));
      for (const r of (p.gantt?.resources ?? [])) {
        resWs.addRow({ proj: projRef(p), name: r.name, role: r.roleId ? (roleById.get(r.roleId) ?? r.role) : r.role, color: r.color, cap: r.capacityPercent });
      }
      for (let i = 0; i < EXCEL_EDIT_BUFFER_ROWS; i++) {
        resWs.addRow({ proj: projRef(p) });
      }
      const names = validationNames.get(p.id);
      if (names) {
        for (let row = firstProjectRow; row <= resWs.rowCount; row++) {
          applyListCellValidation(resWs.getCell(row, 3), `=${names.roles}`);
        }
      }
    }

    // Roles sheet
    const rolesWs = wb.addWorksheet('Roles');
    rolesWs.columns = [
      { header: 'Project', key: 'proj', width: 25 }, { header: 'Name', key: 'name', width: 20 },
      { header: 'Budget', key: 'budget', width: 15 }, { header: 'Paid By', key: 'paidBy', width: 15 },
      { header: 'Currency', key: 'currency', width: 12 },
    ];
    rolesWs.getColumn(1).hidden = true;
    styleHeader(rolesWs);
    for (const p of toExport) {
      for (const rl of (p.gantt?.roles ?? [])) {
        rolesWs.addRow({ proj: projRef(p), name: rl.name, budget: rl.budget, paidBy: rl.paidBy, currency: rl.currency });
      }
      for (let i = 0; i < EXCEL_EDIT_BUFFER_ROWS; i++) {
        rolesWs.addRow({ proj: projRef(p) });
      }
    }

    toExport.forEach(p => {
      const names = validationNames.get(p.id);
      const resourceRows = resourceRowsByProject.get(p.id);
      const roleRows = roleRowsByProject.get(p.id);
      if (names && resourceRows) {
        wb.definedNames.add(`Resources!$B$${resourceRows.start}:$B$${resourceRows.end}`, names.resources);
      }
      if (names && roleRows) {
        wb.definedNames.add(`Roles!$B$${roleRows.start}:$B$${roleRows.end}`, names.roles);
      }
    });

    // Gantt Visual sheet(s)
    for (const p of toExport) {
      const wsName = toExport.length > 1 ? `Gantt Visual - ${p.title.slice(0, 18)}` : 'Gantt Visual';
      const visWs = wb.addWorksheet(wsName);
      buildGanttVisualSheet(visWs, p, isRTL);
    }

    // Trigger download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedProject
      ? `${selectedProject.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
      : `All_Projects_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('manager.exportedProjects', {
      count: formatNumber(toExport.length),
      suffix: toExport.length !== 1 ? 's' : '',
    }));
  }, [selectedProject, projects, allGoals, formatNumber, isRTL, t]);

  // ── Full Multi-Sheet Import ───────────────────────────────────────

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellFormula: true, cellDates: true, dateNF: EXCEL_DATE_FORMAT });

      // Build row→title map from Projects sheet for formula resolution
      const projSheetRows = wb.Sheets['Projects']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Projects'])
        : [];
      const projRowTitleMap = new Map<number, string>();
      projSheetRows.forEach((r, i) => projRowTitleMap.set(i + 2, String(r['Title'] || r['title'] || '')));

      const resolveCell = (v: unknown): string => {
        const s = String(v ?? '').trim();
        const m = s.match(/^=Projects!\$A\$(\d+)$/i);
        if (m) return projRowTitleMap.get(parseInt(m[1])) ?? s;
        return s;
      };

      // Parse all sheets
      const sheetName = wb.SheetNames.includes('Projects') ? 'Projects' : wb.SheetNames[0];
      if (!sheetName) { toast.error(t('manager.noSheetsFound')); return; }
      const projRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);

      const rolesRows = wb.Sheets['Roles']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Roles']) : [];
      const resRows = wb.Sheets['Resources']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Resources']) : [];
      const ganttRows = wb.Sheets['Gantt']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Gantt']) : [];

      // Group side-tables by project title
      const group = <T,>(arr: T[], key: (r: T) => string) =>
        arr.reduce((m, r) => { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); return m; }, new Map<string, T[]>());

      const rolesByProj  = group(rolesRows,  r => resolveCell(r['Project']));
      const resByProj    = group(resRows,    r => resolveCell(r['Project']));
      const ganttByProj  = group(ganttRows,  r => resolveCell(r['Project']));

      let imported = 0, skipped = 0;

      for (const row of projRows) {
        const title      = resolveCell(row['Title']       ?? row['title']      ?? row['Name'] ?? '');
        const department = resolveCell(row['Department'] ?? row['department'] ?? '');
        if (!title || !department) { skipped++; continue; }

        // Build roles
        const roles: GanttRole[] = (rolesByProj.get(title) ?? [])
          .filter(r => resolveCell(r['Name']).trim())
          .map(r => ({
          id:       createRoleId(),
          name:     String(r['Name']     ?? 'Role'),
          budget:   parseFloat(String(r['Budget']   ?? '0')) || 0,
          paidBy:   parseRolePeriod(String(r['Paid By']  ?? 'monthly')),
          currency: parseCurrency(String(r['Currency'] ?? 'ILS')),
        }));

        // Build resources (link role name → role id)
        const roleByName = new Map(roles.map(r => [r.name, r.id]));
        const resources: GanttResource[] = (resByProj.get(title) ?? [])
          .filter(r => resolveCell(r['Name']).trim())
          .map((r, i) => {
          const roleName = String(r['Role'] ?? '').trim();
          return {
            id:              createResourceId(),
            name:            String(r['Name']           ?? `Resource ${i + 1}`),
            role:            roleName,
            roleId:          roleByName.get(roleName) ?? null,
            color:           String(r['Color']          ?? getNextResourceColor(i)),
            capacityPercent: parseInt(String(r['Capacity (%)'] ?? '100')) || 100,
          };
        });

        // Build tasks — two passes: assign IDs, then resolve predecessors
        const projGanttRows = (ganttByProj.get(title) ?? []).filter(r => resolveCell(r['Task Name']).trim());
        const resourceByName = new Map(resources.map(r => [r.name, r.id]));
        const taskIdByNum = new Map<string, string>();

        // Pass 1: allocate IDs and index task numbers
        const rawEntries = projGanttRows.map(r => {
          const num = String(r['Task ID'] ?? '').trim();
          const id  = createTaskId();
          if (num) taskIdByNum.set(num, id);
          return { id, r, num };
        });

        // Pass 2: build normalised GanttTask objects
        const tasks: GanttTask[] = rawEntries.map(({ id, r, num }) => {
          const predStr  = String(r['PRED'] ?? '').trim();
          const predNums = predStr && predStr !== '—' ? predStr.split(',').map(s => s.trim()) : [];
          const predecessorIds = predNums.map(n => taskIdByNum.get(n) ?? '').filter(Boolean);

          const resName    = String(r['Resource'] ?? '').trim();
          const resourceId = resName && resName !== '—' ? (resourceByName.get(resName) ?? null) : null;
          const milestone  = String(r['Milestone'] ?? 'No').toLowerCase() === 'yes';
          const indentLevel = num ? num.split('.').length - 1 : 0;

          return normalizeTask({
            id,
            name:         String(r['Task Name']      ?? 'Task'),
            startDate:    fromExcelDate(r['Start Date']),
            endDate:      fromExcelDate(r['End Date']),
            durationDays: parseInt(String(r['Duration (Days)'] ?? '1')) || 1,
            progress:     parseInt(String(r['Progress (%)']    ?? '0')) || 0,
            status:       parseTaskStatus(String(r['Status']   ?? 'pending')),
            indentLevel,
            predecessorIds,
            resourceId,
            milestone,
          });
        });

        // Assemble full ProjectGantt and create project with it in one atomic call
        const gantt: ProjectGantt = {
          tasks,
          resources,
          roles,
          zoom: 'day',
          lastEditedAt: new Date().toISOString(),
        };

        await addProject({
          title,
          department,
          devision:    resolveCell(row['Division']    ?? row['Devision']    ?? ''),
          field:       resolveCell(row['Field']       ?? ''),
          description: resolveCell(row['Description'] ?? ''),
        }, gantt);

        imported++;
      }

      if (imported > 0) {
        toast.success(t('manager.importedProjects', {
          count: formatNumber(imported),
          suffix: imported !== 1 ? 's' : '',
          skipped: skipped ? t('manager.importSkipped', { count: formatNumber(skipped) }) : '',
        }));
      } else {
        toast.warning(t('manager.noProjectsImported'));
      }
    } catch (err) {
      console.error(err);
      toast.error(t('manager.failedToParseFile'));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }, [addProject, formatNumber, t]);

  // ── Goal UI helpers ───────────────────────────────────────────────────────

  const goalBadge = (s: GoalStatus) => ({ 'ahead': 'bg-green-100 text-green-700', 'on-track': 'bg-[#D93A3A]/10 text-[#D93A3A]', 'behind': 'bg-red-100 text-red-700' }[s]);
  const goalIcon = (s: GoalStatus) => s === 'ahead'
    ? <HugeiconsIcon icon={AnalyticsUpIcon} className="w-3.5 h-3.5 text-green-600" />
    : s === 'behind'
      ? <HugeiconsIcon icon={AnalyticsDownIcon} className="w-3.5 h-3.5 text-red-600" />
      : <HugeiconsIcon icon={MinusSignIcon} className="w-3.5 h-3.5 text-[#D93A3A]" />;

  const getProjectStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return t('manager.completed');
      case 'in-progress':
        return t('manager.inProgress');
      case 'pending':
        return t('manager.pending');
      case 'delayed':
        return t('manager.delayed');
    }
  };

  const getGoalStatusLabel = (status: GoalStatus) => {
    switch (status) {
      case 'ahead':
        return t('manager.ahead');
      case 'on-track':
        return t('manager.onTrack');
      case 'behind':
        return t('manager.behind');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-hidden">

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#171717]">{t('manager.spreadsheetTitle')}</h2>
          <p className="text-sm text-[#737373]">{t('manager.spreadsheetSummary', { count: formatNumber(projects.length), suffix: projects.length !== 1 ? 's' : '' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
          <button onClick={() => importRef.current?.click()} className="btn-secondary flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('manager.import')}
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
            <HugeiconsIcon icon={Download01Icon} className="w-4 h-4" />
            {selectedProject ? t('manager.exportSelected') : t('manager.exportAll')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon icon={Search01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]', isRTL ? 'right-3' : 'left-3')} />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t('manager.searchProjectsPlaceholder')} dir={isRTL ? 'rtl' : 'ltr'} className={cn('w-full py-2', isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4')} />
        </div>
        <button className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors">
          <HugeiconsIcon icon={FilterIcon} className="w-5 h-5" />
        </button>
      </div>

      {/* Projects Table */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB]">
                {[t('manager.project'), t('manager.department'), t('manager.status'), t('manager.dueDate')].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {filteredProjects.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-sm text-[#737373]">
                  {searchTerm ? t('manager.noSearchResults', { query: searchTerm }) : t('manager.noProjectsYet')}
                </td></tr>
              ) : filteredProjects.map(project => {
                const isSelected = project.id === selectedProjectId;
                return (
                  <tr key={project.id} onClick={() => { setSelectedProjectId(isSelected ? null : project.id); setActiveSheet('gantt'); setViewMode('visual'); }}
                    className={`cursor-pointer transition-all ${isSelected ? 'bg-[#D93A3A]/5 border-l-2 border-l-[#D93A3A]' : 'hover:bg-[#F9FAFB]'}`}>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${isSelected ? 'text-[#D93A3A]' : 'text-[#171717]'}`} dir="auto">{project.title || t('manager.untitledProject')}</span>
                      {project.devision && <div className="text-xs text-[#A3A3A3] mt-0.5" dir="auto">{project.devision}</div>}
                    </td>
                    <td className="py-3 px-4 text-[#737373] text-sm">
                      <span className="flex items-center gap-1.5"><HugeiconsIcon icon={Building02Icon} className="w-3.5 h-3.5 flex-shrink-0" />{project.department}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusBadgeClass(project.status)}`}>{getProjectStatusLabel(project.status)}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[#737373] font-mono">{getProjectDueDate(project) === '—' ? '—' : formatDate(getProjectDueDate(project), { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Excel Viewer ── */}
      {selectedProject && (
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[#E5E5E5] bg-white shadow-sm">

          {/* Header */}
          <div className="sticky top-0 z-30 flex items-center gap-3 px-4 pt-3 border-b border-[#E5E5E5] bg-[#FAFAFA] flex-wrap gap-y-2">
            <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center flex-shrink-0">
              <HugeiconsIcon icon={FileSpreadsheetIcon} className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#171717] truncate">{selectedProject.title}</p>
              <p className="text-xs text-[#737373]">{selectedProject.department}</p>
            </div>

            {/* Visual / Raw toggle */}
            <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-lg p-0.5">
              {(['visual', 'raw'] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === mode ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]'}`}>
                  {mode === 'visual' ? `📊 ${t('manager.visual')}` : `📄 ${t('manager.raw')}`}
                </button>
              ))}
            </div>

            {/* Sheet tabs */}
            <div className="flex items-end gap-px">
              {SHEET_TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveSheet(tab.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg border transition-colors whitespace-nowrap ${activeSheet === tab.id ? 'bg-white border-[#E5E5E5] border-b-white text-[#171717] -mb-px relative z-10' : 'bg-[#F3F4F6] border-transparent text-[#737373] hover:text-[#171717] hover:bg-white'}`}>
                  {tab.id === 'gantt' ? `📊 ${t('manager.gantt')}` : tab.id === 'projects' ? `📋 ${t('manager.projects')}` : tab.id === 'goals' ? `🎯 ${t('manager.goals')}` : tab.id === 'resources' ? `👤 ${t('manager.resources')}` : `🎭 ${t('manager.roles')}`}
                </button>
              ))}
            </div>
          </div>

          {/* Sheet Content */}
          <div className="min-w-0 max-w-full overflow-hidden">
            {/* Gantt */}
            {activeSheet === 'gantt' && (
              viewMode === 'visual'
                ? <MiniGanttViewer project={selectedProject} />
                : <RawGanttTable project={selectedProject} />
            )}

            {/* Projects */}
            {activeSheet === 'projects' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#F9FAFB] border-b border-[#E5E5E5]">
                    {[t('manager.title'), t('manager.department'), t('manager.division'), t('manager.field'), t('manager.status'), t('manager.dueDate'), t('manager.description')].map(c => (
                      <th key={c} className="text-left py-2.5 px-4 text-xs font-semibold text-[#737373] uppercase tracking-wider whitespace-nowrap">{c}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {projects.map(p => (
                      <tr key={p.id} className={p.id === selectedProjectId ? 'bg-[#D93A3A]/5' : 'hover:bg-[#FAFAFA]'}>
                        <td className="py-2 px-4 font-medium text-[#171717] whitespace-nowrap" dir="auto">{p.title}</td>
                        <td className="py-2 px-4 text-[#737373] whitespace-nowrap">{p.department}</td>
                        <td className="py-2 px-4 text-[#737373] whitespace-nowrap">{p.devision}</td>
                        <td className="py-2 px-4 text-[#737373] whitespace-nowrap">{p.field}</td>
                        <td className="py-2 px-4 whitespace-nowrap">
                          {viewMode === 'visual'
                            ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadgeClass(p.status)}`}>{getProjectStatusLabel(p.status)}</span>
                            : <span className="text-xs text-[#737373]">{getProjectStatusLabel(p.status)}</span>}
                        </td>
                        <td className="py-2 px-4 text-[#737373] font-mono text-xs whitespace-nowrap">{getProjectDueDate(p) === '—' ? '—' : formatDate(getProjectDueDate(p), { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                        <td className="py-2 px-4 text-[#737373] max-w-xs truncate" dir="auto">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Goals */}
            {activeSheet === 'goals' && (
              displayedGoals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center gap-2 py-8">
                  <HugeiconsIcon icon={Target01Icon} className="w-10 h-10 text-[#E5E5E5]" />
                  <p className="text-sm text-[#737373]">{t('manager.noMilestonesSpreadsheet')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#F9FAFB] border-b border-[#E5E5E5]">
                      {[t('manager.project'), t('manager.milestone'), t('manager.date'), t('manager.progressPercent'), t('manager.status')].map(c => (
                        <th key={c} className="text-left py-2.5 px-4 text-xs font-semibold text-[#737373] uppercase tracking-wider whitespace-nowrap">{c}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {displayedGoals.map(g => (
                        <tr key={g.id} className="hover:bg-[#FAFAFA]">
                          <td className="py-2.5 px-4 font-medium text-[#171717] whitespace-nowrap">{g.projectTitle}</td>
                          <td className="py-2.5 px-4 text-[#737373] whitespace-nowrap">
                            {viewMode === 'visual'
                              ? <span className="flex items-center gap-1.5"><HugeiconsIcon icon={Target01Icon} className="w-3.5 h-3.5 text-[#D93A3A] flex-shrink-0" />{g.milestoneName}</span>
                              : <span className="text-[#737373]">{g.milestoneName}</span>}
                          </td>
                          <td className="py-2.5 px-4 text-[#737373] font-mono text-xs whitespace-nowrap">{formatDate(g.milestoneDate, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {viewMode === 'visual'
                              ? <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                                    <div className="h-full bg-[#D93A3A] rounded-full" style={{ width: `${g.progress}%` }} />
                                  </div>
                                  <span className="text-xs text-[#737373]">{formatNumber(g.progress)}%</span>
                                </div>
                              : <span className="text-xs text-[#737373]">{formatNumber(g.progress)}%</span>}
                          </td>
                          <td className="py-2.5 px-4">
                            {viewMode === 'visual'
                              ? <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${goalBadge(g.status)}`}>
                                  {goalIcon(g.status)}{getGoalStatusLabel(g.status)}
                                </span>
                              : <span className="text-xs text-[#737373]">{getGoalStatusLabel(g.status)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Resources */}
            {activeSheet === 'resources' && (() => {
              const resources = selectedProject.gantt?.resources ?? [];
              const roles = selectedProject.gantt?.roles ?? [];
              const roleById = new Map(roles.map(r => [r.id, r]));
              return resources.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center gap-2 py-8">
                  <span className="text-4xl">👤</span>
                  <p className="text-sm text-[#737373]">{t('manager.noResourcesSpreadsheet')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#F9FAFB] border-b border-[#E5E5E5]">
                      {[t('manager.name'), t('manager.role'), t('manager.color'), t('manager.capacity')].map(c => <th key={c} className="text-left py-2.5 px-4 text-xs font-semibold text-[#737373] uppercase tracking-wider whitespace-nowrap">{c}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {resources.map(r => {
                        const role = r.roleId ? roleById.get(r.roleId) : null;
                        return (
                          <tr key={r.id} className="hover:bg-[#FAFAFA]">
                            <td className="py-2.5 px-4 font-medium text-[#171717] whitespace-nowrap">
                              {viewMode === 'visual'
                                ? <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full flex-shrink-0 inline-block" style={{ background: r.color }} />{r.name}</span>
                                : <span>{r.name}</span>}
                            </td>
                            <td className="py-2.5 px-4 text-[#737373] whitespace-nowrap">{role?.name ?? r.role ?? '—'}</td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {viewMode === 'visual'
                                ? <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#737373]"><span className="w-4 h-4 rounded" style={{ background: r.color }} />{r.color}</span>
                                : <span className="font-mono text-xs text-[#737373]">{r.color}</span>}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {viewMode === 'visual'
                                ? <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.capacityPercent}%`, background: r.color }} /></div>
                                    <span className="text-xs text-[#737373]">{formatNumber(r.capacityPercent)}%</span>
                                  </div>
                                : <span className="text-xs text-[#737373]">{formatNumber(r.capacityPercent)}%</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Roles */}
            {activeSheet === 'roles' && (() => {
              const roles = selectedProject.gantt?.roles ?? [];
              return roles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center gap-2 py-8">
                  <span className="text-4xl">🎭</span>
                  <p className="text-sm text-[#737373]">{t('manager.noRolesSpreadsheet')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#F9FAFB] border-b border-[#E5E5E5]">
                      {[t('manager.name'), t('manager.budget'), t('manager.paidBy'), t('manager.currency')].map(c => <th key={c} className="text-left py-2.5 px-4 text-xs font-semibold text-[#737373] uppercase tracking-wider whitespace-nowrap">{c}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {roles.map(rl => (
                        <tr key={rl.id} className="hover:bg-[#FAFAFA]">
                          <td className="py-2.5 px-4 font-medium text-[#171717] whitespace-nowrap">{rl.name}</td>
                          <td className="py-2.5 px-4 text-[#737373] whitespace-nowrap font-mono">{formatNumber(rl.budget)} {rl.currency}</td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {viewMode === 'visual'
                              ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#737373] font-medium capitalize">{rl.paidBy}</span>
                              : <span className="text-xs text-[#737373] capitalize">{rl.paidBy}</span>}
                          </td>
                          <td className="py-2.5 px-4 text-[#737373] whitespace-nowrap">{rl.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
