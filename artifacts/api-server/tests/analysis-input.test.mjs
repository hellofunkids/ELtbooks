import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/analysis-input.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { passageSentences, cleanOcrSentences, isPageFurniture, PASSAGE_OCR_PROMPT } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("pasted paragraphs retain sentence order, dialogue and meaningful numbers", () => {
  const result = passageSentences('Emma is 10 years old.\nIn 2024, she saw 12 birds.\n"Hello!"\nThe birds live near\nthe river.');
  assert.equal(result.length, 4);
  assert.equal(result[0], "Emma is 10 years old.");
  assert.equal(result[1], "In 2024, she saw 12 birds.");
  assert.equal(result[3], "The birds live near the river.");
});
test("page numbers, running headers, copyright and standalone URLs are removed", () => {
  const result = passageSentences("Unit 4\nEmma visits the river.\n24\nPage 25\nCopyright 2026 Example Press. All rights reserved.\nwww.example.com\nReading Practice | 26");
  assert.deepEqual(result, ["Emma visits the river."]);
});
test("OCR cleanup keeps body facts and rejects page furniture", () => {
  assert.deepEqual(cleanOcrSentences(["24", "Emma is 10 years old.", "Page 25", "In 2024, she saw 12 birds.", "© Example Press"], ""),
    ["Emma is 10 years old.", "In 2024, she saw 12 birds."]);
});
test("footer-only input does not become a reading passage; fullText fallback is cleaned too", () => {
  assert.deepEqual(passageSentences("24\nPage 25\nCopyright 2026 Example Press"), []);
  assert.deepEqual(cleanOcrSentences(undefined, "Emma visits the river.\n24"), ["Emma visits the river."]);
});
test("numbers inside sentences are never mistaken for page numbers", () => {
  for (const value of ["Emma is 10 years old.", "The price is $24.", "In 2024, 12 birds lived here."]) {
    assert.equal(isPageFurniture(value), false);
  }
  assert.match(PASSAGE_OCR_PROMPT, /본문 안의 짧은 대사/);
  assert.match(PASSAGE_OCR_PROMPT, /나이·연도·가격·시간·수량/);
});
