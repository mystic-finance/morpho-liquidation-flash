const { spawn } = require("child_process");
const path = require("path");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const child = spawn(npmCmd, ["run", "start:bot"], {
  cwd: path.resolve(__dirname),
  stdio: "inherit",
  shell: true,
});

child.on("close", (code) => {
  console.log(`Child process exited with code ${code}`);
});

child.on("error", (err) => {
  console.error("Failed to start child process.", err);
});
