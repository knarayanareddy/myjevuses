/**
 * The Jev contract, as used by every use case in this repo.
 *
 * A request is state (a string) plus a panel of typed questions whose answer
 * spaces are fully enumerated. A response is one answer per question, each
 * carrying a probability distribution. No text is generated.
 */

export type ChoiceOption = {
  id: string;
  label: string;
  detail?: string;
};

export type ScoreLevel = {
  value: number;
  label: string;
  detail?: string;
};

export type Question =
  | {
      kind: "choice";
      id: string;
      prompt: string;
      options: ChoiceOption[];
      /** Every Choice should offer an escape hatch. Missing this is the #1 bug. */
      allowNone?: boolean;
    }
  | {
      kind: "score";
      id: string;
      prompt: string;
      levels: ScoreLevel[];
    }
  | {
      kind: "noul";
      id: string;
      prompt: string;
      /** What a "yes" looks like, in words. Maps to TypeSafe's criteria.true. */
      trueCriteria?: string;
      /** What a "no" looks like, in words. Maps to TypeSafe's criteria.false. */
      falseCriteria?: string;
    };

export type ChoiceAnswer = {
  kind: "choice";
  id: string;
  pick: string;
  probs: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  kind: "score";
  id: string;
  score: number;
  probs: Record<string, number>;
  confidence: number;
};

export type NoulAnswer = {
  kind: "noul";
  id: string;
  p: number;
};

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type AskRequest = {
  state: string;
  questions: Question[];
};

export type AskResult = {
  answers: Answer[];
  tokens: number;
  costUsd: number;
  latencyMs: number;
  /** Which provider produced this. "local" is a deterministic stand-in, not TypeSafe. */
  provider: string;
};

export interface JevProvider {
  name: string;
  ask(request: AskRequest): Promise<AskResult>;
}

/** $0.042 per 1M input tokens, output free. */
export const PRICE_PER_MILLION_INPUT = 0.042;
export const PRICE_PER_MILLION_OUTPUT = 0;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function questionTokens(question: Question): number {
  return estimateTokens(JSON.stringify(question));
}

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.000001) return `$${usd.toExponential(1)}`;
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
