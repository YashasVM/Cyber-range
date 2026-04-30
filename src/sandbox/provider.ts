import type { SandboxCommand, SandboxCommandResult } from "../domain/types";

export type SandboxRunInput = {
  sessionId: string;
  workspacePath: string;
  commands: SandboxCommand[];
  maxSessionSeconds: number;
};

export type SandboxRunResult = {
  provider: string;
  image?: string;
  results: SandboxCommandResult[];
};

export interface SandboxProvider {
  readonly providerName: string;
  run(input: SandboxRunInput): Promise<SandboxRunResult>;
}
