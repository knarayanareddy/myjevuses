import type { JevProvider } from "../engine/types.js";
import { estimateTokens } from "../engine/types.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

const TASK = "Make the invoice import tolerant of trailing whitespace, and prove it with tests.";
const TRACE = `1. read_file imports/invoice_import.rb → 180 lines
2. grep "strip" imports/ → 2 matches
3. edit invoice_import.rb → added .strip to the SKU and amount fields
4. run "bundle exec rspec spec/imports" → 12 examples, 1 failure
5. read_file spec/imports/invoice_import_spec.rb → 64 lines
6. read_file spec/imports/invoice_import_spec.rb → 64 lines (unchanged)
7. edit invoice_import_spec.rb → added a fixture with trailing spaces
8. run "bundle exec rspec spec/imports" → 13 examples, 0 failures
9. read_file spec/imports/invoice_import_spec.rb → 64 lines (still unchanged)
10. assistant: I updated the importer to strip whitespace from SKU and amount, and added a regression test. All 13 examples pass.`;

const GOOD = TRACE;
const LOOPING = `1. read_file src/parser.py → 210 lines
2. grep "csv" src/ → 4 matches
3. run "pytest tests/test_parser.py" → 3 failed
4. read_file src/parser.py → 210 lines (unchanged)
5. edit src/parser.py → changed delimiter handling
6. run "pytest tests/test_parser.py" → 3 failed
7. read_file src/parser.py → 210 lines (unchanged)
8. edit src/parser.py → reverted delimiter handling
9. run "pytest tests/test_parser.py" → 3 failed
10. assistant: I'm still investigating the parser failures.`;

export const traceEvaluation: UseCaseMeta = {
  id: "trace-evaluation",
  index: 7,
  title: "Agent trace evaluation",
  tagline: "Turn raw trajectories into queryable labels — progress, repetition, waste.",
  category: "Quality",
  verdict: "Canonical fit",
  primitives: ["Noul", "Score"],
  whyItFits: "Judging a step is a bounded yes/no; judging verification is a 4-level rubric. You get a labelled row per trace instead of a prose review nobody can aggregate, and you can query thousands of runs for the same pattern.",
  gates: {
    answerSpace: "Per-step progress and repetition; per-trace verification rubric.",
    repeats: "Once per trace, across every run of every agent.",
    latencyOrCost: "A written review per trace costs more than the run itself.",
    wrongAnswerCaught: "Labels are for triage and trending, never for gating a single run.",
  },
  sharpEdge:
    "Labels are only useful if they aggregate. Decide the label vocabulary before you run the panel, keep it versioned, and never re-interpret a label's meaning across model versions — otherwise your trend line measures the judge, not the agent.",
  codeOwns: ["Splitting the trace", "Duplicate detection", "Aggregation and trend math", "Outcome from the last observed tool result"],
  jevOwns: ["Did this step advance the task", "Did the agent verify its work"],
  inputs: [
    { key: "task", label: "Task", type: "textarea", rows: 2, default: TASK },
    { key: "trace", label: "Trace", type: "textarea", rows: 16, default: TRACE, help: "One numbered step per line." },
  ],
  presets: [
    {
      label: "Looping trace",
      note: "Repeated reads and a reverted edit — the labels should say 'waste', not 'failed'.",
      input: { task: "Fix the CSV parser tests.", trace: LOOPING },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const task = input.task ?? "";
    const steps = (input.trace ?? "")
      .split("\n")
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean);

    const panel = new Panel(provider);
    const THRESHOLD = 0.5;

    for (let i = 0; i < steps.length; i++) {
      const prior = steps.slice(0, i);
      // Progress: judged against the step alone, described by criteria.
      await panel.run(
        steps[i],
        [
          {
            kind: "noul",
            id: `progress-${i}`,
            prompt: "This step made progress on the task",
            trueCriteria: "run a command, read a file, edit code, or produce a test result",
            falseCriteria: "restate the plan or report status",
          },
        ],
        {
          [`progress-${i}`]: (a) => ({
            verdict: a.kind === "noul" && a.p >= THRESHOLD ? "productive" : "no visible progress",
            threshold: THRESHOLD,
            itemId: `step-${i + 1}`,
          }),
        }
      );

      // Repetition: state is the history, so a repeated path really is present
      // in the evidence and a new one is not.
      const REPEAT_AT = 0.8;
      await panel.run(prior.length ? prior.join("\n") : "No earlier steps.", [
        {
          kind: "noul",
          id: `repeat-${i}`,
          prompt: `This step repeats an earlier step: ${steps[i]}`,
        },
      ], {
        [`repeat-${i}`]: (a) => ({
          verdict: a.kind === "noul" && a.p >= REPEAT_AT ? "repeat" : "new work",
          threshold: REPEAT_AT,
          itemId: `step-${i + 1}`,
        }),
      });
    }

    // Deterministic duplicate detection sits beside the semantic one.
    const normalized = steps.map((s) => s.toLowerCase().replace(/\s*\(unchanged\)|\s*\(still unchanged\)/g, "").replace(/[^a-z0-9 ]/g, ""));
    const duplicate = normalized.map((s, i) => normalized.findIndex((other, j) => j < i && similar(other, s)) !== -1);

    const perStep = steps.map((step, i) => {
      const progress = panel.noul(`progress-${i}`);
      // Exact repetition is deterministic, so the code check is the primary
      // signal and the semantic probability can only reinforce it.
      const repeat = Math.max(panel.noul(`repeat-${i}`), duplicate[i] ? 0.95 : 0);
      return { index: i + 1, step, progress, repeat };
    });

    await panel.run(`Task: ${task}\n\nWhole trace:\n${steps.join("\n")}`, [
      {
        kind: "score",
        id: "verification",
        prompt: "How thoroughly did the agent verify its own change?",
        levels: [
          { value: 0, label: "none", detail: "No test, check, or command was run after changing anything." },
          { value: 1, label: "claimed", detail: "The agent only asserted that the work was done, without running anything." },
          { value: 2, label: "attempted", detail: "A test or command was run, and failures were not resolved." },
          { value: 3, label: "ran tests", detail: "Tests were run after the change and passed." },
          { value: 4, label: "verified output", detail: "Tests passed after the change and the agent read or inspected the output before finishing." },
        ],
      },
    ]);

    const verification = panel.score("verification");
    const productive = perStep.filter((s) => s.progress >= THRESHOLD).length;
    const repeats = perStep.filter((s) => s.repeat >= 0.8).length;
    const last = steps[steps.length - 1] ?? "";
    const outcome = /0 failures|passed|all .* pass/i.test(last)
      ? "solved"
      : /failed|failure/i.test(last)
        ? "blocked"
        : "unknown";
    const wasted = perStep.filter((s) => s.progress < THRESHOLD || s.repeat >= 0.8).length;

    const labels = {
      task_id: "T-4417",
      steps: steps.length,
      productive_steps: productive,
      repeated_steps: repeats,
      wasted_steps: wasted,
      mean_progress: Number((perStep.reduce((s, x) => s + x.progress, 0) / steps.length).toFixed(3)),
      verification_score: verification.score,
      outcome,
      loop_detected: repeats >= 2,
      cost_usd: Number(panel.costUsd.toFixed(6)),
    };

    return {
      summary: [
        { label: "Outcome", value: outcome, tone: outcome === "solved" ? "good" : outcome === "blocked" ? "bad" : "neutral" },
        { label: "Productive steps", value: `${productive} / ${steps.length}`, tone: "accent" },
        { label: "Repeated steps", value: String(repeats), tone: repeats ? "bad" : "good" },
        { label: "Verification", value: `${verification.score.toFixed(1)} / 4` },
        { label: "Cost", value: money(panel.costUsd), hint: `${steps.length * 2 + 1} questions` },
      ],
      panels: [
        {
          title: "Per-step labels",
          note: "Two Nouls per step. Progress is judged against the step alone with written criteria; repetition is judged against the history, where a repeated file path is literally present in the evidence.",
          entries: panel.entries.filter((e) => e.question.kind === "noul"),
        },
        {
          title: "Trace-level rubric",
          note: "One Score asks how thoroughly the agent verified its own work. The numeric value is probability-weighted, so it can land between levels.",
          entries: panel.entries.filter((e) => e.question.kind === "score"),
        },
      ],
      artifacts: [
        {
          title: "Labelled trace",
          kind: "list",
          rows: perStep.map((s) => ({
            id: String(s.index),
            label: truncate(s.step, 82),
            value: `progress ${s.progress.toFixed(2)} · repeat ${s.repeat.toFixed(2)}`,
            status: s.progress < THRESHOLD || s.repeat >= 0.8 ? "flag" : "pass",
            meta: s.repeat >= 0.8 ? `repeat of an earlier step${duplicate[s.index - 1] ? " (exact match)" : ""}` : "",
          })),
        },
        {
          title: "Queryable record",
          kind: "code",
          preview: JSON.stringify(labels, null, 2),
          rows: Object.entries(labels).map(([key, value]) => ({
            id: key,
            label: key,
            value: String(value),
            status: "neutral" as const,
          })),
        },
      ],
      decisions: [
        {
          title: labels.loop_detected ? "Loop detected" : "No loop",
          detail: labels.loop_detected
            ? `${repeats} steps repeated earlier work. Stop the run and re-plan rather than raising the step budget.`
            : "No step repeated earlier work by either the semantic check or exact normalised match.",
          status: labels.loop_detected ? "blocked" : "ok",
        },
        {
          title: outcome === "solved" ? "Outcome from the trace, not the model" : "Outcome not established",
          detail: `"${outcome}" is read from the last observed tool result — a deterministic parse, so the label cannot be talked into a success.`,
          status: outcome === "solved" ? "ok" : "warn",
        },
        {
          title: "Aggregates only",
          detail: `${steps.length * 2 + 1} judgments for ${estimateTokens(steps.join("\n"))} tokens of trace, costing ${money(panel.costUsd)} — instead of a written review.`,
          status: "info",
        },
      ],
      code: [
        {
          title: "Labels, then aggregation",
          language: "ts",
          body: `for (const [i, step] of steps.entries()) {
  const { answers } = await jev.ask({
    state: \`\${task}\\n\\nStep: \${step}\\n\\nEarlier:\\n\${steps.slice(0, i).join("\\n")}\`,
    questions: {
      progress: noul(\`This step made progress on the task: \${task}\`),
      repeat:   noul(\`This step repeated earlier work: \${step}\`),
    },
  });
  labels.push({ step: i, progress: answers.progress.noul, repeat: answers.repeat.noul });
}
const wasted = labels.filter(l => l.progress < 0.5 || l.repeat >= 0.5).length;
const loop = labels.filter(l => l.repeat >= 0.5).length >= 2;`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "The record is the artifact: five numbers you can graph per build, not a paragraph.",
        "Exact-duplicate detection is free and deterministic, so it runs alongside the semantic check and takes the max.",
      ],
    };
  },
};

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const aw = new Set(a.split(/\s+/));
  const bw = new Set(b.split(/\s+/));
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared += 1;
  return shared / Math.max(aw.size, bw.size) > 0.85;
}
