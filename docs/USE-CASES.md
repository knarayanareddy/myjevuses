# The twelve, as built

Every use case below is a real module, not a mock. The shape is the same in all twelve:

1. **Code builds the answer space** — a candidate list, a tool schema, a memory library, a passage set.
2. **One request carries the whole panel** — typed `Choice` / `Score` / `Noul` questions whose answers are bounded.
3. **Code decides** — thresholds, hard rules, arithmetic, schema validation, token budgets.
4. **The UI shows all three** — the state, the probabilities, and the decision.

| # | Use case | Module | Primitives | What code owns | What Jev owns |
|---|---|---|---|---|---|
| 1 | Browser next action | `src/usecases/browser-action.ts` | Choice | DOM parsing, `(action, target)` enumeration, validation, text entry | which legal action advances the goal |
| 2 | Context compaction | `src/usecases/context-compaction.ts` | Noul | trace splitting, pinning the tail, verbatim copy, duplicate removal | which older events are still needed |
| 3 | Skill loading | `src/usecases/skill-loading.ts` | Choice, Noul | catalogue parsing, token budget, prompt assembly | which skill fits, whether each is required |
| 4 | Typed tool calls | `src/usecases/tool-compilation.ts` | Choice, Noul | registry, literal composition, schema validation | function choice and each enumerated argument |
| 5 | Citation verification | `src/usecases/citation-verification.ts` | Noul | exact substring match, number comparison, verdict precedence | does the source address / state the claim |
| 6 | Extraction verification | `src/usecases/extraction-verification.ts` | Noul | regex extraction, arithmetic, routing thresholds | is this value stated for this field |
| 7 | Agent trace evaluation | `src/usecases/trace-evaluation.ts` | Noul, Score | step splitting, duplicate detection, aggregation, outcome | progress per step, verification depth |
| 8 | Semantic regression | `src/usecases/semantic-regression.ts` | Noul | replay, baseline comparison, the pass/block gate | whether each behavioural check holds |
| 9 | Jevgrep | `src/usecases/jevgrep.ts` | Noul | chunking this repo's `src/`, lexical shortlist, cutoff | does this chunk implement the behaviour |
| 10 | Entity alignment | `src/usecases/entity-alignment.ts` | Noul | normalisation, blocking keys, tax-id conflict rule | whether each field value is the same entity |
| 11 | Retrieval reranking | `src/usecases/retrieval-rerank.ts` | Noul | TF-cosine recall (embedding stand-in), top-k, token budget | does this passage answer the query |
| 12 | Memory promotion | `src/usecases/memory-gate.ts` | Noul, Choice | evidence extraction, duplicate overlap, the conjunction | is there a correction, which lesson class, is it already known |

## Architecture

```
src/engine/types.ts    Choice | Score | Noul, the Answer union, cost constants
src/engine/text.ts     tokenising, weighted coverage, concept tags, negation frames
src/engine/local.ts    LocalProvider — deterministic lexical stand-in
src/engine/typesafe.ts TypeSafeProvider — the real @typesafe-ai/sdk, criteria and all
src/engine/provider.ts picks one based on TYPESAFE_API_KEY
src/usecases/*.ts      the twelve modules; one file each, plus shared plumbing
src/ui/*.tsx           the showcase (React, no component library)
server.ts              Express + Vite middleware, /api/usecases and /api/run/:id
tests/*.test.ts        27 tests: engine contract, all 12 modules, every preset
```

A use case is a plain object:

```ts
export const someUseCase: UseCaseMeta = {
  id, index, title, tagline, category, verdict, primitives,
  whyItFits, gates, sharpEdge, codeOwns, jevOwns,
  inputs, presets,
  async run(input, jev) { ... return { summary, panels, artifacts, decisions, code, usage } },
};
```

`run` receives a `JevProvider` and knows nothing else about the environment, which is why the same code runs against the local engine and the live API.

## Switching to live Jev

```bash
TYPESAFE_API_KEY=... npm run dev
```

Every panel then goes to `POST https://api.typesafe.ai/v1/systemone`. The adapter passes `trueCriteria` / `falseCriteria`
through as the SDK's `criteria` field, so the written descriptions of "yes" and "no" survive the switch unchanged.

## What the local engine is, and is not

With no key, `LocalProvider` answers the same panels using weighted lexical overlap, a small table of concept tags
(`deadline`, `error`, `correction`, …), and explicit negation frames. It exists so the showcase runs offline.

It is **not** Jev. It cannot paraphrase, it cannot reason across numbers, it is not calibrated, and it is deliberately
easy to fool. Every screen says so. The numbers it returns illustrate the *shape* of a Jev answer — a distribution over
your options, with a confidence you threshold — and nothing more.

The things that are real regardless of provider: the candidate generation, the question panels, the thresholds, the
code-owned decisions, the cost model, and the tests.

## Honest limits, per use case

Each demo's **Fit & limits** tab states the failure mode. The three worth reading first:

- **Browser action** — the DOM is untrusted input. Prompt-injection text can argue for its own action; the allowlist bounds the damage but does not remove it.
- **Semantic regression** — a panel catches most defect classes, not all. Gate on regression against the last accepted build, never on "correct".
- **Memory promotion** — a promoted lesson is a permanent prompt change. Pilot offline, review every promotion by hand for the first month, keep the revoke path.
