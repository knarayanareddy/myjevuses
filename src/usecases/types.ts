import type { Answer, ChoiceAnswer, NoulAnswer, Question, ScoreAnswer, JevProvider } from "../engine/types.js";

export type InputField = {
  key: string;
  label: string;
  type: "textarea" | "text" | "select";
  default: string;
  help?: string;
  rows?: number;
  options?: { value: string; label: string }[];
};

export type PanelEntry = {
  question: Question;
  answer: Answer;
  /** What the code did with this answer. */
  verdict?: string;
  threshold?: number;
  itemId?: string;
};

export type ArtifactRow = {
  id: string;
  label: string;
  value?: string;
  status?: "keep" | "drop" | "flag" | "pass" | "fail" | "neutral";
  meta?: string;
};

export type Artifact = {
  title: string;
  note?: string;
  kind: "table" | "list" | "code";
  rows: ArtifactRow[];
  preview?: string;
};

export type Decision = {
  title: string;
  detail: string;
  status: "ok" | "warn" | "blocked" | "info";
};

export type SummaryChip = {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral" | "accent";
};

export type CodeSample = {
  title: string;
  language: string;
  body: string;
};

export type RunResult = {
  summary: SummaryChip[];
  panels: { title: string; note?: string; entries: PanelEntry[] }[];
  artifacts: Artifact[];
  decisions: Decision[];
  code: CodeSample[];
  usage: { tokens: number; costUsd: number; latencyMs: number; provider: string };
  notes?: string[];
};

export type UseCaseMeta = {
  id: string;
  index: number;
  title: string;
  tagline: string;
  category: "Agent loop" | "Context" | "Verification" | "Retrieval" | "Memory" | "Quality";
  verdict: "Canonical fit" | "Strong fit" | "Fit with a caveat";
  primitives: ("Choice" | "Score" | "Noul")[];
  whyItFits: string;
  /** The four hard requirements from the README's feasibility gate. */
  gates: {
    answerSpace: string;
    repeats: string;
    latencyOrCost: string;
    wrongAnswerCaught: string;
  };
  sharpEdge: string;
  codeOwns: string[];
  jevOwns: string[];
  inputs: InputField[];
  presets?: { label: string; note?: string; input: Record<string, string> }[];
  run: (input: Record<string, string>, provider: JevProvider) => Promise<RunResult>;
};

export const DEFAULT_THRESHOLD = 0.5;

/**
 * Collects a panel's answers while accumulating usage, so every use case
 * reports one honest cost/latency figure for the whole run.
 */
export class Panel {
  entries: PanelEntry[] = [];
  tokens = 0;
  costUsd = 0;
  latencyMs = 0;
  provider = "";

  constructor(private readonly jev: JevProvider) {}

  async run(
    state: string,
    questions: Question[],
    verdicts: Record<string, (answer: Answer) => { verdict?: string; threshold?: number; itemId?: string }> = {}
  ): Promise<void> {
    if (questions.length === 0) return;
    const result = await this.jev.ask({ state, questions });
    this.tokens += result.tokens;
    this.costUsd += result.costUsd;
    this.latencyMs += result.latencyMs;
    this.provider = result.provider;
    for (const question of questions) {
      const answer = result.answers.find((a) => a.id === question.id);
      if (!answer) continue;
      const extra = verdicts[question.id]?.(answer) ?? {};
      this.entries.push({ question, answer, ...extra });
    }
  }

  choice(id: string): ChoiceAnswer {
    const found = this.entries.find((e) => e.question.id === id)?.answer;
    if (!found || found.kind !== "choice") throw new Error(`no choice answer for ${id}`);
    return found;
  }

  noul(id: string): number {
    const found = this.entries.find((e) => e.question.id === id)?.answer;
    if (!found || found.kind !== "noul") throw new Error(`no noul answer for ${id}`);
    return found.p;
  }

  score(id: string): ScoreAnswer {
    const found = this.entries.find((e) => e.question.id === id)?.answer;
    if (!found || found.kind !== "score") throw new Error(`no score answer for ${id}`);
    return found;
  }

  answer(id: string): Answer {
    const found = this.entries.find((e) => e.question.id === id)?.answer;
    if (!found) throw new Error(`no answer for ${id}`);
    return found;
  }

  usage() {
    return {
      tokens: this.tokens,
      costUsd: this.costUsd,
      latencyMs: Math.round(this.latencyMs * 10) / 10,
      provider: this.provider,
    };
  }
}

export function truncate(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function money(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.0001) return `$${usd.toExponential(1)}`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(3)}`;
}

export function perThousand(costUsd: number, items: number): string {
  if (items <= 0) return "—";
  return money((costUsd / items) * 1000);
}

export { type Answer, type NoulAnswer };
