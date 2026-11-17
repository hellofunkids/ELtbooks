import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

async function load(name) {
  const source = fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { chooseEssayEvidence } = await load("text-evidence");
const { groundEssayQuestions, createEssayRetrievalQuestions } = await load("essay-questions");
const { groundReadingQuestions } = await load("reading-questions");
const text = "Farmers get water from the river. They use the water to grow rice. They carry the rice to the village market. Birds build nests in tall trees. They collect small sticks for their nests. They feed their young in the morning. Children visit the library after school. They read books about animals. They return their books on Friday.";
const evidence = chooseEssayEvidence(text);
const valid = () => evidence.map((sentences, evidenceIndex) => ({
  evidenceIndex, question: "본문 속 대상은 어디에서 무엇을 하며, 어떤 활동들을 하나요?", answerSentences: [...sentences],
}));

test("each essay uses two or three complete, verbatim passage sentences", () => {
  assert.equal(evidence.length, 3);
  for (const sentences of evidence) {
    assert.ok(sentences.length >= 2 && sentences.length <= 3);
    sentences.forEach(sentence => assert.ok(text.includes(sentence)));
  }
});
test("model answers become two or three English lines without duplicate evidence annotations", () => {
  const result = groundEssayQuestions(valid(), evidence);
  assert.equal(result.length, 3);
  result.forEach((item, index) => {
    assert.deepEqual(item.answer.split("\n"), evidence[index]);
    assert.match(item.question, /2~3줄/);
    assert.doesNotMatch(item.answer, /[가-힣]/);
  });
});
test("short-phrase and invented answers are rejected", () => {
  const short = valid();
  short[0].answerSentences = ["from the river"];
  assert.equal(groundEssayQuestions(short, evidence), null);
  const invented = valid();
  invented[0].answerSentences[0] = "Farmers fly to the moon.";
  assert.equal(groundEssayQuestions(invented, evidence), null);
});
test("question-only generation always receives canonical full-sentence answers from the server", () => {
  const questions = valid().map(({ answerSentences, ...question }) => question);
  const result = groundEssayQuestions(questions, evidence);
  assert.equal(result.length, 3);
  result.forEach((item, index) => assert.equal(item.answer, evidence[index].join("\n")));
});
test("opinion prompts are rejected; fallback still produces complete multi-sentence answers", () => {
  const opinion = valid();
  opinion[0].question = "여러분의 생각과 경험을 쓰세요.";
  assert.equal(groundEssayQuestions(opinion, evidence), null);
  createEssayRetrievalQuestions(evidence).forEach((item, index) =>
    assert.equal(item.answer, evidence[index].join("\n")));
});
test("the separate final-test short-answer validator remains phrase-based", () => {
  const sources = ["Farmers get water from the river.", "Birds build nests in tall trees.", "Children visit the library after school."];
  const questions = ["농부들은 어디에서 물을 구하나요?", "새들은 어디에 둥지를 짓나요?", "아이들은 언제 도서관에 가나요?"];
  const phrases = ["from the river", "in tall trees", "after school"];
  const items = sources.map((source, evidenceIndex) => ({ evidenceIndex, question: questions[evidenceIndex], answer: phrases[evidenceIndex] }));
  assert.ok(groundReadingQuestions(items, sources));
  items[0].answer = sources[0];
  assert.equal(groundReadingQuestions(items, sources), null);
});
