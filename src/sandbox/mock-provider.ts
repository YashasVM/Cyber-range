import type { SandboxProvider, SandboxRunInput, SandboxRunResult } from "./provider";

export class MockSandboxProvider implements SandboxProvider {
  readonly providerName = "mock";

  async run(input: SandboxRunInput): Promise<SandboxRunResult> {
    return {
      provider: this.providerName,
      results: input.commands.map((command) => ({
        id: command.id,
        command: command.command,
        exitCode: 0,
        timedOut: false,
        stdout: "Mock sandbox enabled for tests only. No uploaded code was executed.",
        stderr: ""
      }))
    };
  }
}
