import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { toSyncData, mergeSyncData } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const make = toSyncData;

test("simultaneous/offline additions are merged; omitted items are not deleted", () => {
  const result = mergeSyncData(make({ library: [{ id: "a" }] }), make({ library: [{ id: "b" }] }));
  assert.deepEqual(new Set(result.library.map(item => item.id)), new Set(["a", "b"]));
});
test("a deletion cannot be resurrected by an old device", () => {
  const cloud = make({ deleted: { library: { a: 20 } } });
  const stale = make({ library: [{ id: "a" }], updated: { library: { a: 10 } } });
  assert.equal(mergeSyncData(cloud, stale).library.length, 0);
});
test("a deliberate new edit after a tombstone can be restored", () => {
  const result = mergeSyncData(make({ deleted: { library: { a: 20 } } }),
    make({ library: [{ id: "a" }], updated: { library: { a: 30 } } }));
  assert.equal(result.library.length, 1);
});
test("latest quizzes and essay answers win regardless of upload order", () => {
  const newer = make({ quizzesV3: { a: { answer: "new" } }, essaysV3: { a: { answers: ["new"] } },
    updated: { quizzesV3: { a: 20 }, essaysV3: { a: 20 } } });
  const stale = make({ quizzesV3: { a: { answer: "old" } }, essaysV3: { a: { answers: ["old"] } },
    updated: { quizzesV3: { a: 10 }, essaysV3: { a: 10 } } });
  assert.deepEqual(mergeSyncData(newer, stale).quizzesV3.a, { answer: "new" });
  assert.deepEqual(mergeSyncData(stale, newer).essaysV3.a, { answers: ["new"] });
});
test("legacy exams are retained separately, never promoted to v3", () => {
  const result = mergeSyncData(make({}), make({ quizzes: { a: { old: true } } }));
  assert.deepEqual(result.quizzesV3, {});
  assert.deepEqual(result.quizzes.a, { old: true });
});
test("canonical thumbnails replace data URLs without replacing analysis content", () => {
  const original = make({ library: [{ id: "a", result: { topic: "keep" }, thumbnailUrl: "data:image/png;base64,AA==" }] });
  const remote = make({ library: [{ id: "a", thumbnailUrl: "/api/sync/assets/ROOMID/hash.png" }] });
  const result = mergeSyncData(original, remote);
  assert.deepEqual(result.library[0].result, { topic: "keep" });
  assert.equal(result.library[0].thumbnailUrl, "/api/sync/assets/ROOMID/hash.png");
  assert.deepEqual(mergeSyncData(result, original), result);
});
