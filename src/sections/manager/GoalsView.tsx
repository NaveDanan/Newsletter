import { HugeiconsIcon } from "@hugeicons/react";
import { AnalyticsDownIcon, AnalyticsUpIcon, Clock01Icon, Coins01Icon, MinusSignIcon, Target01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useProjects } from '@/hooks/useProjects';
import { estimateTasksCost, getTaskProgress, getTaskSpanDays } from '@/lib/gantt';
import type { GanttRoleCost } from '@/lib/gantt';
import { parseISO } from 'date-fns';
import type { GanttCurrency, GanttResource, GanttRole, GanttTask } from '@/types/gantt';

// ─── Types ──────────────────────────────────────────────────────────

type GoalStatus = 'ahead' | 'on-track' | 'behind';

interface ComputedGoal {
  id: string;
  projectTitle: string;
  milestoneName: string;
  milestoneDate: string;
  progress: number;        // 0-100, based on task-day completion up to this milestone
  status: GoalStatus;
  manpowerHours: number;          // planned manpower hours to reach this milestone
  remainingManpowerHours: number; // manpower hours still needed to reach this milestone
  costsByCurrency: Partial<Record<GanttCurrency, number>>;
  roleCosts: GanttRoleCost[];
}

const currencySymbols: Record<GanttCurrency, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * For a given milestone task, collect all tasks in the project that end on or
 * before the milestone's start date (i.e. tasks that are "leading up to" it),
 * excluding other milestones and the milestone itself.
 */
function getGoalLeadingTasks(tasks: GanttTask[], milestone: GanttTask): GanttTask[] {
  const milestoneDate = parseISO(milestone.startDate);

  return tasks.filter((t) => {
    if (t.id === milestone.id) return false;
    if (t.milestone) return false;
    return parseISO(t.endDate) <= milestoneDate;
  });
}

/**
 * For a given milestone task, collect all tasks in the project that end on or
 * before the milestone's start date (i.e. tasks that are "leading up to" it).
 * Then compute progress as:
 *   (sum of completed task-day units) / (sum of all task-day units) * 100
 */
function computeGoalProgress(tasks: GanttTask[], milestone: GanttTask): number {
  const precedingTasks = getGoalLeadingTasks(tasks, milestone);

  // Include the milestone itself so its completion state is considered.
  const allRelevantTasks = [...precedingTasks, milestone];

  const totalDays = allRelevantTasks.reduce((sum, t) => sum + getTaskSpanDays(t), 0);
  if (totalDays === 0) return 0;

  const completedDays = allRelevantTasks.reduce(
    (sum, t) => sum + (getTaskSpanDays(t) * getTaskProgress(t)) / 100,
    0,
  );

  return Math.round((completedDays / totalDays) * 100);
}

/**
 * Determine the status badge based on the tasks leading up to the milestone.
 *
 * Logic:
 * - If the milestone itself is 'completed' → 'ahead'
 * - If any task is 'delayed' (and milestone not completed) → 'behind'
 * - If all preceding tasks are 'completed' (milestone still pending) → 'ahead'
 * - Otherwise → 'on-track'
 */
function computeGoalStatus(tasks: GanttTask[], milestone: GanttTask): GoalStatus {
  if (milestone.status === 'completed') return 'ahead';

  const precedingTasks = getGoalLeadingTasks(tasks, milestone);

  if (precedingTasks.some((t) => t.status === 'delayed')) return 'behind';
  if (precedingTasks.length > 0 && precedingTasks.every((t) => t.status === 'completed')) return 'ahead';

  return 'on-track';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalsView() {
  const { formatDate, formatNumber, t } = useLocale();
  const { projects } = useProjects();
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  // ── Projects to include based on the pill selection (empty = all) ──
  const filteredProjects = useMemo(
    () => (selectedProjectIds.length === 0
      ? projects
      : projects.filter((project) => selectedProjectIds.includes(project.id))),
    [projects, selectedProjectIds],
  );

  const toggleProjectFilter = (projectId: string) => {
    setSelectedProjectIds((current) => (
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    ));
  };

  // ── Build computed goals from every selected project's milestone tasks ──
  const goals = useMemo<ComputedGoal[]>(() => {
    const result: ComputedGoal[] = [];

    for (const project of filteredProjects) {
      const tasks = project.gantt?.tasks ?? [];
      const resources: GanttResource[] = project.gantt?.resources ?? [];
      const roles: GanttRole[] = project.gantt?.roles ?? [];
      const milestones = tasks.filter((t) => t.milestone);

      for (const ms of milestones) {
        const leadingTasks = getGoalLeadingTasks(tasks, ms);
        const { manpowerHours, remainingManpowerHours, costsByCurrency, roleCosts } = estimateTasksCost(leadingTasks, resources, roles);

        result.push({
          id: `${project.id}-${ms.id}`,
          projectTitle: project.title || project.department,
          milestoneName: ms.name,
          milestoneDate: ms.startDate,
          progress: computeGoalProgress(tasks, ms),
          status: computeGoalStatus(tasks, ms),
          manpowerHours,
          remainingManpowerHours,
          costsByCurrency,
          roleCosts,
        });
      }
    }

    return result;
  }, [filteredProjects]);

  // ── Overall Progress ──
  // ((sum of completed MS across projects) / (sum of all MS across projects)) * 100
  const overallProgress = useMemo(() => {
    let completedCount = 0;
    let totalCount = 0;

    for (const project of filteredProjects) {
      const tasks = project.gantt?.tasks ?? [];
      const milestones = tasks.filter((t) => t.milestone);
      totalCount += milestones.length;
      completedCount += milestones.filter((t) => t.status === 'completed').length;
    }

    if (totalCount === 0) return 0;
    return Math.round((completedCount / totalCount) * 100);
  }, [filteredProjects]);

  // ── Overall effort & cost across selected projects (all tasks) ──
  const overallEffort = useMemo(() => {
    let totalManpowerHours = 0;
    let usedManpowerHours = 0;
    const totalCostsByCurrency: Partial<Record<GanttCurrency, number>> = {};
    const spentCostsByCurrency: Partial<Record<GanttCurrency, number>> = {};

    for (const project of filteredProjects) {
      const tasks = project.gantt?.tasks ?? [];
      const resources: GanttResource[] = project.gantt?.resources ?? [];
      const roles: GanttRole[] = project.gantt?.roles ?? [];
      const estimate = estimateTasksCost(tasks, resources, roles);

      totalManpowerHours += estimate.manpowerHours;
      usedManpowerHours += estimate.manpowerHours - estimate.remainingManpowerHours;

      for (const [currency, amount] of Object.entries(estimate.costsByCurrency) as [GanttCurrency, number][]) {
        totalCostsByCurrency[currency] = (totalCostsByCurrency[currency] ?? 0) + amount;
      }
      for (const [currency, amount] of Object.entries(estimate.spentCostsByCurrency) as [GanttCurrency, number][]) {
        spentCostsByCurrency[currency] = (spentCostsByCurrency[currency] ?? 0) + amount;
      }
    }

    return { totalManpowerHours, usedManpowerHours, totalCostsByCurrency, spentCostsByCurrency };
  }, [filteredProjects]);

  // ── Badge / icon helpers ──
  const getStatusIcon = (status: GoalStatus) => {
    switch (status) {
      case 'ahead':
        return <HugeiconsIcon icon={AnalyticsUpIcon} className="w-5 h-5 text-green-600" />;
      case 'on-track':
        return <HugeiconsIcon icon={MinusSignIcon} className="w-5 h-5 text-[#D93A3A]" />;
      case 'behind':
        return <HugeiconsIcon icon={AnalyticsDownIcon} className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusBadgeClass = (status: GoalStatus) => {
    switch (status) {
      case 'ahead': return 'bg-green-100 text-green-700';
      case 'on-track': return 'bg-[#D93A3A]/10 text-[#D93A3A]';
      case 'behind': return 'bg-red-100 text-red-700';
    }
  };

  const getProgressBarClass = (status: GoalStatus) => {
    if (status === 'ahead') return 'bg-green-600';
    if (status === 'behind') return 'bg-red-600';
    return 'bg-[#D93A3A]';
  };

  const getStatusLabel = (status: GoalStatus) => {
    switch (status) {
      case 'ahead':
        return t('manager.ahead');
      case 'on-track':
        return t('manager.onTrack');
      case 'behind':
        return t('manager.behind');
    }
  };

  // ── Cost formatting ──
  const formatCost = (costsByCurrency: Partial<Record<GanttCurrency, number>>) => {
    const entries = (Object.entries(costsByCurrency) as [GanttCurrency, number][])
      .filter(([, amount]) => amount > 0);

    if (entries.length === 0) {
      return `${currencySymbols.ILS}${formatNumber(0)}`;
    }

    return entries
      .map(([currency, amount]) => `${currencySymbols[currency]}${formatNumber(Math.round(amount))}`)
      .join(' + ');
  };

  // ── Overall usage percentages ──
  const manpowerUsedPercent = overallEffort.totalManpowerHours > 0
    ? Math.round((overallEffort.usedManpowerHours / overallEffort.totalManpowerHours) * 100)
    : 0;
  const overallTotalCost = Object.values(overallEffort.totalCostsByCurrency).reduce((sum, amount) => sum + (amount ?? 0), 0);
  const overallSpentCost = Object.values(overallEffort.spentCostsByCurrency).reduce((sum, amount) => sum + (amount ?? 0), 0);
  const costSpentPercent = overallTotalCost > 0
    ? Math.round((overallSpentCost / overallTotalCost) * 100)
    : 0;

  // ── Project selector pills ──
  const projectSelector = projects.length > 0 ? (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setSelectedProjectIds([])}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          selectedProjectIds.length === 0
            ? 'border-[#D93A3A] bg-[#FEF2F2] text-[#D93A3A]'
            : 'border-[#E5E5E5] bg-white text-[#525252] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]'
        }`}
      >
        {t('manager.allProjects')}
      </button>
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => toggleProjectFilter(project.id)}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            selectedProjectIds.includes(project.id)
              ? 'border-[#D93A3A] bg-[#FEF2F2] text-[#D93A3A]'
              : 'border-[#E5E5E5] bg-white text-[#525252] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]'
          }`}
          dir="auto"
        >
          {project.title || project.department}
        </button>
      ))}
    </div>
  ) : null;

  // ── Empty state ──
  if (goals.length === 0) {
    return (
      <div className="space-y-6">
        {projectSelector}
        <div className="dashboard-card flex flex-col items-center justify-center py-16 text-center">
          <HugeiconsIcon icon={Target01Icon} className="w-12 h-12 text-[#D93A3A]/40 mb-4" />
          <h2 className="text-lg font-bold text-[#171717] mb-1">{t('manager.noMilestonesFound')}</h2>
          <p className="text-sm text-[#737373] max-w-xs">
            {t('manager.noMilestonesDescription')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {projectSelector}

      {/* Overall Progress */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#171717]">{t('manager.overallProgress')}</h2>
            <p className="text-sm text-[#737373]">
              {t('manager.milestonesCompleted', {
                completed: formatNumber(goals.filter((g) => g.status === 'ahead' && g.progress === 100).length),
                total: formatNumber(goals.length),
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-[#D93A3A]">{formatNumber(overallProgress)}%</p>
            <p className="text-sm text-[#737373]">{t('manager.milestonesAchieved')}</p>
          </div>
        </div>
        <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#D93A3A] to-green-600 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Manpower & cost usage */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Manpower hours used */}
          <div className="rounded-xl bg-[#F8FAFC] px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#737373]">
                <HugeiconsIcon icon={Clock01Icon} className="w-4 h-4" />
                <span className="text-sm">{t('manager.manpowerUsage')}</span>
              </div>
              <span className="text-xs font-medium text-[#525252]">{formatNumber(manpowerUsedPercent)}%</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-[#171717]" dir="ltr">
              {formatNumber(Math.round(overallEffort.usedManpowerHours))}
              <span className="text-[#A3A3A3]"> / {formatNumber(Math.round(overallEffort.totalManpowerHours))} {t('manager.hoursUnit')}</span>
            </p>
            <div className="mt-2 h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D93A3A] transition-all duration-500"
                style={{ width: `${manpowerUsedPercent}%` }}
              />
            </div>
          </div>

          {/* Cost spent */}
          <div className="rounded-xl bg-[#F8FAFC] px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#737373]">
                <HugeiconsIcon icon={Coins01Icon} className="w-4 h-4" />
                <span className="text-sm">{t('manager.costUsage')}</span>
              </div>
              <span className="text-xs font-medium text-[#525252]">{formatNumber(costSpentPercent)}%</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-[#171717] truncate" dir="ltr" title={`${formatCost(overallEffort.spentCostsByCurrency)} / ${formatCost(overallEffort.totalCostsByCurrency)}`}>
              {formatCost(overallEffort.spentCostsByCurrency)}
              <span className="text-[#A3A3A3]"> / {formatCost(overallEffort.totalCostsByCurrency)}</span>
            </p>
            <div className="mt-2 h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D93A3A] transition-all duration-500"
                style={{ width: `${costSpentPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Goals grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {goals.map((goal) => (
          <div key={goal.id} className="dashboard-card group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#D93A3A]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <HugeiconsIcon icon={Target01Icon} className="w-5 h-5 text-[#D93A3A]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-[#171717] truncate">{goal.milestoneName}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadgeClass(goal.status)}`}
                  >
                    {getStatusLabel(goal.status)}
                  </span>
                </div>
              </div>
              {getStatusIcon(goal.status)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">{t('manager.project')}</span>
                <span className="font-medium text-[#171717] text-sm truncate max-w-[60%] text-right">
                  {goal.projectTitle}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">{t('manager.targetDate')}</span>
                <span className="text-sm text-[#171717]">{formatDate(goal.milestoneDate, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>

              {/* Manpower & estimated cost */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[#737373]">
                    <HugeiconsIcon icon={Clock01Icon} className="w-3.5 h-3.5" />
                    <span className="text-xs">{t('manager.manpowerHours')}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#171717]">
                    {formatNumber(Math.round(goal.manpowerHours))} {t('manager.hoursUnit')}
                  </p>
                  {goal.progress < 100 && goal.remainingManpowerHours > 0 ? (
                    <p className="mt-0.5 text-xs font-medium text-[#D93A3A]">
                      {t('manager.manpowerHoursRemaining', {
                        hours: `${formatNumber(Math.round(goal.remainingManpowerHours))} ${t('manager.hoursUnit')}`,
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[#737373]">
                    <HugeiconsIcon icon={Coins01Icon} className="w-3.5 h-3.5" />
                    <span className="text-xs">{t('manager.estimatedCost')}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#171717] truncate" dir="ltr" title={formatCost(goal.costsByCurrency)}>
                    {formatCost(goal.costsByCurrency)}
                  </p>
                  {goal.roleCosts.length > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {goal.roleCosts.map((roleCost) => (
                        <div key={roleCost.roleId} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="min-w-0 truncate text-[#737373]" dir="auto">
                            {roleCost.roleName || t('manager.role')}
                          </span>
                          <span className="shrink-0 font-medium text-[#525252]">{formatNumber(roleCost.percent)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Progress bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[#737373]">{t('manager.progress')}</span>
                  <span className="text-[#171717]">{formatNumber(goal.progress)}%</span>
                </div>
                <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getProgressBarClass(goal.status)} transition-all duration-500`}
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
