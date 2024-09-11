const { spawn } = require("child_process");
const path = require("path");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(__dirname),
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command "${command} ${args.join(" ")}" exited with code ${code}`
          )
        );
      } else {
        resolve();
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    console.log("Running npm install...");
    await runCommand(npmCmd, ["install", "--force"]);

    console.log("Running npm run start:bot...");
    await runCommand(npmCmd, ["run", "start:bot"]);
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

main();
