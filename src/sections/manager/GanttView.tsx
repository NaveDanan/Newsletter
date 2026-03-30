import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar01Icon, Edit02Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import { getProjectProgress, getTaskCalendarSpanDays, getTaskOffsetDays, getTimelineDays } from '../../lib/gantt';
import type { GanttTask } from '../../types/gantt';
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

export function GanttView({ onEditProjectGantt }: GanttViewProps) {
  const [activeStatuses, setActiveStatuses] = useState<GanttTask['status'][]>([]);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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
  const timelineStart = previewTimelineDays[0] ?? new Date();
  const dayWidth = 30;
  const timelineWidth = Math.max(previewTimelineDays.length * dayWidth, 640);
  const selectedProjectProgress = getProjectProgress(selectedProject?.gantt.tasks ?? []);

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

  return (
    <div className="space-y-6">
      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Gantts</DialogTitle>
            <DialogDescription>
              Show or hide projects on the overview and jump into the dedicated schedule editor.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[480px] overflow-y-auto rounded-2xl border border-[#E5E5E5]">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#737373]">No projects available yet.</div>
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
                          {project.gantt.tasks.length} tasks
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-[#737373]">
                        {project.description || 'No description'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setProjectGanttVisibility(project.id, !project.isVisibleInGantt)}
                        className={`rounded-lg p-2 transition-colors ${
                          project.isVisibleInGantt
                            ? 'text-[#D93A3A] hover:bg-[#D93A3A]/10'
                            : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
                        }`}
                        title={project.isVisibleInGantt ? 'Hide from Gantt overview' : 'Show on Gantt overview'}
                      >
                        <HugeiconsIcon icon={project.isVisibleInGantt ? ViewOffIcon : ViewIcon} className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditor(project.id)}
                        className="rounded-lg p-2 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
                        title="Edit schedule"
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
          <h2 className="text-lg font-bold text-[#171717]">Gantt Projects</h2>
          <p className="text-sm text-[#737373]">
            Pick a visible project to preview its saved schedule, or manage which projects appear here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManageModal(true)}
          className="btn-secondary"
        >
          Manage Gantts
        </button>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#D4D4D8] bg-white px-6 py-14 text-center">
          <div className="mx-auto inline-flex rounded-full bg-[#FEF2F2] p-4 text-[#D93A3A]">
            <HugeiconsIcon icon={Calendar01Icon} className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-[#171717]">No visible Gantt projects</h3>
          <p className="mt-2 text-sm text-[#737373]">
            Use Manage Gantts to make one or more projects visible on the overview.
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
              >
                {project.title}
              </button>
            ))}
          </div>

          {selectedProject ? (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
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
              </div>

              {selectedProject.gantt.tasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#D4D4D8] bg-white px-6 py-14 text-center">
                  <h3 className="text-xl font-semibold text-[#171717]">This project has no schedule yet</h3>
                  <p className="mt-2 text-sm text-[#737373]">
                    Open the editor to add tasks, dependencies, resources, and timeline bars.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(selectedProject.id)}
                    className="btn-primary mt-6 inline-flex items-center gap-2"
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="h-4 w-4" />
                    Create Schedule
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
                          {status.replace('-', ' ')}
                        </button>
                      );
                    })}
                  </div>

                  {filteredTasks.length === 0 ? (
                    <div className="rounded-3xl border border-[#E5E5E5] bg-white px-6 py-10 text-center text-sm text-[#737373]">
                      No tasks match the current status filters.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-3xl border border-[#E5E5E5] bg-white">
                      <div className="grid grid-cols-[320px_minmax(0,1fr)]">
                        <div className="border-r border-[#E5E5E5]">
                          <div className="grid h-14 grid-cols-[52px_minmax(0,1fr)_92px] border-b border-[#E5E5E5] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.18em] text-[#737373]">
                            <div className="flex items-center justify-center border-r border-[#E5E5E5]">#</div>
                            <div className="flex items-center border-r border-[#E5E5E5] px-4">Task</div>
                            <div className="flex items-center px-4">Status</div>
                          </div>
                          {filteredTasks.map((task) => {
                            const resource = selectedProject.gantt.resources.find((entry) => entry.id === task.resourceId);

                            return (
                              <div key={task.id} className="grid h-14 grid-cols-[52px_minmax(0,1fr)_92px] border-b border-[#E5E5E5] last:border-b-0">
                                <div className="flex items-center justify-center border-r border-[#E5E5E5] text-xs font-semibold text-[#525252]">
                                  {selectedProject.gantt.tasks.findIndex((entry) => entry.id === task.id) + 1}
                                </div>
                                <div className="border-r border-[#E5E5E5] px-4 py-3">
                                  <p className="truncate text-sm font-medium text-[#171717]">{task.name}</p>
                                  <p className="truncate text-xs text-[#737373]">{resource?.name ?? 'Unassigned'}</p>
                                </div>
                                <div className="flex items-center px-3">
                                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${getStatusBadge(task.status)}`}>
                                    {task.status.replace('-', ' ')}
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
