import { useCallback, useEffect, useState } from 'react';
import { readStoredValue, writeStoredValue } from '../lib/localStorage';
import type { Project, ProjectFormData, ProjectStatus } from '../types/project';

const STORAGE_KEY = 'pulse_ai_projects';

function normalizeProject(rawProject: unknown, index: number): Project | null {
  if (!rawProject || typeof rawProject !== 'object') {
    return null;
  }

  const candidate = rawProject as Partial<Project> & { owner?: string };

  return {
    id: typeof candidate.id === 'string' && candidate.id
      ? candidate.id
      : `${Date.now()}-${index}`,
    department: typeof candidate.department === 'string' && candidate.department.trim()
      ? candidate.department.trim()
      : typeof candidate.owner === 'string' && candidate.owner.trim()
        ? candidate.owner.trim()
        : 'Unassigned',
    devision: typeof candidate.devision === 'string' ? candidate.devision : '',
    field: typeof candidate.field === 'string' ? candidate.field : '',
    title: typeof candidate.title === 'string' ? candidate.title : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    status: candidate.status ?? 'pending',
    isVisibleInGantt: typeof candidate.isVisibleInGantt === 'boolean' ? candidate.isVisibleInGantt : true,
  };
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storedProjects = readStoredValue<unknown[]>(STORAGE_KEY, []);
    setProjects(storedProjects.map(normalizeProject).filter((project): project is Project => project !== null));
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    writeStoredValue(STORAGE_KEY, projects);
  }, [isLoaded, projects]);

  const addProject = useCallback((data: ProjectFormData): Project => {
    const newProject: Project = {
      id: Date.now().toString(),
      department: data.department,
      devision: data.devision,
      field: data.field,
      title: data.title,
      description: data.description,
      status: 'pending',
      isVisibleInGantt: true,
    };

    setProjects((currentProjects) => [...currentProjects, newProject]);
    return newProject;
  }, []);

  const updateProject = useCallback((id: string, data: ProjectFormData): Project | null => {
    let updatedProject: Project | null = null;

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== id) {
          return project;
        }

        updatedProject = {
          ...project,
          department: data.department,
          devision: data.devision,
          field: data.field,
          title: data.title,
          description: data.description,
        };

        return updatedProject;
      }),
    );

    return updatedProject;
  }, []);

  const deleteProject = useCallback((id: string): boolean => {
    let found = false;

    setProjects((currentProjects) => {
      const filteredProjects = currentProjects.filter((project) => project.id !== id);
      found = filteredProjects.length !== currentProjects.length;
      return filteredProjects;
    });

    return found;
  }, []);

  const setProjectGanttVisibility = useCallback((id: string, isVisibleInGantt: boolean): Project | null => {
    let updatedProject: Project | null = null;

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== id) {
          return project;
        }

        updatedProject = { ...project, isVisibleInGantt };
        return updatedProject;
      }),
    );

    return updatedProject;
  }, []);

  const updateProjectStatus = useCallback((id: string, status: ProjectStatus): Project | null => {
    let updatedProject: Project | null = null;

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== id) {
          return project;
        }

        updatedProject = { ...project, status };
        return updatedProject;
      }),
    );

    return updatedProject;
  }, []);

  return {
    projects,
    isLoaded,
    addProject,
    updateProject,
    deleteProject,
    setProjectGanttVisibility,
    updateProjectStatus,
  };
}
