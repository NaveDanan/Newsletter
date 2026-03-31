import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar01Icon,
  ClipboardPasteIcon,
  Copy01Icon,
  Delete02Icon,
  ListIndentDecreaseIcon,
  ListIndentIncreaseIcon,
  PlusSignIcon,
  ResourcesAddIcon,
  ScissorIcon,
  Settings02Icon,
  TaskDone01Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import { faDollarSign, faEuroSign, faPoundSign, faShekelSign } from '@fortawesome/free-solid-svg-icons';
import { addDays, compareAsc, format, parseISO, startOfMonth } from 'date-fns';
import { enUS, he as heLocale } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/useProjects';
import { useLocale } from '@/contexts/LocaleContext';
import {
  alignTaskDates,
  applyDependencyScheduling,
  createDefaultResource,
  createDefaultRole,
  createDefaultTask,
  createTaskId,
  getProjectProgress,
  getResourceSummary,
  getTaskCalendarSpanDays,
  getTaskEnd,
  getTaskOffsetDays,
  getTaskProgress,
  getTimelineDays,
  hasDependencyCycle,
  isRestDay,
  normalizeProjectGantt,
} from '@/lib/gantt';
import type { GanttCurrency, GanttRole, GanttRoleBillingPeriod, GanttTask, ProjectGantt } from '@/types/gantt';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface GanttEditorPageProps {
  projectId: string;
  onBack: () => void;
}

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface DragState {
  taskId: string;
  mode: DragMode;
  startX: number;
  originalTask: GanttTask;
  baseTasks: GanttTask[];
  lastDeltaDays: number;
}

interface TaskClipboard {
  task: GanttTask;
  mode: 'copy' | 'cut';
}

interface TaskGridResizeState {
  startX: number;
  startWidth: number;
}

type TaskInsertMode = 'task' | 'subtask';
type TaskDropPosition = 'before' | 'after' | 'inside' | 'root';

interface TaskHierarchyItem {
  hasChildren: boolean;
  label: string;
}

interface TaskDropTarget {
  position: TaskDropPosition;
  taskId: string | null;
}

function sameDayValue(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildPredecessorDrafts(tasks: GanttTask[]) {
  return Object.fromEntries(
    tasks.map((task) => [
      task.id,
      task.predecessorIds
        .map((predecessorId) => tasks.findIndex((candidate) => candidate.id === predecessorId) + 1)
        .filter((rowNumber) => rowNumber > 0)
        .join(', '),
    ]),
  );
}

function buildTaskHierarchy(tasks: GanttTask[]) {
  const counters: number[] = [];
  const hierarchy = new Map<string, TaskHierarchyItem>();

  tasks.forEach((task, index) => {
    counters[task.indentLevel] = (counters[task.indentLevel] ?? 0) + 1;
    counters.length = task.indentLevel + 1;

    hierarchy.set(task.id, {
      label: counters.slice(0, task.indentLevel + 1).join('.'),
      hasChildren: (tasks[index + 1]?.indentLevel ?? -1) > task.indentLevel,
    });
  });

  return hierarchy;
}

function buildVisibleTasks(tasks: GanttTask[], collapsedTaskIds: Set<string>) {
  const visibleTasks: GanttTask[] = [];
  const hiddenLevels: number[] = [];

  tasks.forEach((task) => {
    while (hiddenLevels.length > 0 && task.indentLevel <= hiddenLevels[hiddenLevels.length - 1]) {
      hiddenLevels.pop();
    }

    const isHidden = hiddenLevels.length > 0;
    if (!isHidden) {
      visibleTasks.push(task);
    }

    if (!isHidden && collapsedTaskIds.has(task.id)) {
      hiddenLevels.push(task.indentLevel);
    }
  });

  return visibleTasks;
}

function getDescendantTaskIds(tasks: GanttTask[], parentTaskId: string) {
  const parentIndex = tasks.findIndex((task) => task.id === parentTaskId);
  if (parentIndex < 0) {
    return [];
  }

  const parentIndentLevel = tasks[parentIndex].indentLevel;
  const descendantTaskIds: string[] = [];

  for (let index = parentIndex + 1; index < tasks.length; index += 1) {
    const candidate = tasks[index];
    if (candidate.indentLevel <= parentIndentLevel) {
      break;
    }

    descendantTaskIds.push(candidate.id);
  }

  return descendantTaskIds;
}

function getTaskSubtreeEndIndex(tasks: GanttTask[], startIndex: number) {
  const sourceTask = tasks[startIndex];
  if (!sourceTask) {
    return startIndex;
  }

  let endIndex = startIndex + 1;
  while (endIndex < tasks.length && tasks[endIndex].indentLevel > sourceTask.indentLevel) {
    endIndex += 1;
  }

  return endIndex;
}

function moveTaskSubtree(tasks: GanttTask[], taskId: string, dropTarget: TaskDropTarget) {
  const sourceIndex = tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex < 0) {
    return null;
  }

  const sourceEndIndex = getTaskSubtreeEndIndex(tasks, sourceIndex);
  const movedTasks = tasks.slice(sourceIndex, sourceEndIndex);
  const movedTaskIds = new Set(movedTasks.map((task) => task.id));

  if (dropTarget.taskId && movedTaskIds.has(dropTarget.taskId)) {
    return null;
  }

  const remainingTasks = tasks.filter((task) => !movedTaskIds.has(task.id));
  let insertAt = remainingTasks.length;
  let targetIndentLevel = 0;

  if (dropTarget.position !== 'root') {
    const targetIndex = remainingTasks.findIndex((task) => task.id === dropTarget.taskId);
    if (targetIndex < 0) {
      return null;
    }

    const targetTask = remainingTasks[targetIndex];
    if (dropTarget.position === 'before') {
      insertAt = targetIndex;
      targetIndentLevel = targetTask.indentLevel;
    }

    if (dropTarget.position === 'after') {
      insertAt = getTaskSubtreeEndIndex(remainingTasks, targetIndex);
      targetIndentLevel = targetTask.indentLevel;
    }

    if (dropTarget.position === 'inside') {
      insertAt = getTaskSubtreeEndIndex(remainingTasks, targetIndex);
      targetIndentLevel = targetTask.indentLevel + 1;
    }
  }

  const indentDelta = targetIndentLevel - movedTasks[0].indentLevel;
  const nextTasks = [...remainingTasks];
  nextTasks.splice(
    insertAt,
    0,
    ...movedTasks.map((task) => ({
      ...task,
      indentLevel: Math.max(0, task.indentLevel + indentDelta),
    })),
  );

  return nextTasks;
}

const roleBillingOptions: GanttRoleBillingPeriod[] = ['hourly', 'daily', 'weekly', 'monthly', 'yearly', 'one-time'];
const currencyOptions: GanttCurrency[] = ['ILS', 'USD', 'EUR', 'GBP'];
const timelineHeaderHeight = 56;
const taskMainRowHeight = 56;
const taskDetailRowHeight = 84;
const taskBubbleWidth = 248;
const taskBubbleHeight = 164;
const minimumVisibleRows = 10;
const defaultTaskGridWidth = 556;
const minTaskGridWidth = 380;
const maxTaskGridWidth = 920;
const taskGridColumns = '56px minmax(136px, 1fr) 132px 84px 148px';
const taskDetailColumns = 'minmax(0, 1.05fr) minmax(0, 1.15fr) 108px 112px 48px';

const currencyIcons = {
  ILS: faShekelSign,
  USD: faDollarSign,
  EUR: faEuroSign,
  GBP: faPoundSign,
} satisfies Record<GanttCurrency, typeof faDollarSign>;

function CurrencyIcon({ currency }: { currency: GanttCurrency }) {
  const definition = currencyIcons[currency] as {
    icon: [number, number, unknown, unknown, string | string[]];
  };
  const [width, height, , , svgPathData] = definition.icon;
  const paths = Array.isArray(svgPathData) ? svgPathData : [svgPathData];

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      className="h-3.5 w-3.5 fill-current"
      focusable="false"
    >
      {paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

export function GanttEditorPage({ projectId, onBack }: GanttEditorPageProps) {
  const { formatDate, formatNumber, isRTL, locale, t } = useLocale();
  const { projects, updateProjectGantt } = useProjects();
  const project = projects.find((entry) => entry.id === projectId) ?? null;
  const calendarLocale = locale === 'he' ? heLocale : enUS;
  const backIcon = isRTL ? ArrowRight01Icon : ArrowLeft01Icon;
  const formatBillingLabel = useCallback((value: GanttRoleBillingPeriod) => {
    switch (value) {
      case 'hourly':
        return t('ganttEditor.billing.hourly');
      case 'daily':
        return t('ganttEditor.billing.daily');
      case 'weekly':
        return t('ganttEditor.billing.weekly');
      case 'monthly':
        return t('ganttEditor.billing.monthly');
      case 'yearly':
        return t('ganttEditor.billing.yearly');
      default:
        return t('ganttEditor.billing.oneTime');
    }
  }, [t]);
  const formatStatusLabel = useCallback((value: GanttTask['status']) => {
    switch (value) {
      case 'pending':
        return t('manager.pending');
      case 'in-progress':
        return t('manager.inProgress');
      case 'completed':
        return t('manager.completed');
      case 'delayed':
        return t('manager.delayed');
      default:
        return value;
    }
  }, [t]);
  const formatWeekLabel = useCallback((value: Date) => {
    const weekNumber = Number.parseInt(format(value, 'w'), 10);
    return `${t('editor.weekShort')} ${formatNumber(Number.isFinite(weekNumber) ? weekNumber : 0)}`;
  }, [formatNumber, t]);
  const initialGantt = normalizeProjectGantt(project?.gantt);
  const [draftGantt, setDraftGantt] = useState<ProjectGantt>(initialGantt);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialGantt));
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [timelineSelectedTaskId, setTimelineSelectedTaskId] = useState<string | null>(null);
  const [managedTaskId, setManagedTaskId] = useState<string | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [taskGridWidth, setTaskGridWidth] = useState(defaultTaskGridWidth);
  const [isTaskGridCollapsed, setIsTaskGridCollapsed] = useState(false);
  const [taskGridResizeState, setTaskGridResizeState] = useState<TaskGridResizeState | null>(null);
  const [taskClipboard, setTaskClipboard] = useState<TaskClipboard | null>(null);
  const [predecessorDrafts, setPredecessorDrafts] = useState<Record<string, string>>(() => buildPredecessorDrafts(initialGantt.tasks));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [taskDropTarget, setTaskDropTarget] = useState<TaskDropTarget | null>(null);
  const [showResourcesDialog, setShowResourcesDialog] = useState(false);
  const [showRolesDialog, setShowRolesDialog] = useState(false);
  const [isTimelineCalendarOpen, setIsTimelineCalendarOpen] = useState(false);
  const [showTimelineYears, setShowTimelineYears] = useState(false);
  const suppressNextGridDismissRef = useRef(false);
  const suppressNextEmptyRowClickRef = useRef(false);
  const lastExpandedTaskGridWidthRef = useRef(defaultTaskGridWidth);
  const draftGanttRef = useRef<ProjectGantt>(draftGantt);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);

  useEffect(() => {
    draftGanttRef.current = draftGantt;
  }, [draftGantt]);

  const isDirty = useMemo(
    () => JSON.stringify(draftGantt) !== savedSnapshot,
    [draftGantt, savedSnapshot],
  );

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const orderedTasks = draftGantt.tasks;
  const taskHierarchy = useMemo(() => buildTaskHierarchy(orderedTasks), [orderedTasks]);
  const visibleTasks = useMemo(
    () => buildVisibleTasks(orderedTasks, collapsedTaskIds),
    [collapsedTaskIds, orderedTasks],
  );
  const selectedTask = orderedTasks.find((task) => task.id === timelineSelectedTaskId) ?? null;
  const selectedTaskIndex = selectedTask ? visibleTasks.findIndex((task) => task.id === selectedTask.id) : -1;
  const managedTaskIndex = managedTaskId ? visibleTasks.findIndex((task) => task.id === managedTaskId) : -1;
  const selectedTaskResource = selectedTask
    ? draftGantt.resources.find((resource) => resource.id === selectedTask.resourceId) ?? null
    : null;
  const resourceSummary = useMemo(() => getResourceSummary(draftGantt), [draftGantt]);
  const unassignedTasks = orderedTasks.filter((task) => task.resourceId === null).length;
  const timelineDays = useMemo(() => getTimelineDays(orderedTasks), [orderedTasks]);
  const baseDayWidth = draftGantt.zoom === 'week' ? 18 : 30;
  const dayWidth = timelineDays.length > 0 && timelineViewportWidth > 0
    ? Math.max(baseDayWidth, timelineViewportWidth / timelineDays.length)
    : baseDayWidth;
  const timelineStart = useMemo(() => timelineDays[0] ?? new Date(), [timelineDays]);
  const timelineWidth = Math.max(timelineDays.length * dayWidth, timelineViewportWidth, 680);
  const completion = getProjectProgress(orderedTasks);
  const visibleRowCount = Math.max(visibleTasks.length, minimumVisibleRows);
  const fillerRowCount = Math.max(minimumVisibleRows - visibleTasks.length, 0);
  const timelineGridMinHeight = timelineHeaderHeight + (visibleRowCount * taskMainRowHeight) + (managedTaskId ? taskDetailRowHeight : 0);
  const fillerRows = useMemo(
    () => Array.from({ length: fillerRowCount }, (_, index) => index),
    [fillerRowCount],
  );
  const isRootTaskDropTarget = taskDropTarget?.position === 'root' && taskDropTarget.taskId === null;
  const draggedTaskPreviewLabel = useMemo(() => {
    if (!draggedTaskId || !taskDropTarget) {
      return null;
    }

    const previewTasks = moveTaskSubtree(orderedTasks, draggedTaskId, taskDropTarget);
    if (!previewTasks) {
      return null;
    }

    return buildTaskHierarchy(previewTasks).get(draggedTaskId)?.label ?? null;
  }, [draggedTaskId, orderedTasks, taskDropTarget]);
  const timelineYears = useMemo(
    () => Array.from(new Set(timelineDays.map((day) => day.getFullYear()))),
    [timelineDays],
  );
  const [visibleTimelineDate, setVisibleTimelineDate] = useState<Date>(timelineStart);
  const [timelineCalendarMonth, setTimelineCalendarMonth] = useState<Date>(startOfMonth(timelineStart));
  const activeVisibleTimelineDate = useMemo(() => {
    if (timelineDays.length === 0) {
      return visibleTimelineDate;
    }

    const start = timelineDays[0];
    const end = timelineDays[timelineDays.length - 1];
    return visibleTimelineDate < start || visibleTimelineDate > end ? start : visibleTimelineDate;
  }, [timelineDays, visibleTimelineDate]);
  const selectedTaskBubble = useMemo(() => {
    if (!selectedTask || selectedTaskIndex < 0) {
      return null;
    }

    const offsetDays = getTaskOffsetDays(selectedTask, timelineStart);
    const spanDays = getTaskCalendarSpanDays(selectedTask);
    const barWidth = selectedTask.milestone ? 20 : Math.max(spanDays * dayWidth - 12, 28);
    const barLeft = selectedTask.milestone
      ? offsetDays * dayWidth + (dayWidth / 2) - 10
      : offsetDays * dayWidth + 6;
    const anchorCenter = barLeft + (barWidth / 2);
    const bubbleLeft = clamp(anchorCenter - (taskBubbleWidth / 2), 8, Math.max(timelineWidth - taskBubbleWidth - 8, 8));
    const pointerLeft = clamp(anchorCenter - bubbleLeft, 18, taskBubbleWidth - 18);
    const rowTop = timelineHeaderHeight
      + (selectedTaskIndex * taskMainRowHeight)
      + (managedTaskIndex >= 0 && managedTaskIndex < selectedTaskIndex ? taskDetailRowHeight : 0);
    const belowTop = rowTop + taskMainRowHeight + (timelineSelectedTaskId === managedTaskId ? taskDetailRowHeight : 0) + 8;
    const aboveTop = rowTop - 8;
    const gridBottom = timelineHeaderHeight + (visibleRowCount * taskMainRowHeight) + (managedTaskId ? taskDetailRowHeight : 0);
    const placeAbove = belowTop + taskBubbleHeight > gridBottom;

    return {
      barColor: selectedTaskResource?.color ?? '#D93A3A',
      bubbleLeft,
      pointerLeft,
      top: placeAbove ? aboveTop : belowTop,
      placeAbove,
    };
  }, [
    dayWidth,
    managedTaskId,
    managedTaskIndex,
    selectedTask,
    timelineSelectedTaskId,
    selectedTaskIndex,
    selectedTaskResource,
    timelineStart,
    timelineWidth,
    visibleRowCount,
  ]);
  const updateVisibleTimelineDate = useCallback(() => {
    if (!timelineScrollRef.current || timelineDays.length === 0) {
      return;
    }

    const scrollContainer = timelineScrollRef.current;
    const centerPosition = scrollContainer.scrollLeft + (scrollContainer.clientWidth / 2);
    const dateIndex = clamp(Math.floor(centerPosition / dayWidth), 0, timelineDays.length - 1);
    const nextVisibleDate = timelineDays[dateIndex];

    setVisibleTimelineDate(nextVisibleDate);
    if (isTimelineCalendarOpen) {
      setTimelineCalendarMonth(startOfMonth(nextVisibleDate));
      setShowTimelineYears(false);
    }
  }, [dayWidth, isTimelineCalendarOpen, timelineDays]);

  const scrollTimelineToDate = useCallback((date: Date, behavior: ScrollBehavior = 'smooth') => {
    if (!timelineScrollRef.current || timelineDays.length === 0) {
      return;
    }

    const targetMonth = startOfMonth(date).getTime();
    const targetIndex = timelineDays.findIndex((day) => (
      day.getFullYear() === date.getFullYear()
      && day.getMonth() === date.getMonth()
      && day.getDate() === date.getDate()
    ));
    const fallbackIndex = timelineDays.findIndex((day) => startOfMonth(day).getTime() === targetMonth);
    const finalIndex = targetIndex >= 0
      ? targetIndex
      : fallbackIndex >= 0
        ? fallbackIndex
        : 0;
    const scrollContainer = timelineScrollRef.current;
    const targetLeft = Math.max(0, (finalIndex * dayWidth) - (scrollContainer.clientWidth / 2) + (dayWidth / 2));

    scrollContainer.scrollTo({
      left: targetLeft,
      behavior,
    });
  }, [dayWidth, timelineDays]);

  useEffect(() => {
    if (!timelineScrollRef.current) {
      return undefined;
    }

    const scrollContainer = timelineScrollRef.current;
    const updateViewportWidth = () => {
      setTimelineViewportWidth(scrollContainer.clientWidth);
      updateVisibleTimelineDate();
    };

    updateViewportWidth();
    const resizeObserver = new ResizeObserver(updateViewportWidth);
    resizeObserver.observe(scrollContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateVisibleTimelineDate]);

  useEffect(() => {
    if (!timelineScrollRef.current) {
      return undefined;
    }

    const scrollContainer = timelineScrollRef.current;
    const handleScroll = () => {
      updateVisibleTimelineDate();
    };

    handleScroll();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [updateVisibleTimelineDate]);

  useEffect(() => {
    if (!selectedTask || dragState || !timelineScrollRef.current) {
      return;
    }

    const scrollContainer = timelineScrollRef.current;
    const offsetDays = getTaskOffsetDays(selectedTask, timelineStart);
    const spanDays = getTaskCalendarSpanDays(selectedTask);
    const barWidth = selectedTask.milestone ? 20 : Math.max(spanDays * dayWidth - 12, 28);
    const barLeft = selectedTask.milestone
      ? offsetDays * dayWidth + (dayWidth / 2) - 10
      : offsetDays * dayWidth + 6;
    const targetLeft = Math.max(0, barLeft - (scrollContainer.clientWidth / 2) + (barWidth / 2));

    scrollContainer.scrollTo({
      left: targetLeft,
      behavior: 'smooth',
    });
  }, [dayWidth, dragState, selectedTask, timelineStart]);

  const applyDraftGantt = useCallback((nextGantt: ProjectGantt) => {
    draftGanttRef.current = nextGantt;
    setDraftGantt(nextGantt);
  }, []);

  const commitTasks = useCallback((nextTasks: GanttTask[], changedTaskId?: string, cycleMessage = t('ganttEditor.circularDependency')) => {
    const alignedTasks = nextTasks.map((task) => alignTaskDates(task));
    if (hasDependencyCycle(alignedTasks)) {
      toast.error(cycleMessage);
      return false;
    }

    const nextGantt = {
      ...draftGanttRef.current,
      tasks: applyDependencyScheduling(alignedTasks, changedTaskId),
    };
    applyDraftGantt(nextGantt);
    return true;
  }, [applyDraftGantt, t]);

  const handleBack = () => {
    if (isDirty && !window.confirm(t('ganttEditor.unsavedLeave'))) {
      return;
    }

    onBack();
  };

  const handleSave = () => {
    if (!project) {
      return;
    }

    const nextGantt = {
      ...draftGantt,
      lastEditedAt: new Date().toISOString(),
    };

    void updateProjectGantt(project.id, nextGantt);
    setSavedSnapshot(JSON.stringify(nextGantt));
    applyDraftGantt(nextGantt);
    toast.success(t('ganttEditor.scheduleSaved'));
  };

  const createAppendedTask = useCallback((tasks: GanttTask[]) => {
    const latestEnd = tasks.length === 0
      ? new Date()
      : tasks
        .map((task) => getTaskEnd(task))
        .sort(compareAsc)
        .at(-1) ?? new Date();

    return createDefaultTask(addDays(latestEnd, tasks.length === 0 ? 0 : 1));
  }, []);

  const handleAddTask = useCallback(() => {
    const nextTask = createAppendedTask(orderedTasks);
    const nextTasks = [...orderedTasks, nextTask];

    applyDraftGantt({
      ...draftGanttRef.current,
      tasks: nextTasks,
    });
    setTimelineSelectedTaskId(null);
    setPredecessorDrafts((current) => ({ ...current, [nextTask.id]: '' }));
  }, [applyDraftGantt, createAppendedTask, orderedTasks]);

  const handleDeleteTask = (taskId: string) => {
    const removedTaskIds = new Set([taskId, ...getDescendantTaskIds(orderedTasks, taskId)]);
    const nextTasks = orderedTasks
      .filter((task) => !removedTaskIds.has(task.id))
      .map((task) => ({
        ...task,
        predecessorIds: task.predecessorIds.filter((predecessorId) => !removedTaskIds.has(predecessorId)),
      }));

    applyDraftGantt({
      ...draftGanttRef.current,
      tasks: nextTasks,
    });
    setHighlightedTaskId((current) => current === taskId ? null : current);
    setTimelineSelectedTaskId((current) => current === taskId ? null : current);
    setManagedTaskId((current) => current === taskId ? null : current);
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      removedTaskIds.forEach((id) => next.delete(id));
      return next;
    });
    setPredecessorDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[taskId];
      return nextDrafts;
    });
  };

  const updateTask = (taskId: string, patch: Partial<GanttTask>) => {
    const nextTasks = orderedTasks.map((task) => (
      task.id === taskId
        ? {
          ...task,
          ...patch,
        }
        : task
    ));
    commitTasks(nextTasks, taskId);
  };

  const handlePredecessorCommit = (taskId: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      commitTasks(orderedTasks.map((task) => task.id === taskId ? { ...task, predecessorIds: [] } : task), taskId);
      setPredecessorDrafts((current) => ({ ...current, [taskId]: '' }));
      return;
    }

    const rowNumbers = trimmed
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value));
    const invalidRow = rowNumbers.find((rowNumber) => rowNumber < 1 || rowNumber > orderedTasks.length);

    if (invalidRow) {
      toast.error(t('ganttEditor.invalidPredecessors'));
      setPredecessorDrafts((current) => ({
        ...current,
        [taskId]: orderedTasks
          .find((task) => task.id === taskId)
          ?.predecessorIds
          .map((predecessorId) => orderedTasks.findIndex((candidate) => candidate.id === predecessorId) + 1)
          .filter((rowNumber) => rowNumber > 0)
          .join(', ') ?? '',
      }));
      return;
    }

    const predecessorIds = Array.from(new Set(
      rowNumbers
        .map((rowNumber) => orderedTasks[rowNumber - 1]?.id ?? null)
        .filter((candidate): candidate is string => Boolean(candidate))
        .filter((candidate) => candidate !== taskId),
    ));

    const didCommit = commitTasks(
      orderedTasks.map((task) => task.id === taskId ? { ...task, predecessorIds } : task),
      taskId,
      t('ganttEditor.circularPredecessor'),
    );

    if (didCommit) {
      setPredecessorDrafts((current) => ({
        ...current,
        [taskId]: predecessorIds
          .map((predecessorId) => orderedTasks.findIndex((task) => task.id === predecessorId) + 1)
          .filter((rowNumber) => rowNumber > 0)
          .join(', '),
      }));
    }
  };

  const handleManageTask = (taskId: string) => {
    suppressNextGridDismissRef.current = true;
    setHighlightedTaskId(taskId);
    setTimelineSelectedTaskId(null);
    setManagedTaskId((current) => current === taskId ? null : taskId);
  };

  const handleCopyTask = (taskId: string, mode: TaskClipboard['mode'] = 'copy') => {
    const task = orderedTasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    setTaskClipboard({
      task: {
        ...task,
        predecessorIds: [...task.predecessorIds],
      },
      mode,
    });

    if (mode === 'cut') {
      handleDeleteTask(taskId);
    }
  };

  const handlePasteTask = (targetTaskId: string) => {
    if (!taskClipboard) {
      return;
    }

    const targetIndex = orderedTasks.findIndex((task) => task.id === targetTaskId);
    const insertAt = targetIndex >= 0 ? targetIndex + 1 : orderedTasks.length;
    const pastedTask: GanttTask = {
      ...taskClipboard.task,
      id: createTaskId(),
      name: taskClipboard.mode === 'copy' ? t('ganttEditor.taskCopySuffix', { name: taskClipboard.task.name }) : taskClipboard.task.name,
      predecessorIds: [],
    };
    const nextTasks = [...orderedTasks];

    nextTasks.splice(insertAt, 0, pastedTask);
    const didCommit = commitTasks(nextTasks, pastedTask.id);

    if (!didCommit) {
      return;
    }

    setHighlightedTaskId(pastedTask.id);
    setManagedTaskId(pastedTask.id);

    if (taskClipboard.mode === 'cut') {
      setTaskClipboard(null);
    }
  };

  const handleInsertTask = useCallback((targetTaskId: string, mode: TaskInsertMode) => {
    const targetIndex = orderedTasks.findIndex((task) => task.id === targetTaskId);
    if (targetIndex < 0) {
      return;
    }

    const targetTask = orderedTasks[targetIndex];
    const insertAt = getTaskSubtreeEndIndex(orderedTasks, targetIndex);
    const seedDate = mode === 'subtask'
      ? parseISO(targetTask.startDate)
      : addDays(getTaskEnd(targetTask), 1);
    const nextTask: GanttTask = {
      ...createDefaultTask(seedDate),
      indentLevel: mode === 'subtask' ? targetTask.indentLevel + 1 : targetTask.indentLevel,
    };
    const nextTasks = [...orderedTasks];

    nextTasks.splice(insertAt, 0, nextTask);
    const didCommit = commitTasks(nextTasks, nextTask.id);
    if (!didCommit) {
      return;
    }

    if (mode === 'subtask') {
      setCollapsedTaskIds((current) => {
        const next = new Set(current);
        next.delete(targetTaskId);
        return next;
      });
    }

    setHighlightedTaskId(nextTask.id);
    setTimelineSelectedTaskId(null);
    setManagedTaskId(nextTask.id);
    setPredecessorDrafts((current) => ({ ...current, [nextTask.id]: '' }));
  }, [commitTasks, orderedTasks]);

  const handleShiftTaskHierarchy = (taskId: string, direction: 'indent' | 'outdent') => {
    const taskIndex = orderedTasks.findIndex((task) => task.id === taskId);
    if (taskIndex < 0) {
      return;
    }

    const task = orderedTasks[taskIndex];
    const previousTask = taskIndex > 0 ? orderedTasks[taskIndex - 1] : null;
    const targetIndent = direction === 'indent'
      ? previousTask
        ? Math.min(task.indentLevel + 1, previousTask.indentLevel + 1)
        : task.indentLevel
      : Math.max(0, task.indentLevel - 1);

    if (targetIndent === task.indentLevel) {
      return;
    }

    const indentDelta = targetIndent - task.indentLevel;
    const nextTasks = [...orderedTasks];
    nextTasks[taskIndex] = {
      ...task,
      indentLevel: targetIndent,
    };

    for (let index = taskIndex + 1; index < nextTasks.length; index += 1) {
      const candidate = nextTasks[index];
      if (candidate.indentLevel <= orderedTasks[taskIndex].indentLevel) {
        break;
      }

      nextTasks[index] = {
        ...candidate,
        indentLevel: Math.max(0, candidate.indentLevel + indentDelta),
      };
    }

    const didCommit = commitTasks(nextTasks, taskId);
    if (!didCommit) {
      return;
    }

    setHighlightedTaskId(taskId);
    setManagedTaskId(taskId);
  };

  const handleToggleTaskCollapse = (taskId: string) => {
    const descendantTaskIds = new Set(getDescendantTaskIds(orderedTasks, taskId));

    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });

    if (descendantTaskIds.has(highlightedTaskId ?? '')) {
      setHighlightedTaskId(taskId);
    }

    if (descendantTaskIds.has(timelineSelectedTaskId ?? '')) {
      setTimelineSelectedTaskId(null);
    }

    if (descendantTaskIds.has(managedTaskId ?? '')) {
      setManagedTaskId(null);
    }
  };

  const handleToggleTaskGrid = () => {
    if (isTaskGridCollapsed) {
      setIsTaskGridCollapsed(false);
      setTaskGridWidth(lastExpandedTaskGridWidthRef.current);
      return;
    }

    lastExpandedTaskGridWidthRef.current = taskGridWidth;
    setIsTaskGridCollapsed(true);
  };

  const handleAddResource = () => {
    const nextResource = createDefaultResource(draftGantt.resources.length);
    applyDraftGantt({
      ...draftGanttRef.current,
      resources: [...draftGantt.resources, nextResource],
    });
  };

  const handleUpdateResource = (resourceId: string, field: 'name' | 'role' | 'capacityPercent', value: string) => {
    const nextResources = draftGantt.resources.map((resource) => {
      if (resource.id !== resourceId) {
        return resource;
      }

      if (field === 'capacityPercent') {
        return {
          ...resource,
          capacityPercent: Math.max(0, Math.min(100, Number.parseInt(value, 10) || 0)),
        };
      }

      return {
        ...resource,
        [field]: value,
      };
    });

    applyDraftGantt({
      ...draftGanttRef.current,
      resources: nextResources,
    });
  };

  const handleUpdateResourceRole = (resourceId: string, roleId: string) => {
    const nextResources = draftGantt.resources.map((resource) => {
      if (resource.id !== resourceId) {
        return resource;
      }

      const selectedRole = draftGantt.roles.find((role) => role.id === roleId) ?? null;
      return {
        ...resource,
        roleId: roleId || null,
        role: selectedRole?.name ?? '',
      };
    });

    applyDraftGantt({
      ...draftGanttRef.current,
      resources: nextResources,
    });
  };

  const handleDeleteResource = (resourceId: string) => {
    applyDraftGantt({
      ...draftGanttRef.current,
      resources: draftGantt.resources.filter((resource) => resource.id !== resourceId),
      tasks: orderedTasks.map((task) => task.resourceId === resourceId ? { ...task, resourceId: null } : task),
    });
  };

  const handleAddRole = () => {
    const nextRole = createDefaultRole(draftGantt.roles.length);
    applyDraftGantt({
      ...draftGanttRef.current,
      roles: [...draftGantt.roles, nextRole],
    });
  };

  const handleUpdateRole = (roleId: string, field: keyof GanttRole, value: string) => {
    const nextRoles = draftGantt.roles.map((role) => {
      if (role.id !== roleId) {
        return role;
      }

      if (field === 'budget') {
        return {
          ...role,
          budget: Math.max(0, Number.parseFloat(value) || 0),
        };
      }

      if (field === 'paidBy') {
        return {
          ...role,
          paidBy: value as GanttRoleBillingPeriod,
        };
      }

      if (field === 'currency') {
        return {
          ...role,
          currency: value as GanttCurrency,
        };
      }

      return {
        ...role,
        [field]: value,
      };
    });

    const roleNamesById = new Map(nextRoles.map((role) => [role.id, role.name]));
    const nextResources = draftGantt.resources.map((resource) => (
      resource.roleId
        ? { ...resource, role: roleNamesById.get(resource.roleId) ?? resource.role }
        : resource
    ));

    applyDraftGantt({
      ...draftGanttRef.current,
      roles: nextRoles,
      resources: nextResources,
    });
  };

  const handleDeleteRole = (roleId: string) => {
    applyDraftGantt({
      ...draftGanttRef.current,
      roles: draftGantt.roles.filter((role) => role.id !== roleId),
      resources: draftGantt.resources.map((resource) => (
        resource.roleId === roleId
          ? { ...resource, roleId: null, role: '' }
          : resource
      )),
    });
  };

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      const deltaDays = Math.round((event.clientX - dragState.startX) / dayWidth);

      if (deltaDays === dragState.lastDeltaDays) {
        return;
      }

      const originalStart = parseISO(dragState.originalTask.startDate);
      const originalEnd = getTaskEnd(dragState.originalTask);
      let nextTask = dragState.originalTask;

      if (dragState.mode === 'move') {
        nextTask = {
          ...dragState.originalTask,
          startDate: sameDayValue(addDays(originalStart, deltaDays)),
        };
      }

      if (dragState.mode === 'resize-start') {
        const maxStart = dragState.originalTask.milestone
          ? originalStart
          : originalEnd;
        const proposedStart = addDays(originalStart, deltaDays);
        const nextStart = compareAsc(proposedStart, maxStart) > 0 ? maxStart : proposedStart;
        nextTask = {
          ...dragState.originalTask,
          startDate: sameDayValue(nextStart),
          durationDays: Math.max(1, Math.round((originalEnd.getTime() - nextStart.getTime()) / 86400000) + 1),
          milestone: dragState.originalTask.milestone ? true : dragState.originalTask.milestone,
        };
      }

      if (dragState.mode === 'resize-end') {
        const proposedEnd = addDays(originalEnd, deltaDays);
        const nextDuration = Math.max(
          1,
          Math.round((proposedEnd.getTime() - originalStart.getTime()) / 86400000) + 1,
        );
        nextTask = {
          ...dragState.originalTask,
          durationDays: nextDuration,
          milestone: dragState.originalTask.milestone && nextDuration === 1,
        };
      }

      const nextTasks = dragState.baseTasks.map((task) => (
        task.id === dragState.taskId ? nextTask : task
      ));
      commitTasks(nextTasks, dragState.taskId);
      setDragState((current) => current ? { ...current, lastDeltaDays: deltaDays } : null);
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commitTasks, dayWidth, dragState]);

  useEffect(() => {
    if (!taskGridResizeState) {
      return undefined;
    }

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      const nextWidth = clamp(
        taskGridResizeState.startWidth + (event.clientX - taskGridResizeState.startX),
        minTaskGridWidth,
        maxTaskGridWidth,
      );

      setTaskGridWidth(nextWidth);
      lastExpandedTaskGridWidthRef.current = nextWidth;
      if (isTaskGridCollapsed) {
        setIsTaskGridCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      setTaskGridResizeState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTaskGridCollapsed, taskGridResizeState]);

  const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!timelineScrollRef.current) {
      return;
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    timelineScrollRef.current.scrollLeft += event.deltaY;
  }, []);

  const getRowDropPosition = useCallback((event: React.DragEvent<HTMLDivElement>): Exclude<TaskDropPosition, 'root'> => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - bounds.top;

    if (offsetY < bounds.height * 0.28) {
      return 'before';
    }

    if (offsetY > bounds.height * 0.72) {
      return 'after';
    }

    return 'inside';
  }, []);

  const handleTaskDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, taskId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
    setTaskDropTarget(null);
    setHighlightedTaskId(taskId);
    setTimelineSelectedTaskId(null);
  }, []);

  const handleTaskDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setTaskDropTarget(null);
  }, []);

  const handleTaskRowDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, taskId: string) => {
    const activeTaskId = draggedTaskId ?? event.dataTransfer.getData('text/plain');
    if (!activeTaskId) {
      return;
    }

    const position = getRowDropPosition(event);
    const movedTaskIds = new Set([activeTaskId, ...getDescendantTaskIds(orderedTasks, activeTaskId)]);
    if (movedTaskIds.has(taskId)) {
      setTaskDropTarget(null);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setTaskDropTarget((current) => (
      current?.taskId === taskId && current.position === position
        ? current
        : { taskId, position }
    ));
  }, [draggedTaskId, getRowDropPosition, orderedTasks]);

  const handleTaskRootDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const activeTaskId = draggedTaskId ?? event.dataTransfer.getData('text/plain');
    if (!activeTaskId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setTaskDropTarget((current) => (
      current?.position === 'root' && current.taskId === null
        ? current
        : { taskId: null, position: 'root' }
    ));
  }, [draggedTaskId]);

  const handleTaskDrop = useCallback((event: React.DragEvent<HTMLDivElement>, dropTargetOverride?: TaskDropTarget) => {
    const activeTaskId = draggedTaskId ?? event.dataTransfer.getData('text/plain');
    const nextDropTarget = dropTargetOverride ?? taskDropTarget;

    event.preventDefault();
    if (!activeTaskId || !nextDropTarget) {
      setDraggedTaskId(null);
      setTaskDropTarget(null);
      return;
    }

    const nextTasks = moveTaskSubtree(orderedTasks, activeTaskId, nextDropTarget);

    setDraggedTaskId(null);
    setTaskDropTarget(null);

    if (!nextTasks) {
      return;
    }

    const didCommit = commitTasks(nextTasks, activeTaskId);
    if (!didCommit) {
      return;
    }

    if (nextDropTarget.position === 'inside' && nextDropTarget.taskId) {
      setCollapsedTaskIds((current) => {
        const next = new Set(current);
        next.delete(nextDropTarget.taskId!);
        return next;
      });
    }

    setHighlightedTaskId(activeTaskId);
    setManagedTaskId(activeTaskId);
    setTimelineSelectedTaskId(null);
  }, [commitTasks, draggedTaskId, orderedTasks, taskDropTarget]);

  const handleEmptyRowMouseDown = useCallback(() => {
    const activeElement = document.activeElement;
    suppressNextEmptyRowClickRef.current = activeElement instanceof HTMLElement
      && activeElement.dataset.ganttTaskNameInput === 'true';
  }, []);

  const handleEmptyRowClick = useCallback(() => {
    if (suppressNextEmptyRowClickRef.current) {
      suppressNextEmptyRowClickRef.current = false;
      return;
    }

    if (managedTaskId) {
      setManagedTaskId(null);
      return;
    }

    handleAddTask();
  }, [handleAddTask, managedTaskId]);

  const handleTimelineCalendarOpenChange = useCallback((open: boolean) => {
    setIsTimelineCalendarOpen(open);
    if (open) {
      setTimelineCalendarMonth(startOfMonth(activeVisibleTimelineDate));
      setShowTimelineYears(false);
    }
  }, [activeVisibleTimelineDate]);

  if (!project) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#171717]"
          >
            <HugeiconsIcon icon={backIcon} className="h-4 w-4" />
            {t('ganttEditor.backToOverview')}
          </button>
          <h1 className="text-2xl font-bold text-[#171717]">{t('ganttEditor.projectNotFound')}</h1>
          <p className="mt-3 text-sm text-[#737373]">
            {t('ganttEditor.projectLoadFailed')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#F8FAFC_0%,#EEF2F7_100%)] text-[#171717]"
      onClick={() => setTimelineSelectedTaskId(null)}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <Dialog open={showResourcesDialog} onOpenChange={setShowResourcesDialog}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('ganttEditor.manageResources')}</DialogTitle>
            <DialogDescription>
              {t('ganttEditor.manageResourcesDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#EEF2F6] bg-[#F8FAFC] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#171717]">{t('ganttEditor.projectResources')}</p>
                <p className="text-xs text-[#737373]">
                  {t('ganttEditor.projectResourcesSummary', {
                    resources: formatNumber(draftGantt.resources.length),
                    tasks: formatNumber(unassignedTasks),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRolesDialog(true)}
                  className="btn-secondary inline-flex items-center gap-2 !px-3 !py-2 text-xs"
                >
                  <HugeiconsIcon icon={ResourcesAddIcon} className="h-4 w-4" />
                  {t('ganttEditor.addRoles')}
                </button>
                <button
                  type="button"
                  onClick={handleAddResource}
                  className="btn-secondary inline-flex items-center gap-2 !px-3 !py-2 text-xs"
                >
                  <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" />
                  {t('ganttEditor.addResource')}
                </button>
              </div>
            </div>

            {draftGantt.resources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DADFE7] bg-[#F8FAFC] p-6 text-center text-sm text-[#737373]">
                {t('ganttEditor.noResourcesYet')}
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {draftGantt.resources.map((resource) => {
                  const summary = resourceSummary.find((entry) => entry.resource.id === resource.id);

                  return (
                    <div key={resource.id} className="rounded-xl border border-[#EEF2F6] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: resource.color }} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#171717]">{resource.name}</p>
                            <p className="truncate text-xs text-[#737373]">{resource.role || t('ganttEditor.noRoleSet')}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteResource(resource.id)}
                          className="text-xs font-medium text-[#A3A3A3] transition-colors hover:text-[#D93A3A]"
                        >
                          {t('ganttEditor.remove')}
                        </button>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_110px_90px_90px]">
                        <input
                          type="text"
                          value={resource.name}
                          onChange={(event) => handleUpdateResource(resource.id, 'name', event.target.value)}
                          placeholder={t('manager.name')}
                          className="h-10 w-full px-3 py-2 text-sm"
                        />
                        <select
                          value={resource.roleId ?? ''}
                          onChange={(event) => handleUpdateResourceRole(resource.id, event.target.value)}
                          className="h-10 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm"
                        >
                          <option value="">{t('ganttEditor.noRole')}</option>
                          {draftGantt.roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[#A3A3A3]">{t('ganttEditor.capacity')}</p>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={resource.capacityPercent}
                            onChange={(event) => handleUpdateResource(resource.id, 'capacityPercent', event.target.value)}
                            className="mt-1 h-7 w-full px-1 py-1 text-center text-xs"
                          />
                        </div>
                        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[#A3A3A3]">{t('ganttEditor.tasks')}</p>
                          <p className="mt-1 text-sm font-semibold text-[#171717]">{formatNumber(summary?.assignedTasks ?? 0)}</p>
                        </div>
                        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[#A3A3A3]">{t('ganttEditor.days')}</p>
                          <p className="mt-1 text-sm font-semibold text-[#171717]">{formatNumber(summary?.scheduledDays ?? 0)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRolesDialog} onOpenChange={setShowRolesDialog}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('ganttEditor.manageRoles')}</DialogTitle>
            <DialogDescription>
              {t('ganttEditor.manageRolesDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#EEF2F6] bg-[#F8FAFC] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#171717]">{t('ganttEditor.projectRoles')}</p>
                <p className="text-xs text-[#737373]">
                  {t('ganttEditor.projectRolesSummary')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRole}
                className="btn-secondary inline-flex items-center gap-2 !px-3 !py-2 text-xs"
              >
                <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" />
                {t('ganttEditor.addRole')}
              </button>
            </div>

            {draftGantt.roles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DADFE7] bg-[#F8FAFC] p-6 text-center text-sm text-[#737373]">
                {t('ganttEditor.noRolesYet')}
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {draftGantt.roles.map((role) => (
                  <div key={role.id} className="rounded-xl border border-[#EEF2F6] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#FEF2F2] text-[#BF2222]">
                            <CurrencyIcon currency={role.currency} />
                          </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#171717]">{role.name}</p>
                          <p className="truncate text-xs text-[#737373]">
                            {role.currency} {formatNumber(role.budget)} / {formatBillingLabel(role.paidBy)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role.id)}
                        className="text-xs font-medium text-[#A3A3A3] transition-colors hover:text-[#D93A3A]"
                      >
                        {t('ganttEditor.remove')}
                      </button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_120px_170px_140px]">
                      <input
                        type="text"
                        value={role.name}
                        onChange={(event) => handleUpdateRole(role.id, 'name', event.target.value)}
                        placeholder={t('ganttEditor.roleName')}
                        className="h-10 w-full px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={role.budget}
                        onChange={(event) => handleUpdateRole(role.id, 'budget', event.target.value)}
                        placeholder={t('manager.budget')}
                        className="h-10 w-full px-3 py-2 text-sm"
                      />
                      <select
                        value={role.paidBy}
                        onChange={(event) => handleUpdateRole(role.id, 'paidBy', event.target.value)}
                        className="h-10 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm"
                      >
                        {roleBillingOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatBillingLabel(option)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={role.currency}
                        onChange={(event) => handleUpdateRole(role.id, 'currency', event.target.value)}
                        className="h-10 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm"
                      >
                        {currencyOptions.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/90 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="min-w-0">
            <button
              type="button"
              onClick={handleBack}
              className="mb-2 inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#171717]"
            >
              <HugeiconsIcon icon={backIcon} className="h-4 w-4" />
              {t('ganttEditor.backToOverview')}
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[#171717]">{project.title}</h1>
              <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-xs font-medium text-[#525252]">
                {project.department}
              </span>
              <span className="rounded-full bg-[#D93A3A]/10 px-3 py-1 text-xs font-medium text-[#D93A3A]">
                {t('manager.tasksCount', { count: formatNumber(orderedTasks.length) })}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#737373]">
              {t('ganttEditor.buildScheduleDescription')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`rounded-full px-3 py-1 text-xs font-medium ${isDirty ? 'bg-[#FEF2F2] text-[#D93A3A]' : 'bg-[#ECFDF3] text-[#027A48]'
              }`}>
              {isDirty ? t('ganttEditor.unsavedChanges') : t('ganttEditor.allChangesSaved')}
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary inline-flex items-center gap-2"
            >
              <HugeiconsIcon icon={Tick01Icon} className="h-4 w-4" />
              {t('ganttEditor.saveSchedule')}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col py-6">
        <section className="flex min-h-0 flex-1 flex-col space-y-6">
          {/* Stats card */}
          <div className="dashboard-card mx-auto flex w-fit min-w-[340px] flex-col items-center justify-center px-4 py-2">
              <div className="grid h-5 w-full grid-cols-4 gap-4">
                <p className="text-sm text-[#737373] mb-1 text-center">{t('manager.progress')}</p>
                <p className="text-sm text-[#737373] mb-1 text-center">{t('ganttEditor.dependencies')}</p>
                <div className="group flex items-center justify-center gap-1">
                  <p className="mb-1 text-center text-sm text-[#737373]">{t('manager.resources')}</p>
                  <div className="relative mb-1">
                    <button
                      type="button"
                      onClick={() => setShowResourcesDialog(true)}
                      className="peer rounded-full p-1 text-[#A3A3A3] opacity-0 transition-all hover:bg-[#F3F4F6] hover:text-[#171717] group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t('ganttEditor.manageResources')}
                      title={t('ganttEditor.manageResources')}
                    >
                      <HugeiconsIcon icon={ResourcesAddIcon} className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-[#171717] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      {t('ganttEditor.manageResources')}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#737373] mb-1 text-center">{t('ganttEditor.lastSavedLabel')}</p>
              </div>
              <div className="grid h-5 w-full grid-cols-4 gap-4">
                <p className="text-lg font-bold text-[#171717] text-center">{formatNumber(completion)}%</p>
                <p className="text-lg font-bold text-green-600 text-center">{formatNumber(orderedTasks.filter((task) => task.predecessorIds.length > 0).length)}</p>
                <p className="text-lg font-bold text-[#D93A3A] text-center">{formatNumber(draftGantt.resources.length)}</p>
                <p className="text-lg font-bold text-[#A3A3A3] text-center">{draftGantt.lastEditedAt ? formatDate(parseISO(draftGantt.lastEditedAt), { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('ganttEditor.notSavedYet')}</p>
              </div>
              <div className="grid w-full grid-cols-4 gap-4">
                <p className="text-xs text-[#737373] text-center py-2">{t('ganttEditor.weightedProgress')}</p>
                <p className="text-xs text-[#737373] text-center py-2">{t('ganttEditor.dependenciesDescription')}</p>
                <p className="text-xs text-[#737373] text-center py-2">{t('ganttEditor.tasksUnassigned', { count: formatNumber(unassignedTasks) })}</p>
                <p className="text-xs text-[#737373] text-center py-2">{t('ganttEditor.storedLocally')}</p>
              </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-y border-[#E5E7EB] bg-white/95">
            <div className="flex flex-col gap-4 border-b border-[#EEF2F6] px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <h2 className="text-lg font-semibold text-[#171717]">{t('ganttEditor.taskGridTimeline')}</h2>
                <p className="text-sm text-[#737373]">
                  {t('ganttEditor.taskGridTimelineDescription')}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A3A3A3]">{t('ganttEditor.timelineWindow')}</p>
                <p className="mt-1 text-lg font-semibold text-[#171717]">{formatDate(activeVisibleTimelineDate, { month: 'long', year: 'numeric' })}</p>
              </div>
              <Popover open={isTimelineCalendarOpen} onOpenChange={handleTimelineCalendarOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-2"
                  >
                    <HugeiconsIcon icon={Calendar01Icon} className="h-4 w-4 text-[#D93A3A]" />
                    {t('ganttEditor.calendar')}
                  </button>
                </PopoverTrigger>
                <PopoverContent align={isRTL ? 'start' : 'end'} className="w-auto min-w-[23rem] p-0">
                  <div className="border-b border-[#EEF2F6] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#171717]">{t('ganttEditor.calendarViewer')}</p>
                        <p className="text-xs text-[#737373]">{t('ganttEditor.calendarViewerDescription')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTimelineYears((current) => !current)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          showTimelineYears
                            ? 'border-[#D93A3A] bg-[#FEF2F2] text-[#D93A3A]'
                            : 'border-[#E5E7EB] bg-white text-[#525252] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]'
                        }`}
                      >
                        {t('ganttEditor.year')} {timelineCalendarMonth.getFullYear()}
                      </button>
                    </div>
                    {showTimelineYears ? (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {timelineYears.map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => {
                              setTimelineCalendarMonth(new Date(year, timelineCalendarMonth.getMonth(), 1));
                              setShowTimelineYears(false);
                            }}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              timelineCalendarMonth.getFullYear() === year
                                ? 'border-[#D93A3A] bg-[#FEF2F2] text-[#D93A3A]'
                                : 'border-[#E5E7EB] bg-white text-[#525252] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]'
                            }`}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-center p-4">
                    <Calendar
                      mode="single"
                      locale={calendarLocale}
                      month={timelineCalendarMonth}
                      onMonthChange={setTimelineCalendarMonth}
                      selected={activeVisibleTimelineDate}
                      onSelect={(date) => {
                        if (!date) {
                          return;
                        }

                        setVisibleTimelineDate(date);
                        setTimelineCalendarMonth(startOfMonth(date));
                        scrollTimelineToDate(date);
                        handleTimelineCalendarOpenChange(false);
                      }}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleTaskGrid}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <HugeiconsIcon icon={isTaskGridCollapsed ? ArrowRight01Icon : ArrowLeft01Icon} className="h-4 w-4" />
                  {isTaskGridCollapsed ? t('ganttEditor.showGrid') : t('ganttEditor.hideGrid')}
                </button>
                <div className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] p-1">
                  {(['day', 'week'] as const).map((zoom) => (
                    <button
                      key={zoom}
                      type="button"
                      onClick={() => applyDraftGantt({ ...draftGanttRef.current, zoom })}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${draftGantt.zoom === zoom ? 'bg-[#171717] text-white' : 'text-[#525252] hover:bg-white'
                        }`}
                    >
                      {zoom === 'day' ? t('ganttEditor.dayZoom') : t('ganttEditor.compact')}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" />
                  {t('ganttEditor.addTask')}
                </button>
              </div>
            </div>

            {orderedTasks.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <div className="rounded-full bg-[#D93A3A]/10 p-4 text-[#D93A3A]">
                  <HugeiconsIcon icon={TaskDone01Icon} className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-[#171717]">{t('ganttEditor.startFirstSchedule')}</h3>
                  <p className="mt-2 text-sm text-[#737373]">
                    {t('ganttEditor.startFirstScheduleDescription')}
                  </p>
                </div>
                <button type="button" onClick={handleAddTask} className="btn-primary inline-flex items-center gap-2">
                  <HugeiconsIcon icon={PlusSignIcon} className="h-4 w-4" />
                  {t('ganttEditor.addFirstTask')}
                </button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div
                  className="grid min-h-0 flex-1"
                  style={{ gridTemplateColumns: `${isTaskGridCollapsed ? 0 : taskGridWidth}px 16px minmax(0, 1fr)` }}
                >
                  <div
                    className={`overflow-auto ${isTaskGridCollapsed ? 'pointer-events-none opacity-0' : 'border-r border-[#EEF2F6] opacity-100'}`}
                    onClick={() => {
                      if (suppressNextGridDismissRef.current) {
                        suppressNextGridDismissRef.current = false;
                        return;
                      }

                      setManagedTaskId(null);
                    }}
                  >
                    <div className="min-h-full" style={{ minHeight: timelineGridMinHeight, minWidth: taskGridWidth }}>
                      <div
                        className="grid h-14 border-b border-[#EEF2F6] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.14em] text-[#737373]"
                        style={{ gridTemplateColumns: taskGridColumns }}
                      >
                        {[
                          '#',
                          t('manager.task'),
                          t('manager.startDate'),
                          t('ganttEditor.days'),
                          t('manager.endDate'),
                        ].map((label) => (
                          <div key={label} className="flex items-center border-r border-[#EEF2F6] px-2 last:border-r-0">
                            {label}
                          </div>
                        ))}
                      </div>
                      {visibleTasks.map((task) => {
                        const isHighlighted = task.id === highlightedTaskId;
                        const isManaged = task.id === managedTaskId;
                        const hierarchyItem = taskHierarchy.get(task.id);
                        const isCollapsed = collapsedTaskIds.has(task.id);
                        const dropPosition = taskDropTarget?.taskId === task.id ? taskDropTarget.position : null;

                        return (
                          <ContextMenu key={task.id}>
                            <ContextMenuTrigger asChild>
                              <div>
                                <div
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setHighlightedTaskId(task.id);
                                    setTimelineSelectedTaskId(null);
                                    setManagedTaskId((current) => current === task.id ? current : null);
                                  }}
                                  onContextMenu={() => {
                                    setHighlightedTaskId(task.id);
                                    setTimelineSelectedTaskId(null);
                                    setManagedTaskId((current) => current === task.id ? current : null);
                                  }}
                                  onDragOver={(event) => handleTaskRowDragOver(event, task.id)}
                                  onDrop={(event) => handleTaskDrop(event, { taskId: task.id, position: getRowDropPosition(event) })}
                                  className={`group relative grid h-14 border-b border-[#EEF2F6] outline-none transition-colors ${
                                    isManaged
                                      ? 'border-b-transparent bg-[#FFF7F7]'
                                      : isHighlighted
                                        ? 'bg-[#FFF7F7]'
                                        : 'bg-white'
                                  } ${draggedTaskId === task.id ? 'opacity-60' : ''}`}
                                  style={{ gridTemplateColumns: taskGridColumns }}
                                >
                                  {dropPosition === 'before' ? (
                                    <div className="pointer-events-none absolute inset-x-3 top-0 z-10 h-[3px] rounded-full bg-[#D93A3A]">
                                      {draggedTaskPreviewLabel ? (
                                        <span className="absolute left-0 top-1 rounded-full bg-[#171717] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                                          #{draggedTaskPreviewLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {dropPosition === 'after' ? (
                                    <div className="pointer-events-none absolute inset-x-3 bottom-0 z-10 h-[3px] rounded-full bg-[#D93A3A]">
                                      {draggedTaskPreviewLabel ? (
                                        <span className="absolute left-0 bottom-1 rounded-full bg-[#171717] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                                          #{draggedTaskPreviewLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {dropPosition === 'inside' ? (
                                    <div className="pointer-events-none absolute inset-1 rounded-xl border-2 border-dashed border-[#D93A3A] bg-[#FFF1F1]/80">
                                      {draggedTaskPreviewLabel ? (
                                        <span className="absolute right-2 top-2 rounded-full bg-[#171717] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                                          #{draggedTaskPreviewLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <div className="flex items-center justify-center border-r border-[#EEF2F6] px-2 text-xs font-semibold text-[#525252]">
                                    {hierarchyItem?.label ?? ''}
                                  </div>
                                  <div className="border-r border-[#EEF2F6] px-2 py-2">
                                    <div
                                      className="flex h-full items-center gap-2"
                                      style={{ paddingInlineStart: `${8 + (task.indentLevel * 24)}px` }}
                                    >
                                      <div
                                        role="button"
                                        tabIndex={-1}
                                        draggable
                                        onClick={(event) => event.stopPropagation()}
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onDragStart={(event) => handleTaskDragStart(event, task.id)}
                                        onDragEnd={handleTaskDragEnd}
                                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#A3A3A3] transition-all ${
                                          draggedTaskId === task.id
                                            ? 'cursor-grabbing bg-white text-[#171717] opacity-100'
                                            : 'cursor-grab opacity-0 group-hover:opacity-100 hover:bg-white hover:text-[#171717]'
                                        }`}
                                        aria-label={t('ganttEditor.dragTask')}
                                        title={t('ganttEditor.dragTask')}
                                      >
                                        <span className="grid grid-cols-2 gap-[2px]">
                                          {Array.from({ length: 6 }, (_, dot) => (
                                            <span key={`${task.id}-drag-dot-${dot}`} className="h-1 w-1 rounded-full bg-current" />
                                          ))}
                                        </span>
                                      </div>
                                      {hierarchyItem?.hasChildren ? (
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleToggleTaskCollapse(task.id);
                                          }}
                                          className="rounded-md p-1 text-[#5F6B7A] transition-colors hover:bg-white hover:text-[#171717]"
                                          aria-label={isCollapsed ? t('ganttEditor.expandSubtasks') : t('ganttEditor.collapseSubtasks')}
                                        >
                                          <HugeiconsIcon
                                            icon={ArrowDown01Icon}
                                            className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                          />
                                        </button>
                                      ) : (
                                        <span className="h-6 w-6 shrink-0" />
                                      )}
                                      <input
                                        type="text"
                                        data-gantt-task-name-input="true"
                                        value={task.name}
                                        onChange={(event) => updateTask(task.id, { name: event.target.value })}
                                        className={`h-full w-full border-transparent bg-transparent px-0 py-1 text-sm focus:border-[#D93A3A] focus:bg-white ${
                                          hierarchyItem?.hasChildren
                                            ? 'font-semibold text-[#171717]'
                                            : 'font-medium text-[#525252]'
                                        }`}
                                      />
                                    </div>
                                  </div>
                                  <div className="border-r border-[#EEF2F6] px-2 py-2">
                                    <input
                                      type="date"
                                      value={task.startDate}
                                      onChange={(event) => updateTask(task.id, { startDate: event.target.value })}
                                      className="h-full w-full px-2 py-1 text-sm"
                                    />
                                  </div>
                                  <div className="border-r border-[#EEF2F6] px-2 py-2">
                                    <input
                                      type="number"
                                      min={1}
                                      value={task.durationDays}
                                      onChange={(event) => updateTask(task.id, { durationDays: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })}
                                      className="h-full w-full px-2 py-1 text-sm"
                                    />
                                  </div>
                                  <div className="flex items-center border-r border-[#EEF2F6] px-3 text-sm text-[#525252]">
                                    {task.endDate}
                                  </div>
                                </div>

                                {isManaged ? (
                                  <div className="pb-3" onClick={(event) => event.stopPropagation()}>
                                    <div
                                      className="grid h-[72px] overflow-hidden border border-[#E8E0D2] bg-[#FAF6EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                                      style={{
                                        gridTemplateColumns: taskDetailColumns,
                                        borderTopWidth: 0,
                                        borderBottomLeftRadius: 18,
                                      }}
                                    >
                                      <div className="border-r border-[#E8E0D2] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A8895C]">{t('manager.status')}</p>
                                        <select
                                          value={task.status}
                                          onChange={(event) => updateTask(task.id, { status: event.target.value as GanttTask['status'] })}
                                          className="mt-1 h-9 w-full rounded-md border border-[#E2D7C5] bg-white/90 px-2 py-1 text-sm"
                                        >
                                          <option value="pending">{formatStatusLabel('pending')}</option>
                                          <option value="in-progress">{formatStatusLabel('in-progress')}</option>
                                          <option value="completed">{formatStatusLabel('completed')}</option>
                                          <option value="delayed">{formatStatusLabel('delayed')}</option>
                                        </select>
                                      </div>
                                      <div className="border-r border-[#E8E0D2] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A8895C]">{t('manager.resource')}</p>
                                        <select
                                          value={task.resourceId ?? ''}
                                          onChange={(event) => updateTask(task.id, { resourceId: event.target.value || null })}
                                          className="mt-1 h-9 w-full rounded-md border border-[#E2D7C5] bg-white/90 px-2 py-1 text-sm"
                                        >
                                          <option value="">{t('manager.unassigned')}</option>
                                          {draftGantt.resources.map((resource) => (
                                            <option key={resource.id} value={resource.id}>
                                              {resource.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="border-r border-[#E8E0D2] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A8895C]">{t('ganttEditor.flag')}</p>
                                        <label className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-[#6B5A3C]">
                                          <input
                                            type="checkbox"
                                            checked={task.milestone}
                                            onChange={(event) => updateTask(task.id, {
                                              milestone: event.target.checked,
                                              durationDays: event.target.checked ? 1 : task.durationDays,
                                            })}
                                            className="h-4 w-4 rounded border-[#D8CCB7]"
                                          />
                                          MS
                                        </label>
                                      </div>
                                      <div className="border-r border-[#E8E0D2] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A8895C]">{t('manager.pred')}</p>
                                        <input
                                          type="text"
                                          value={predecessorDrafts[task.id] ?? ''}
                                          onChange={(event) => setPredecessorDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                                          onBlur={(event) => handlePredecessorCommit(task.id, event.target.value)}
                                          placeholder="1, 3"
                                          className="mt-1 h-9 w-full rounded-md border border-[#E2D7C5] bg-white/90 px-2 py-1 text-sm"
                                        />
                                      </div>
                                      <div className="px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A8895C]">{t('ganttEditor.level')}</p>
                                        <p className="mt-2 text-xs font-medium text-[#6B5A3C]">{formatNumber(task.indentLevel + 1)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="min-w-[10rem] rounded-xl border-[#E5E7EB] p-1.5">
                              <ContextMenuItem onSelect={() => handleCopyTask(task.id)}>
                                <HugeiconsIcon icon={Copy01Icon} className="h-4 w-4" />
                                {t('ganttEditor.copy')}
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => handleCopyTask(task.id, 'cut')}>
                                <HugeiconsIcon icon={ScissorIcon} className="h-4 w-4" />
                                {t('ganttEditor.cut')}
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => handleDeleteTask(task.id)} className="text-[#D93A3A] focus:text-[#D93A3A]">
                                <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" />
                                {t('ganttEditor.delete')}
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => handlePasteTask(task.id)} disabled={!taskClipboard}>
                                <HugeiconsIcon icon={ClipboardPasteIcon} className="h-4 w-4" />
                                {t('ganttEditor.paste')}
                              </ContextMenuItem>
                              <ContextMenuSub>
                                <ContextMenuSubTrigger>
                                  <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" />
                                  {t('ganttEditor.insert')}
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="min-w-[9rem] rounded-xl border-[#E5E7EB] p-1.5">
                                  <ContextMenuItem onSelect={() => handleInsertTask(task.id, 'subtask')}>
                                    {t('ganttEditor.subTask')}
                                  </ContextMenuItem>
                                  <ContextMenuItem onSelect={() => handleInsertTask(task.id, 'task')}>
                                    {t('manager.task')}
                                  </ContextMenuItem>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              <ContextMenuItem
                                onSelect={() => handleShiftTaskHierarchy(task.id, 'indent')}
                                disabled={orderedTasks.findIndex((entry) => entry.id === task.id) === 0}
                              >
                                <HugeiconsIcon icon={ListIndentIncreaseIcon} className="h-4 w-4" />
                                {t('ganttEditor.indentTask')}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => handleShiftTaskHierarchy(task.id, 'outdent')}
                                disabled={task.indentLevel === 0}
                              >
                                <HugeiconsIcon icon={ListIndentDecreaseIcon} className="h-4 w-4" />
                                {t('ganttEditor.outdentTask')}
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onSelect={() => handleManageTask(task.id)}>
                                <HugeiconsIcon icon={Settings02Icon} className="h-4 w-4" />
                                {t('ganttEditor.manage')}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                      {fillerRows.map((row) => (
                        <div
                          key={`task-grid-filler-${row}`}
                          className={`grid h-14 border-b border-[#EEF2F6] transition-colors ${isRootTaskDropTarget ? 'bg-[#FFF1F1]' : 'bg-white hover:bg-[#FAFAFA]'}`}
                          style={{ gridTemplateColumns: taskGridColumns }}
                          onMouseDown={handleEmptyRowMouseDown}
                          onClick={handleEmptyRowClick}
                          onDragOver={handleTaskRootDragOver}
                          onDrop={(event) => handleTaskDrop(event, { taskId: null, position: 'root' })}
                        >
                          {Array.from({ length: 5 }, (_, column) => (
                            <div
                              key={`task-grid-filler-${row}-${column}`}
                              className="border-r border-[#EEF2F6] last:border-r-0"
                            />
                          ))}
                        </div>
                      ))}
                      <div
                        className={`relative h-3 border-b border-[#EEF2F6] transition-colors ${isRootTaskDropTarget ? 'bg-[#FDECEC]' : 'bg-white'}`}
                        onDragOver={handleTaskRootDragOver}
                        onDrop={(event) => handleTaskDrop(event, { taskId: null, position: 'root' })}
                      >
                        {isRootTaskDropTarget && draggedTaskPreviewLabel ? (
                          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-[#171717] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                            #{draggedTaskPreviewLabel}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex items-stretch justify-center bg-white">
                    <button
                      type="button"
                      onClick={handleToggleTaskGrid}
                      className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-[#E5E7EB] bg-white p-1 text-[#737373] shadow-sm transition-colors hover:border-[#D4D4D4] hover:text-[#171717]"
                      aria-label={isTaskGridCollapsed ? t('ganttEditor.expandTaskGrid') : t('ganttEditor.collapseTaskGrid')}
                      title={isTaskGridCollapsed ? t('ganttEditor.expandTaskGrid') : t('ganttEditor.collapseTaskGrid')}
                    >
                      <HugeiconsIcon icon={isTaskGridCollapsed ? ArrowRight01Icon : ArrowLeft01Icon} className="h-3.5 w-3.5" />
                    </button>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      className={`relative h-full w-full ${isTaskGridCollapsed ? 'cursor-pointer' : 'cursor-col-resize'}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        if (isTaskGridCollapsed) {
                          handleToggleTaskGrid();
                          return;
                        }

                        setTaskGridResizeState({
                          startX: event.clientX,
                          startWidth: taskGridWidth,
                        });
                      }}
                    >
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#E5E7EB]" />
                      <div className="absolute left-1/2 top-1/2 h-16 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E5E7EB]" />
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col">
                    <div
                      ref={timelineScrollRef}
                      className="min-h-0 flex-1 overflow-auto scroll-smooth overscroll-contain"
                      onWheel={handleTimelineWheel}
                    >
                    <div className="relative min-h-full" style={{ width: `max(100%, ${timelineWidth}px)`, minHeight: timelineGridMinHeight }}>
                      <div className="sticky top-0 z-10 grid h-14 border-b border-[#EEF2F6] bg-[#F8FAFC]" style={{ gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${dayWidth}px, 1fr))` }}>
                        {timelineDays.map((day, index) => (
                          <div
                            key={day.toISOString()}
                            className={`border-r px-2 py-2 text-center last:border-r-0 ${
                              isRestDay(day) ? 'border-[#E9E3D7] bg-[#FAF6EE]' : 'border-[#EEF2F6]'
                            }`}
                          >
                            <p className={`text-[10px] uppercase tracking-[0.18em] ${isRestDay(day) ? 'text-[#B45309]' : 'text-[#A3A3A3]'}`}>
                              {draftGantt.zoom === 'day' ? formatDate(day, { weekday: 'short' }) : formatWeekLabel(day)}
                            </p>
                            <p className={`mt-1 text-sm font-medium ${isRestDay(day) ? 'text-[#92400E]' : 'text-[#171717]'}`}>
                              {draftGantt.zoom === 'day' ? formatNumber(day.getDate()) : index % 7 === 0 ? formatDate(day, { month: 'short', day: 'numeric' }) : ''}
                            </p>
                            {isRestDay(day) ? (
                              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#C2410C]">
                                {t('ganttEditor.restDay')}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {visibleTasks.map((task) => {
                        const offsetDays = getTaskOffsetDays(task, timelineStart);
                        const spanDays = getTaskCalendarSpanDays(task);
                        const resource = draftGantt.resources.find((entry) => entry.id === task.resourceId) ?? null;
                        const barColor = resource?.color ?? '#D93A3A';
                        const barWidth = task.milestone ? 20 : Math.max(spanDays * dayWidth - 12, 28);
                        const barLeft = task.milestone
                          ? offsetDays * dayWidth + (dayWidth / 2) - 10
                          : offsetDays * dayWidth + 6;
                        const isHighlighted = task.id === highlightedTaskId;
                        const isManaged = task.id === managedTaskId;

                        return (
                          <div key={task.id}>
                            <div
                              className={`relative h-14 border-b border-[#EEF2F6] ${isManaged ? 'border-b-transparent' : ''} ${isHighlighted ? 'bg-[#FFF7F7]' : 'bg-white'
                                }`}
                            >
                              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${dayWidth}px, 1fr))` }}>
                                {timelineDays.map((day) => (
                                  <div
                                    key={`${task.id}-${day.toISOString()}`}
                                    className={`border-r last:border-r-0 ${isRestDay(day) ? 'border-[#EEE5D6] bg-[#FCFAF5]' : 'border-[#F1F5F9]'}`}
                                  />
                                ))}
                              </div>

                              <div
                                className={`absolute top-1/2 flex -translate-y-1/2 items-center ${task.milestone ? 'justify-center' : 'rounded-full px-3'
                                  } ${dragState?.taskId === task.id ? 'shadow-lg' : 'shadow-sm'} cursor-pointer`}
                                style={{
                                  left: `${barLeft}px`,
                                  width: `${barWidth}px`,
                                  height: task.milestone ? '20px' : '28px',
                                  backgroundColor: task.milestone ? 'transparent' : barColor,
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setHighlightedTaskId(task.id);
                                  setTimelineSelectedTaskId(task.id);
                                }}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setHighlightedTaskId(task.id);
                                  setTimelineSelectedTaskId(task.id);
                                  setDragState({
                                    taskId: task.id,
                                    mode: 'move',
                                    startX: event.clientX,
                                    originalTask: task,
                                    baseTasks: orderedTasks,
                                    lastDeltaDays: 0,
                                  });
                                }}
                              >
                                {task.milestone ? (
                                  <div
                                    className="h-4 w-4 rotate-45 rounded-[4px] border-2 border-white"
                                    style={{ backgroundColor: barColor }}
                                  />
                                ) : (
                                  <>
                                    <span
                                      className="absolute left-1 top-1/2 h-4 w-2 -translate-y-1/2 cursor-ew-resize rounded-full bg-white/80"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setHighlightedTaskId(task.id);
                                        setTimelineSelectedTaskId(task.id);
                                        setDragState({
                                          taskId: task.id,
                                          mode: 'resize-start',
                                          startX: event.clientX,
                                          originalTask: task,
                                          baseTasks: orderedTasks,
                                          lastDeltaDays: 0,
                                        });
                                      }}
                                    />
                                    <span className="max-w-full truncate px-3 text-xs font-semibold text-white">
                                      {task.name}
                                    </span>
                                    <span
                                      className="absolute right-1 top-1/2 h-4 w-2 -translate-y-1/2 cursor-ew-resize rounded-full bg-white/80"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setHighlightedTaskId(task.id);
                                        setTimelineSelectedTaskId(task.id);
                                        setDragState({
                                          taskId: task.id,
                                          mode: 'resize-end',
                                          startX: event.clientX,
                                          originalTask: task,
                                          baseTasks: orderedTasks,
                                          lastDeltaDays: 0,
                                        });
                                      }}
                                    />
                                  </>
                                )}
                              </div>
                            </div>

                            {isManaged ? (
                              <div className="pb-3">
                                <div
                                  className="h-[72px] border border-[#E8E0D2] bg-[#FAF6EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                                  style={{
                                    borderTopWidth: 0,
                                    borderBottomRightRadius: 18,
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {fillerRows.map((row) => (
                        <div
                          key={`timeline-filler-${row}`}
                          className={`relative h-14 border-b border-[#EEF2F6] transition-colors ${isRootTaskDropTarget ? 'bg-[#FFF1F1]' : 'bg-white hover:bg-[#FAFAFA]'}`}
                          onMouseDown={handleEmptyRowMouseDown}
                          onClick={handleEmptyRowClick}
                        >
                          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${timelineDays.length}, minmax(${dayWidth}px, 1fr))` }}>
                            {timelineDays.map((day) => (
                              <div
                                key={`timeline-filler-${row}-${day.toISOString()}`}
                                className={`border-r last:border-r-0 ${isRestDay(day) ? 'border-[#EEE5D6] bg-[#FCFAF5]' : 'border-[#F1F5F9]'}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}

                      {selectedTask && selectedTaskBubble ? (
                        <div
                          className="pointer-events-none absolute z-[80]"
                          style={{
                            left: selectedTaskBubble.bubbleLeft,
                            top: selectedTaskBubble.top,
                            width: taskBubbleWidth,
                            transform: selectedTaskBubble.placeAbove ? 'translateY(-100%)' : undefined,
                          }}
                        >
                          <div
                            className="pointer-events-auto rounded-2xl border border-[#F4D9D9] bg-white/95 p-4 shadow-[0_18px_42px_rgba(23,23,23,0.16)] backdrop-blur"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D93A3A]">
                                  {t('ganttEditor.selectedTask')}
                                </p>
                                <p className="mt-2 truncate text-sm font-semibold text-[#171717]">{selectedTask.name}</p>
                                <p className="mt-1 text-xs text-[#737373]">
                                  {formatDate(selectedTask.startDate, { month: 'short', day: 'numeric', year: 'numeric' })} - {formatDate(selectedTask.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTimelineSelectedTaskId(null);
                                }}
                                className="shrink-0 rounded-full border border-[#E5E7EB] px-2 py-1 text-[11px] font-medium text-[#737373] transition-colors hover:border-[#D4D4D4] hover:text-[#171717]"
                              >
                                {t('ganttEditor.close')}
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-xl bg-[#F8FAFC] p-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[#A3A3A3]">{t('manager.progress')}</p>
                                <p className="mt-1 text-sm font-semibold text-[#171717]">{formatNumber(getTaskProgress(selectedTask))}%</p>
                              </div>
                              <div className="rounded-xl bg-[#F8FAFC] p-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[#A3A3A3]">{t('manager.status')}</p>
                                <p className="mt-1 text-sm font-semibold capitalize text-[#171717]">
                                  {formatStatusLabel(selectedTask.status)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#EEF2F6] px-3 py-2 text-xs text-[#525252]">
                              <span>{selectedTaskResource?.name ?? t('manager.unassigned')}</span>
                              <span
                                className="rounded-full px-2 py-1 text-[11px] font-medium"
                                style={{ backgroundColor: `${selectedTaskBubble.barColor}1A`, color: selectedTaskBubble.barColor }}
                              >
                                {taskHierarchy.get(selectedTask.id)?.label ?? formatNumber(selectedTaskIndex + 1)}
                              </span>
                            </div>
                          </div>
                          <div
                            className="absolute h-3 w-3 rotate-45 border-[#F4D9D9] bg-white"
                            style={{
                              left: selectedTaskBubble.pointerLeft - 6,
                              top: selectedTaskBubble.placeAbove ? undefined : -6,
                              bottom: selectedTaskBubble.placeAbove ? -6 : undefined,
                              borderStyle: 'solid',
                              borderLeftWidth: 1,
                              borderTopWidth: 1,
                              borderRightWidth: selectedTaskBubble.placeAbove ? 1 : 0,
                              borderBottomWidth: selectedTaskBubble.placeAbove ? 0 : 1,
                            }}
                          />
                        </div>
                      ) : null}

                    </div>
                  </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
