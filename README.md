# How I Use Jev

A feasibility-reviewed catalogue of what Jev (TypeSafe's "System One" model) is actually good for, what people are genuinely using it for, and what the popular examples get wrong.

**Purpose:** decide whether a task is worth building on Jev before you build it, and know which claims in circulating write-ups are unverified.

---

## 1. What Jev actually is

Jev does not generate text. You send it **state** (a string, JSON object, or array) plus **typed questions** whose answer spaces you define in advance, and it returns a constrained value with a probability distribution:

| Primitive | Shape | Returns |
|---|---|---|
| `Choice` | pick one from a set you enumerate (up to 255) | the choice, a probability for **every** option, `confidence` |
| `Score` | position on an ordered rubric, each level described in words | probability-weighted `score` (may land between levels), `legend`, `confidence` |
| `Noul` | is this statement true | a single `0`–`1` probability. Near `0.5` means *uncertain*, not "medium" |

The design rule that matters more than the primitives: **questions describe judgments; code owns composition, thresholds, and side effects.**

### Verified facts

| Item | Detail |
|---|---|
| Price | **$0.042 per 1M input tokens; output free** |
| Latency | 70–500 ms end-to-end, **measured from US West Coast** |
| Limits | 250,000 tokens/sec, 1,200 requests/min |
| Context | 64k tokens/request; docs advise ≤32k for state + longest question |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, alias `jev-latest` |
| Modalities | **Text only** — no images, audio, or video |
| SDKs | Python (`typesafe-sdk`), JS/TS (`@typesafe-ai/sdk`), Swift (community) |
| Also via | Vercel AI Gateway (`typesafe-ai/jev`), Cloudflare Workers AI (`typesafe/jev`) |

### Two corrections to the circulating write-ups

These appear in the most-shared "how people are using Jev" video and several blog posts:

1. **The price is $0.042/1M, not $4.20/1M.** The video's "$4.2" is a transcription artifact and is **100× too high**. Every cost comparison that quotes $4.2 is wrong by two orders of magnitude — and in the *conservative* direction, which is why the flawed number still made the economics look attractive. Real comparison: **~$0.0004 per case vs $0.0304 (GPT-5.6 Terra) and $0.1761 (Claude Opus 5)** on TypeSafe's own workflow benchmark.
2. **The binary primitive is `Noul`, not "Bernie."** "Bernie" is a garbled transcription of a pronunciation. It also is not a yes/no *label* — it returns a probability, which is the feature.

### The decisive economic property

Questions are evaluated **in parallel within one request**, so the 9th or 10th question on the same state costs additional *tokens* but essentially no additional *latency*. TypeSafe measured 13 questions in a single call as **12.2× cheaper and 10× faster than one at a time, with identical answers.**

This inverts the usual tradeoff. Normally, adding questions costs money *and* time. Here, adding questions is nearly free in time and trivially cheap in money — so the correct design instinct is **ask everything you might need, then throw away what you don't use in code.** Speculative fan-out is the flagship pattern, not a hack.

---

## 2. Feasibility gates

Apply these before writing code. They are the whole decision.

### Hard requirements — a task must pass all four

1. **The answer space is known in advance.** A category, a level, a yes/no. If the answer is a sentence or a calculation, it is not a Jev task.
2. **The decision repeats.** Hundreds of times a day, or millions in a batch. A one-off decision does not amortize.
3. **Latency or cost matters.** It sits in a request path, an agent loop, or a data pipeline.
4. **A wrong answer can be caught.** You can route low-confidence cases to a human or a stronger model.

The fastest way to find candidates in an existing codebase: **search for LLM calls immediately followed by a JSON parse into a fixed set of values.** Every one of those is a Jev-shaped hole.

### Hard prohibitions — never delegate these to Jev

- **Arithmetic, counting, date comparison.** It extracts facts; it does not compute. Do totals in code.
- **Multi-step reasoning.** Accuracy decays per hop. One question, one judgment.
- **Free-text extraction.** It selects among values *you* supply; it cannot invent a value you did not enumerate. Use a small generative model to propose candidates, then Jev to *choose* among them.
- **Anything requiring a rationale an auditor can read.** It returns a number with no attached reasoning.
- **Anything where being wrong is expensive and not caught downstream.** Hiring, money, and security are the three named risk areas.

### Sharp edges that will bite

- **State is not treated as hostile.** TypeSafe's own jaggedness page warns that text written to argue for its own classification can shift the answer. For a guardrail or moderation check, that is precisely the attack you are defending against. **Red-team your checks before trusting them.** This is the single most under-discussed limitation.
- **US-West-Coast latency.** The 70–500 ms figure was measured from there. From Europe, add real round-trip. Measure before designing a UX around "100 ms" — and note that any idea below is already impaired for EU users specifically.
- **Text only.** Any "analyze the video/image" idea needs transcription or OCR first, and that cost belongs in your budget, not Jev's.
- **Multi-hop chains decay.** A pipeline of Jev decisions compounds error even though each step is individually fast.
- **Include an explicit `other` / `none_of_the_above` option** in every `Choice`. Without it, the model picks the closest wrong category instead of admitting nothing fits — this is the most common implementation bug in the list below.
- **Pin a versioned model ID** if your thresholds depend on model behavior, and log which version answered. `jev-latest` can move under you.
- **English-first.** Test non-English workloads on representative data before trusting calibrated thresholds.
- **TypeSafe says it cannot yet prove the pricing isn't subsidized.** Treat vendor-reported speed and cost as workload-dependent and re-benchmark on your own state and question design.

---

## 3. Ten project ideas (original)

Each was checked against the gates above. Verdicts are honest — two did not survive.

### 1. Documentation Time Machine ✅ VIABLE

**What:** Fix one question panel — "does this page state a version number?", "is there a runnable example?", "does this instruction still name a real CLI flag?", "does this claim cite a source?" — and rerun it against the same docs every week, storing per-question probability per page.

**Why:** Every published Jev example is a one-shot snapshot. A 586-page link audit tells you where the gaps are *today*, not which gaps are *widening*. Documentation rot is expensive precisely because nobody notices until a user files a bug, by which point the page has usually been rewritten.

**How:** Version-control the panel next to the docs, run on a schedule, and render decay per page rather than a repo-wide pass/fail. The new output is the **derivative**: a page whose "is this flag still valid" probability fell 0.3 this month is categorically different from a page that was always weak, and no amount of reading finds that.

**Feasibility:** Passes all four gates. The panel is writable in advance, the corpus is large, cost is trivial, and a low score is cheap to ignore. Prefers pages over full files so per-item state stays small.

### 2. Shadow Routing ✅ VIABLE — the one I'd build first

**What:** Run routing decisions in shadow mode against real tickets or incidents for a month. Log `(item, jev_pick, human_pick, human_latency)` for every decision, and produce a map of where your team's unwritten rules diverge from its written ones.

**Why:** Box shipped incident triage and Attio proposed lead scoring, but both assume the labels are already correct. In practice the labels encode judgment calls nobody wrote down — the tier-2 escalation that always goes to one person, the "P1" that is actually a partner asking for a refund. A shadow run surfaces those **with zero risk cost**, because nothing changes behaviour.

**How:** Cluster the disagreements. Each cluster is a rule the organisation has but hasn't documented. You get a prioritised list of routing rules *and* a calibrated accuracy estimate — which is exactly the "label 50 examples yourself and compare" test everyone recommends, run at production volume instead of on a sample.

**Feasibility:** The strongest of the ten. Nothing acts on the output, so all four gates are trivially satisfied. This is also the lowest-stakes possible path to a calibrated threshold, which is the thing you need before shipping anything automated.

### 3. Rubric Compiler ✅ VIABLE WITH CHANGES

**What:** Compile a natural-language rubric — "is this support reply empathetic?", "does this design doc state a tradeoff?", "is this PR description honest about what it doesn't do?" — into a panel of 8–15 binary questions, each with a written answer key, producing a reusable eval harness.

**Why:** The "checking work against rules" category requires a translation step the ecosystem names but nobody has solved: *you'd basically need to go through a translation process for your rules.* That translation is the bottleneck, and it is exactly the part a reasoning model is good at.

**How:** A reasoning LLM does the compilation once, emitting a versioned YAML panel; Jev then executes it at $0.042/1M across every output. Enforce **one judgment per question** — "is this empathetic?" is three questions wearing a coat. The compiler's real job is splitting.

**Change required:** Ship the **panel format** as the artifact, not the tool. A team that has compiled its rubric once can execute that panel on any model, and the rubric becomes reviewable by a human who cannot read YAML. Otherwise you've built a dependency on a model you are claiming you don't need.

**Evidence anchor:** Typesafe planted 7 errors in passages. Jev caught **6 in 0.35 s**; Claude Fable 5.1 caught **all 7 in 8.83 s** — roughly 580× cheaper, and cheap enough to rerun on every commit. Note it still missed one: this gates on *regression*, not on correctness.

### 4. Decision Ledger ⚠️ VIABLE WITH CHANGES

**What:** Ask "did a decision get made here?", "who owns the resulting action?", "was a date committed to?" across meeting transcripts. Then cross-reference each extracted commitment against later meetings: "was this action reported complete?"

**Why:** Meeting summarisation is the most saturated AI use case in existence and a *bad* fit for Jev, because the output is prose. The underexploited version is verification over time — a yes/no question with a written answer key. Nobody in the ecosystem does this, and the corpus is already structured by time, so a commitment has a natural observation window.

**How:** Pass one extracts `(action, owner, date, source_meeting)`. Pass two asks the completion question about each action at the next meeting mentioning that owner. Output is a commitment-survival rate plus an escalation list where an action recurs across three meetings without closing.

**Change required:** The extraction step is a `Choice` over *pre-enumerated* commitment types, not free-text extraction — Jev cannot invent an action phrase you did not offer. Keep the phrase in code (regex/NLP), use Jev only to classify and verify it. The transcript-parsing is the expensive part of this project and is not a Jev problem.

**Feasibility:** Weaker than the others. Volume is good, stakes are low, but the ceiling is set by your transcript quality and the enumeration of commitment types. Worth a pilot, not a bet.

### 5. Skill Library Autopsist ✅ VIABLE

**What:** Extend the 88%-token-reduction skill router into a hygiene tool that also reports dead, conflicting, and redundant skills.

**Why:** The router solved cost but created a new problem: a skills library only pays off if it stays accurate, and nothing in the router notices when a skill hasn't fired in 90 days or when two skills both match the same request. Since the router already asks "which skill fits this request, if any?" on **every** call, the match matrix is a free byproduct — it is the entire library's coverage graph, already computed.

**How:** Log every routing decision with skill ID and timestamp. Then ask offline: which two skills won overlapping requests? Which skill has lost every request for 90 days? **Which request class consistently matches nothing?** That last one is the valuable finding — a measured gap in your library rather than a guess, and it tells you exactly which skill to write next.

**Feasibility:** Clean fit. The questions are all writable in advance, volume is enormous, and the analysis is offline batch so latency is irrelevant. Evidence: 88% token/cost reduction is a real published measurement from a Claude Code skill-suggestion build.

### 6. Job Description Archaeologist ⚠️ VIABLE WITH CHANGES

**What:** Ask "does this JD's stated seniority match what this person was promoted to?", "does this JD list a skill the person never used?", "does the stated meeting load match their calendars?" across your entire hiring history, then report where written roles diverge from jobs people actually did.

**Why:** Hiring is a named caution area, and rightly so — ranking candidates on an unreasoned number is dangerous. But **auditing your own history inverts the risk**: nothing is decided, nothing is gated, and the output is organisational learning rather than a judgement about a person. It also exploits the free-questions property: you can ask 12 questions about every historical hire for a fraction of a cent, and your sample is people you *already hired*, so there is no fairness question about who got screened.

**How:** Ask the questions of the JD text, then of performance-review and promotion records, and diff per person. The signal that matters is systematic: if JDs promise 30% architecture work and nobody exceeds 5%, that's a compensation and retention problem you can now name with evidence.

**Change required:** Access to performance-review data is the real blocker, not the model. This is a data-governance project wearing a Jev costume. Confirm HR data access before scoping.

### 7. Claim Decay Monitor ✅ VIABLE

**What:** Extract every checkable factual claim from your published content as a panel of binary questions — "does this version still exist?", "is this API parameter still accepted?", "is this command still valid?" — then re-verify on a schedule and alert **only on claims that have decayed**.

**Why:** Distinct from idea 1, which audits *structure*; this audits *facts*. A stale number in a doc is actively harmful in a way a missing example is not, because a reader makes a decision on it. The panel is also stable over time, so almost every call after month one is pure detection rather than discovery — the cheapest possible workload shape.

**How:** Extract once, store `(claim, question, source_file, line)` as a versioned artifact, then re-ask only questions whose subject is plausibly volatile — anything version-, price-, or date-bearing — monthly. Make the alert asymmetric: a true→false claim is worth waking someone for; false→true is not.

**Feasibility:** Passes. Two notes: (a) put the *new* value in the state, since Jev cannot fetch it — "is version 2.3.1 still the latest?" needs current data supplied, and Jev judges only what you give it; (b) date comparison is a hard prohibition, so a claim like "this was updated last week" must be reduced to a current-value-in-state question.

### 8. Copy Consistency Auditor ✅ VIABLE — best pure fit

**What:** Run a fixed binary panel across every user-facing string — button labels, error messages, empty states, confirmation dialogs — asking "is this error actionable?", "is this label consistent with other buttons in this flow?", "does this message say what to do next?", "does this use a term the product uses elsewhere?"

**Why:** The purest possible fit for the constraints and nobody is doing it. Enormous volume (a mid-sized product has thousands of strings), near-zero stakes, always a written yes/no, and every string fits in a few hundred tokens. The 586-page internal-link audit is the direct precedent — 8,790 yes/no calls for $0.45, described by its author as *"paying frontier prices to do it one page at a time."* Copy is the identical shape and nobody has priced it.

**How:** Extract strings from the component tree or a locale bundle, batch 50–100 per call, emit `(string_id, question, probability, current_label)`. The high-value output isn't "this error is bad" — it's the **systematic** finding: if 40% of error messages lack a next action, that's one design decision to make once instead of forty tickets.

**Feasibility:** The cleanest of the ten. Nothing to change.

### 9. Win/Loss Pattern Extractor ✅ VIABLE

**What:** Screen past bids, RFPs, and proposals with a per-item eligibility panel — "does this ask for a capability we have?", "is there a disqualifying constraint?", "does the submission window suggest a process we've failed before?" — then correlate the panel results against actual outcomes to find **which single question best predicts a loss**.

**Why:** The marketing examples (724 ads, 3,300 posts) all stop at description. Correlating the cheap judgment against a ground-truth outcome is what turns a pile of classifications into a decision rule — and the label already exists in your CRM, so the ground truth is free. This is the only way to get value out of a judgment nobody can specify in advance, which is exactly why you need volume: you cannot write down what loses you a deal, but you can measure which of 12 candidate questions correlates with it across 400 historical bids.

**How:** Build the panel from your last five **losses** rather than wins, since loss causes are more diagnostic. Run over the full archive, compute per-question lift against the won/lost label, then ship the single highest-lift question as a pre-bid go/no-go check — cheap enough to run before anyone writes a word.

**Feasibility:** Passes, with one caution. Correlating a single question's probability against a binary outcome over ~400 samples is thin statistics — require a meaningful lift before trusting it, and treat the result as a hypothesis to test prospectively. And note the prohibition: Jev extracts the constraint, code computes the arithmetic and checks the deadline.

### 10. Deploy-Gate Eval Harness ✅ VIABLE — with a stated limit

**What:** Fix one question panel per production agent that grades **traces** rather than outputs, and run it on every deploy as a numeric gate that blocks promotion.

**Why:** Online evals are the named killer application, and the economics are what change the design: a frontier-model eval you run weekly is a ritual; the same eval run on every commit is a constraint. Agent-trace observability is one of TypeSafe's own four benchmark workflows, so this is tested rather than extrapolated.

**How:** Instrument the agent to emit traces. Define the panel as versioned YAML with per-question thresholds. Require the aggregate to clear a line that ratchets upward. **Keep deterministic checks outside Jev**: it judges whether a tool-call sequence was appropriate; code asserts the schema was valid and no tool crashed. The two never substitute for each other.

**Stated limit, not a caveat:** the vendor benchmark caught 6 of 7 planted errors. This harness catches roughly six of seven defect classes. Therefore gate on **regression** — a trace scoring materially below last week gets stopped — and never present it as a correctness gate. A novel failure mode gets through to production; that is the design, not a bug.

---

## 4. What people are actually building

### From the ecosystem, with verdicts

| Use case | Who / evidence | Feasibility |
|---|---|---|
| **Support ticket triage** — department, urgency, refund intent, frustration in one call; code routes | Valyu estimate: ~$6,480 per 1M tickets vs $30,400. Must include an explicit `other` option | ✅ Canonical fit. Start here |
| **RAG passage filtering** — one `Noul` per passage, keep only what clears threshold | Official cookbook. Filter costs less than the context tokens it saves | ✅ Canonical. Ceiling set by retrieval quality |
| **Guardrails on every LLM output** — leakage, unsupported claim, injection, as `Noul`/`Score` | ~$0.00006 per check ⇒ ~$60 per million checks, flipping sampling into checking everything | ⚠️ **Red-team first.** State is not treated as hostile — this is the attack surface |
| **Semantic code search / reranking** — BM25 shortlist, then `Noul` per chunk | `jgrep` 16 chunks/request; `oko` publishes Agent Retrieval Bench + SWE-Explore raw results; `jevr` Rust, sha256-keyed cache | ✅ Measured, open benchmarks. Strongest evidence tier |
| **Site search** — "would the visitor be glad to land here?" | `jevsearch`: Hit@1 83% vs 41% keyword-only, 41 labelled queries, results committed | ✅ Author-reported with artefacts |
| **Agent loop control** — choose next action; decide continue/retry/ask/stop | Browser-use agent booked Zürich→London in 7.1 s for $0.0039. Computer-use: $0.0002/decision vs $0.032 for Opus 5 on screenshots | ✅ At volume. Frontier reasoning must be rebuilt as explicit code |
| **Skill / model routing** — 88% token and cost reduction | Vercel: 50% lower cost, faster runs, reasoning-effort control inside Codex | ✅ Most common community pattern |
| **Pre-commit secret & destructive-command gate** | `jev-git` Rust, staged-diff `Noul` screening | ✅ Small, cheap, immediately useful |
| **Semantic linting of docs against your ruleset** | `slop-grader`, `jev-pref` (encodes AGENTS.md preferences as rules) | ✅ Direct sibling of idea 3 |
| **Code review against team preferences** | `jev-pref`: findings fed back to the agent, never auto-applied | ✅ Correct boundary — annotate, don't rewrite |
| **SQL / DuckDB native extensions** — `Noul`/`Choice`/`Score` as SQL predicates | `jevql` (Postgres), `duckdb-jev` (native C++, JSONL/STRUCT/LIST/ARRAY) | ✅ Novel surface. Strong if you already live in SQL |
| **Synthetic data curation** | `jev-curate` Rust sifter, streams clean rows to disk | ✅ Batching is the whole point |
| **Calibration tooling** | `jevcal` fits per-question thresholds on labelled data → calibration lock file; `Janus` publishes raw JSONL + figures | ✅ **Underrated.** Read this before trusting any threshold |
| **Structure recovery from messy text** | Two-pass: rejoin hard-wrapped lines, then classify blocks | ✅ Niche, real |
| **Security incident response** | Join alert + asset context + tickets + maintenance windows; playbook picks close/queue/notify/contain | ✅ Official eval. Ask deeper questions only after the first branch |
| **Invoice / expense / insurance triage** — semantic checks in Jev, arithmetic in code | Official evals. Per-action thresholds: auto-tag at 0.6, auto-pay only above 0.85 | ✅ Right split. Never let Jev touch dates or totals |
| **ArXiv paper radar** | 501 papers for $0.0196; includes a `calibrate` command | ✅ Verifiable |
| **YouTube sponsor detection** | `jev-skip` paints per-segment sponsor probability on the seek bar; 77% of SponsorBlock seconds, 23 videos, $0.0008/video | ⚠️ Nice, but note it needs the **caption track**, not video |
| **Social-feed slop filtering** | `jev-slop-guard`, `jev-linkedin-slop-filter` (14-post labelled set), `slop-grader` | ✅ Annotates, never hides — the right default |
| **YouTube spoiler protection** | `PlotVeil`: 20 `Noul`s per request, thresholds 0.85/0.7/0.5, **fails closed** (leaves comment covered) | ✅ Excellent failure-mode design |
| **Adversarial asymmetry research** | `jevradar`: natural-language wording induces buy/sell conviction asymmetry in the model itself | ⚠️ Research finding, not a product. Read it before trusting any LLM-generated score |
| **Trust-degrading agent governance** | `r2r-jev`: two `Noul`s per tool call degrade persistent Trust/Delegation relations until human override | ⚠️ Interesting, unproven at scale |
| **Subtitle translation QC** | One `Noul` per cue; flags suspicious lines for human review, never rewrites | ✅ Correct boundary |
| **Sleep/wake gating for long-running agents** | `wakegate`: skip wakeup only below 0.2; always wake on user message, error, timeout | ✅ Reusable pattern for any expensive-resume decision |
| **Real-time game control** | Snake, Chess, Wikiracing, Doom (~10 decisions/sec, ~$7/hr), Pokémon Red with Brier-scored faint predictions | ⚠️ Excellent engineering demos; code must generate all legal moves so illegal states are impossible |
| **Drone tactical judgment at 2.5 Hz** | Jev advises only; flight control and safety stay in code at 50–500 Hz | ✅ Read this one for the right mental model |
| **Trading bots** | `jev-trader`, `Jev Trade` (Hyperliquid), `QuantDinger` pre-trade gate | ❌ **Do not.** Dry-run paths exist precisely because these are unvalidated. Jev returns no rationale; capital allocation needs one |
| **Market-making at ~81 ms** | Community build | ❌ Same reasoning. Latency is a distraction from the real problem: no explanation attached to a fill |

### Ideas I rejected after review

Listing these because "why not X" is usually more useful than another "X".

| Idea | Why it fails the gates |
|---|---|
| Summarise documents / meetings | Output is prose — hard prohibition. Use an LLM. |
| Generate code or contracts | Explicitly cannot. |
| Do the arithmetic on extracted dates/amounts | Hard prohibition. It extracts, you compute. |
| Rank job applicants with a Jev score | The named caution case. Unreasoned number gating a person. If you must, use Jev to *surface* borderline cases for a reasoning model, never to decide. |
| "AI judge" for free-form quality scoring | If you can't write the rubric in advance, you can't write the rubric as a `Score` legend either — so you can't calibrate it, which makes the number untrustworthy. |
| Any use requiring an auditable rationale | Returns a number with no reasoning attached. |
| Real-time UI in the EU at sub-100 ms | Works from US West Coast; add your round-trip and measure before designing around it. |
| "Just swap Jev in for your LLM classifier" | Check for multi-hop reasoning first — that's where accuracy silently dies, and the failure is invisible without a labelled eval. |

---

## 5. If you build one thing

Build **Shadow Routing** (idea 2). It needs no new infrastructure, acts on nothing, and produces the one artifact every later project requires: **a calibrated accuracy estimate on your own data.** Everyone quotes vendor benchmarks; almost nobody has measured their own corpus. Get that first, and the other nine become ordinary engineering.

Then follow the ecosystem's own advice, which is the right advice:

> Do some tests before you actually trust it in production. Label ~50 examples yourself and compare.

---

## Sources

- TypeSafe: [docs](https://docs.typesafe.ai/introduction) · [patterns](https://docs.typesafe.ai/patterns) · [model jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) · [workflow evals](https://evals.typesafe.ai/) · [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- Ecosystem survey: [Anil-matcha/awesome-jev-by-typesafe](https://github.com/Anil-matcha/awesome-jev-by-typesafe) (snapshot 2026-09-19) — source of the per-project evidence links above
- Practical review with feasibility warnings: [binubabu.in](https://www.binubabu.in/blog/jev-typesafe-practical-use-cases)
- Project index: [jevradar.com](https://www.jevradar.com) · [awesomejev.com](https://awesomejev.com/)
- Community use-case roundup: "How People Are Actually Using Jev", The AI Daily Brief — source of the 586-page, 724-ad, 3,300-post, 100-email and 384-article figures. **Its cost figure is wrong by 100×; see §1.**

## Honesty notes

- Every cost and latency number above is vendor-reported or author-reported, never independently verified. Re-benchmark on your own state and question design.
- TypeSafe states it cannot yet prove the listed pricing isn't subsidised.
- Projects marked ❌ are not claims that the authors are careless — several ship dry-run defaults and closed-loop designs that are more careful than most production trading systems. They are marked ❌ because *you* should not put capital behind an unreasoned number.
- The ten original ideas in §3 are proposals. Only §4 has implementations behind it.
