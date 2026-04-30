import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AnalysisReport, Project, Session, SessionEvent } from "../domain/types";
import type { ValidatedUpload } from "../security/upload-policy";

export class FileStore {
  constructor(private readonly root: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await mkdir(this.projectsDir(), { recursive: true });
    await mkdir(this.sessionsDir(), { recursive: true });
  }

  async createProject(project: Project, files: ValidatedUpload[]): Promise<void> {
    await mkdir(project.rootPath, { recursive: true });
    for (const file of files) {
      const target = join(project.rootPath, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
    }
    await this.writeJson(this.projectMetaPath(project.projectId), project);
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.readJson<Project>(this.projectMetaPath(projectId));
  }

  async createSession(session: Session): Promise<void> {
    await mkdir(this.sessionPath(session.sessionId), { recursive: true });
    await this.writeJson(this.sessionMetaPath(session.sessionId), session);
  }

  async updateSession(session: Session): Promise<void> {
    await this.writeJson(this.sessionMetaPath(session.sessionId), session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.readJson<Session>(this.sessionMetaPath(sessionId));
  }

  async appendEvent(event: SessionEvent): Promise<void> {
    await appendFile(this.eventsPath(event.sessionId), `${JSON.stringify(event)}\n`);
  }

  async getEvents(sessionId: string): Promise<SessionEvent[]> {
    try {
      const raw = await readFile(this.eventsPath(sessionId), "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SessionEvent);
    } catch {
      return [];
    }
  }

  async writeReport(report: AnalysisReport): Promise<void> {
    await this.writeJson(this.reportPath(report.sessionId), report);
  }

  async getReport(sessionId: string): Promise<AnalysisReport | undefined> {
    return this.readJson<AnalysisReport>(this.reportPath(sessionId));
  }

  sessionPath(sessionId: string): string {
    return join(this.sessionsDir(), sessionId);
  }

  projectSourcePath(projectId: string): string {
    return join(this.projectsDir(), projectId, "source");
  }

  private projectsDir(): string {
    return join(this.root, "projects");
  }

  private sessionsDir(): string {
    return join(this.root, "sessions");
  }

  private projectMetaPath(projectId: string): string {
    return join(this.projectsDir(), projectId, "project.json");
  }

  private sessionMetaPath(sessionId: string): string {
    return join(this.sessionPath(sessionId), "session.json");
  }

  private eventsPath(sessionId: string): string {
    return join(this.sessionPath(sessionId), "events.jsonl");
  }

  private reportPath(sessionId: string): string {
    return join(this.sessionPath(sessionId), "report.json");
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2));
  }

  private async readJson<T>(path: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
      return undefined;
    }
  }
}
