import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxCommandResult } from "../domain/types";
import { checkDockerAvailability, resolveDockerCommand } from "./docker-availability";
import { assertAllowedSandboxCommand } from "./policy";
import type { SandboxProvider, SandboxRunInput, SandboxRunResult } from "./provider";

export class DockerSandboxProvider implements SandboxProvider {
  readonly providerName = "docker";

  constructor(private readonly image: string) {}

  async run(input: SandboxRunInput): Promise<SandboxRunResult> {
    for (const command of input.commands) {
      assertAllowedSandboxCommand(command);
    }

    const docker = await checkDockerAvailability();
    if (!docker.available) {
      throw new Error(`Docker sandbox unavailable: ${docker.reason ?? "Docker Engine is not reachable"}`);
    }

    const runnerPath = join(input.workspacePath, ".cloud-range-runner.json");
    await writeFile(runnerPath, JSON.stringify(input.commands, null, 2));
    const dockerWorkspacePath = input.workspacePath.replaceAll("\\", "/");

    const dockerArgs = [
      "run",
      "--rm",
      "--network",
      "none",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--pids-limit",
      "256",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--security-opt",
      "no-new-privileges",
      "--cap-drop",
      "ALL",
      "-v",
      `${dockerWorkspacePath}:/workspace:rw`,
      "-w",
      "/workspace",
      this.image,
      "bun",
      "run",
      ".cloud-range-runner.ts"
    ];

    await writeFile(join(input.workspacePath, ".cloud-range-runner.ts"), RUNNER_SCRIPT);

    const proc = Bun.spawn([resolveDockerCommand(), ...dockerArgs], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const timeout = setTimeout(() => proc.kill("SIGKILL"), input.maxSessionSeconds * 1000);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    clearTimeout(timeout);

    return {
      provider: this.providerName,
      image: this.image,
      results: parseRunnerOutput(stdout, stderr, exitCode)
    };
  }
}

function parseRunnerOutput(stdout: string, stderr: string, exitCode: number): SandboxCommandResult[] {
  const marker = "CLOUD_RANGE_RESULTS=";
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(marker));

  if (!line) {
    return [
      {
        id: "sandbox-runner",
        command: ["docker", "run"],
        exitCode,
        timedOut: exitCode === 137,
        stdout: limit(stdout),
        stderr: limit(stderr || "Sandbox runner did not emit structured output.")
      }
    ];
  }

  try {
    return JSON.parse(line.slice(marker.length)) as SandboxCommandResult[];
  } catch {
    return [
      {
        id: "sandbox-runner",
        command: ["docker", "run"],
        exitCode,
        timedOut: false,
        stdout: limit(stdout),
        stderr: limit(stderr || "Sandbox runner emitted invalid JSON.")
      }
    ];
  }
}

function limit(value: string): string {
  return value.slice(-20_000);
}

const RUNNER_SCRIPT = `
const commands = await Bun.file(".cloud-range-runner.json").json();
const results = [];

for (const item of commands) {
  const proc = Bun.spawn(item.command, {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: "/tmp",
      CI: "true",
      NO_COLOR: "1"
    }
  });

  const timer = setTimeout(() => proc.kill("SIGKILL"), item.timeoutSeconds * 1000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  clearTimeout(timer);

  results.push({
    id: item.id,
    command: item.command,
    exitCode,
    timedOut: exitCode === 137,
    stdout: stdout.slice(-20000),
    stderr: stderr.slice(-20000)
  });

  if (exitCode !== 0) break;
}

console.log("CLOUD_RANGE_RESULTS=" + JSON.stringify(results));
`.trim();
