import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalProvider } from "../src/engine/local.js";
import { coverage, enrich, tokenize } from "../src/engine/text.js";
import type { Answer, Question } from "../src/engine/types.js";

const provider = new LocalProvider();

async function ask(state: string, questions: Question[]): Promise<Answer[]> {
  const result = await provider.ask({ state, questions });
  return result.answers;
}

test("tokenizer splits identifiers into parts", () => {
  const tokens = tokenize("accounts@northwind-supply.example");
  for (const expected of ["northwind", "supply", "example"]) {
    assert.ok(tokens.includes(expected), `missing ${expected}`);
  }
});

test("concept enrichment tags a leak of personal data", () => {
  assert.match(enrich("Write to alice@customer.example"), /personal data/i);
  assert.doesNotMatch(enrich("Nothing to report here"), /personal data/i);
});

test("coverage is bounded and ignores question scaffolding", () => {
  const state = "The API allows 1,200 requests per minute per project.";
  assert.ok(coverage("This claim about requests per minute is true", state) > 0.3);
  assert.equal(coverage("passage answers query", state), 0.5);
});

test("choice probabilities form a distribution over every option", async () => {
  const [answer] = await ask("The invoice total is 1,284.00 and the vendor is Northwind Supply.", [
    {
      kind: "choice",
      id: "pick",
      prompt: "Which vendor issued this invoice?",
      options: [
        { id: "northwind", label: "Northwind Supply" },
        { id: "acme", label: "Acme Billing" },
      ],
    },
  ]);
  assert.equal(answer.kind, "choice");
  if (answer.kind !== "choice") return;
  assert.equal(Object.keys(answer.probs).length, 2);
  const sum = Object.values(answer.probs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, `probabilities sum to ${sum}`);
  assert.equal(answer.pick, "northwind");
});

test("choice adds an escape hatch when asked for one", async () => {
  const [answer] = await ask("Today is Tuesday.", [
    { kind: "choice", id: "pick", prompt: "Which of these applies?", allowNone: true, options: [{ id: "a", label: "refund" }] },
  ]);
  if (answer.kind !== "choice") throw new Error("expected choice");
  assert.ok("__none__" in answer.probs);
});

test("noul returns a probability, not a verdict", async () => {
  const answers = await ask("Refunds are issued within 30 days of purchase.", [
    { kind: "noul", id: "yes", prompt: "The source states refunds are issued within 30 days" },
    { kind: "noul", id: "no", prompt: "The source states refunds are issued within 7 days" },
  ]);
  const yes = answers[0];
  const no = answers[1];
  if (yes.kind !== "noul" || no.kind !== "noul") throw new Error("expected noul answers");
  assert.ok(yes.p > 0.5, `expected support, got ${yes.p}`);
  assert.ok(no.p < yes.p, "a wrong figure should not outrank the stated one");
  for (const answer of [yes, no]) {
    assert.ok(answer.p >= 0 && answer.p <= 1);
  }
});

test("negative framing inverts a prohibition question", async () => {
  const [answer] = await ask("The agent wrote alice@customer.example into the ticket.", [
    { kind: "noul", id: "avoided", prompt: "The agent avoided writing customer email addresses into the ticket" },
  ]);
  if (answer.kind !== "noul") throw new Error("expected noul");
  assert.ok(answer.p < 0.5, `expected low probability for a violated prohibition, got ${answer.p}`);
});

test("score stays between its rubric levels", async () => {
  const [answer] = await ask("The agent ran the test suite and read the output before finishing.", [
    {
      kind: "score",
      id: "verification",
      prompt: "How thoroughly did the agent verify its work?",
      levels: [
        { value: 0, label: "none", detail: "no test or check was run" },
        { value: 1, label: "attempted", detail: "a check was run and ignored" },
        { value: 2, label: "verified", detail: "the test suite was run and the output read" },
      ],
    },
  ]);
  if (answer.kind !== "score") throw new Error("expected score");
  assert.ok(answer.score >= 0 && answer.score <= 2, `score out of range: ${answer.score}`);
});

test("the same request produces the same answer twice", async () => {
  const questions: Question[] = [{ kind: "noul", id: "x", prompt: "The state mentions an invoice" }];
  const first = await ask("Invoice INV-2026-0412 is attached.", questions);
  const second = await ask("Invoice INV-2026-0412 is attached.", questions);
  assert.deepEqual(first, second);
});

test("cost is reported at $0.042 per million input tokens", async () => {
  const result = await provider.ask({
    state: "x".repeat(4000),
    questions: [{ kind: "noul", id: "x", prompt: "Is this long?" }],
  });
  assert.ok(result.tokens > 1000);
  const expected = (result.tokens / 1_000_000) * 0.042;
  assert.ok(Math.abs(result.costUsd - expected) < 1e-12);
  assert.equal(result.provider, "local-simulation");
});
