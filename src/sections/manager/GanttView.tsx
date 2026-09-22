import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar01Icon, Edit02Icon, ViewIcon, ViewOffIcon, Calendar03Icon, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { addMonths, addWeeks, differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarWeeks, endOfMonth, endOfWeek, format, isAfter, parseISO, startOfMonth, startOfQuarter, startOfWeek } from 'date-fns';
import { enUS, he as heLocale } from 'date-fns/locale';
import { useMemo, useRef, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { useProjects } from '../../hooks/useProjects';
import { applyDependencyScheduling, getStatusBadgeClass, getStatusBarClass, getStatusColor, getTaskCalendarSpanDays, getTaskEnd, getTaskOffsetDays, getTimelineDays, updateTaskDeadline } from '../../lib/gantt';
import type { GanttTask, GanttZoom } from '../../types/gantt';
import type { Project } from '../../types/project';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

interface GanttViewProps {
  onEditProjectGantt: (projectId: string) => void;
}

const statusOrder: GanttTask['status'][] = ['pending', 'in-progress', 'completed', 'delayed'];
const contentTimelinePeriodCount = 6;
const contentTimelineWeekStartsOn = 0 as const;
const contentTimelineBarHeight = 20;
const contentTimelineBarGap = 4;
const contentTimelineRowPadding = 8;

interface ContentTimelineBar {
  id: string;
  name: string;
  owner: string;
  status: GanttTask['status'];
  startLabel: string;
  endLabel: string;
  left: string;
  width: string;
  top: number;
}

interface ContentTimelineRow {
  project: Project;
  bars: ContentTimelineBar[];
  rowMinHeight: number;
}

function buildTimelineWeeks(days: Date[]) {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

function buildTimelineMonths(days: Date[]) {
  const months: Date[][] = [];

  days.forEach((day) => {
    const lastMonth = months[months.length - 1];
    if (!lastMonth || startOfMonth(lastMonth[0]).getTime() !== startOfMonth(day).getTime()) {
      months.push([day]);
      return;
    }

    lastMonth.push(day);
  });

  return months;
}

function buildTimelineQuarters(days: Date[]) {
  const quarters: Date[][] = [];

  days.forEach((day) => {
    const lastQuarter = quarters[quarters.length - 1];
    if (!lastQuarter || startOfQuarter(lastQuarter[0]).getTime() !== startOfQuarter(day).getTime()) {
      quarters.push([day]);
      return;
    }

    lastQuarter.push(day);
  });

  return quarters;
}

function getQuarterNumber(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function buildContentTimelineRow(
  project: Project,
  windowStart: Date,
  windowEnd: Date,
  formatLabel: (date: Date) => string,
  unassignedLabel: string,
  isRTL: boolean,
): ContentTimelineRow {
  const resourceNameById = new Map(project.gantt.resources.map((resource) => [resource.id, resource.name]));
  const laneEndDates: Date[] = [];
  const totalWindowDays = differenceInCalendarDays(windowEnd, windowStart) + 1;
  const bars = [...project.gantt.tasks]
    .sort((left, right) => {
      const startDifference = left.startDate.localeCompare(right.startDate);
      if (startDifference !== 0) {
        return startDifference;
      }

      return right.durationDays - left.durationDays;
    })
    .reduce<ContentTimelineBar[]>((result, task) => {
      const taskStart = parseISO(task.startDate);
      const taskEnd = getTaskEnd(task);

      if (isAfter(taskStart, windowEnd) || isAfter(windowStart, taskEnd)) {
        return result;
      }

      const clampedStart = isAfter(taskStart, windowStart) ? taskStart : windowStart;
      const clampedEnd = isAfter(taskEnd, windowEnd) ? windowEnd : taskEnd;
      const laneIndex = laneEndDates.findIndex((laneEnd) => differenceInCalendarDays(clampedStart, laneEnd) > 0);
      const resolvedLaneIndex = laneIndex === -1 ? laneEndDates.length : laneIndex;

      laneEndDates[resolvedLaneIndex] = clampedEnd;

      const startPercent = (differenceInCalendarDays(clampedStart, windowStart) / totalWindowDays) * 100;
      const widthPercent = Math.max(((differenceInCalendarDays(clampedEnd, clampedStart) + 1) / totalWindowDays) * 100, 2);

      result.push({
        id: task.id,
        name: task.name,
        owner: task.resourceId ? resourceNameById.get(task.resourceId) ?? unassignedLabel : unassignedLabel,
        status: task.status,
        startLabel: formatLabel(taskStart),
        endLabel: formatLabel(taskEnd),
        left: `${isRTL ? 100 - startPercent - widthPercent : startPercent}%`,
        width: `${widthPercent}%`,
        top: contentTimelineRowPadding + (resolvedLaneIndex * (contentTimelineBarHeight + contentTimelineBarGap)),
      });

      return result;
    }, []);

  const rowMinHeight = bars.length === 0
    ? 48
    : Math.max(
      48,
      contentTimelineRowPadding * 2
      + (laneEndDates.length * contentTimelineBarHeight)
      + (Math.max(laneEndDates.length - 1, 0) * contentTimelineBarGap),
    );

  return {
    project,
    bars,
    rowMinHeight,
  };
}

export function GanttView({ onEditProjectGantt }: GanttViewProps) {
  const { formatDate, formatNumber, isRTL, locale, t } = useLocale();
  const calendarLocale = locale === 'he' ? heLocale : enUS;
  const [activeStatuses, setActiveStatuses] = useState<GanttTask['status'][]>([]);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [timelineOffsetWeeks, setTimelineOffsetWeeks] = useState(0);
  const [contentTimelineMode, setContentTimelineMode] = useState<'week' | 'month'>('week');
  const taskTableBodyRef = useRef<HTMLDivElement | null>(null);
  const taskTimelineBodyRef = useRef<HTMLDivElement | null>(null);
  const isSyncingTaskScrollRef = useRef(false);
  const { projects, setProjectGanttVisibility, updateProjectGantt } = useProjects();

  const visibleProjects = useMemo(
    () => projects.filter((project) => project.isVisibleInGantt),
    [projects],
  );

  const effectiveSelectedProjectId = selectedProjectId && visibleProjects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : visibleProjects[0]?.id ?? null;
  const selectedProject = visibleProjects.find((project) => project.id === effectiveSelectedProjectId) ?? null;
  const filteredTasks = useMemo(() => {
    if (!selectedProject) {
      return [];
    }

    if (activeStatuses.length === 0) {
      return selectedProject.gantt.tasks;
    }

    return selectedProject.gantt.tasks.filter((task) => activeStatuses.includes(task.status));
  }, [activeStatuses, selectedProject]);
  const previewTimelineDays = useMemo(
    () => getTimelineDays(selectedProject?.gantt.tasks ?? []),
    [selectedProject?.gantt.tasks],
  );
  const contentTimelineStart = useMemo(
    () => contentTimelineMode === 'month'
      ? addMonths(startOfMonth(new Date()), timelineOffsetWeeks)
      : addWeeks(startOfWeek(new Date(), { weekStartsOn: contentTimelineWeekStartsOn }), timelineOffsetWeeks),
    [contentTimelineMode, timelineOffsetWeeks],
  );
  const contentTimelinePeriods = useMemo(
    () => Array.from({ length: contentTimelinePeriodCount }, (_, index) => (
      contentTimelineMode === 'month'
        ? addMonths(contentTimelineStart, index)
        : addWeeks(contentTimelineStart, index)
    )),
    [contentTimelineMode, contentTimelineStart],
  );
  const contentTimelineEnd = useMemo(
    () => contentTimelineMode === 'month'
      ? endOfMonth(contentTimelinePeriods[contentTimelinePeriods.length - 1])
      : endOfWeek(contentTimelinePeriods[contentTimelinePeriods.length - 1], { weekStartsOn: contentTimelineWeekStartsOn }),
    [contentTimelineMode, contentTimelinePeriods],
  );
  const currentTimelinePeriodIndex = useMemo(() => {
    const index = contentTimelineMode === 'month'
      ? differenceInCalendarMonths(startOfMonth(new Date()), contentTimelineStart)
      : differenceInCalendarWeeks(startOfWeek(new Date(), { weekStartsOn: contentTimelineWeekStartsOn }), contentTimelineStart, { weekStartsOn: contentTimelineWeekStartsOn });
    return index >= 0 && index < contentTimelinePeriodCount ? index : -1;
  }, [contentTimelineMode, contentTimelineStart]);
  const contentTimelineRows = useMemo(
    () => visibleProjects.map((project) => buildContentTimelineRow(
      project,
      contentTimelineStart,
      contentTimelineEnd,
      (date) => formatDate(date, { month: 'short', day: 'numeric' }),
      t('manager.unassigned'),
      isRTL,
    )),
    [contentTimelineEnd, contentTimelineStart, formatDate, isRTL, t, visibleProjects],
  );
  const timelineStart = previewTimelineDays[0] ?? new Date();
  const dayWidth = 30;
  const previewZoom: GanttZoom = selectedProject?.gantt.zoom ?? 'day';
  const previewBaseDayWidth = previewZoom === 'quarter'
    ? 3
    : previewZoom === 'month'
      ? 8
      : previewZoom === 'week'
        ? 18
        : dayWidth;
  const previewTimelineWeeks = useMemo(() => buildTimelineWeeks(previewTimelineDays), [previewTimelineDays]);
  const previewTimelineMonths = useMemo(() => buildTimelineMonths(previewTimelineDays), [previewTimelineDays]);
  const previewTimelineQuarters = useMemo(() => buildTimelineQuarters(previewTimelineDays), [previewTimelineDays]);
  const previewTimelineWidth = Math.max(previewTimelineDays.length * previewBaseDayWidth, 640);
  const timelineCellWidth = previewTimelineDays.length > 0 ? previewTimelineWidth / previewTimelineDays.length : previewBaseDayWidth;
  const previewTimelineSegments = useMemo(() => {
    if (previewZoom === 'quarter') {
      return previewTimelineQuarters.map((days) => ({ key: `quarter-${days[0].toISOString()}`, days }));
    }

    if (previewZoom === 'month') {
      return previewTimelineMonths.map((days) => ({ key: `month-${days[0].toISOString()}`, days }));
    }

    if (previewZoom === 'week') {
      return previewTimelineWeeks.map((days) => ({ key: `week-${days[0].toISOString()}`, days }));
    }

    return previewTimelineDays.map((day) => ({ key: `day-${day.toISOString()}`, days: [day] }));
  }, [previewTimelineDays, previewTimelineMonths, previewTimelineQuarters, previewTimelineWeeks, previewZoom]);
  const previewTimelineGridColumns = previewZoom === 'day'
    ? `repeat(${previewTimelineDays.length}, minmax(${previewBaseDayWidth}px, 1fr))`
    : previewTimelineSegments
      .map((segment) => `minmax(${segment.days.length * previewBaseDayWidth}px, ${segment.days.length}fr)`)
      .join(' ');
  const formatTimelineDayLabel = (value: Date) => format(value, 'EEEEE', { locale: calendarLocale });
  const formatWeekLabel = (value: Date) => {
    const weekNumber = Number.parseInt(format(value, 'w'), 10);
    return `${t('editor.weekShort')} ${formatNumber(Number.isFinite(weekNumber) ? weekNumber : 0)}`;
  };
  const previewTimelineHeaderCells = previewTimelineSegments.map((segment) => {
    const segmentStart = segment.days[0];

    if (previewZoom === 'quarter') {
      return {
        key: segment.key,
        caption: String(segmentStart.getFullYear()),
        label: `${t('ganttEditor.quarterShort')}${formatNumber(getQuarterNumber(segmentStart))}`,
      };
    }

    if (previewZoom === 'month') {
      return {
        key: segment.key,
        caption: String(segmentStart.getFullYear()),
        label: formatDate(segmentStart, { month: 'short' }),
      };
    }

    if (previewZoom === 'week') {
      return {
        key: segment.key,
        caption: formatWeekLabel(segmentStart),
        label: formatDate(segmentStart, { month: 'short', day: 'numeric' }),
      };
    }

    return {
      key: segment.key,
      caption: formatTimelineDayLabel(segmentStart),
      label: formatNumber(segmentStart.getDate()),
    };
  });
  const getPreviewTaskTimelineLayout = (task: GanttTask) => {
    const offsetDays = getTaskOffsetDays(task, timelineStart);
    const spanDays = getTaskCalendarSpanDays(task);
    const width = task.milestone ? 18 : Math.max((spanDays * timelineCellWidth) - 8, 24);
    const left = task.milestone
      ? isRTL
        ? previewTimelineWidth - ((offsetDays * timelineCellWidth) + (timelineCellWidth / 2)) - 9
        : (offsetDays * timelineCellWidth) + (timelineCellWidth / 2) - 9
      : isRTL
        ? previewTimelineWidth - ((offsetDays + spanDays) * timelineCellWidth) + 4
        : (offsetDays * timelineCellWidth) + 4;

    return { left, width };
  };

  const toggleStatusFilter = (status: GanttTask['status']) => {
    setActiveStatuses((current) => (
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status]
    ));
  };

  const handleOpenEditor = (projectId: string) => {
    setShowManageModal(false);
    onEditProjectGantt(projectId);
  };

  const syncTaskScroll = (source: 'table' | 'timeline') => {
    if (isSyncingTaskScrollRef.current) {
      return;
    }

    const sourceElement = source === 'table' ? taskTableBodyRef.current : taskTimelineBodyRef.current;
    const targetElement = source === 'table' ? taskTimelineBodyRef.current : taskTableBodyRef.current;
    if (!sourceElement || !targetElement) {
      return;
    }

    isSyncingTaskScrollRef.current = true;
    targetElement.scrollTop = sourceElement.scrollTop;
    window.requestAnimationFrame(() => {
      isSyncingTaskScrollRef.current = false;
    });
  };

  const handleTaskStatusChange = (taskId: string, status: GanttTask['status']) => {
    if (!selectedProject) {
      return;
    }

    const existingTask = selectedProject.gantt.tasks.find((task) => task.id === taskId);
    if (!existingTask) {
      return;
    }

    let nextTask: GanttTask = {
      ...existingTask,
      status,
      progress: status === 'completed' ? 100 : status === 'pending' || status === 'delayed' ? 0 : existingTask.progress || 50,
    };

    if (status === 'delayed') {
      const deadline = window.prompt(t('ganttEditor.delayedDeadlinePrompt'), existingTask.endDate);
      if (!deadline) {
        return;
      }
      nextTask = updateTaskDeadline(nextTask, deadline);
    }

    const tasks = selectedProject.gantt.tasks.map((task) => task.id === taskId ? nextTask : task);
    void updateProjectGantt(selectedProject.id, {
      ...selectedProject.gantt,
      tasks: applyDependencyScheduling(tasks, taskId),
      lastEditedAt: new Date().toISOString(),
    });
  };

  const getStatusLabel = (status: GanttTask['status']) => {
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

  const formatRangeLabel = (startDate: Date, endDate: Date) => {
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

    if (sameMonth) {
      return `${formatDate(startDate, { month: 'short', day: 'numeric' })} - ${formatDate(endDate, { day: 'numeric', year: 'numeric' })}`;
    }

    if (sameYear) {
      return `${formatDate(startDate, { month: 'short', day: 'numeric' })} - ${formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    return `${formatDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })} - ${formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  return (
    <div className="space-y-6">
      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="sm:max-w-3xl bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">{t('manager.manageGantts')}</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              {t('manager.manageGanttsDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[480px] overflow-y-auto rounded-2xl border border-[var(--border-subtle)]">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-secondary)]">{t('manager.noProjectsAvailable')}</div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group flex items-start justify-between gap-4 p-4 transition-colors hover:bg-[var(--bg-card-hover)]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">{project.title}</h4>
                        <span className="rounded-full bg-[var(--bg-pill)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]">
                          {project.department}
                        </span>
                        <span className="rounded-full bg-[var(--primary-accent)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-accent)]">
                          {t('manager.tasksCount', { count: formatNumber(project.gantt.tasks.length) })}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs sm:text-sm text-[var(--text-secondary)]" dir="auto">
                        {project.description || t('manager.noDescription')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => void setProjectGanttVisibility(project.id, !project.isVisibleInGantt)}
                        className={`rounded-xl p-2 transition-colors ${
                          project.isVisibleInGantt
                            ? 'text-[var(--primary-accent)] hover:bg-[var(--primary-accent)]/10'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]'
                        }`}
                        title={project.isVisibleInGantt ? t('manager.hideFromOverview') : t('manager.showOnOverview')}
                      >
                        <HugeiconsIcon icon={project.isVisibleInGantt ? ViewOffIcon : ViewIcon} className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditor(project.id)}
                        className="rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]"
                        title={t('manager.editSchedule')}
                      >
                        <HugeiconsIcon icon={Edit02Icon} className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('manager.ganttProjects')}</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('manager.ganttProjectsDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManageModal(true)}
          className="btn-secondary text-xs sm:text-sm py-2 px-5"
        >
          {t('manager.manageGantts')}
        </button>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <div className="mx-auto inline-flex rounded-full bg-[var(--primary-accent)]/15 p-4 text-[var(--primary-accent)]">
            <HugeiconsIcon icon={Calendar01Icon} className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-[var(--text-primary)]">{t('manager.noVisibleGanttProjects')}</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {t('manager.noVisibleGanttProjectsDescription')}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {visibleProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`rounded-full border px-4 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                  project.id === effectiveSelectedProjectId
                    ? 'border-[var(--primary-accent)] bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)]'
                }`}
                dir="auto"
              >
                {project.title}
              </button>
            ))}
          </div>

          {selectedProject ? (
            <div className="space-y-5">
              {/* <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
                <div className="rounded-3xl border border-[#E5E5E5] bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D93A3A]">Selected Project</p>
                      <h3 className="mt-2 text-2xl font-bold text-[#171717]">{selectedProject.title}</h3>
                      <p className="mt-2 text-sm text-[#737373]">{selectedProject.description || 'No description yet.'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenEditor(selectedProject.id)}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      <HugeiconsIcon icon={Edit02Icon} className="h-4 w-4" />
                      Edit Schedule
                    </button>
                  </div>
                </div>
                <div className="rounded-3xl border border-[#E5E5E5] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#737373]">Tasks</p>
                  <p className="mt-3 text-3xl font-semibold text-[#171717]">{selectedProject.gantt.tasks.length}</p>
                  <p className="mt-2 text-sm text-[#737373]">Saved in this project schedule.</p>
                </div>
                <div className="rounded-3xl border border-[#E5E5E5] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#737373]">Resources</p>
                  <p className="mt-3 text-3xl font-semibold text-[#171717]">{selectedProject.gantt.resources.length}</p>
                  <p className="mt-2 text-sm text-[#737373]">Assignable people in the editor.</p>
                </div>
                <div className="rounded-3xl border border-[#E5E5E5] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#737373]">Progress</p>
                  <p className="mt-3 text-3xl font-semibold text-[#171717]">{selectedProjectProgress}%</p>
                  <p className="mt-2 text-sm text-[#737373]">
                    {selectedProject.gantt.lastEditedAt
                      ? `Updated ${format(parseISO(selectedProject.gantt.lastEditedAt), 'MMM d, yyyy')}`
                      : 'No saved schedule yet'}
                  </p>
                </div>
              </div> */}
              {/* Content Timeline */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('manager.contentTimeline')}</h2>
                  <p className="text-sm text-[var(--text-secondary)]">{t('manager.publishingSchedule')}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1">
                    {(['week', 'month'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setContentTimelineMode(mode);
                          setTimelineOffsetWeeks(0);
                        }}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                          contentTimelineMode === mode ? 'bg-[var(--primary-accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)]'
                        }`}
                      >
                        {mode === 'week' ? t('ganttEditor.weekly') : t('ganttEditor.monthly')}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTimelineOffsetWeeks((current) => current - 1)}
                    className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] rounded-xl transition-colors"
                  >
                    <HugeiconsIcon icon={isRTL ? ArrowRight01Icon : ArrowLeft01Icon} className="h-5 w-5" />
                  </button>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl">
                    <HugeiconsIcon icon={Calendar03Icon} className="h-4 w-4 text-[var(--primary-accent)]" />
                    <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">{formatRangeLabel(contentTimelineStart, contentTimelineEnd)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTimelineOffsetWeeks((current) => current + 1)}
                    className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] rounded-xl transition-colors"
                  >
                    <HugeiconsIcon icon={isRTL ? ArrowLeft01Icon : ArrowRight01Icon} className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Gantt Chart */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
                {/* Timeline header */}
                <div className="grid grid-cols-[180px_1fr] border-b border-[var(--border-subtle)] bg-[var(--bg-card-alt)]">
                  <div className="p-4 border-r border-[var(--border-subtle)]">
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('manager.projects')}</span>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${contentTimelinePeriods.length}, minmax(0, 1fr))` }}>
                    {contentTimelinePeriods.map((periodStart, i) => (
                      <div
                        key={periodStart.toISOString()}
                        className={`p-4 text-center border-r border-[var(--border-subtle)] last:border-r-0 ${
                          i === currentTimelinePeriodIndex ? 'bg-[var(--primary-accent)]/10' : ''
                        }`}
                      >
                        <span className={`text-sm ${i === currentTimelinePeriodIndex ? 'text-[var(--primary-accent)] font-bold' : 'text-[var(--text-secondary)]'}`}>
                          {contentTimelineMode === 'month' ? formatDate(periodStart, { month: 'short', year: 'numeric' }) : formatDate(periodStart, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Project rows */}
                <div className="divide-y divide-[var(--border-subtle)]">
                  {contentTimelineRows.map(({ project, bars, rowMinHeight }) => (
                    <div key={project.id} className="grid grid-cols-[180px_1fr] hover:bg-[var(--bg-card-hover)] transition-colors">
                      {/* Project label */}
                      <div className="p-4 border-r border-[var(--border-subtle)] bg-[var(--bg-card-alt)]">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20" style={{ backgroundColor: getStatusColor(project.status) }} />
                          <span className="font-semibold text-sm text-[var(--text-primary)] truncate" dir="auto">{project.title}</span>
                        </div>
                      </div>

                      {/* Timeline grid */}
                      <div className="relative grid" style={{ minHeight: rowMinHeight, gridTemplateColumns: `repeat(${contentTimelinePeriods.length}, minmax(0, 1fr))` }}>
                        {contentTimelinePeriods.map((periodStart, i) => (
                          <div
                            key={periodStart.toISOString()}
                            className={`border-r border-[var(--border-subtle)] last:border-r-0 ${
                              i === currentTimelinePeriodIndex ? 'bg-[var(--primary-accent)]/10' : ''
                            }`}
                          />
                        ))}

                        {/* Tasks */}
                        <div className="absolute inset-0">
                          {bars.map((task) => (
                              <div
                                key={task.id}
                                className="absolute h-5 mx-1 rounded-full cursor-pointer group shadow-sm transition-transform hover:scale-[1.02]"
                                style={{
                                  left: task.left,
                                  width: task.width,
                                  top: `${task.top}px`,
                                }}
                              >
                                <div
                                  className={`h-full rounded-full ${getStatusBarClass(task.status)} opacity-90 group-hover:opacity-100 transition-opacity`}
                                />
                                <div className="absolute inset-0 flex items-center px-2">
                                  <span className="text-xs text-white font-medium truncate" dir="auto">
                                    {task.name}
                                  </span>
                                </div>

                                {/* Tooltip */}
                                <div className={cn('absolute bottom-full mb-2 hidden group-hover:block z-20', isRTL ? 'right-0' : 'left-0')}>
                                  <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl p-3 min-w-[180px]">
                                    <p className="font-bold text-sm text-[var(--text-primary)] mb-1" dir="auto">{task.name}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{t('manager.owner')}: {task.owner}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{t('manager.status')}: {getStatusLabel(task.status)}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{t('manager.dates')}: {task.startLabel} - {task.endLabel}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-green-500 shadow-sm" />
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{t('manager.completed')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 shadow-sm" />
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{t('manager.inProgress')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-neutral-400 shadow-sm" />
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{t('manager.pending')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[var(--primary-accent)] shadow-sm" />
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{t('manager.delayed')}</span>
                </div>
              </div>
              {selectedProject.gantt.tasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-14 text-center">
                  <h3 className="text-xl font-bold text-[var(--text-primary)]">{t('manager.thisProjectHasNoSchedule')}</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {t('manager.thisProjectHasNoScheduleDescription')}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(selectedProject.id)}
                    className="btn-hire-me mt-6 inline-flex items-center gap-2 !px-5 !py-2.5 text-xs sm:text-sm font-semibold"
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="h-4 w-4" />
                    {t('manager.createSchedule')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusOrder.map((status) => {
                      const isActive = activeStatuses.includes(status);
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => toggleStatusFilter(status)}
                          className={`rounded-full border px-3.5 py-1 text-xs sm:text-sm font-semibold transition-all ${
                            isActive
                              ? 'border-[var(--primary-accent)] bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--border-highlight)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {getStatusLabel(status)}
                        </button>
                      );
                    })}
                  </div>

                  {filteredTasks.length === 0 ? (
                    <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-10 text-center text-sm text-[var(--text-secondary)] shadow-[var(--shadow-card)]">
                      {t('manager.noTasksMatchFilters')}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
                      <div className="grid max-h-[620px] grid-cols-[320px_minmax(0,1fr)]">
                        <div className="border-r border-[var(--border-subtle)]">
                          <div className="sticky top-0 z-10 grid h-14 grid-cols-[52px_minmax(0,1fr)_112px] border-b border-[var(--border-subtle)] bg-[var(--bg-card-alt)] text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                            <div className="flex items-center justify-center border-r border-[var(--border-subtle)]">#</div>
                            <div className="flex items-center border-r border-[var(--border-subtle)] px-4">{t('manager.task')}</div>
                            <div className="flex items-center px-4">{t('manager.status')}</div>
                          </div>
                          <div ref={taskTableBodyRef} onScroll={() => syncTaskScroll('table')} className="max-h-[566px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden divide-y divide-[var(--border-subtle)]">
                          {filteredTasks.map((task) => {
                            const resource = selectedProject.gantt.resources.find((entry) => entry.id === task.resourceId);

                            return (
                              <div key={task.id} className="grid h-14 grid-cols-[52px_minmax(0,1fr)_112px] border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors">
                                <div className="flex items-center justify-center border-r border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-muted)]">
                                  {formatNumber(selectedProject.gantt.tasks.findIndex((entry) => entry.id === task.id) + 1)}
                                </div>
                                <div className="border-r border-[var(--border-subtle)] px-4 py-3">
                                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]" dir="auto">{task.name}</p>
                                  <p className="truncate text-xs text-[var(--text-muted)]">{resource?.name ?? t('manager.unassigned')}</p>
                                </div>
                                <div className="flex items-center px-3">
                                  <select
                                    value={task.status}
                                    onChange={(event) => handleTaskStatusChange(task.id, event.target.value as GanttTask['status'])}
                                    className={`w-full rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-accent)]`}
                                  >
                                    {statusOrder.map((status) => (
                                      <option key={status} value={status} className="bg-[var(--bg-card)] text-[var(--text-primary)]">{getStatusLabel(status)}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        </div>

                        <div className="overflow-x-auto" dir="ltr">
                          <div dir={isRTL ? 'rtl' : 'ltr'} style={{ width: previewTimelineWidth }}>
                            <div
                              className="sticky top-0 z-10 grid h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-card-alt)]"
                              style={{ gridTemplateColumns: previewTimelineGridColumns }}
                            >
                              {previewTimelineHeaderCells.map((cell) => (
                                <div key={cell.key} className="flex h-14 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden border-r border-[var(--border-subtle)] px-1 py-2 text-center text-xs last:border-r-0">
                                  <p className="max-w-full truncate whitespace-nowrap uppercase leading-none tracking-[0.12em] text-[var(--text-muted)]">{cell.caption}</p>
                                  <p className="max-w-full truncate whitespace-nowrap font-semibold leading-tight text-[var(--text-primary)]">{cell.label}</p>
                                </div>
                              ))}
                            </div>

                            <div ref={taskTimelineBodyRef} onScroll={() => syncTaskScroll('timeline')} className="max-h-[566px] overflow-y-auto divide-y divide-[var(--border-subtle)]">
                            {filteredTasks.map((task) => {
                              const resource = selectedProject.gantt.resources.find((entry) => entry.id === task.resourceId) ?? null;
                              const barColor = resource?.color ?? getStatusColor(task.status);
                              const { left, width } = getPreviewTaskTimelineLayout(task);

                              return (
                                <div key={task.id} className="relative h-14 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-card-hover)]/30 transition-colors">
                                  <div
                                    className="absolute inset-0 grid"
                                    style={{ gridTemplateColumns: previewTimelineGridColumns }}
                                  >
                                    {previewTimelineSegments.map((segment) => (
                                      <div key={`${task.id}-${segment.key}`} className="border-r border-[var(--border-subtle)]/60 last:border-r-0" />
                                    ))}
                                  </div>
                                  <div
                                    className={`absolute top-1/2 -translate-y-1/2 ${
                                      task.milestone ? '' : 'rounded-full shadow-sm'
                                    }`}
                                    style={{
                                      left,
                                      width,
                                      height: task.milestone ? 18 : 26,
                                      backgroundColor: task.milestone ? 'transparent' : barColor,
                                    }}
                                  >
                                    {task.milestone ? (
                                      <div
                                        className="h-[18px] w-[18px] rotate-45 rounded-[4px] border-2 border-[var(--bg-card)]"
                                        style={{ backgroundColor: barColor }}
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
