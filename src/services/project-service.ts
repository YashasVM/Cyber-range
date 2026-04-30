import { cp } from "node:fs/promises";
import type { AppConfig } from "../config";
import type { Project, UploadedFile } from "../domain/types";
import { validateUploadFiles } from "../security/upload-policy";
import { makeId, nowIso } from "../utils/ids";
import { FileStore } from "../storage/store";

export type CreateProjectInput = {
  name: string;
  company?: string;
  files: UploadedFile[];
};

export class ProjectService {
  constructor(
    private readonly store: FileStore,
    private readonly config: AppConfig
  ) {}

  async createProject(input: CreateProjectInput): Promise<Project> {
    if (!input.name || input.name.length > 120) {
      throw new Error("Project name is required and must be 120 characters or fewer");
    }

    const files = validateUploadFiles(input.files, this.config.maxUploadBytes);
    const projectId = makeId("project");
    const sizeBytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
    const project: Project = {
      projectId,
      name: input.name,
      company: input.company,
      createdAt: nowIso(),
      rootPath: this.store.projectSourcePath(projectId),
      fileCount: files.length,
      sizeBytes
    };

    await this.store.createProject(project, files);
    return project;
  }

  async copyProjectToSession(project: Project, sessionWorkspace: string): Promise<void> {
    await cp(project.rootPath, sessionWorkspace, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  }
}
