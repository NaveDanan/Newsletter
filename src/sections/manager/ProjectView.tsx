import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Briefcase01Icon, Building02Icon, CheckmarkCircle02Icon, CircleIcon, Clock01Icon, Delete02Icon, Edit02Icon, FolderTreeIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';

export function ProjectView() {
  const { projects, addProject, updateProject, deleteProject, updateProjectStatus } = useProjects();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProject, setNewProject] = useState({ department: '', devision: '', field: '', title: '', description: '' });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const getStatusIcon = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5 text-green-600" />;
      case 'in-progress':
        return <HugeiconsIcon icon={Clock01Icon} className="w-5 h-5 text-[#D93A3A]" />;
      case 'pending':
        return <HugeiconsIcon icon={CircleIcon} className="w-5 h-5 text-[#A3A3A3]" />;
      case 'delayed':
        return <HugeiconsIcon icon={Clock01Icon} className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: Project['status']) => {
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

  const handleAddProject = () => {
    if (!newProject.department || !newProject.devision || !newProject.field || !newProject.title) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (editingProjectId) {
      updateProject(editingProjectId, newProject);
      toast.success('Project updated successfully');
    } else {
      addProject(newProject);
      toast.success('Project added successfully');
    }

    setNewProject({ department: '', devision: '', field: '', title: '', description: '' });
    setEditingProjectId(null);
    setShowAddModal(false);
  };

  const handleDeleteProject = (id: string) => {
    deleteProject(id);
    toast.success('Project deleted');
  };

  const handleEditProject = (project: Project) => {
    setNewProject({
      department: project.department,
      devision: project.devision,
      field: project.field,
      title: project.title,
      description: project.description,
    });
    setEditingProjectId(project.id);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingProjectId(null);
    setNewProject({ department: '', devision: '', field: '', title: '', description: '' });
  };

  const toggleStatus = (id: string) => {
    const project = projects.find((entry) => entry.id === id);
    if (!project) {
      return;
    }

    const statuses: Project['status'][] = ['pending', 'in-progress', 'completed', 'delayed'];
    const currentIndex = statuses.indexOf(project.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];
    updateProjectStatus(id, nextStatus);
  };

  const stats = {
    total: projects.length,
    completed: projects.filter((project) => project.status === 'completed').length,
    inProgress: projects.filter((project) => project.status === 'in-progress').length,
    pending: projects.filter((project) => project.status === 'pending').length,
    delayed: projects.filter((project) => project.status === 'delayed').length

  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}

      <div className="dashboard-card flex flex-col items-center justify-center mx-auto w-fit px-4 py-2 min-w-[340px]">
        <div className="grid grid-cols-5 gap-4 h-5 w-full">
          <p className="text-xs text-[#737373] mb-1 text-center">Total</p>
          <p className="text-xs text-[#737373] mb-1 text-center">Completed</p>
          <p className="text-xs text-[#737373] mb-1 text-center">In Progress</p>
          <p className="text-xs text-[#737373] mb-1 text-center">Pending</p>
          <p className="text-xs text-[#737373] mb-1 text-center">Delayed</p>
        </div>
        <div className="grid grid-cols-5 gap-4 h-5 w-full">
          <p className="text-lg font-bold text-[#171717] text-center">{stats.total}</p>
          <p className="text-lg font-bold text-green-600 text-center">{stats.completed}</p>
          <p className="text-lg font-bold text-[#D93A3A] text-center">{stats.inProgress}</p>
          <p className="text-lg font-bold text-[#A3A3A3] text-center">{stats.pending}</p>
          <p className="text-lg font-bold text-yellow-600 text-center">{stats.delayed}</p>
        </div>
      </div>

      {/* Projects list */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-[#E5E5E5]">
          <button 
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
            Add Project
          </button>
        </div>

        <div className="divide-y divide-[#E5E5E5]">
          {projects.map((project) => (
            <div 
              key={project.id}
              className="flex items-start gap-4 p-4 hover:bg-[#F9FAFB] transition-colors group"
            >
              <button 
                onClick={() => toggleStatus(project.id)}
                className="mt-0.5"
              >
                {getStatusIcon(project.status)}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`font-medium ${project.status === 'completed' ? 'line-through text-[#A3A3A3]' : 'text-[#171717]'}`}>
                      {project.title}
                    </h3>
                    <p className="text-sm text-[#737373] mt-1">{project.description}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditProject(project)}
                      className="p-2 text-[#A3A3A3] hover:text-[#171717]"
                      title="Edit"
                    >
                      <HugeiconsIcon icon={Edit02Icon} className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteProject(project.id)}
                      className="p-2 text-[#A3A3A3] hover:text-red-600"
                      title="Delete"
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 mt-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusBadge(project.status)}`}>
                    {project.status.replace('-', ' ')}
                  </span>
                  <span className="flex items-center gap-1 text-[#737373] text-xs">
                    <HugeiconsIcon icon={Building02Icon} className="w-3 h-3" />
                    {project.department}
                  </span>
                  <span className="flex items-center gap-1 text-[#737373] text-xs">
                    <HugeiconsIcon icon={FolderTreeIcon} className="w-3 h-3" />
                    {project.devision}
                  </span>
                  <span className="flex items-center gap-1 text-[#737373] text-xs">
                    <HugeiconsIcon icon={Briefcase01Icon} className="w-3 h-3" />
                    {project.field}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Project Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-[#171717] mb-4">
              {editingProjectId ? 'Edit Project' : 'Add New Project'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Title *</label>
                <input
                  type="text"
                  value={newProject.title}
                  onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  placeholder="Enter project title"
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Devision *</label>
                <input
                  type="text"
                  value={newProject.devision}
                  onChange={(e) => setNewProject({ ...newProject, devision: e.target.value })}
                  placeholder="Enter devision"
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Field *</label>
                <input
                  type="text"
                  value={newProject.field}
                  onChange={(e) => setNewProject({ ...newProject, field: e.target.value })}
                  placeholder="Enter field"
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Department *</label>
                <input
                  type="text"
                  value={newProject.department}
                  onChange={(e) => setNewProject({ ...newProject, department: e.target.value })}
                  placeholder="Enter department"
                />
              </div>
              

              
              <div>
                <label className="text-sm text-[#737373] mb-1 block">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleCloseModal}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddProject}
                  className="flex-1 btn-primary"
                >
                  {editingProjectId ? 'Save Changes' : 'Add Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
