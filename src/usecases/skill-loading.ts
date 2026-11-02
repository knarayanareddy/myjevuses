import type { JevProvider } from "../engine/types.js";
import { estimateTokens } from "../engine/types.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

type Skill = { name: string; tokens: number; description: string };

const CATALOG = `ci-triage | 1800 | Diagnose a failing CI job: read the workflow file, reproduce locally, bisect the first red commit, and propose a minimal fix.
migration-runbook | 2400 | Apply, verify, and roll back a database migration. Covers lock windows, backfill batching, and the staging rehearsal checklist.
postgres-index-tuning | 3200 | Tune PostgreSQL indexes: pg_stat_statements review, bloat analysis, and choosing partial or covering indexes for slow queries.
release-notes | 900 | Turn merged PRs into customer-facing release notes with a consistent voice and a migration note per breaking change.
incident-comms | 1500 | Draft status-page updates and stakeholder emails during an incident. Templates per severity, cadence rules, and what never to promise.
design-review | 1100 | Review a design doc for missing tradeoffs, unstated assumptions, and rollout risk.`;

const TURN =
  "The billing-migration CI job has been red since we bumped the Postgres image last night — the migration smoke test times out at 30s. Can you get it green before the 14:00 deploy?";

export function parseCatalog(text: string): Skill[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, tokens, ...rest] = line.split("|").map((part) => part.trim());
      return { name, tokens: Number(tokens) || estimateTokens(rest.join(" ")), description: rest.join(" | ") };
    });
}

export const skillLoading: UseCaseMeta = {
  id: "skill-loading",
  index: 3,
  title: "Skill and context loading",
  tagline: "Load the two skill files this turn needs, not all six.",
  category: "Context",
  verdict: "Canonical fit",
  primitives: ["Choice", "Noul"],
  whyItFits: "Which skills a turn needs is a bounded classification over a catalogue you wrote. One Choice picks the best fit; per-skill Nouls tell you what else clears the bar — the published version of this pattern reports an 88% token reduction.",
  gates: {
    answerSpace: "One skill per Choice, plus an explicit 'load base instructions only' option.",
    repeats: "Every single turn of every session.",
    latencyOrCost: "The difference between 3k and 20k tokens in the first message is the whole prompt bill.",
    wrongAnswerCaught: "A missing skill fails loudly on the first tool call; a spurious one only wastes tokens.",
  },
  sharpEdge:
    "Loading too little is the expensive mistake: the agent then improvises a runbook. Keep the always-on base prompt large enough to cover the common case, and log every turn that matched nothing — that is your backlog of skills to write.",
  codeOwns: ["Parsing the catalogue", "Enforcing a token budget", "Assembling the final prompt", "Logging the match matrix"],
  jevOwns: ["Which skill fits this turn", "Whether each individual skill is required"],
  inputs: [
    { key: "turn", label: "User turn", type: "textarea", rows: 3, default: TURN },
    {
      key: "catalog",
      label: "Skill catalogue",
      type: "textarea",
      rows: 10,
      default: CATALOG,
      help: "name | tokens | description — one per line.",
    },
  ],
  presets: [
    {
      label: "Unrelated turn",
      note: "Nothing in the catalogue fits. The correct output is 'base only', not the closest wrong skill.",
      input: {
        turn: "Water the office plants and order more coffee beans for the kitchen.",
        catalog: CATALOG,
      },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const turn = input.turn ?? "";
    const skills = parseCatalog(input.catalog ?? "");
    const panel = new Panel(provider);
    const THRESHOLD = 0.5;
    const BUDGET_TOKENS = 4500;

    await panel.run(
      turn,
      [
        {
          kind: "choice",
          id: "primary",
          prompt: `Which skill is the primary match for this turn: ${truncate(turn, 220)}`,
          allowNone: true,
          options: skills.map((s) => ({ id: s.name, label: s.name, detail: s.description })),
        },
        ...skills.map(
          (s): import("../engine/types.js").Question => ({
            kind: "noul",
            id: `need-${s.name}`,
            prompt: `This turn requires the ${s.name} skill`,
            trueCriteria: s.description,
            falseCriteria: "the turn is an unrelated errand that none of the catalogue descriptions cover",
          })
        ),
      ],
      Object.fromEntries(
        skills.map((s) => [
          `need-${s.name}`,
          (answer: { kind: string; p?: number }) => ({
            verdict: answer.kind === "noul" && (answer.p ?? 0) >= THRESHOLD ? "load" : "skip",
            threshold: THRESHOLD,
            itemId: s.name,
          }),
        ])
      )
    );

    const primary = panel.choice("primary");
    const scored = skills
      .map((s) => ({ ...s, p: panel.noul(`need-${s.name}`) }))
      .sort((a, b) => b.p - a.p);

    // The Choice names the best fit; the per-skill Noul decides whether it is
    // actually needed. A primary pick that fails its own check loads nothing,
    // which is the correct answer for an out-of-catalogue turn.
    const selected: Skill[] = [];
    let used = 0;
    for (const skill of scored) {
      if (skill.p < THRESHOLD) continue;
      if (selected.length >= 2) continue;
      if (used + skill.tokens > BUDGET_TOKENS && selected.length > 0) continue;
      selected.push(skill);
      used += skill.tokens;
    }
    const primaryLoaded = selected.some((s) => s.name === primary.pick);

    const maxTokens = skills.reduce((sum, s) => sum + s.tokens, 0);
    const basePrompt = 700;
    return {
      summary: [
        {
          label: "Loaded",
          value: selected.length ? selected.map((s) => s.name).join(", ") : "base only",
          tone: selected.length ? "accent" : "neutral",
        },
        {
          label: "Context tokens",
          value: `${basePrompt + used} vs ${basePrompt + maxTokens}`,
          hint: `${Math.round((1 - (basePrompt + used) / (basePrompt + maxTokens)) * 100)}% smaller`,
          tone: "good",
        },
        {
          label: "Primary pick",
          value: primary.pick === "__none__" ? "none" : primaryLoaded ? primary.pick : `${primary.pick} (rejected)`,
          hint: primaryLoaded ? `confidence ${primary.confidence.toFixed(2)}` : "failed its own need check",
        },
        { label: "Cost", value: money(panel.costUsd), hint: "one parallel request" },
      ],
      panels: [
        {
          title: "Routing panel",
          note: "One Choice for the primary skill plus one Noul per skill, all evaluated in parallel over the same turn.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Catalogue with per-skill probability",
          kind: "list",
          note: "The tail matters here: a second skill above threshold gets loaded too, which is how you avoid a half-applied runbook.",
          rows: scored.map((s) => ({
            id: s.name,
            label: s.name,
            value: s.p.toFixed(2),
            status: selected.some((x) => x.name === s.name) ? "keep" : "drop",
            meta: `${s.tokens} tokens · ${truncate(s.description, 110)}`,
          })),
        },
        {
          title: "Assembled context",
          kind: "code",
          preview: [
            `[base instructions] ${basePrompt} tokens`,
            ...selected.map((s) => `[skill: ${s.name}] ${s.tokens} tokens — ${truncate(s.description, 80)}`),
            `[user turn] ${estimateTokens(turn)} tokens`,
          ].join("\n"),
          rows: selected.map((s) => ({ id: s.name, label: s.name, value: `${s.tokens} tok`, status: "keep" as const })),
        },
      ],
      decisions: [
        {
          title: selected.length ? "Budget respected" : "Base instructions only",
          detail: selected.length
            ? `${used} of ${BUDGET_TOKENS} skill tokens used, max 2 skills, all above ${THRESHOLD} or the primary pick.`
            : "No skill cleared the bar, so code loads nothing rather than the closest wrong runbook.",
          status: "ok",
        },
        {
          title: "Escape hatch present",
          detail: `The Choice included 'load base instructions only'. Without it the model picks the least-bad skill — the most common implementation bug in this pattern.`,
          status: "ok",
        },
        {
          title: scored[0] && scored[0].p > 0.6 && scored[1] && scored[1].p > 0.6
            ? "Ambiguity flagged"
            : "Unambiguous route",
          detail:
            scored[0] && scored[0].p > 0.6 && scored[1] && scored[1].p > 0.6
              ? `Two skills scored above 0.6 (${scored[0].name}, ${scored[1].name}). Both loaded; log this pair as a candidate merge in the library.`
              : "One clear winner, so the secondary skills stay out of the prompt.",
          status: scored[0] && scored[0].p > 0.6 && scored[1] && scored[1].p > 0.6 ? "warn" : "info",
        },
      ],
      code: [
        {
          title: "Route, then budget",
          language: "ts",
          body: `const { answers } = await jev.ask({
  state: turn,
  questions: {
    primary: choice("Which skill is the primary match?", {
      ...skills, none: "load base instructions only",
    }),
    ...Object.fromEntries(skills.map(s => [
      \`need_\${s.name}\`, noul(\`This turn requires the skill \${s.name}: \${s.description}\`),
    ])),
  },
});
const load = skills
  .filter(s => s.name === answers.primary.choice || answers[\`need_\${s.name}\`].noul > 0.5)
  .slice(0, 2);  // code enforces the budget, not the model`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "Cost of a wrong route is asymmetric: a missed skill produces a worse answer, a surplus skill only costs tokens. Tune the threshold accordingly.",
        "The local engine scores lexical overlap, so a skill that merely shares a word (postgres-index-tuning shares 'Postgres') can over-fire. Real Jev reads the description — verify thresholds on your own catalogue.",
      ],
    };
  },
};
