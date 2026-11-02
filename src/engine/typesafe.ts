import {
  type Answer,
  type AskRequest,
  type AskResult,
  type JevProvider,
  type Question,
  PRICE_PER_MILLION_INPUT,
  estimateTokens,
  questionTokens,
} from "./types.js";

/**
 * TypeSafeProvider — the real thing.
 *
 * Activates when TYPESAFE_API_KEY is set (see src/engine/provider.ts). Maps this
 * repo's Question[] onto `client.systemOne`, then maps the SDK's typed answers
 * back onto the same Answer[] shape the local provider returns, so every use
 * case is provider-agnostic.
 *
 * Mapping notes:
 *  - Choice criteria are keyed by label; options carry an `id`, so we keep a
 *    label → id map and translate the chosen label back to the id in code.
 *  - Score rubrics must be contiguous from 0, so all Score panels here use
 *    levels 0..n-1. The adapter asserts this rather than silently shifting.
 *  - `allowNone` is fanned out as a real label ("none of the above").
 */
export class TypeSafeProvider implements JevProvider {
  name = "typesafe";
  private clientPromise: Promise<any> | null = null;

  constructor(private apiKey: string, private model?: string) {}

  private client(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = import("@typesafe-ai/sdk").then((mod) => {
        const Client = (mod as any).TypeSafeClient;
        return new Client({ apiKey: this.apiKey, ...(this.model ? { defaultModel: this.model } : {}) });
      });
    }
    return this.clientPromise;
  }

  async ask(request: AskRequest): Promise<AskResult> {
    const started = performance.now();
    const client = await this.client();
    const labelToId = new Map<string, string>();
    const questions: Record<string, any> = {};

    for (const q of request.questions) {
      if (q.kind === "choice") {
        const criteria: Record<string, string | null> = {};
        const options = q.allowNone
          ? [...q.options, { id: "__none__", label: "none of the above", detail: "nothing listed fits" }]
          : q.options;
        for (const option of options) {
          const label = uniqueLabel(option.label, criteria);
          labelToId.set(`${q.id}\u0000${label}`, option.id);
          criteria[label] = option.detail ?? null;
        }
        questions[q.id] = { type: "choice", instructions: q.prompt, criteria };
      } else if (q.kind === "score") {
        q.levels.forEach((level, i) => {
          if (level.value !== i) {
            throw new Error(
              `Score question "${q.id}" has non-contiguous level values; TypeSafe rubrics are indexed from 0.`
            );
          }
        });
        if (q.levels.length < 2) throw new Error(`Score question "${q.id}" needs at least 2 levels.`);
        questions[q.id] = {
          type: "score",
          instructions: q.prompt,
          criteria: q.levels.map((level) => level.detail ?? level.label),
        };
      } else {
        const criteria =
          q.trueCriteria || q.falseCriteria
            ? {
                ...(q.trueCriteria ? { true: q.trueCriteria } : {}),
                ...(q.falseCriteria ? { false: q.falseCriteria } : {}),
              }
            : null;
        questions[q.id] = { type: "noul", instructions: q.prompt, criteria };
      }
    }

    const result = await client.systemOne({ state: request.state, questions });
    const answers: Answer[] = request.questions.map((q) => {
      const raw = result.answers[q.id];
      if (q.kind === "noul") {
        return { kind: "noul", id: q.id, p: Number(raw.noul) };
      }
      if (q.kind === "score") {
        const probs: Record<string, number> = {};
        for (const [key, value] of Object.entries(raw.probabilities ?? {})) {
          probs[String(key)] = Number(value);
        }
        return {
          kind: "score",
          id: q.id,
          score: Number(raw.score),
          probs,
          confidence: Number(raw.confidence ?? 0),
        };
      }
      const probs: Record<string, number> = {};
      for (const [label, value] of Object.entries(raw.probabilities ?? {})) {
        const id = labelToId.get(`${q.id}\u0000${label}`) ?? label;
        probs[id] = Number(value);
      }
      const pick = labelToId.get(`${q.id}\u0000${String(raw.choice)}`) ?? String(raw.choice);
      return {
        kind: "choice",
        id: q.id,
        pick,
        probs,
        confidence: Number(raw.confidence ?? probs[pick] ?? 0),
      };
    });

    const tokens =
      result.usage?.input_tokens ??
      estimateTokens(request.state) + request.questions.reduce((sum, q) => sum + questionTokens(q), 0);

    return {
      answers,
      tokens,
      costUsd: (tokens / 1_000_000) * PRICE_PER_MILLION_INPUT,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
      provider: `${this.name}:${result.model ?? this.model ?? "jev-latest"}`,
    };
  }
}

function uniqueLabel(label: string, existing: Record<string, unknown>): string {
  if (!(label in existing)) return label;
  let i = 2;
  while (`${label} (${i})` in existing) i += 1;
  return `${label} (${i})`;
}

/** Kept for type-level documentation of the Question union. */
export type _Q = Question;
