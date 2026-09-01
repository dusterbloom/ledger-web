import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = resolve(root, "index.html");
const readApp = () => readFileSync(appPath, "utf8");

function inlineScript(html) {
  const matches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(matches.length, 1, "expected one inline application script");
  return matches[0][1];
}

function extractTestableLogic(html, names) {
  const match = html.match(/\/\* @testable:start \*\/([\s\S]*?)\/\* @testable:end \*\//);
  assert.ok(match, "testable logic block missing");
  return new Function(match[1] + "; return { " + names.join(", ") + " }; ")();
}

test("release is one offline HTML file with no cross-frame API", () => {
  const html = readApp();
  const script = inlineScript(html);
  assert.doesNotMatch(html, /<(?:script|link|img|audio|video|source)\b[^>]*(?:src|href)\s*=\s*["']https?:/i);
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i);
  assert.doesNotMatch(script, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|sendBeacon/);
  assert.doesNotMatch(script, /postMessage|addEventListener\(["']message/);
  assert.doesNotThrow(() => new Function(script));
});

test("capture, search, stream, status, and recovery controls are semantic", () => {
  const html = readApp();
  for (const id of ["entry", "save", "search", "stream", "status", "recentlyDeleted"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + " missing");
  }
  assert.match(html, /<label[^>]*for="entry"/);
  assert.match(html, /aria-live="polite"/);
});
