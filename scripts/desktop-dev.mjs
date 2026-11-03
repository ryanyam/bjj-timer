import { spawn } from "node:child_process";
import path from "node:path";

const port = process.env.BJJ_TIMER_DEV_PORT ?? "5173";
const url = `http://localhost:${port}/`;
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const electronBin = path.join(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

const vite = spawn(
  npmBin,
  ["run", "dev", "--", "--port", port, "--strictPort"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

let electron = null;
let stopping = false;

function stop(child) {
  if (child !== null && !child.killed) {
    child.kill("SIGTERM");
  }
}

function cleanup() {
  if (stopping) {
    return;
  }

  stopping = true;
  stop(electron);
  stop(vite);
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

async function waitForVite() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Vite did not become ready at ${url}`);
}

vite.on("exit", (code) => {
  if (!stopping && electron === null) {
    console.error(`Vite exited with code ${code ?? "unknown"}`);
    process.exit(code ?? 1);
  }
});

try {
  await waitForVite();

  electron = spawn(
    electronBin,
    [".", "--dev"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        BJJ_TIMER_DEV_URL: url,
      },
      shell: process.platform === "win32",
    },
  );

  electron.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  electron.on("error", (error) => {
    console.error("Could not start Electron:", error);
    cleanup();
    process.exit(1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  cleanup();
  process.exit(1);
}
