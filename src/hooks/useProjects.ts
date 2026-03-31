import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../lib/pocketbase/projects';
import { normalizeProjectGantt } from '../lib/gantt';
import type { Project, ProjectFormData, ProjectStatus } from '../types/project';
import type { ProjectGantt } from '../types/gantt';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Initial fetch
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    fetchProjects()
      .then((data) => {
        if (!cancelled) {
          setProjects(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load projects';
          console.error('useProjects fetch error:', err);
          setError(message);
          toast.error(`Projects: ${message}`);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Add
  // -------------------------------------------------------------------------
  const addProject = useCallback(async (data: ProjectFormData, gantt?: ProjectGantt): Promise<Project | null> => {
    try {
      const newProject = await createProject(data, gantt);
      setProjects((prev) => [newProject, ...prev]);
      return newProject;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      console.error('addProject error:', err);
      toast.error(message);
      return null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Update metadata
  // -------------------------------------------------------------------------
  const updateProjectData = useCallback(async (id: string, data: ProjectFormData): Promise<Project | null> => {
    try {
      const updated = await updateProject(id, data);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update project';
      console.error('updateProject error:', err);
      toast.error(message);
      return null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  const deleteProjectById = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      console.error('deleteProject error:', err);
      toast.error(message);
      return false;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Gantt visibility
  // -------------------------------------------------------------------------
  const setProjectGanttVisibility = useCallback(async (id: string, isVisibleInGantt: boolean): Promise<Project | null> => {
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isVisibleInGantt } : p)),
    );
    try {
      const updated = await updateProject(id, { isVisibleInGantt });
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      // Revert
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isVisibleInGantt: !isVisibleInGantt } : p)),
      );
      const message = err instanceof Error ? err.message : 'Failed to update visibility';
      toast.error(message);
      return null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------
  const updateProjectStatus = useCallback(async (id: string, status: ProjectStatus): Promise<Project | null> => {
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p)),
    );
    try {
      const updated = await updateProject(id, { status });
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(message);
      return null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Gantt data
  // -------------------------------------------------------------------------
  const updateProjectGantt = useCallback(async (id: string, gantt: ProjectGantt): Promise<Project | null> => {
    const normalizedGantt = normalizeProjectGantt(gantt);
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, gantt: normalizedGantt } : p)),
    );
    try {
      const updated = await updateProject(id, { gantt: normalizedGantt });
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Gantt data';
      toast.error(message);
      return null;
    }
  }, []);

  return {
    projects,
    isLoading,
    error,
    addProject,
    updateProject: updateProjectData,
    deleteProject: deleteProjectById,
    setProjectGanttVisibility,
    updateProjectStatus,
    updateProjectGantt,
  };
}
