import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const processes = [
  spawn(process.execPath, ["backend/server.js"], { cwd: projectRoot, stdio: "inherit", env: process.env }),
  spawn(process.execPath, [resolve(projectRoot, "node_modules/vite/bin/vite.js"), "--config", "vite.config.js"], { cwd: projectRoot, stdio: "inherit" }),
];

const stop = (code = 0) => {
  processes.forEach((child) => child.kill());
  process.exit(code);
};

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

processes.forEach((child) => {
  child.on("error", (error) => {
    console.error("Unable to start development process:", error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) stop(code);
  });
});
