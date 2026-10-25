/**
 * Runs the client (Vite) and the API (node --watch) together for `npm run dev`, with each line
 * labelled [client] or [server]. Both run through Node directly, without npm or a shell in
 * between, so one Ctrl+C stops everything on Windows too. Once both are ready, it opens the app
 * in the default browser, unless BROWSER is none, set in the environment or in client/.env.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { parseEnv, stripVTControlCharacters } from "node:util";

const ROOT = join(import.meta.dirname, "..");
const STOP_TIMEOUT_MS = 5_000;
const APP_ADDRESS = /Local:\s+(https?:\/\/\S+)/;
const API_READY = "API listening";
const CTRL_C_GRACE_MS = 1_000;
const LINE_DELAY_MS = 50;
const WINDOWS = process.platform === "win32";
const COLOR =
  process.stdout.isTTY &&
  process.stdout.hasColors() &&
  !("NO_COLOR" in process.env);

function viteEntry(clientDir) {
  const require = createRequire(join(clientDir, "package.json"));
  const manifestPath = require.resolve("vite/package.json");
  const { bin } = require(manifestPath);
  return join(dirname(manifestPath), typeof bin === "string" ? bin : bin.vite);
}

const APPS = [
  { name: "client", color: 33, args: (dir) => [viteEntry(dir)] },
  { name: "server", color: 36, args: () => ["--watch", "src/server.js"] },
];

function hasMissingPackages(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const names = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  });
  return names.some(
    (name) => !existsSync(join(dir, "node_modules", name, "package.json")),
  );
}

const notInstalled = APPS.filter(({ name }) =>
  hasMissingPackages(join(ROOT, name)),
);
if (notInstalled.length > 0) {
  const commands = notInstalled.map(
    ({ name }) => `npm install --prefix ${name}`,
  );
  console.error(`Install the packages first: ${commands.join(" and ")}`);
  process.exit(1);
}

let stopping = false;
let appAddress = "";
let apiReady = false;
let browserOpened = false;

// On Windows, npm returns to the prompt as soon as Ctrl+C is pressed, so anything printed while
// the apps stop would land after the prompt and look like the terminal is stuck. There, lines are
// held for a moment, so a Ctrl+C that arrives together with them is handled first and they're
// dropped. Elsewhere npm waits for the apps, so their last lines still show.
function print(to, text) {
  if (!WINDOWS) {
    to.write(`${text}\n`);
    return;
  }
  setTimeout(() => {
    if (!stopping) to.write(`${text}\n`);
  }, LINE_DELAY_MS);
}

function browserSetting() {
  if (process.env.BROWSER !== undefined) return process.env.BROWSER;
  const envFile = join(ROOT, "client", ".env");
  if (!existsSync(envFile)) return "";
  return parseEnv(readFileSync(envFile, "utf8")).BROWSER ?? "";
}

function browserCommand(address) {
  // start reads its first quoted argument as a window title, so an empty one goes first.
  if (WINDOWS) return ["cmd", ["/c", "start", "", address]];
  if (process.platform === "darwin") return ["open", [address]];
  return ["xdg-open", [address]];
}

// Vite prints the app's address when it's ready, and the API logs "API listening" once it has
// connected to the database, so the page never loads before its first requests can be answered.
function openWhenReady(name, line) {
  if (browserOpened || stopping) return;
  const text = stripVTControlCharacters(line);
  if (name === "client") appAddress ||= APP_ADDRESS.exec(text)?.[1] ?? "";
  if (name === "server" && text.includes(API_READY)) apiReady = true;
  if (!appAddress || !apiReady) return;
  browserOpened = true;
  if (browserSetting().trim().toLowerCase() === "none") return;
  const [command, args] = browserCommand(appAddress);
  const browser = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  browser.on("error", () => undefined);
  browser.unref();
}

const children = APPS.map((app) => {
  const cwd = join(ROOT, app.name);
  const label = COLOR
    ? `\x1b[${app.color}m[${app.name}]\x1b[39m`
    : `[${app.name}]`;
  // Vite stops when its input closes, so each app gets a pipe that stays open.
  const child = spawn(process.execPath, app.args(cwd), {
    cwd,
    env: COLOR ? { FORCE_COLOR: "1", ...process.env } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  for (const [from, to] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    createInterface({ input: from, crlfDelay: Infinity }).on("line", (line) => {
      print(to, `${label} ${line}`);
      openWhenReady(app.name, line);
    });
  }
  child.on("close", (code, signal) => {
    if (stopping) return;
    print(
      process.stdout,
      `${label} stopped (${signal ?? `exit code ${code}`})`,
    );
    if (code) process.exitCode = code;
  });
  return child;
});

function stopAll(signal) {
  for (const child of children) child.kill(signal);
}

// Ctrl+C reaches every process in the terminal, so the apps get it too and stop on their own.
// They're only told to stop if they're still running a moment later, such as when an editor's
// stop button signals this script alone.
function stop(fromCtrlC) {
  if (stopping) return;
  stopping = true;
  const grace = fromCtrlC ? CTRL_C_GRACE_MS : 0;
  setTimeout(() => stopAll("SIGTERM"), grace).unref();
  setTimeout(() => stopAll("SIGKILL"), grace + STOP_TIMEOUT_MS).unref();
}

process.on("SIGINT", () => stop(true));
process.on("SIGBREAK", () => stop(true));
process.on("SIGTERM", () => stop(false));
process.on("SIGHUP", () => stop(false));
