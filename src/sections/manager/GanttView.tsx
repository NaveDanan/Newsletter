import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar01Icon, Edit02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useProjects } from '../../hooks/useProjects';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

interface GanttTask {
  id: string;
  name: string;
  track: string;
  startWeek: number;
  duration: number;
  status: 'completed' | 'in-progress' | 'pending' | 'delayed';
  owner: string;
}

const tracks = ['Draft', 'Review', 'Design', 'Publish'];

const tasks: GanttTask[] = [
  { id: '1', name: 'AI Trends Research', track: 'Draft', startWeek: 1, duration: 2, status: 'completed', owner: 'Alex' },
  { id: '2', name: 'Content Outline', track: 'Draft', startWeek: 2, duration: 1, status: 'completed', owner: 'Sarah' },
  { id: '3', name: 'Editorial Review', track: 'Review', startWeek: 3, duration: 1, status: 'in-progress', owner: 'Marcus' },
  { id: '4', name: 'Visual Assets', track: 'Design', startWeek: 3, duration: 2, status: 'in-progress', owner: 'Lisa' },
  { id: '5', name: 'Newsletter Layout', track: 'Design', startWeek: 4, duration: 1, status: 'pending', owner: 'Emily' },
  { id: '6', name: 'Issue #45 Publish', track: 'Publish', startWeek: 5, duration: 1, status: 'delayed', owner: 'Alex' },
  { id: '7', name: 'Multimodal Deep Dive', track: 'Draft', startWeek: 4, duration: 2, status: 'pending', owner: 'David' },
  { id: '8', name: 'Policy Analysis', track: 'Draft', startWeek: 5, duration: 2, status: 'pending', owner: 'Sarah' },
  { id: '9', name: 'Fact Check', track: 'Review', startWeek: 6, duration: 1, status: 'pending', owner: 'Marcus' },
  { id: '10', name: 'Social Media Kit', track: 'Design', startWeek: 6, duration: 1, status: 'delayed', owner: 'Lisa' },
];

const weeks = Array.from({ length: 6 }, (_, i) => `Week ${i + 1}`);
const statusOrder: GanttTask['status'][] = ['pending', 'in-progress', 'completed', 'delayed'];

export function GanttView() {
  const [currentWeek, setCurrentWeek] = useState(0);
  const [activeStatuses, setActiveStatuses] = useState<GanttTask['status'][]>([]);
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
    department: '',
    devision: '',
    field: '',
    title: '',
    description: '',
  });
  const { projects, updateProject, setProjectGanttVisibility } = useProjects();

  const visibleProjects = useMemo(
    () => projects.filter((project) => project.isVisibleInGantt),
    [projects],
  );

  const getStatusColor = (status: GanttTask['status']) => {
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
  };

  const getStatusBadge = (status: GanttTask['status']) => {
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
  };

  const getLegendClasses = (status: GanttTask['status'], isActive: boolean) => {
    if (!isActive) {
      return 'border-[#E5E5E5] bg-white text-[#737373] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]';
    }

    switch (status) {
      case 'completed':
        return 'border-green-300 bg-green-500/15 text-green-700 shadow-[0_0_0_1px_rgba(34,197,94,0.18)]';
      case 'in-progress':
        return 'border-[#D93A3A]/40 bg-[#D93A3A]/15 text-[#B42323] shadow-[0_0_0_1px_rgba(217,58,58,0.16)]';
      case 'pending':
        return 'border-[#CFCFCF] bg-[#E5E5E5]/70 text-[#525252] shadow-[0_0_0_1px_rgba(212,212,212,0.28)]';
      case 'delayed':
        return 'border-yellow-300 bg-yellow-400/20 text-yellow-800 shadow-[0_0_0_1px_rgba(234,179,8,0.18)]';
    }
  };

  const getTaskPosition = (task: GanttTask) => {
    const cellWidth = 100 / 6;
    const left = (task.startWeek - 1) * cellWidth;
    const width = task.duration * cellWidth;
    return { left: `${left}%`, width: `${width}%` };
  };

  const visibleTasks = useMemo(() => {
    if (activeStatuses.length === 0) {
      return tasks;
    }

    return tasks.filter((task) => activeStatuses.includes(task.status));
  }, [activeStatuses]);

  const toggleStatusFilter = (status: GanttTask['status']) => {
    setActiveStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  };

  const handleToggleProjectVisibility = (projectId: string, isVisibleInGantt: boolean) => {
    setProjectGanttVisibility(projectId, !isVisibleInGantt);
  };

  const handleEditProject = (projectId: string) => {
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) {
      return;
    }

    setProjectForm({
      department: project.department,
      devision: project.devision,
      field: project.field,
      title: project.title,
      description: project.description,
    });
    setEditingProjectId(project.id);
  };

  const handleCloseEditDialog = () => {
    setEditingProjectId(null);
    setProjectForm({
      department: '',
      devision: '',
      field: '',
      title: '',
      description: '',
    });
  };

  const handleSaveProject = () => {
    if (!editingProjectId) {
      return;
    }

    if (!projectForm.department || !projectForm.devision || !projectForm.field || !projectForm.title) {
      toast.error('Please fill in all required fields');
      return;
    }

    updateProject(editingProjectId, projectForm);
    handleCloseEditDialog();
    toast.success('Project updated successfully');
  };

  return (
    <div className="space-y-6">
      <Dialog open={Boolean(editingProjectId)} onOpenChange={(open) => {
        if (!open) {
          handleCloseEditDialog();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the selected project from the Gantt manager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#737373] mb-1 block">Title *</label>
              <input
                type="text"
                value={projectForm.title}
                onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })}
                placeholder="Enter project title"
              />
            </div>
            <div>
              <label className="text-sm text-[#737373] mb-1 block">Devision *</label>
              <input
                type="text"
                value={projectForm.devision}
                onChange={(event) => setProjectForm({ ...projectForm, devision: event.target.value })}
                placeholder="Enter devision"
              />
            </div>
            <div>
              <label className="text-sm text-[#737373] mb-1 block">Field *</label>
              <input
                type="text"
                value={projectForm.field}
                onChange={(event) => setProjectForm({ ...projectForm, field: event.target.value })}
                placeholder="Enter field"
              />
            </div>
            <div>
              <label className="text-sm text-[#737373] mb-1 block">Department *</label>
              <input
                type="text"
                value={projectForm.department}
                onChange={(event) => setProjectForm({ ...projectForm, department: event.target.value })}
                placeholder="Enter department"
              />
            </div>
            <div>
              <label className="text-sm text-[#737373] mb-1 block">Description</label>
              <textarea
                value={projectForm.description}
                onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                placeholder="Enter description"
                rows={3}
                className="w-full"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCloseEditDialog}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProject}
                className="flex-1 btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Gantts</DialogTitle>
            <DialogDescription>Show or hide projects from the Gantt page, or edit them directly from here.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-[#E5E5E5]">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#737373]">No projects available yet.</div>
            ) : (
              <div className="divide-y divide-[#E5E5E5]">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group flex items-start justify-between gap-4 p-4 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-[#171717]">{project.title}</h4>
                        <span className="text-xs px-2 py-1 rounded-full bg-[#F3F4F6] text-[#737373]">
                          {project.department}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#737373] line-clamp-2">
                        {project.description || 'No description'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleToggleProjectVisibility(project.id, project.isVisibleInGantt)}
                        className={`p-2 rounded-lg transition-colors ${
                          project.isVisibleInGantt
                            ? 'text-[#D93A3A] hover:bg-[#D93A3A]/10'
                            : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
                        }`}
                        title={project.isVisibleInGantt ? 'Hide project from Gantt page' : 'Show project on Gantt page'}
                      >
                        <HugeiconsIcon icon={project.isVisibleInGantt ? ViewOffIcon : ViewIcon} className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditProject(project.id)}
                        className="p-2 rounded-lg text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717] transition-colors"
                        title="Edit"
                      >
                        <HugeiconsIcon icon={Edit02Icon} className="w-4 h-4" />
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
          <p className="text-sm text-[#737373]">Manage which projects are currently shown on the Gantt page.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowManageModal(true)}
          className="btn-secondary"
        >
          Manage Gantts
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {visibleProjects.length === 0 ? (
          <span className="text-sm text-[#737373]">No projects are visible in Gantt right now.</span>
        ) : (
          visibleProjects.map((project) => (
            <span
              key={project.id}
              className="inline-flex items-center rounded-full border border-[#E5E5E5] bg-white px-3 py-1 text-xs text-[#525252]"
            >
              {project.title}
            </span>
          ))
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#171717]">Content Timeline</h2>
          <p className="text-sm text-[#737373]">6-week publishing schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentWeek(Math.max(0, currentWeek - 1))}
            className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E5E5] rounded-lg">
            <HugeiconsIcon icon={Calendar01Icon} className="w-4 h-4 text-[#D93A3A]" />
            <span className="text-sm text-[#171717]">Jul - Aug 2024</span>
          </div>
          <button
            onClick={() => setCurrentWeek(Math.min(4, currentWeek + 1))}
            className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[180px_1fr] border-b border-[#E5E5E5]">
          <div className="p-4 border-r border-[#E5E5E5]">
            <span className="text-xs font-medium text-[#737373] uppercase tracking-wider">Project</span>
          </div>
          <div className="grid grid-cols-6">
            {weeks.map((week, i) => (
              <div
                key={week}
                className={`p-4 text-center border-r border-[#E5E5E5] last:border-r-0 ${
                  i === currentWeek ? 'bg-[#D93A3A]/5' : ''
                }`}
              >
                <span className={`text-sm ${i === currentWeek ? 'text-[#D93A3A] font-medium' : 'text-[#737373]'}`}>
                  {week}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-[#E5E5E5]">
          {tracks.map((track) => {
            const trackTasks = visibleTasks.filter((task) => task.track === track);

            return (
              <div key={track} className="grid grid-cols-[180px_1fr]">
                <div className="p-4 border-r border-[#E5E5E5] bg-[#F9FAFB]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#D93A3A]" />
                    <span className="font-medium text-[#171717]">{track}</span>
                  </div>
                </div>

                <div className="relative grid grid-cols-6">
                  {weeks.map((week, i) => (
                    <div
                      key={week}
                      className={`border-r border-[#E5E5E5] last:border-r-0 ${
                        i === currentWeek ? 'bg-[#D93A3A]/5' : ''
                      }`}
                    />
                  ))}

                  <div className="absolute inset-0 py-2">
                    {trackTasks.map((task) => (
                      <div
                        key={task.id}
                        className="absolute h-5 mx-1 rounded cursor-pointer group"
                        style={{
                          ...getTaskPosition(task),
                          top: '10px',
                        }}
                      >
                        <div
                          className={`h-full rounded ${getStatusColor(task.status)} opacity-80 group-hover:opacity-100 transition-opacity`}
                        />
                        <div className="absolute inset-0 flex items-center px-2">
                          <span className="text-xs text-white font-medium truncate">
                            {task.name}
                          </span>
                        </div>

                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                          <div className="bg-white border border-[#E5E5E5] rounded-lg shadow-lg p-3 min-w-[180px]">
                            <p className="font-medium text-[#171717] mb-1">{task.name}</p>
                            <p className="text-xs text-[#737373]">Owner: {task.owner}</p>
                            <p className="text-xs text-[#737373]">Status: {task.status}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {statusOrder.map((status) => {
          const isActive = activeStatuses.includes(status);

          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatusFilter(status)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${getLegendClasses(status, isActive)}`}
            >
              <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`} />
              <span className="capitalize">{status.replace('-', ' ')}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5]">
          <h3 className="font-bold text-[#171717]">Task Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E5E5]">
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Project</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Track</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Owner</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Start</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Duration</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {visibleTasks.map((task) => (
                <tr key={task.id} className="hover:bg-[#F9FAFB]">
                  <td className="py-3 px-4 text-[#171717]">{task.name}</td>
                  <td className="py-3 px-4 text-[#737373]">{task.track}</td>
                  <td className="py-3 px-4 text-[#737373]">{task.owner}</td>
                  <td className="py-3 px-4 text-[#737373]">Week {task.startWeek}</td>
                  <td className="py-3 px-4 text-[#737373]">{task.duration} week(s)</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusBadge(task.status)}`}>
                      {task.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
