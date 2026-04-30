import { checkDockerAvailability } from "../src/sandbox/docker-availability";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

checks.push({
  name: "Bun",
  ok: true,
  detail: `Running on Bun ${Bun.version}`
});

const docker = await checkDockerAvailability();
checks.push({
  name: "Docker sandbox",
  ok: docker.available,
  detail: docker.available
    ? `${docker.version}; daemon reachable`
    : [docker.version ?? "Docker CLI unavailable", docker.reason ?? "Docker daemon unavailable"].join(" | ")
});

checks.push({
  name: "Host execution fallback",
  ok: true,
  detail: "disabled"
});

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "BLOCKED"} ${check.name}: ${check.detail}`);
}

if (!docker.available) {
  console.log("");
  console.log("Real uploaded-code analysis is blocked until Docker Desktop/Engine is running.");
  console.log("The API can still serve metadata, prompts, project upload, and health endpoints.");
}
