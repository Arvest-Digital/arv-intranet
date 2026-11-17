export { type ClosingImpact, ProjectClosingHook } from './application/ports';
export { type ProjectInfo, ProjectsApi } from './application/projects-api';
export type { ClosingAllocation, ClosingEmployee } from './domain/errors';
export { isOpenOn, type ProjectType } from './domain/project';
export { MANAGE_PROJECTS, projectsPermissions } from './permissions';
