const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform === "darwin") {
  // The Dock uses the bundle identity, so launch the named .app, not Electron.app.
  run("npm", ["run", "app:mac"]);
  const folder = process.arch === "x64" ? "mac" : `mac-${process.arch}`;
  run("open", ["-W", join(root, "release", folder, "restcookie.app")]);
} else {
  run(require("electron"), ["."]);
}
