import {
  type Answer,
  type AskRequest,
  type AskResult,
  type ChoiceOption,
  type JevProvider,
  type Question,
  type ScoreLevel,
  PRICE_PER_MILLION_INPUT,
  estimateTokens,
  questionTokens,
} from "./types.js";
import {
  coverage,
  decisiveCoverage,
  enrich,
  idf,
  isNegativeFrame,
  polarityClash,
  round,
  sentences,
  sigmoid,
  softmax,
  tokenize,
} from "./text.js";

/**
 * LocalProvider — a deterministic stand-in for Jev.
 *
 * It implements the *contract* (typed questions in, probability distributions
 * out) using lexical overlap rather than a language model. This exists so the
 * showcase runs with no API key and no network. It is NOT Jev, and the numbers
 * it produces are not TypeSafe's. Swap providers with TYPESAFE_API_KEY.
 *
 * The failure modes are deliberate and documented: it is sensitive to wording,
 * it cannot handle paraphrase or negation reliably, and it is not calibrated.
 * Every panel in the UI labels its output accordingly.
 */
export class LocalProvider implements JevProvider {
  name = "local-simulation";

  async ask(request: AskRequest): Promise<AskResult> {
    const started = performance.now();
    // IDF is built from the state only. Words that appear solely in a question
    // fall back to the default weight, which keeps a long prompt from
    // dominating the score of a short state.
    const enriched = enrich(request.state);
    const stateSentences = sentences(enriched);
    const docs = [tokenize(enriched), ...stateSentences.map(tokenize)];
    const weights = idf(docs);

    const answers = request.questions.map((q) => this.answer(q, enriched, weights));
    const tokens =
      estimateTokens(request.state) +
      request.questions.reduce((sum, q) => sum + questionTokens(q), 0);

    return {
      answers,
      tokens,
      costUsd: (tokens / 1_000_000) * PRICE_PER_MILLION_INPUT,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
      provider: this.name,
    };
  }

  private answer(q: Question, state: string, weights: ReturnType<typeof idf>): Answer {
    if (q.kind === "choice") return this.choice(q, state, weights);
    if (q.kind === "score") return this.score(q, state, weights);
    return this.noul(q, state, weights);
  }

  private choice(
    q: Extract<Question, { kind: "choice" }>,
    state: string,
    weights: ReturnType<typeof idf>
  ): Answer {
    const options: ChoiceOption[] = q.allowNone
      ? [
          ...q.options,
          { id: "__none__", label: "none of the above", detail: "nothing in the list fits" },
        ]
      : q.options;

    const logits = options.map((option) => {
      const text = `${option.label} ${option.detail ?? ""}`;
      // Three cheap signals:
      //  answersPrompt — how much of the question this option accounts for
      //  grounded      — how much of the option is actually present in the state
      //  decisive      — rare question terms that only this option covers
      const answersPrompt = coverage(q.prompt, text, weights);
      const grounded = coverage(text, state, weights);
      const decisive = decisiveCoverage(q.prompt, text, weights, 4);
      return answersPrompt * 0.52 + grounded * 0.13 + decisive * 0.35;
    });

    const probs = softmax(logits, 0.07);
    const byId = new Map(options.map((option, i) => [option.id, probs[i]]));
    const best = [...byId.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      kind: "choice",
      id: q.id,
      pick: best[0],
      probs: Object.fromEntries(
        [...byId.entries()]
          .map(([id, p]) => [id, round(p, 4)] as [string, number])
          .sort((a, b) => b[1] - a[1])
      ),
      confidence: round(best[1], 4),
    };
  }

  private score(
    q: Extract<Question, { kind: "score" }>,
    state: string,
    weights: ReturnType<typeof idf>
  ): Answer {
    const levels: ScoreLevel[] = q.levels;
    const logits = levels.map((level) => {
      const text = `${level.label} ${level.detail ?? ""}`;
      return coverage(text, state, weights) * 0.78 + decisiveCoverage(`${q.prompt} ${level.label}`, state, weights, 4) * 0.22;
    });
    const probs = softmax(logits, 0.075);
    const value = probs.reduce((sum, p, i) => sum + p * levels[i].value, 0);
    const confidence = probs.reduce((sum, p) => sum + p * p, 0);
    return {
      kind: "score",
      id: q.id,
      score: round(value, 3),
      probs: Object.fromEntries(
        levels.map((level, i) => [String(level.value), round(probs[i], 4)])
      ),
      confidence: round(confidence, 4),
    };
  }

  private noul(
    q: Extract<Question, { kind: "noul" }>,
    state: string,
    weights: ReturnType<typeof idf>
  ): Answer {
    let p: number;

    if (q.trueCriteria || q.falseCriteria) {
      // Compare the state against the written description of each outcome.
      // This is what the criteria fields are for: the question names the
      // behaviour, and the criteria say what yes and no look like.
      const t = coverage(q.trueCriteria ?? "", state, weights);
      const f = coverage(q.falseCriteria ?? "", state, weights);
      const tn = t * t;
      const fn = f * f;
      // A small prior on the negative side: matching neither description is
      // weak evidence for "yes". Asymmetric judgments (discard, duplicate,
      // promote) should fail closed.
      p = tn / (tn + fn + 0.02);
    } else {
      const signal = coverage(q.prompt, state, weights);
      p = sigmoid((signal - 0.55) / 0.13);
    }

    // Prohibitions invert presence; explicit polarity clashes cap support.
    if (isNegativeFrame(q.prompt)) p = 1 - p;
    else if (polarityClash(q.prompt, state)) p = Math.min(p, 0.2);

    return { kind: "noul", id: q.id, p: round(Math.max(0.02, Math.min(0.97, p)), 4) };
  }
}
