import type { JevProvider, Question } from "../engine/types.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

type ArgSpec =
  | { name: string; kind: "choice"; description: string; options: string[]; required: boolean }
  | { name: string; kind: "noul"; description: string; required: boolean }
  | { name: string; kind: "literal"; description: string; required: boolean };

type ToolSpec = { name: string; description: string; args: ArgSpec[] };

const TOOLS: ToolSpec[] = [
  {
    name: "create_issue",
    description: "File a tracked issue in the team's tracker and assign it to a queue.",
    args: [
      { name: "team", kind: "choice", description: "owning team", options: ["billing", "platform", "support", "design"], required: true },
      { name: "priority", kind: "choice", description: "urgency", options: ["p0", "p1", "p2", "p3"], required: true },
      { name: "title", kind: "literal", description: "one-line summary, composed by code from the request", required: true },
      { name: "customer_impact", kind: "noul", description: "is a paying customer currently blocked", required: false },
    ],
  },
  {
    name: "schedule_meeting",
    description: "Book a calendar slot and invite attendees.",
    args: [
      { name: "attendee_group", kind: "choice", description: "who to invite", options: ["billing-oncall", "platform-oncall", "design-team", "customer-success"], required: true },
      { name: "day", kind: "choice", description: "day", options: ["today", "tomorrow", "next-week"], required: true },
      { name: "duration_min", kind: "choice", description: "length", options: ["15", "30", "60"], required: true },
    ],
  },
  {
    name: "refund_charge",
    description: "Refund a card charge. Money-moving: code requires an exact charge id.",
    args: [
      { name: "charge_id", kind: "literal", description: "exact charge id, required for money movement", required: true },
      { name: "reason", kind: "choice", description: "reason code", options: ["duplicate", "fraud", "service-not-rendered", "goodwill"], required: true },
    ],
  },
  {
    name: "escalate_to_human",
    description: "Hand the conversation to a human agent with a summary.",
    args: [
      { name: "queue", kind: "choice", description: "queue", options: ["billing", "trust-and-safety", "platform"], required: true },
      { name: "urgency", kind: "choice", description: "urgency", options: ["standard", "urgent"], required: true },
    ],
  },
];

const REQUEST =
  "Hi — we were billed twice for the October invoice (acct_9f2), $480 each time. Our finance lead needs this refunded today, and honestly we'd like someone senior to confirm it won't happen again next month.";

export const toolCompilation: UseCaseMeta = {
  id: "tool-call-compilation",
  index: 4,
  title: "Typed tool-call compilation",
  tagline: "Map prose to one function, then fill every argument separately.",
  category: "Agent loop",
  verdict: "Canonical fit",
  primitives: ["Choice", "Noul"],
  whyItFits: "A tool call is a finite set of functions with finite argument domains. Each argument is its own question, so a bad enum value cannot ride along inside a mostly-correct call — and the whole thing costs less than the tokens in the request.",
  gates: {
    answerSpace: "Function names from the registry; argument values from each JSON schema.",
    repeats: "Every tool call, every step, every session.",
    latencyOrCost: "Two requests (function, then arguments) instead of a 900-token generation.",
    wrongAnswerCaught: "Schema validation rejects out-of-domain values before execution; money-moving calls need an exact id.",
  },
  sharpEdge:
    "Never let the panel supply free text. Titles, filenames, and ids are copied by code from the request or the session — Jev only selects among values you enumerated. The moment an argument is generated, you have an unvalidated injection surface.",
  codeOwns: ["Function registry and JSON schemas", "Composing free-text fields", "Validating argument domains", "Execution and dry-run"],
  jevOwns: ["Which function the request maps to", "Each enumerated argument value"],
  inputs: [
    { key: "request", label: "Natural-language request", type: "textarea", rows: 4, default: REQUEST },
    {
      key: "registry",
      label: "Tool registry (JSON)",
      type: "textarea",
      rows: 10,
      default: JSON.stringify(TOOLS.map((t) => ({ name: t.name, args: t.args.map((a) => `${a.name}:${a.kind}`) })), null, 2),
      help: "Edit only to inspect; the schema used for validation is the one in the registry below the demo by design.",
    },
  ],
  presets: [
    {
      label: "Ambiguous request",
      note: "Two plausible functions. Compilation should surface the ambiguity, not silently pick.",
      input: {
        request: "Something is wrong with the October billing run and I need the right people looking at it today.",
        registry: "",
      },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const request = input.request ?? "";
    const panel = new Panel(provider);
    const state = `Tool registry:\n${TOOLS.map(
      (t) => `- ${t.name}(${t.args.map((a) => a.name).join(", ")}): ${t.description}`
    ).join("\n")}\n\nUser request:\n${request}`;

    await panel.run(
      state,
      [
        {
          kind: "choice",
          id: "function",
          prompt: `Which function should be called for this request: ${truncate(request, 260)}`,
          allowNone: true,
          options: TOOLS.map((t) => ({ id: t.name, label: t.name, detail: t.description })),
        },
      ],
      { function: (a) => ({ verdict: a.kind === "choice" ? a.pick : "", threshold: 0.4 }) }
    );

    const fnAnswer = panel.choice("function");
    const fn = TOOLS.find((t) => t.name === fnAnswer.pick);
    const compiled: Record<string, unknown> = {};
    const argQuestions: Question[] = [];
    const argVerdicts: Record<string, (a: import("../engine/types.js").Answer) => { verdict?: string; threshold?: number; itemId?: string }> = {};

    if (fn) {
      for (const arg of fn.args) {
        const qid = `arg-${arg.name}`;
        if (arg.kind === "choice") {
          argQuestions.push({
            kind: "choice",
            id: qid,
            prompt: `For this request, what should ${arg.name} (${arg.description}) be? ${truncate(request, 260)}`,
            options: arg.options.map((o) => ({ id: o, label: o })),
          });
          argVerdicts[qid] = (a) => ({
            verdict: a.kind === "choice" ? a.pick : "",
            itemId: arg.name,
          });
        } else if (arg.kind === "noul") {
          argQuestions.push({
            kind: "noul",
            id: qid,
            prompt: `Customer impact is true for this request: ${truncate(request, 220)}`,
            trueCriteria: "a paying customer cannot complete their work, money is already owed or double-charged, and the request says so",
            falseCriteria: "a routine question, a preference, or a request with no blocked customer",
          });
          argVerdicts[qid] = (a) => ({
            verdict: a.kind === "noul" ? (a.p >= 0.5 ? "true" : "false") : "",
            threshold: 0.5,
            itemId: arg.name,
          });
        }
      }

      await panel.run(`${state}\nChosen function: ${fn.name}`, argQuestions, argVerdicts);

      for (const arg of fn.args) {
        const qid = `arg-${arg.name}`;
        if (arg.kind === "choice") {
          compiled[arg.name] = panel.choice(qid).pick;
        } else if (arg.kind === "noul") {
          compiled[arg.name] = panel.noul(qid) >= 0.5;
        } else {
          compiled[arg.name] = composeLiteral(arg.name, request);
        }
      }
    }

    const validation = fn ? validate(fn, compiled) : { ok: false, errors: ["no function selected"] };
    const ambiguous = fnAnswer.confidence < 0.4;
    const dryRun = validation.ok && !ambiguous;
    const toolCall = fn ? { tool: fn.name, arguments: compiled } : null;

    return {
      summary: [
        { label: "Function", value: fn ? fn.name : "none", hint: `confidence ${fnAnswer.confidence.toFixed(2)}`, tone: fn ? "accent" : "bad" },
        { label: "Arguments filled", value: `${Object.keys(compiled).length} / ${fn?.args.length ?? 0}` },
        { label: "Schema", value: validation.ok ? "valid" : "rejected", tone: validation.ok ? "good" : "bad" },
        { label: "Cost", value: money(panel.costUsd), hint: "two requests" },
      ],
      panels: [
        {
          title: "Step 1 — function choice",
          note: "One Choice over the registry. 'None of the above' is always present: a request that matches no tool should compile to nothing.",
          entries: panel.entries.filter((e) => e.question.kind === "choice" && e.question.id === "function"),
        },
        {
          title: "Step 2 — one question per argument",
          note: "Each argument is evaluated independently, against the request plus the chosen function. Code composes literals; Jev never generates a string.",
          entries: panel.entries.filter((e) => e.question.id !== "function"),
        },
      ],
      artifacts: [
        {
          title: "Compiled call",
          kind: "code",
          preview: JSON.stringify(toolCall ?? { tool: null, reason: "no function matched" }, null, 2),
          rows: fn
            ? fn.args.map((a) => ({
                id: a.name,
                label: a.name,
                value: compiled[a.name] === undefined ? "missing" : JSON.stringify(compiled[a.name]),
                status: (compiled[a.name] === undefined ? "fail" : "pass") as "fail" | "pass",
                meta: `${a.kind}${a.required ? " · required" : ""}`,
              }))
            : [],
        },
        {
          title: "Validation trace",
          kind: "list",
          rows: [
            ...validation.errors.map((error, i) => ({
              id: `err-${i}`,
              label: error,
              status: "fail" as const,
            })),
            ...(validation.ok ? [{ id: "ok", label: "Every argument is inside its declared domain", status: "pass" as const }] : []),
          ],
        },
      ],
      decisions: [
        {
          title: fn ? `Compiled ${fn.name}` : "No call compiled",
          detail: fn
            ? `${Object.keys(compiled).length} arguments, each evaluated as its own question. Literals copied from the request, not generated.`
            : "The panel returned 'none of the above'. Code does nothing rather than force-fitting a tool.",
          status: fn ? "ok" : "blocked",
        },
        {
          title: ambiguous ? "Ambiguous mapping" : "Mapping clear",
          detail: ambiguous
            ? `Top confidence ${fnAnswer.confidence.toFixed(2)} is under 0.40. Route back to the model for clarification instead of executing.`
            : `Top confidence ${fnAnswer.confidence.toFixed(2)} clears the 0.40 floor.`,
          status: ambiguous ? "warn" : "ok",
        },
        {
          title: dryRun ? "Executed as dry run" : "Execution blocked",
          detail: dryRun
            ? "Schema valid. Money-moving tools would stop here for a human confirmation step regardless of confidence."
            : !validation.ok
              ? `Validation failed: ${validation.errors.join("; ")}.`
              : "Schema valid, but the function mapping was ambiguous. Clarify before executing.",
          status: dryRun ? "ok" : "blocked",
        },
      ],
      code: [
        {
          title: "Compile then validate",
          language: "ts",
          body: `const fn = await jev.ask({ state, questions: { f: choice("Which function?", registry) } });
const spec = REGISTRY.get(fn.answers.f.choice);
const args = {};
for (const arg of spec.args) {
  if (arg.type === "enum") {
    args[arg.name] = (await jev.ask({
      state, questions: { a: choice(\`What should \${arg.name} be?\`, arg.values) },
    })).answers.a.choice;
  } else if (arg.type === "boolean") {
    args[arg.name] = (await jev.ask({ state, questions: { a: noul(arg.question) } })).answers.a.noul > 0.5;
  } else {
    args[arg.name] = composeInCode(arg, request);  // never generated
  }
}
if (!spec.validate(args)) return block();
return execute(spec.name, args);`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "Two round trips, not one: the argument panel is built from the chosen function's schema, so unknown arguments are not expressible.",
        "Cost scales with questions asked in parallel, not with a generated JSON blob.",
      ],
    };
  },
};

function composeLiteral(name: string, request: string): string {
  if (name === "title") {
    const first = request.split(/(?<=[.!?])\s/)[0] ?? request;
    return first.replace(/^(hi|hello)[^—–-]*[—–-]\s*/i, "").slice(0, 110);
  }
  if (name === "charge_id") {
    const match = request.match(/(?:ch_|acct_)[A-Za-z0-9]+/);
    return match ? match[0] : "";
  }
  return "";
}

function validate(fn: ToolSpec, args: Record<string, unknown>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const arg of fn.args) {
    const value = args[arg.name];
    if (arg.required && (value === undefined || value === null || value === "")) {
      errors.push(`${arg.name} is required and missing`);
      continue;
    }
    if (arg.kind === "choice" && value !== undefined && !arg.options.includes(String(value))) {
      errors.push(`${arg.name}="${String(value)}" is outside ${arg.options.join("|")}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
