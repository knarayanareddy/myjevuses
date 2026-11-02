import type { JevProvider } from "../engine/types.js";
import { tokenize } from "../engine/text.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

const EXISTING_MEMORY = `- When a parcel shows delivered but the customer denies receipt, open a not-delivered claim instead of closing the ticket.
- Refunds above $200 need a second approver before the refund is issued.
- Dates written DD/MM/YYYY in supplier invoices must be parsed as day-first, not month-first.`;

const TRACE = `1. tool: call_carrier_api(tracking=TRK-88120) → 429 Too Many Requests
2. tool: call_carrier_api(tracking=TRK-88120) → 429 Too Many Requests
3. user: Tracking still shows nothing. This is the third day.
4. assistant: I retried straight away and hit the carrier rate limit twice. I should have backed off before retrying.
5. tool: call_carrier_api(tracking=TRK-88120, wait=30s) → 200 OK, tracking updated
6. assistant: Backing off thirty seconds worked; tracking is updated.`;

const TRACE_KNOWN = `1. tool: close_ticket(ord_5521, resolution="delivered")
2. user: No! The parcel never arrived. Why did you close it?
3. assistant: You're right — closing it was wrong. A delivered scan is not proof of receipt.
4. tool: open_claim(ord_5521, reason="not-delivered")
5. tool: notify_customer(ord_5521, message="Replacement ships in 2 business days")
6. assistant: I reopened this as a not-delivered claim and arranged a replacement.`;

const TRACE_NOISE = `1. assistant: I'll check the order.
2. tool: get_order(ord_5531) → delivered last Tuesday
3. assistant: Delivered last Tuesday, so nothing to do.
4. user: Fine, thanks.
5. assistant: Marking this resolved.`;

const LESSON_TYPES = [
  { id: "verify-before-close", label: "verify before closing", detail: "a delivery scan is not proof of receipt; open a claim before resolving" },
  { id: "parse-day-first", label: "parse dates day-first", detail: "supplier invoices use DD/MM/YYYY; day-first parsing avoids swapped months" },
  { id: "approval-threshold", label: "check approval threshold", detail: "refunds above the approval limit need a second approver first" },
  { id: "tool-error-retry", label: "retry with backoff", detail: "a 429 from the carrier API needs backoff, not a retry immediately" },
];

export const memoryGate: UseCaseMeta = {
  id: "memory-promotion",
  index: 12,
  title: "Memory promotion gate",
  tagline: "Promote the reusable lesson; discard the ticket-specific noise.",
  category: "Memory",
  verdict: "Fit with a caveat",
  primitives: ["Noul", "Choice"],
  whyItFits: "A finished trace either contains a correction worth remembering or it does not, and the candidate lesson is a shortlist you can enumerate. Keeping the evidence pointer in code means every memory is traceable to the run that taught it.",
  gates: {
    answerSpace: "Does a correction exist, is it reusable, is it a duplicate, which known lesson class.",
    repeats: "Every completed trace — the gate must be cheap enough to run on all of them.",
    latencyOrCost: "Memory pollution is permanent: one bad promoted lesson poisons every later session.",
    wrongAnswerCaught: "The duplicate check, the evidence pointer, and a human review queue for low confidence.",
  },
  sharpEdge:
    "This is the use case where I would demand the most evidence before trusting it: a promoted memory changes behaviour long after the run that produced it. Require a verbatim quote from the trace, reject anything the existing library already covers, and keep a one-click revoke.",
  codeOwns: ["Splitting the trace", "Extracting the correction verbatim", "Duplicate search", "Writing the record with its evidence pointer"],
  jevOwns: ["Whether a correction exists", "Whether it generalises", "Which known lesson class it belongs to"],
  inputs: [
    { key: "trace", label: "Completed trace", type: "textarea", rows: 10, default: TRACE },
    { key: "memory", label: "Existing memory", type: "textarea", rows: 5, default: EXISTING_MEMORY },
  ],
  presets: [
    {
      label: "Task-specific noise",
      note: "Nothing went wrong. The gate should promote nothing.",
      input: { trace: TRACE_NOISE, memory: EXISTING_MEMORY },
    },
    {
      label: "Already known",
      note: "A near-copy of memory entry one. The duplicate check should suppress it.",
      input: { trace: TRACE_KNOWN, memory: EXISTING_MEMORY },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const trace = input.trace ?? "";
    const memory = input.memory ?? "";
    const steps = trace.split("\n").map((l) => l.trim()).filter(Boolean);
    const panel = new Panel(provider);

    // State is the trace alone: each memory entry is quoted inside its own
    // question, so a match means the trace really teaches that rule rather
    // than the entry being visible in the state.
    await panel.run(
      trace,
      [
        {
          kind: "noul",
          id: "corrected",
          prompt: "A correction of an earlier action appears in this trace",
          trueCriteria: "correction: wrong step reopened or redone differently after the user pushed back",
          falseCriteria: "ran straight through on the first attempt with no apology",
        },
        ...memoryEntries(memory).slice(0, 6).map(
          (entry, i): import("../engine/types.js").Question => ({
            kind: "noul",
            id: `duplicate-${i}`,
            prompt: `This trace teaches the same rule as: ${entry}`,
          })
        ),
        {
          kind: "choice",
          id: "lesson-type",
          prompt: `Which known lesson class does this trace teach: ${trace}`,
          allowNone: true,
          options: LESSON_TYPES.map((l) => ({ id: l.id, label: l.label, detail: l.detail })),
        },
      ],
      {
        corrected: (a) => ({ verdict: a.kind === "noul" && a.p >= 0.5 ? "correction found" : "no correction", threshold: 0.5 }),
        "lesson-type": (a) => ({ verdict: a.kind === "choice" ? a.pick : "", itemId: "lesson-class" }),
        ...Object.fromEntries(
          memoryEntries(memory).slice(0, 6).map((_, i) => [
            `duplicate-${i}`,
            (a: import("../engine/types.js").Answer) => ({
              verdict: a.kind === "noul" && a.p >= 0.6 ? "already in the library" : "new",
              threshold: 0.6,
              itemId: `memory-${i + 1}`,
            }),
          ])
        ),
      }
    );

    const pCorrected = panel.noul("corrected");
    const entries = memoryEntries(memory).slice(0, 6);
    const perEntry = entries.map((entry, i) => ({ entry, p: panel.noul(`duplicate-${i}`) }));
    const pDuplicate = perEntry.reduce((max, e) => Math.max(max, e.p), 0);
    const lessonType = panel.choice("lesson-type");
    const typeKnown = lessonType.pick !== "__none__" && lessonType.confidence >= 0.3;
    const lessonDetail = LESSON_TYPES.find((l) => l.id === lessonType.pick)?.detail ?? "";

    // Deterministic duplicate pre-check: how much of the proposed lesson is
    // already present in an existing memory entry. Jev's opinion can raise the
    // score but never lower it, so a near-copy cannot slip through.
    const entryOverlap = memoryEntries(memory).map((entry) => ({
      entry,
      overlap: jaccard(lessonDetail, entry),
    }));
    const maxOverlap = entryOverlap.reduce((max, e) => Math.max(max, e.overlap), 0);
    const duplicateByCode = maxOverlap >= 0.3;
    const duplicate = pDuplicate >= 0.6 || duplicateByCode;

    const correctionStep = steps.find((step) => /wrong|instead|right|sorry|reopen|should have|backed off/i.test(step)) ?? "";
    const evidenceIndex = steps.indexOf(correctionStep) + 1;

    const checks = [
      { id: "correction-exists", pass: pCorrected >= 0.5, detail: `p=${pCorrected.toFixed(2)} ≥ 0.50` },
      { id: "known-lesson-class", pass: typeKnown, detail: typeKnown ? `${lessonType.pick} (${lessonType.confidence.toFixed(2)})` : "no class cleared 0.30" },
      { id: "not-a-duplicate", pass: !duplicate, detail: duplicate
          ? duplicateByCode
            ? `lesson overlaps an existing entry by ${(maxOverlap * 100).toFixed(0)}%`
            : `p(duplicate)=${pDuplicate.toFixed(2)}`
          : `p(duplicate)=${pDuplicate.toFixed(2)}, max overlap ${(maxOverlap * 100).toFixed(0)}%` },
      { id: "has-evidence", pass: correctionStep !== "", detail: correctionStep ? `quote from step ${steps.indexOf(correctionStep) + 1}` : "no correction line found" },
    ];
    const promote = checks.every((c) => c.pass);

    const record = promote
      ? {
          id: `mem-${Math.abs(hash(`${lessonType.pick}${correctionStep}`)).toString(36).slice(0, 8)}`,
          lesson_class: lessonType.pick,
          text: LESSON_TYPES.find((l) => l.id === lessonType.pick)?.detail ?? "",
          evidence: { trace: "run_88214", step: evidenceIndex, quote: correctionStep },
          confidence: Number(Math.min(pCorrected, 1 - pDuplicate).toFixed(2)),
          source: "auto-promoted",
        }
      : null;

    return {
      summary: [
        { label: "Gate", value: promote ? "PROMOTED" : "DISCARDED", tone: promote ? "good" : "neutral" },
        { label: "Correction", value: pCorrected.toFixed(2), hint: "p(correction exists)" },
        { label: "Lesson class", value: typeKnown ? lessonType.pick : "none", hint: `duplicate ${pDuplicate.toFixed(2)}` },
        { label: "Cost", value: money(panel.costUsd), hint: `one request, ${2 + entries.length} questions` },
      ],
      panels: [
        {
          title: "Promotion panel",
          note: "One Noul asks whether a correction exists, one Noul per existing memory entry asks whether this trace teaches the same rule, and a Choice names the lesson class. All in one request.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Gate checklist",
          kind: "list",
          note: "All five must pass. Code evaluates the conjunction; the model supplies no overall verdict to overrule it.",
          rows: checks.map((c) => ({
            id: c.id,
            label: c.id.replace(/-/g, " "),
            value: c.pass ? "pass" : "fail",
            status: c.pass ? ("pass" as const) : ("fail" as const),
            meta: c.detail,
          })),
        },
        {
          title: "Memory record",
          kind: "code",
          preview: record
            ? JSON.stringify(record, null, 2)
            : JSON.stringify(
                {
                  promoted: false,
                  reason: checks.filter((c) => !c.pass).map((c) => c.id),
                  trace: "run_88214",
                },
                null,
                2
              ),
          rows: [],
        },
        {
          title: "Evidence in the trace",
          kind: "list",
          rows: steps.map((step, i) => ({
            id: `s${i + 1}`,
            label: truncate(step, 88),
            status: correctionStep && step === correctionStep ? ("keep" as const) : ("neutral" as const),
          })),
        },
      ],
      decisions: [
        {
          title: promote ? "Promoted with evidence" : "Not promoted",
          detail: promote
            ? `Wrote ${record?.id} with a verbatim quote from step ${evidenceIndex}. The pointer is what lets you revoke a memory later.`
            : `Failed: ${checks.filter((c) => !c.pass).map((c) => c.id).join(", ")}. Nothing enters memory.`,
          status: promote ? "ok" : "info",
        },
        {
          title: duplicate ? "Duplicate suppressed" : "Novel lesson",
          detail: duplicate
            ? `Existing memory already covers this behaviour${duplicateByCode ? ` (${(maxOverlap * 100).toFixed(0)}% term overlap with the closest entry)` : ""}. Promote nothing — duplicate memories crowd the prompt and dilute retrieval.`
            : `No existing entry covers this lesson (closest overlap ${(maxOverlap * 100).toFixed(0)}%).`,
          status: duplicate ? "warn" : "ok",
        },
        {
          title: "Revocable by construction",
          detail: "Every promoted lesson carries its trace id and step index, so a bad promotion can be found, quoted, and removed.",
          status: "info",
        },
      ],
      code: [
        {
          title: "Five gates, one conjunction",
          language: "ts",
          body: `const { answers } = await jev.ask({
  state: \`Trace:\\n\${trace}\\n\\nExisting memory:\\n\${memory}\`,
  questions: {
    corrected:   noul(\`The trace contains a correction of an earlier action: \${trace}\`),
    reusable:    noul(\`The lesson generalises beyond this ticket: \${trace}\`),
    specific:    noul(\`This trace is too specific to teach anything reusable: \${trace}\`),
    duplicate:   noul(\`This lesson is already covered by existing memory: \${memory}\`),
    lessonClass: choice("Which known lesson class?", LESSON_CLASSES),
  },
});

const promote =
  answers.corrected.noul   >= 0.5 &&
  answers.reusable.noul    >= 0.5 &&
  answers.specific.noul    <  0.5 &&
  answers.duplicate.noul   <  0.5 &&
  answers.lessonClass.choice !== "none";

if (promote) writeMemory({ ...answers.lessonClass, quote: findCorrection(trace), trace: runId });`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "The caveat: this is the use case I would pilot offline before letting it write to memory. Run it on 200 historical traces, review every promotion by hand, then automate.",
        "A promoted lesson is a permanent prompt change. Keep the review queue for the first month — the false-positive cost is silent behaviour drift.",
      ],
    };
  },
};

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h << 5) - h + value.charCodeAt(i);
  return h;
}

function memoryEntries(memory: string): string[] {
  return memory
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function jaccard(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}
