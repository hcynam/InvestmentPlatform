import type { Project } from "@/lib/types";

export const PROJECTS_STORAGE_KEY = "iran-investment-platform.projects.v3";
export const LEGACY_PROJECT_STORAGE_KEY = "iran-investment-platform.project.v2";
export const KNOWN_DEMO_PROJECT_ID = "solar-kerman";

export type ProjectStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isProject = (value: unknown): value is Project => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Project>;
  return typeof candidate.id === "string"
    && typeof candidate.projectId === "string"
    && typeof candidate.name === "string"
    && Array.isArray(candidate.scenarios);
};

export const isKnownDemoProject = (project: Pick<Project, "id" | "projectId">) =>
  project.id === KNOWN_DEMO_PROJECT_ID && project.projectId === KNOWN_DEMO_PROJECT_ID;

const parseProjectArray = (raw: string | null): Project[] | null => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every(isProject) ? parsed : null;
  } catch {
    return null;
  }
};

const parseLegacyProject = (raw: string | null): Project | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const loadProjects = (storage: ProjectStorage): Project[] => {
  const storedProjects = parseProjectArray(storage.getItem(PROJECTS_STORAGE_KEY));
  const projects = storedProjects ?? [];
  const withoutDemo = projects.filter((project) => !isKnownDemoProject(project));

  if (storedProjects && withoutDemo.length !== projects.length) {
    storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(withoutDemo));
  }

  const legacyRaw = storage.getItem(LEGACY_PROJECT_STORAGE_KEY);
  const legacyProject = parseLegacyProject(legacyRaw);
  if (!legacyRaw || !legacyProject) return withoutDemo;

  if (isKnownDemoProject(legacyProject)) {
    storage.removeItem(LEGACY_PROJECT_STORAGE_KEY);
    return withoutDemo;
  }

  const migrated = withoutDemo.some((project) => project.id === legacyProject.id)
    ? withoutDemo
    : [...withoutDemo, legacyProject];
  storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(migrated));
  storage.removeItem(LEGACY_PROJECT_STORAGE_KEY);
  return migrated;
};

export const saveProject = (storage: ProjectStorage, project: Project) => {
  if (isKnownDemoProject(project)) return;
  const projects = loadProjects(storage);
  const index = projects.findIndex((candidate) => candidate.id === project.id);
  const next = [...projects];
  if (index >= 0) next[index] = project;
  else next.push(project);
  storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
};
