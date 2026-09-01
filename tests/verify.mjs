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

test("fragment helpers preserve meaningful whitespace and classify tombstones", () => {
  const { normalizeText, normalizeLegacyRecord, isLive } = extractTestableLogic(readApp(), [
    "normalizeText", "normalizeLegacyRecord", "isLive",
  ]);
  assert.equal(normalizeText("  first\nsecond  \n"), "  first\nsecond");
  assert.equal(normalizeText(" \n\t"), "");
  const used = new Set();
  assert.deepEqual(normalizeLegacyRecord({ id: "a", at: 42, text: "kept", src: "press" }, used, 99), {
    id: "a", createdAt: 42, text: "kept", source: "press",
  });
  assert.equal(isLive({ id: "a", createdAt: 1, text: "x" }), true);
  assert.equal(isLive({ id: "a", createdAt: 1, text: "x", deletedAt: 10, undoUntil: 200 }), false);
});

test("fragment IDs prefer UUIDs and fall back to timestamp plus random entropy", () => {
  const { makeId } = extractTestableLogic(readApp(), ["makeId"]);
  assert.equal(makeId(42, () => "uuid-preferred", () => 0.5), "uuid-preferred");
  assert.equal(makeId(42, () => "", () => 0.5), "16-zik0zk");
});

test("legacy records generate unique IDs for missing and duplicate IDs", () => {
  const { normalizeLegacyRecord } = extractTestableLogic(readApp(), ["normalizeLegacyRecord"]);
  const used = new Set(["legacy-id"]);
  const missingId = normalizeLegacyRecord({ at: 7, text: "missing" }, used, 99);
  const duplicateId = normalizeLegacyRecord({ id: "legacy-id", at: 8, text: "duplicate" }, used, 99);

  assert.deepEqual({ createdAt: missingId.createdAt, text: missingId.text }, { createdAt: 7, text: "missing" });
  assert.deepEqual({ createdAt: duplicateId.createdAt, text: duplicateId.text }, { createdAt: 8, text: "duplicate" });
  assert.notEqual(missingId.id, "legacy-id");
  assert.notEqual(duplicateId.id, "legacy-id");
  assert.notEqual(duplicateId.id, missingId.id);
  assert.ok(used.has(missingId.id));
  assert.ok(used.has(duplicateId.id));
});

test("capture helpers are exposed from the testable application logic", () => {
  const helpers = extractTestableLogic(readApp(), ["saveDraft", "appendFragment"]);
  assert.equal(typeof helpers.saveDraft, "function");
  assert.equal(typeof helpers.appendFragment, "function");
});

test("test helpers require both an explicit flag and a loopback hostname", () => {
  const { isTestMode } = extractTestableLogic(readApp(), ["isTestMode"]);
  assert.equal(isTestMode({ href: "http://127.0.0.1/index.html?test=1", hostname: "127.0.0.1" }), true);
  assert.equal(isTestMode({ href: "http://localhost/index.html?test", hostname: "localhost" }), true);
  assert.equal(isTestMode({ href: "http://127.0.0.1/index.html", hostname: "127.0.0.1" }), false);
  assert.equal(isTestMode({ href: "https://ledger.example/index.html?test=1", hostname: "ledger.example" }), false);
});
