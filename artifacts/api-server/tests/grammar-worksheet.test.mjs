import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("../src/lib/grammar-worksheet.ts", import.meta.url).pathname],
  bundle: true, write: false, platform: "node", format: "esm",
});
const { validateGrammarCards, generateGrammarCards } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const passage = "They are salty and crispy. They are fun to eat.";
const card = {
  phrase: "They are salty and crispy.",
  explanation: "그것들은 짭짤하고 바삭해요.",
  grammarNote: "두 형용사를 and로 연결해요.",
  grammarUsage: "[주어 + be동사 + 형용사 and 형용사] → 두 가지 특징",
  grammarExamples: [
    { sentence: "The apple is sweet and juicy.", translation: "사과는 달고 즙이 많아요." },
    { sentence: "The pizza is hot and cheesy.", translation: "피자는 뜨겁고 치즈가 많아요." },
  ],
};

test("complete grammar cards retain source and translated examples", () => {
  assert.deepEqual(validateGrammarCards({ cards: [card] }, passage).cards, [card]);
});
test("empty, summary-only and incomplete cards are rejected instead of printing a fallback", () => {
  for (const value of [
    { cards: [] }, { grammar: "문법 요약" },
    { cards: [{ ...card, grammarUsage: "" }] },
    { cards: [{ ...card, grammarExamples: card.grammarExamples.slice(0, 1) }] },
    { cards: [{ ...card, grammarExamples: [{ sentence: "Hello.", translation: " " }, card.grammarExamples[1]] }] },
  ]) assert.throws(() => validateGrammarCards(value, passage));
});
test("invented source sentences are rejected, wrapped source text is accepted", () => {
  assert.throws(() => validateGrammarCards({ cards: [{ ...card, phrase: "They were happy." }] }, passage));
  assert.equal(validateGrammarCards({ cards: [card] }, passage.replace("salty and", "salty\nand")).cards.length, 1);
});
test("incomplete AI output is retried and complete cards are returned", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(calls === 1 ? { cards: [] } : { cards: [card] }),
    } }] }), { status: 200 });
  };
  try {
    assert.equal((await generateGrammarCards("test-key", passage)).cards.length, 1);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
