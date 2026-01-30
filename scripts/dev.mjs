import { spawn } from "node:child_process";

const procs = [
  spawn("npm", ["run", "dev", "-w", "apps/server"], { stdio: "inherit", shell: true }),
  spawn("npm", ["run", "dev", "-w", "apps/web"], { stdio: "inherit", shell: true })
];

const shutdown = (code) => {
  for (const proc of procs) {
    if (!proc.killed) {
      proc.kill("SIGINT");
    }
  }
  process.exit(code ?? 0);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const proc of procs) {
  proc.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
}
