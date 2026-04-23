const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const nextDir = path.resolve(process.cwd(), ".next");

function exists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function removeWithNode() {
  fs.rmSync(nextDir, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 150,
  });
}

function removeWithShell() {
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "if (Test-Path -LiteralPath '${nextDir}') { Remove-Item -LiteralPath '${nextDir}' -Recurse -Force -ErrorAction Stop }"`,
      { stdio: "inherit" }
    );
    return;
  }

  execSync(`rm -rf "${nextDir}"`, { stdio: "inherit" });
}

function main() {
  if (!exists(nextDir)) {
    console.log("No .next directory to clean.");
    return;
  }

  try {
    removeWithNode();
  } catch (error) {
    console.warn("Node cleanup failed, trying shell fallback...");
    try {
      removeWithShell();
    } catch {
      // Keep original failure details if both methods fail.
      throw error;
    }
  }

  if (exists(nextDir)) {
    throw new Error(
      "Failed to remove .next directory. Close running Next.js processes and try again."
    );
  }

  console.log("Cleaned .next");
}

main();
