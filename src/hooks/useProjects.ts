import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  fetchProjects,
  getCachedProjects,
  rememberProjects,
  createProject,
  updateProject,
  deleteProject,
  updateProjectStatusOnly,
} from '../lib/pocketbase/projects';
import { readScope } from '@/lib/pocketbase/read-cache';
import { normalizeProjectGantt } from '../lib/gantt';
import type { Project, ProjectFormData, ProjectStatus } from '../types/project';
import type { ProjectGantt } from '../types/gantt';

export function useProjects() {
  const scope = readScope();
  const [projects, commitProjects] = useState<Project[]>(() => getCachedProjects() ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedProjects());
  const [hasLoaded, setHasLoaded] = useState(() => Boolean(getCachedProjects()));
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const setProjects = useCallback((next: SetStateAction<Project[]>) => {
    if (scope !== readScope()) return;
    generation.current++;
    commitProjects(next);
  }, [scope]);
  const [lastScope, setLastScope] = useState(scope);
  if (lastScope !== scope) {
    const cached = getCachedProjects();
    setLastScope(scope);
    commitProjects(cached ?? []); setIsLoading(!cached);
    setHasLoaded(Boolean(cached)); setError(null);
  }

  // -------------------------------------------------------------------------
  // Initial fetch
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const version = generation.current;

    fetchProjects({ force: true })
      .then((data) => {
        if (!cancelled && scope === readScope() && version === generation.current) {
          setProjects(data);
          setHasLoaded(true);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && scope === readScope() && version === generation.current) {
          const message = err instanceof Error ? err.message : 'Failed to load projects';
          if (err && typeof err === 'object' && 'status' in err && [401, 403, 404].includes(Number(err.status))) { setProjects([]); setHasLoaded(false); }
          console.error('useProjects fetch error:', err);
          setError(message);
          toast.error(`Projects: ${message}`);
        }
      })
      .finally(() => {
        if (!cancelled && scope === readScope()) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, setProjects]);

  useEffect(() => {
    if (hasLoaded && lastScope === scope) rememberProjects(projects);
  }, [hasLoaded, lastScope, projects, scope]);

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
  }, [setProjects]);

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
  }, [setProjects]);

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
  }, [setProjects]);

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
  }, [setProjects]);

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------
  const updateProjectStatus = useCallback(async (id: string, status: ProjectStatus): Promise<Project | null> => {
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p)),
    );
    try {
      const updated = await updateProjectStatusOnly(id, status);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(message);
      return null;
    }
  }, [setProjects]);

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
  }, [setProjects]);

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
