import type { JevProvider } from "../engine/types.js";
import { estimateTokens } from "../engine/types.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

const TASK = "Migrate the billing service from the old webhook queue to the new event bus, then verify refunds still fire.";

const TRACE = `[step 1] user: We need to move billing webhooks off the legacy queue before Friday. Refunds must keep working.
[step 2] assistant: I'll inspect the queue configuration first.
[step 3] tool: read_file billing/config/queue.yml → 41 lines
[step 4] tool: read_file billing/config/queue.yml → 41 lines (unchanged)
[step 5] tool: grep "legacy_queue" billing/ → 7 matches in 4 files
[step 6] assistant: The producer still publishes to legacy_queue in webhook_producer.rb:88.
[step 7] tool: read_file billing/webhook_producer.rb → 212 lines
[step 8] note: The staging Redis instance is named redis-stg-07 and the office wifi password rotates monthly.
[step 9] tool: edit webhook_producer.rb → replaced LEGACY_QUEUE with EVENT_BUS_TOPIC (3 hunks)
[step 10] tool: run "bundle exec rspec spec/billing/refund_spec.rb" → 18 examples, 2 failures
[step 11] error: refund_spec.rb:44 expected RefundJob to enqueue on refunds.v1, got legacy_queue
[step 12] assistant: The consumer needs the same migration. RefundJob still reads legacy_queue in refund_worker.rb:31.
[step 13] tool: read_file billing/config/queue.yml → 41 lines (unchanged)
[step 14] user: Also, the deploy window is 14:00 UTC and only the platform team can approve it.
[step 15] tool: edit refund_worker.rb → swapped queue constant, updated spec fixture
[step 16] tool: run "bundle exec rspec spec/billing" → 18 examples, 0 failures
[step 17] assistant: Migration complete. Deploy requires platform-team approval in the 14:00 UTC window.`;

export const contextCompaction: UseCaseMeta = {
  id: "context-compaction",
  index: 2,
  title: "Context compaction",
  tagline: "Choose which trace events survive — verbatim, not regenerated.",
  category: "Context",
  verdict: "Strong fit",
  primitives: ["Noul"],
  whyItFits: "Keeping an event is a yes/no decision with a written answer key. One Noul per event, and the kept text is copied byte-for-byte from the original, so nothing is paraphrased into a silent error.",
  gates: {
    answerSpace: "Keep / drop per event, asked one event per request.",
    repeats: "Every turn of a long-running agent, every summarisation boundary.",
    latencyOrCost: "Overflowing context costs frontier-model tokens every subsequent turn.",
    wrongAnswerCaught: "Pinned events and the last two turns are always retained by code.",
  },
  sharpEdge:
    "Compaction is a lossy operation with no undo. Keep a pointer to the original trace for every kept event, and always pin the newest turns — a compaction pass that drops the user's last message is unrecoverable.",
  codeOwns: ["Splitting the trace", "Pinning recent events", "Copying kept text verbatim", "Token accounting"],
  jevOwns: ["Whether each older event is still needed to continue the task"],
  inputs: [
    { key: "task", label: "Task", type: "textarea", rows: 2, default: TASK },
    { key: "trace", label: "Agent trace", type: "textarea", rows: 18, default: TRACE, help: "One event per line. Order matters." },
  ],
  presets: [
    {
      label: "Long noisy trace",
      note: "Adds status updates and a repeated file read; the keep set should barely move.",
      input: {
        task: TASK,
        trace:
          TRACE +
          `\n[step 18] assistant: Progress update — three of five files migrated, still on track.\n[step 19] tool: read_file billing/config/queue.yml → 41 lines (unchanged)\n[step 20] assistant: Reminder that Friday is the deadline.`,
      },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const task = input.task ?? "";
    const events = (input.trace ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const PINNED_TAIL = 2;
    const KEEP_AT = 0.5;

    // Exact duplicate reads are deterministic, so code removes them without
    // asking the model. Jev only sees events whose value is a judgment call.
    const normalised = events.map((event) =>
      event
        .replace(/^\[step\s*\d+\]\s*/i, "")
        .toLowerCase()
        .replace(/\(unchanged\)|\(still unchanged\)/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    );
    const isDuplicate = normalised.map((event, i) => normalised.slice(0, i).includes(event));
    const panel = new Panel(provider);
    const probs: number[] = [];

    for (let i = 0; i < events.length; i++) {
      const pinned = i >= events.length - PINNED_TAIL;
      if (pinned || isDuplicate[i]) {
        probs.push(0);
        continue;
      }
      await panel.run(
        `Event ${i + 1} of an agent trace:\n${events[i]}`,
        [
          {
            kind: "noul",
            id: `keep-${i}`,
            prompt: "Keep this event",
            trueCriteria: "error failure exception, decision decided instead, deadline due date, constraint approval must, tool result returned, identifier path reference, file path",
            falseCriteria: "chatter status update reminder thanks, unrelated environment trivia password wifi, repetition unchanged repeated again",
          },
        ],
        {
          [`keep-${i}`]: (answer) => ({
            verdict: answer.kind === "noul" && answer.p >= KEEP_AT ? "keep" : "drop",
            threshold: KEEP_AT,
            itemId: `event-${i + 1}`,
          }),
        }
      );
      probs.push(panel.noul(`keep-${i}`));
    }

    const kept: string[] = [];
    const rows = events.map((event, i) => {
      const pinned = i >= events.length - PINNED_TAIL;
      const p = probs[i];
      const keep = pinned || p >= KEEP_AT;
      if (keep) kept.push(event);
      return {
        id: `event-${i + 1}`,
        label: truncate(event, 96),
        value: pinned ? "pinned" : isDuplicate[i] ? "duplicate" : p.toFixed(2),
        status: (keep ? "keep" : "drop") as "keep" | "drop",
        meta: pinned
          ? "pinned by code"
          : isDuplicate[i]
            ? "exact duplicate of an earlier read — removed in code"
            : keep
              ? "kept verbatim"
              : `keep probability ${p.toFixed(2)} < ${KEEP_AT}`,
      };
    });

    const originalTokens = estimateTokens(events.join("\n"));
    const compactedText = kept.join("\n");
    const compactedTokens = estimateTokens(compactedText);
    const saved = originalTokens - compactedTokens;
    const verbatim = kept.every((event) => (input.trace ?? "").includes(event));

    return {
      summary: [
        { label: "Events kept", value: `${kept.length} / ${events.length}`, tone: "accent" },
        { label: "Tokens", value: `${originalTokens} → ${compactedTokens}`, hint: `${Math.round((1 - compactedTokens / originalTokens) * 100)}% smaller`, tone: "good" },
        { label: "Verbatim", value: verbatim ? "verified" : "FAILED", hint: "kept text is a substring of the source", tone: verbatim ? "good" : "bad" },
        { label: "Cost", value: money(panel.costUsd), hint: `${events.length} small requests` },
      ],
      panels: [
        {
          title: "Discard panel",
          note: "One Noul per event that is neither pinned nor an exact duplicate. The last two events are retained by code, and duplicate reads are removed before the panel runs.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Compacted trace",
          note: "This is the actual text handed to the next turn. Every line is a byte-identical copy of an original event.",
          kind: "code",
          rows: kept.map((event, i) => ({ id: `k${i}`, label: event })),
          preview: compactedText,
        },
        {
          title: "Per-event decisions",
          kind: "list",
          rows,
        },
      ],
      decisions: [
        {
          title: "Pinned tail",
          detail: `The last ${PINNED_TAIL} events bypass the panel. A compaction pass can never drop the current turn or the tool result that just arrived.`,
          status: "ok",
        },
        {
          title: "Duplicates never reach the model",
          detail: "An exact repeat of an earlier read is removed by string comparison. Paying a model to notice a duplicated line is the kind of waste this pattern exists to avoid.",
          status: "info",
        },
        {
          title: verbatim ? "No paraphrase" : "Verbatim check failed",
          detail: verbatim
            ? "Each kept event was checked with String.includes against the source trace. Nothing was regenerated, so nothing was reworded."
            : "A kept event was not found in the source. Reject the compaction.",
          status: verbatim ? "ok" : "blocked",
        },
        {
          title: "Dropped content is recoverable",
          detail: `${events.length - kept.length} events removed, all still addressed by index in the original trace. Compaction is a view, not a deletion.`,
          status: "info",
        },
      ],
      code: [
        {
          title: "The whole loop",
          language: "ts",
          body: `for (const [i, event] of events.entries()) {
  if (i >= events.length - 2) { kept.push(event); continue; }  // pinned
  const { answers } = await jev.ask({
    state: event,
    questions: { keep: noul(\`Keep this event to continue the task: \${task}\`) },
  });
  if (answers.keep.noul >= 0.5) kept.push(event); // copy, never summarise
}
const compacted = kept.join("\\n");`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "Unlike a summariser, the output cannot hallucinate a fact: it is a subset of the input.",
        "A summariser would cut tokens further. This trades ratio for fidelity — the right call when the trace contains identifiers, error strings, or numbers a summary would round away.",
      ],
    };
  },
};
