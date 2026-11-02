import { test } from "node:test";
import assert from "node:assert/strict";
import { USE_CASES, getUseCase, listMeta } from "../src/usecases/index.js";
import { LocalProvider } from "../src/engine/local.js";
import type { RunResult } from "../src/usecases/types.js";

const provider = new LocalProvider();
const defaults = (id: string) => {
  const useCase = getUseCase(id);
  if (!useCase) throw new Error(`unknown use case ${id}`);
  return Object.fromEntries(useCase.inputs.map((field) => [field.key, field.default]));
};
const run = (id: string, input?: Record<string, string>): Promise<RunResult> => {
  const useCase = getUseCase(id);
  if (!useCase) throw new Error(`unknown use case ${id}`);
  return useCase.run({ ...defaults(id), ...(input ?? {}) }, provider);
};

test("twelve use cases are registered and their metadata crosses the wire cleanly", () => {
  assert.equal(USE_CASES.length, 12);
  const meta = listMeta();
  assert.equal(meta.length, 12);
  for (const item of meta) {
    assert.ok(item.id && item.title && item.tagline);
    assert.ok(!("run" in item), "run() must not be serialised to the client");
    assert.equal(item.primitives.length > 0, true);
  }
  assert.equal(new Set(meta.map((m) => m.id)).size, 12);
});

test("every use case runs, with defaults and with every preset, and returns a well-formed result", async () => {
  for (const useCase of USE_CASES) {
    const inputs = [defaults(useCase.id), ...(useCase.presets ?? []).map((p) => ({ ...defaults(useCase.id), ...p.input }))];
    for (const input of inputs) {
      const result = await useCase.run(input, provider);
      assert.ok(result.summary.length > 0, `${useCase.id}: no summary`);
      assert.ok(result.decisions.length > 0, `${useCase.id}: no decisions`);
      assert.ok(result.code.length > 0, `${useCase.id}: no code sample`);
      assert.ok(result.usage.tokens > 0, `${useCase.id}: no tokens`);
      assert.ok(result.usage.costUsd > 0, `${useCase.id}: no cost`);

      for (const panel of result.panels) {
        for (const entry of panel.entries) {
          const answer = entry.answer;
          if (answer.kind === "noul") {
            assert.ok(answer.p >= 0 && answer.p <= 1, `${useCase.id}/${answer.id}: p=${answer.p}`);
          }
          if (answer.kind === "choice") {
            const sum = Object.values(answer.probs).reduce((a, b) => a + b, 0);
            assert.ok(Math.abs(sum - 1) < 0.02, `${useCase.id}/${answer.id}: probs sum ${sum}`);
          }
          if (answer.kind === "score") {
            const levels = entry.question.kind === "score" ? entry.question.levels.map((l) => l.value) : [];
            assert.ok(answer.score >= Math.min(...levels) && answer.score <= Math.max(...levels));
          }
        }
      }
    }
  }
});

test("browser agent only ever executes a legal operation-target pair", async () => {
  const result = await run("browser-next-action");
  const executed = result.decisions.find((d) => d.title === "Executed");
  assert.ok(executed, "expected the demo to act");
  const candidates = result.artifacts[0].rows;
  assert.ok(candidates.length > 0);
  // Every legal candidate is either a click, a type, or stop — nothing else can be expressed.
  for (const row of candidates) {
    assert.match(row.id, /^(click|type):[a-z0-9-]+$|^stop$/);
  }
  assert.ok(candidates.some((row) => row.id === "stop"));
});

test("disabled controls never enter the candidate set", async () => {
  const result = await run("browser-next-action", {
    goal: "Buy the Anker USB-C cable, 2 m, under $15.",
    dom: `- text "Anker USB-C cable, 2 m — $9.99, out of stock"
  - button "Add to cart" [ref=e1] disabled
- text "Belkin USB-C cable, 1 m — $7.50, in stock"
  - button "Add to cart" [ref=e2]`,
  });
  const ids = result.artifacts[0].rows.map((row) => row.id);
  assert.ok(ids.includes("click:e2"));
  assert.ok(!ids.includes("click:e1"), "disabled button must be filtered before the panel");
});

test("compaction output is a verbatim subset of the input trace", async () => {
  const input = defaults("context-compaction");
  const result = await run("context-compaction");
  const compacted = result.artifacts.find((a) => a.title === "Compacted trace")?.preview ?? "";
  assert.ok(compacted.length > 0);
  for (const line of compacted.split("\n")) {
    assert.ok(input.trace.includes(line), `kept line not in source: ${line}`);
  }
  const verbatim = result.summary.find((s) => s.label === "Verbatim");
  assert.equal(verbatim?.value, "verified");
});

test("citation verification lets code overrule the panel on a fabricated quote", async () => {
  const result = await run("citation-verification", {
    claim: "The API allows 1,200 requests per minute per project.",
    quote: "1,200 requests per minute and 10,000 for enterprise",
    source: "The standard limit is 1,200 requests per minute per project.",
  });
  assert.equal(result.summary.find((s) => s.label === "Verdict")?.value, "fabricated-quote");
  assert.ok(result.decisions.some((d) => d.title === "Quote not found in source" && d.status === "blocked"));
});

test("citation verification catches a numeric conflict in code", async () => {
  const result = await run("citation-verification", {
    claim: "Enterprise plans allow 10,000 requests per minute.",
    quote: "Enterprise plans can raise the limit to 6,000 requests per minute",
    source: "Enterprise plans can raise the limit to 6,000 requests per minute by contacting sales.",
  });
  assert.equal(result.summary.find((s) => s.label === "Verdict")?.value, "contradicted");
  assert.ok(result.decisions.some((d) => d.title === "Numeric conflict found in code"));
});

test("extraction audit catches the seeded date bug and never does arithmetic with Jev", async () => {
  const result = await run("extraction-verification");
  const dueDate = result.artifacts
    .find((a) => a.title === "Record with routing")
    ?.rows.find((row) => row.id === "due_date");
  assert.equal(dueDate?.status, "fail", "the mis-parsed date should be rejected");
  const arithmetic = result.artifacts.find((a) => a.title === "Arithmetic in code");
  assert.ok(arithmetic?.rows.some((row) => row.status === "pass"));
  assert.ok(result.code.every((sample) => !/add\(|sum\(|total\(\)/i.test(sample.title)));
});

test("extraction rejects arithmetic that does not reconcile", async () => {
  const result = await run("extraction-verification", {
    document: `Invoice INV-2026-0999
Subtotal: $100.00
Tax (8%): $8.00
Total due: $900.00
Payment terms: net 30.`,
  });
  assert.ok(result.decisions.some((d) => d.title === "Ledger does not reconcile" && d.status === "blocked"));
});

test("entity alignment lets a hard tax-id conflict outrank a high field score", async () => {
  const result = await run("entity-alignment", { pair: "conflict" });
  assert.equal(result.summary.find((s) => s.label === "Decision")?.value, "separate");
});

test("entity alignment merges a formatted-differently duplicate", async () => {
  const result = await run("entity-alignment", { pair: "same" });
  assert.equal(result.summary.find((s) => s.label === "Decision")?.value, "merge");
});

test("semantic regression blocks a build that leaks personal data", async () => {
  const result = await run("semantic-regression");
  assert.equal(result.summary.find((s) => s.label === "Gate")?.value, "BLOCKED");
  const pii = result.artifacts.find((a) => a.title === "Per-check comparison")?.rows.find((r) => r.id === "no-pii");
  assert.equal(pii?.status, "fail");
});

test("memory gate promotes a novel, trace-backed lesson", async () => {
  const result = await run("memory-promotion");
  assert.equal(result.summary.find((s) => s.label === "Gate")?.value, "PROMOTED");
  const record = result.artifacts.find((a) => a.title === "Memory record")?.preview ?? "";
  assert.match(record, /"evidence"/);
  assert.match(record, /"quote"/);
});

test("memory gate discards a trace with nothing to learn", async () => {
  const result = await run("memory-promotion", {
    trace: "1. assistant: Looked it up.\n2. assistant: All good, closing.",
    memory: "- Refunds above $200 need a second approver.",
  });
  assert.equal(result.summary.find((s) => s.label === "Gate")?.value, "DISCARDED");
});

test("retrieval returns nothing when the corpus cannot answer", async () => {
  const result = await run("retrieval-rerank", {
    query: "Which data-centre regions support on-premises installation?",
    topK: "3",
  });
  assert.equal(result.summary.find((s) => s.label === "Candidates")?.value.startsWith("12 → 0"), true);
});

test("skill router loads nothing when the turn is outside the catalogue", async () => {
  const result = await run("skill-loading", {
    turn: "Water the office plants and order more coffee beans for the kitchen.",
  });
  assert.equal(result.summary.find((s) => s.label === "Loaded")?.value, "base only");
});

test("tool compilation blocks execution when the function mapping is ambiguous", async () => {
  const result = await run("tool-call-compilation", {
    request: "Something is wrong with the October billing run and I need the right people looking at it today.",
  });
  assert.ok(result.decisions.some((d) => d.status === "blocked"));
});
