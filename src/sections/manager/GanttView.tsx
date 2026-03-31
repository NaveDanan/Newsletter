import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar01Icon, Edit02Icon, ViewIcon, ViewOffIcon, Calendar03Icon, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { addWeeks, differenceInCalendarDays, differenceInCalendarWeeks, endOfWeek, format, isAfter, parseISO, startOfWeek } from 'date-fns';
import { useMemo, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { useProjects } from '../../hooks/useProjects';
import { getTaskCalendarSpanDays, getTaskEnd, getTaskOffsetDays, getTimelineDays } from '../../lib/gantt';
import type { GanttTask } from '../../types/gantt';
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
const contentTimelineWeekCount = 6;
const contentTimelineWeekStartsOn = 0 as const;
const contentTimelineBarHeight = 20;
const contentTimelineBarGap = 4;
const contentTimelineRowPadding = 8;

function getStatusBadge(status: GanttTask['status']) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700';
    case 'in-progress':
      return 'bg-[#D93A3A]/10 text-[#D93A3A]';
    case 'pending':
      return 'bg-[#F3F4F6] text-[#737373]';
    case 'delayed':
      return 'bg-yellow-100 text-yellow-700';
  }
}

function getStatusBarColor(status: GanttTask['status']) {
  switch (status) {
    case 'completed':
      return '#16A34A';
    case 'in-progress':
      return '#D93A3A';
    case 'pending':
      return '#A3A3A3';
    case 'delayed':
      return '#EAB308';
  }
}

function getTimelineBarColor(status: GanttTask['status']) {
  switch (status) {
    case 'completed':
      return 'bg-green-600';
    case 'in-progress':
      return 'bg-[#D93A3A]';
    case 'pending':
      return 'bg-[#D4D4D4]';
    case 'delayed':
      return 'bg-yellow-500';
  }
}

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

function buildContentTimelineRow(
  project: Project,
  windowStart: Date,
  windowEnd: Date,
  formatLabel: (date: Date) => string,
  unassignedLabel: string,
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

      result.push({
        id: task.id,
        name: task.name,
        owner: task.resourceId ? resourceNameById.get(task.resourceId) ?? unassignedLabel : unassignedLabel,
        status: task.status,
        startLabel: formatLabel(taskStart),
        endLabel: formatLabel(taskEnd),
        left: `${(differenceInCalendarDays(clampedStart, windowStart) / totalWindowDays) * 100}%`,
        width: `${Math.max(((differenceInCalendarDays(clampedEnd, clampedStart) + 1) / totalWindowDays) * 100, 2)}%`,
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
  const { formatDate, formatNumber, isRTL, t } = useLocale();
  const [activeStatuses, setActiveStatuses] = useState<GanttTask['status'][]>([]);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [timelineOffsetWeeks, setTimelineOffsetWeeks] = useState(0);
  const { projects, setProjectGanttVisibility } = useProjects();

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
    () => addWeeks(startOfWeek(new Date(), { weekStartsOn: contentTimelineWeekStartsOn }), timelineOffsetWeeks),
    [timelineOffsetWeeks],
  );
  const contentTimelineWeeks = useMemo(
    () => Array.from({ length: contentTimelineWeekCount }, (_, index) => addWeeks(contentTimelineStart, index)),
    [contentTimelineStart],
  );
  const contentTimelineEnd = useMemo(
    () => endOfWeek(contentTimelineWeeks[contentTimelineWeeks.length - 1], { weekStartsOn: contentTimelineWeekStartsOn }),
    [contentTimelineWeeks],
  );
  const currentTimelineWeekIndex = useMemo(() => {
    const realCurrentWeekStart = startOfWeek(new Date(), { weekStartsOn: contentTimelineWeekStartsOn });
    const index = differenceInCalendarWeeks(realCurrentWeekStart, contentTimelineStart, { weekStartsOn: contentTimelineWeekStartsOn });
    return index >= 0 && index < contentTimelineWeekCount ? index : -1;
  }, [contentTimelineStart]);
  const contentTimelineRows = useMemo(
    () => visibleProjects.map((project) => buildContentTimelineRow(
      project,
      contentTimelineStart,
      contentTimelineEnd,
      (date) => formatDate(date, { month: 'short', day: 'numeric' }),
      t('manager.unassigned'),
    )),
    [contentTimelineEnd, contentTimelineStart, formatDate, t, visibleProjects],
  );
  const timelineStart = previewTimelineDays[0] ?? new Date();
  const dayWidth = 30;
  const timelineWidth = Math.max(previewTimelineDays.length * dayWidth, 640);

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
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('manager.manageGantts')}</DialogTitle>
            <DialogDescription>
              {t('manager.manageGanttsDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[480px] overflow-y-auto rounded-2xl border border-[#E5E5E5]">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#737373]">{t('manager.noProjectsAvailable')}</div>
            ) : (
              <div className="divide-y divide-[#E5E5E5]">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group flex items-start justify-between gap-4 p-4 transition-colors hover:bg-[#F9FAFB]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium text-[#171717]">{project.title}</h4>
                        <span className="rounded-full bg-[#F3F4F6] px-2 py-1 text-xs text-[#737373]">
                          {project.department}
                        </span>
                        <span className="rounded-full bg-[#FEF2F2] px-2 py-1 text-xs text-[#D93A3A]">
                          {t('manager.tasksCount', { count: formatNumber(project.gantt.tasks.length) })}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-[#737373]" dir="auto">
                        {project.description || t('manager.noDescription')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => void setProjectGanttVisibility(project.id, !project.isVisibleInGantt)}
                        className={`rounded-lg p-2 transition-colors ${
                          project.isVisibleInGantt
                            ? 'text-[#D93A3A] hover:bg-[#D93A3A]/10'
                            : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
                        }`}
                        title={project.isVisibleInGantt ? t('manager.hideFromOverview') : t('manager.showOnOverview')}
                      >
                        <HugeiconsIcon icon={project.isVisibleInGantt ? ViewOffIcon : ViewIcon} className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditor(project.id)}
                        className="rounded-lg p-2 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
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
          <h2 className="text-lg font-bold text-[#171717]">{t('manager.ganttProjects')}</h2>
          <p className="text-sm text-[#737373]">
            {t('manager.ganttProjectsDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManageModal(true)}
          className="btn-secondary"
        >
          {t('manager.manageGantts')}
        </button>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#D4D4D8] bg-white px-6 py-14 text-center">
          <div className="mx-auto inline-flex rounded-full bg-[#FEF2F2] p-4 text-[#D93A3A]">
            <HugeiconsIcon icon={Calendar01Icon} className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-[#171717]">{t('manager.noVisibleGanttProjects')}</h3>
          <p className="mt-2 text-sm text-[#737373]">
            {t('manager.noVisibleGanttProjectsDescription')}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {visibleProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  project.id === effectiveSelectedProjectId
                    ? 'border-[#D93A3A] bg-[#FEF2F2] text-[#D93A3A]'
                    : 'border-[#E5E5E5] bg-white text-[#525252] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]'
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#171717]">{t('manager.contentTimeline')}</h2>
                  <p className="text-sm text-[#737373]">{t('manager.publishingSchedule')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => setTimelineOffsetWeeks((current) => current - 1)}
                    className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                  >
                    <HugeiconsIcon icon={isRTL ? ArrowRight01Icon : ArrowLeft01Icon} className="h-5 w-5" />
                  </button>
                  <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E5E5] rounded-lg">
                    <HugeiconsIcon icon={Calendar03Icon} className="h-4 w-4 text-[#D93A3A]" />
                    <span className="text-sm text-[#171717]">{formatRangeLabel(contentTimelineStart, contentTimelineEnd)}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setTimelineOffsetWeeks((current) => current + 1)}
                    className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                  >
                    <HugeiconsIcon icon={isRTL ? ArrowLeft01Icon : ArrowRight01Icon} className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Gantt Chart */}
              <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
                {/* Timeline header */}
                <div className="grid grid-cols-[180px_1fr] border-b border-[#E5E5E5]">
                  <div className="p-4 border-r border-[#E5E5E5]">
                    <span className="text-xs font-medium text-[#737373] uppercase tracking-wider">{t('manager.projects')}</span>
                  </div>
                  <div className="grid grid-cols-6">
                    {contentTimelineWeeks.map((weekStart, i) => (
                      <div 
                        key={weekStart.toISOString()} 
                        className={`p-4 text-center border-r border-[#E5E5E5] last:border-r-0 ${
                          i === currentTimelineWeekIndex ? 'bg-[#D93A3A]/5' : ''
                        }`}
                      >
                        <span className={`text-sm ${i === currentTimelineWeekIndex ? 'text-[#D93A3A] font-medium' : 'text-[#737373]'}`}>
                          {formatDate(weekStart, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Project rows */}
                <div className="divide-y divide-[#E5E5E5]">
                  {contentTimelineRows.map(({ project, bars, rowMinHeight }) => (
                    <div key={project.id} className="grid grid-cols-[180px_1fr]">
                      {/* Project label */}
                      <div className="p-4 border-r border-[#E5E5E5] bg-[#F9FAFB]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusBarColor(project.status) }} />
                          <span className="font-medium text-[#171717] truncate" dir="auto">{project.title}</span>
                        </div>
                      </div>

                      {/* Timeline grid */}
                      <div className="relative grid grid-cols-6" style={{ minHeight: rowMinHeight }}>
                        {contentTimelineWeeks.map((weekStart, i) => (
                          <div 
                            key={weekStart.toISOString()} 
                            className={`border-r border-[#E5E5E5] last:border-r-0 ${
                              i === currentTimelineWeekIndex ? 'bg-[#D93A3A]/5' : ''
                            }`}
                          />
                        ))}

                        {/* Tasks */}
                        <div className="absolute inset-0">
                          {bars.map((task) => (
                              <div
                                key={task.id}
                                className="absolute h-5 mx-1 rounded cursor-pointer group"
                                style={{
                                  left: task.left,
                                  width: task.width,
                                  top: `${task.top}px`,
                                }}
                              >
                                <div 
                                  className={`h-full rounded ${getTimelineBarColor(task.status)} opacity-80 group-hover:opacity-100 transition-opacity`}
                                />
                                <div className="absolute inset-0 flex items-center px-2">
                                  <span className="text-xs text-white font-medium truncate" dir="auto">
                                    {task.name}
                                  </span>
                                </div>

                                {/* Tooltip */}
                                <div className={cn('absolute bottom-full mb-2 hidden group-hover:block z-10', isRTL ? 'right-0' : 'left-0')}>
                                  <div className="bg-white border border-[#E5E5E5] rounded-lg shadow-lg p-3 min-w-[180px]">
                                    <p className="font-medium text-[#171717] mb-1" dir="auto">{task.name}</p>
                                    <p className="text-xs text-[#737373]">{t('manager.owner')}: {task.owner}</p>
                                    <p className="text-xs text-[#737373]">{t('manager.status')}: {getStatusLabel(task.status)}</p>
                                    <p className="text-xs text-[#737373]">{t('manager.dates')}: {task.startLabel} - {task.endLabel}</p>
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
                  <div className="w-4 h-4 rounded bg-green-600" />
                  <span className="text-sm text-[#737373]">{t('manager.completed')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[#D93A3A]" />
                  <span className="text-sm text-[#737373]">{t('manager.inProgress')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[#D4D4D4]" />
                  <span className="text-sm text-[#737373]">{t('manager.pending')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500" />
                  <span className="text-sm text-[#737373]">{t('manager.delayed')}</span>
                </div>
              </div>
              {selectedProject.gantt.tasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#D4D4D8] bg-white px-6 py-14 text-center">
                  <h3 className="text-xl font-semibold text-[#171717]">{t('manager.thisProjectHasNoSchedule')}</h3>
                  <p className="mt-2 text-sm text-[#737373]">
                    {t('manager.thisProjectHasNoScheduleDescription')}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(selectedProject.id)}
                    className="btn-primary mt-6 inline-flex items-center gap-2"
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
                          className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-[#D93A3A] bg-[#FEF2F2] text-[#D93A3A]'
                              : 'border-[#E5E5E5] bg-white text-[#525252] hover:border-[#D4D4D4]'
                          }`}
                        >
                          {getStatusLabel(status)}
                        </button>
                      );
                    })}
                  </div>

                  {filteredTasks.length === 0 ? (
                    <div className="rounded-3xl border border-[#E5E5E5] bg-white px-6 py-10 text-center text-sm text-[#737373]">
                      {t('manager.noTasksMatchFilters')}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-3xl border border-[#E5E5E5] bg-white">
                      <div className="grid grid-cols-[320px_minmax(0,1fr)]">
                        <div className="border-r border-[#E5E5E5]">
                          <div className="grid h-14 grid-cols-[52px_minmax(0,1fr)_92px] border-b border-[#E5E5E5] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.18em] text-[#737373]">
                            <div className="flex items-center justify-center border-r border-[#E5E5E5]">#</div>
                            <div className="flex items-center border-r border-[#E5E5E5] px-4">{t('manager.task')}</div>
                            <div className="flex items-center px-4">{t('manager.status')}</div>
                          </div>
                          {filteredTasks.map((task) => {
                            const resource = selectedProject.gantt.resources.find((entry) => entry.id === task.resourceId);

                            return (
                              <div key={task.id} className="grid h-14 grid-cols-[52px_minmax(0,1fr)_92px] border-b border-[#E5E5E5] last:border-b-0">
                                <div className="flex items-center justify-center border-r border-[#E5E5E5] text-xs font-semibold text-[#525252]">
                                  {formatNumber(selectedProject.gantt.tasks.findIndex((entry) => entry.id === task.id) + 1)}
                                </div>
                                <div className="border-r border-[#E5E5E5] px-4 py-3">
                                  <p className="truncate text-sm font-medium text-[#171717]" dir="auto">{task.name}</p>
                                  <p className="truncate text-xs text-[#737373]">{resource?.name ?? t('manager.unassigned')}</p>
                                </div>
                                <div className="flex items-center px-3">
                                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${getStatusBadge(task.status)}`}>
                                    {getStatusLabel(task.status)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="overflow-x-auto">
                          <div style={{ width: timelineWidth }}>
                            <div
                              className="grid h-14 border-b border-[#E5E5E5] bg-[#F8FAFC]"
                              style={{ gridTemplateColumns: `repeat(${previewTimelineDays.length}, minmax(${dayWidth}px, 1fr))` }}
                            >
                              {previewTimelineDays.map((day) => (
                                <div key={day.toISOString()} className="border-r border-[#E5E5E5] px-1 py-2 text-center text-xs last:border-r-0">
                                  <p className="uppercase tracking-[0.18em] text-[#A3A3A3]">{format(day, 'EEE')}</p>
                                  <p className="mt-1 font-medium text-[#171717]">{format(day, 'd')}</p>
                                </div>
                              ))}
                            </div>

                            {filteredTasks.map((task) => {
                              const resource = selectedProject.gantt.resources.find((entry) => entry.id === task.resourceId) ?? null;
                              const barColor = resource?.color ?? getStatusBarColor(task.status);
                              const left = getTaskOffsetDays(task, timelineStart) * dayWidth + 4;
                              const width = task.milestone ? 18 : Math.max((getTaskCalendarSpanDays(task) * dayWidth) - 8, 24);

                              return (
                                <div key={task.id} className="relative h-14 border-b border-[#E5E5E5] last:border-b-0">
                                  <div
                                    className="absolute inset-0 grid"
                                    style={{ gridTemplateColumns: `repeat(${previewTimelineDays.length}, minmax(${dayWidth}px, 1fr))` }}
                                  >
                                    {previewTimelineDays.map((day) => (
                                      <div key={`${task.id}-${day.toISOString()}`} className="border-r border-[#F1F5F9] last:border-r-0" />
                                    ))}
                                  </div>
                                  <div
                                    className={`absolute top-1/2 -translate-y-1/2 ${
                                      task.milestone ? '' : 'rounded-full'
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
                                        className="h-[18px] w-[18px] rotate-45 rounded-[4px] border-2 border-white"
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
