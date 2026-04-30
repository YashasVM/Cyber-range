import { existsSync } from "node:fs";

export type DockerAvailability = {
  available: boolean;
  version?: string;
  daemon?: boolean;
  reason?: string;
};

const DOCKER_CANDIDATES = [
  process.env.DOCKER_CLI_PATH,
  "docker",
  "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"
].filter(Boolean) as string[];

export async function checkDockerAvailability(): Promise<DockerAvailability> {
  try {
    const dockerCommand = resolveDockerCommand();
    const version = await runDocker(dockerCommand, ["--version"]);

    if (version.exitCode !== 0) {
      return {
        available: false,
        daemon: false,
        reason: version.stderr.trim() || `docker --version exited with ${version.exitCode}`
      };
    }

    const daemon = await runDocker(dockerCommand, ["info", "--format", "{{.ServerVersion}}"]);

    if (daemon.exitCode !== 0) {
      return {
        available: false,
        version: version.stdout.trim(),
        daemon: false,
        reason:
          daemon.stderr.trim() ||
          "Docker CLI is installed, but the Docker daemon is not reachable. Start Docker Desktop and retry."
      };
    }

    return {
      available: true,
      version: version.stdout.trim(),
      daemon: true
    };
  } catch (error) {
    return {
      available: false,
      daemon: false,
      reason: error instanceof Error ? error.message : "docker CLI is unavailable"
    };
  }
}

export function resolveDockerCommand(): string {
  for (const candidate of DOCKER_CANDIDATES) {
    if (candidate === "docker" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "docker";
}

async function runDocker(
  dockerCommand: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([dockerCommand, ...args], {
      stdout: "pipe",
      stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  return { stdout, stderr, exitCode };
}
