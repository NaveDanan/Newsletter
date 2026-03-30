import { HugeiconsIcon } from "@hugeicons/react";
import { AnalyticsDownIcon, AnalyticsUpIcon, MinusSignIcon, Target01Icon } from "@hugeicons/core-free-icons";
import { useMemo } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { getTaskProgress, getTaskSpanDays } from '@/lib/gantt';
import { parseISO } from 'date-fns';
import type { GanttTask } from '@/types/gantt';

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalStatus = 'ahead' | 'on-track' | 'behind';

interface ComputedGoal {
  id: string;
  projectTitle: string;
  milestoneName: string;
  milestoneDate: string;
  progress: number;        // 0-100, based on task-day completion up to this milestone
  status: GoalStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * For a given milestone task, collect all tasks in the project that end on or
 * before the milestone's start date (i.e. tasks that are "leading up to" it).
 * Then compute progress as:
 *   (sum of completed task-day units) / (sum of all task-day units) * 100
 */
function computeGoalProgress(tasks: GanttTask[], milestone: GanttTask): number {
  const milestoneDate = parseISO(milestone.startDate);

  // Tasks that are scheduled to be done before or on the milestone date,
  // excluding other milestones and the milestone itself.
  const precedingTasks = tasks.filter((t) => {
    if (t.id === milestone.id) return false;
    if (t.milestone) return false;
    const taskEnd = parseISO(t.endDate);
    return taskEnd <= milestoneDate;
  });

  // Include the milestone itself (it contributes 1 day unit)
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

  const milestoneDate = parseISO(milestone.startDate);
  const precedingTasks = tasks.filter((t) => {
    if (t.id === milestone.id) return false;
    if (t.milestone) return false;
    return parseISO(t.endDate) <= milestoneDate;
  });

  if (precedingTasks.some((t) => t.status === 'delayed')) return 'behind';
  if (precedingTasks.length > 0 && precedingTasks.every((t) => t.status === 'completed')) return 'ahead';

  return 'on-track';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalsView() {
  const { projects } = useProjects();

  // ── Build computed goals from every project's milestone tasks ──
  const goals = useMemo<ComputedGoal[]>(() => {
    const result: ComputedGoal[] = [];

    for (const project of projects) {
      const tasks = project.gantt?.tasks ?? [];
      const milestones = tasks.filter((t) => t.milestone);

      for (const ms of milestones) {
        result.push({
          id: `${project.id}-${ms.id}`,
          projectTitle: project.title || project.department,
          milestoneName: ms.name,
          milestoneDate: ms.startDate,
          progress: computeGoalProgress(tasks, ms),
          status: computeGoalStatus(tasks, ms),
        });
      }
    }

    return result;
  }, [projects]);

  // ── Overall Progress ──
  // ((sum of completed MS across projects) / (sum of all MS across projects)) * 100
  const overallProgress = useMemo(() => {
    let completedCount = 0;
    let totalCount = 0;

    for (const project of projects) {
      const tasks = project.gantt?.tasks ?? [];
      const milestones = tasks.filter((t) => t.milestone);
      totalCount += milestones.length;
      completedCount += milestones.filter((t) => t.status === 'completed').length;
    }

    if (totalCount === 0) return 0;
    return Math.round((completedCount / totalCount) * 100);
  }, [projects]);

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

  // ── Empty state ──
  if (goals.length === 0) {
    return (
      <div className="space-y-6">
        <div className="dashboard-card flex flex-col items-center justify-center py-16 text-center">
          <HugeiconsIcon icon={Target01Icon} className="w-12 h-12 text-[#D93A3A]/40 mb-4" />
          <h2 className="text-lg font-bold text-[#171717] mb-1">No Milestones Found</h2>
          <p className="text-sm text-[#737373] max-w-xs">
            Add milestone tasks to your projects in the Gantt editor to track goals here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#171717]">Overall Progress</h2>
            <p className="text-sm text-[#737373]">
              {goals.filter((g) => g.status === 'ahead' && g.progress === 100).length} of{' '}
              {goals.length} milestones completed
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-[#D93A3A]">{overallProgress}%</p>
            <p className="text-sm text-[#737373]">of milestones achieved</p>
          </div>
        </div>
        <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#D93A3A] to-green-600 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
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
                    {goal.status.replace('-', ' ')}
                  </span>
                </div>
              </div>
              {getStatusIcon(goal.status)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">Project</span>
                <span className="font-medium text-[#171717] text-sm truncate max-w-[60%] text-right">
                  {goal.projectTitle}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">Target Date</span>
                <span className="text-sm text-[#171717]">{goal.milestoneDate}</span>
              </div>

              {/* Progress bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[#737373]">Progress</span>
                  <span className="text-[#171717]">{goal.progress}%</span>
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
