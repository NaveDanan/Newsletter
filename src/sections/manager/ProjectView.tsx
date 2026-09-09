import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Briefcase01Icon, Building02Icon, CheckmarkCircle02Icon, CircleIcon, Clock01Icon, Delete02Icon, Edit02Icon, FolderTreeIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';

export function ProjectView() {
  const { formatNumber, t } = useLocale();
  const { projects, addProject, updateProject, deleteProject, updateProjectStatus } = useProjects();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProject, setNewProject] = useState({ department: '', devision: '', field: '', title: '', description: '' });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const getStatusIcon = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5 text-green-600" />;
      case 'in-progress':
        return <HugeiconsIcon icon={Clock01Icon} className="w-5 h-5 text-yellow-600" />;
      case 'pending':
        return <HugeiconsIcon icon={CircleIcon} className="w-5 h-5 text-[#A3A3A3]" />;
      case 'delayed':
        return <HugeiconsIcon icon={Clock01Icon} className="w-5 h-5 text-[#D93A3A]" />;
    }
  };

  const getStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-700';
      case 'pending':
        return 'bg-[#F3F4F6] text-[#737373]';
      case 'delayed':
        return 'bg-red-100 text-red-700';
    }
  };

  const getStatusLabel = (status: Project['status']) => {
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

  const handleAddProject = () => {
    if (!newProject.department || !newProject.devision || !newProject.field || !newProject.title) {
      toast.error(t('manager.requiredFields'));
      return;
    }

    if (editingProjectId) {
      void updateProject(editingProjectId, newProject).then((result) => {
        if (result) toast.success(t('manager.projectUpdated'));
      });
    } else {
      void addProject(newProject).then((result) => {
        if (result) toast.success(t('manager.projectAdded'));
      });
    }

    setNewProject({ department: '', devision: '', field: '', title: '', description: '' });
    setEditingProjectId(null);
    setShowAddModal(false);
  };

  const handleDeleteProject = (id: string) => {
    void deleteProject(id).then((ok) => {
      if (ok) toast.success(t('manager.projectDeleted'));
    });
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
    void updateProjectStatus(id, nextStatus);
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
          <p className="text-xs text-[#737373] mb-1 text-center">{t('manager.total')}</p>
          <p className="text-xs text-[#737373] mb-1 text-center">{t('manager.completed')}</p>
          <p className="text-xs text-[#737373] mb-1 text-center">{t('manager.inProgress')}</p>
          <p className="text-xs text-[#737373] mb-1 text-center">{t('manager.pending')}</p>
          <p className="text-xs text-[#737373] mb-1 text-center">{t('manager.delayed')}</p>
        </div>
        <div className="grid grid-cols-5 gap-4 h-5 w-full">
          <p className="text-lg font-bold text-[#171717] text-center">{formatNumber(stats.total)}</p>
          <p className="text-lg font-bold text-green-600 text-center">{formatNumber(stats.completed)}</p>
          <p className="text-lg font-bold text-yellow-600 text-center">{formatNumber(stats.inProgress)}</p>
          <p className="text-lg font-bold text-[#A3A3A3] text-center">{formatNumber(stats.pending)}</p>
          <p className="text-lg font-bold text-[#D93A3A] text-center">{formatNumber(stats.delayed)}</p>
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
            {t('manager.addProject')}
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
                    <p className="text-sm text-[#737373] mt-1" dir="auto">{project.description || t('manager.noDescription')}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditProject(project)}
                      className="p-2 text-[#A3A3A3] hover:text-[#171717]"
                      title={t('manager.edit')}
                    >
                      <HugeiconsIcon icon={Edit02Icon} className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteProject(project.id)}
                      className="p-2 text-[#A3A3A3] hover:text-red-600"
                      title={t('manager.delete')}
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 mt-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusBadge(project.status)}`}>
                    {getStatusLabel(project.status)}
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
              {editingProjectId ? t('manager.editProject') : t('manager.addNewProject')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#737373] mb-1 block">{t('manager.projectTitle')}</label>
                <input
                  type="text"
                  value={newProject.title}
                  onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  placeholder={t('manager.enterProjectTitle')}
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">{t('manager.division')}</label>
                <input
                  type="text"
                  value={newProject.devision}
                  onChange={(e) => setNewProject({ ...newProject, devision: e.target.value })}
                  placeholder={t('manager.enterDivision')}
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">{t('manager.field')}</label>
                <input
                  type="text"
                  value={newProject.field}
                  onChange={(e) => setNewProject({ ...newProject, field: e.target.value })}
                  placeholder={t('manager.enterField')}
                />
              </div>
              <div>
                <label className="text-sm text-[#737373] mb-1 block">{t('manager.department')}</label>
                <input
                  type="text"
                  value={newProject.department}
                  onChange={(e) => setNewProject({ ...newProject, department: e.target.value })}
                  placeholder={t('manager.enterDepartment')}
                />
              </div>
              

              
              <div>
                <label className="text-sm text-[#737373] mb-1 block">{t('manager.description')}</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder={t('manager.enterDescription')}
                  rows={3}
                  className="w-full"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleCloseModal}
                  className="flex-1 btn-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  onClick={handleAddProject}
                  className="flex-1 btn-primary"
                >
                  {editingProjectId ? t('manager.saveProjectChanges') : t('manager.addProject')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
