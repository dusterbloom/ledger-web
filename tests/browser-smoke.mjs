import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chromium = process.env.CHROMIUM_BIN || "/opt/homebrew/bin/chromium";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address()));
  });
}

function close(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function runChromium(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(chromium, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const limit = 15000;
    const stop = setTimeout(() => child.kill(), limit);
    const forceStop = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") reject(error);
      }
    }, limit + 2000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(stop);
      clearTimeout(forceStop);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(stop);
      clearTimeout(forceStop);
      resolveRun({ code, stdout, stderr });
    });
  });
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const path = resolve(root, "." + pathname);
    if (path !== root && !path.startsWith(root + sep)) throw new Error("outside root");
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404).end("not found");
  }
});

let profile;
try {
  const address = await listen(server);
  profile = await mkdtemp(resolve(tmpdir(), "ledger-browser-"));
  const url = `http://127.0.0.1:${address.port}/tests/browser-harness.html`;
  const result = await runChromium([
    "--headless=new",
    "--disable-gpu",
    "--dump-dom",
    "--virtual-time-budget=8000",
    `--user-data-dir=${profile}`,
    url,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /data-status="pass"/, result.stdout + "\n" + result.stderr);
  console.log("PASS: recovered one draft and committed one fragment");
} finally {
  await close(server);
  if (profile) await rm(profile, { recursive: true, force: true });
}
