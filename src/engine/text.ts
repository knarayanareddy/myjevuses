/**
 * Text utilities for the local scoring engine.
 *
 * Deliberately simple and deterministic: tokenise, drop stopwords, crude stem,
 * weight by inverse document frequency across the request's own "documents".
 */

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those there here is are was were be been being do does did
  doing have has had having i you he she it we they me him her them my your his its our their of in on at to from by
  for with without about as into over under again further once only own same so such no nor not too very can will
  just should now would could may might must shall which who whom what when where why how all any both each few more
  most other some own s t don ll re ve m d`
    .split(/\s+/)
    .filter(Boolean)
);

export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[`"'’]/g, "")
    .split(/[^a-z0-9_.@/-]+/)
    .map((token) => token.replace(/^[._-]+|[._-]+$/g, ""))
    .filter((token) => (token.length > 2 || /^\d+$/.test(token)) && !STOPWORDS.has(token));

  const out: string[] = [];
  for (const token of raw) {
    out.push(stem(token));
    // Compound identifiers (emails, paths, dates, keys) should also match by
    // their parts, otherwise "northwind.example" never matches "a@northwind.example".
    if (/_/.test(token)) {
      for (const part of token.split(/_+/)) {
        if (part.length > 2) out.push(stem(part));
      }
    }
    if (token.length > 6 && /[@._:/-]/.test(token)) {
      for (const part of token.split(/[@._:/-]+/)) {
        if (part.length > 2) out.push(stem(part));
      }
    }
  }
  return out;
}

/**
 * Weight for a term: identifiers and long words carry the decision, common
 * words are almost free. This is what makes a missing invoice number matter
 * more than the word "document" being present.
 */
export function termWeight(token: string): number {
  let weight = 1;
  if (/\d/.test(token)) weight += 2;
  if (/[@._:/-]/.test(token)) weight += 1;
  if (token.length > 9) weight += 1;
  return weight;
}

export function stem(token: string): string {
  if (token.length <= 4) return token;
  for (const suffix of ["ingly", "edly", "ations", "ation", "ments", "ment", "ness", "ings", "ing", "ies", "ied", "ers", "ed", "es", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      const base = token.slice(0, -suffix.length);
      if (suffix === "ies" || suffix === "ied") return `${base}y`;
      return base;
    }
  }
  return token;
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Question scaffolding. Words that belong to how a question is phrased rather
 * than to what it is about are ignored when scoring overlap, otherwise a long
 * prompt mechanically dominates a short piece of evidence.
 */
const SCAFFOLD = new Set(
  `passage answer answers query document state record source trace event keep continue task step progress made make skill turn require function action code
   implement goal list choose among work generalise generalizes reusable specific lesson memory rule value exact appear stated contain mention discuss
   thing something report describe check whether given following listed operation operations best single advance advances called calls called before after acting acted shows show exactly just also still`
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
);

function isScaffold(token: string): boolean {
  return SCAFFOLD.has(token);
}

export type TermWeights = Map<string, number>;

/** IDF over the supplied documents. Terms appearing everywhere weigh ~0. */
export function idf(docs: string[][]): TermWeights {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = Math.max(1, docs.length);
  const weights: TermWeights = new Map();
  for (const [term, count] of df) {
    weights.set(term, Math.log((n + 1) / (count + 0.5)) + 0.15);
  }
  return weights;
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
}

/**
 * How much of `query` is covered by `doc`, weighted by term rarity.
 * Returns 0..1. Rare, discriminating terms dominate because they carry high IDF.
 */
/**
 * Weighted share of `query`'s content terms that appear in `doc`.
 * Returns 0..1.
 */
export function coverage(query: string, doc: string, _weights?: TermWeights): number {
  const queryTokens = new Set(tokenize(query).filter((token) => !isScaffold(token)));
  // A question made only of scaffolding carries no signal either way.
  if (queryTokens.size === 0) return 0.5;
  if (queryTokens.size === 0) return 0.5;
  const docTokens = new Set(tokenize(doc));
  let total = 0;
  let hit = 0;
  for (const token of queryTokens) {
    const weight = termWeight(token);
    total += weight;
    if (docTokens.has(token)) hit += weight;
  }
  return total === 0 ? 0.5 : hit / total;
}

/** Coverage of only the k heaviest query terms — the ones that decide true/false. */
export function decisiveCoverage(query: string, doc: string, _weights?: TermWeights, k = 4): number {
  const filtered = tokenize(query).filter((token) => !isScaffold(token));
  const queryTokens = new Set(filtered.length ? filtered : tokenize(query));
  if (queryTokens.size === 0) return 0.5;
  const ranked = [...queryTokens].map((term) => ({ term, w: termWeight(term) })).sort((a, b) => b.w - a.w).slice(0, k);
  const docTokens = new Set(tokenize(doc));
  const total = ranked.reduce((sum, t) => sum + t.w, 0);
  const hit = ranked.reduce((sum, t) => sum + (docTokens.has(t.term) ? t.w : 0), 0);
  return total === 0 ? 0.5 : hit / total;
}

/**
 * Negative framing is detected from the instructional prefix only. A question
 * that quotes hostile text ("...never arrived") must not invert its own logic.
 */
export function isNegativeFrame(text: string): boolean {
  const prefix = text.split(":")[0] ?? text;
  return /\b(avoid|avoids|avoided|without|prevent|prevents|prevented|never|no longer|does not|do not|did not|refrain|refrained|free of)\b/i.test(
    prefix
  );
}

const NEGATIONS = ["not", "no", "never", "none", "without", "fails", "failed", "absent", "missing", "lacks"];
const CONTRAST_PAIRS: [string, string][] = [
  ["valid", "invalid"],
  ["pass", "fail"],
  ["passed", "failed"],
  ["supported", "unsupported"],
  ["supported", "contradicted"],
  ["merge", "separate"],
  ["increase", "decrease"],
  ["approved", "rejected"],
  ["available", "unavailable"],
  ["allowed", "forbidden"],
  ["confirm", "deny"],
  ["stale", "current"],
  ["correct", "incorrect"],
  ["present", "absent"],
  ["relevant", "irrelevant"],
];

function stems(words: string[]): Set<string> {
  return new Set(words.map(stem));
}

/** True when the claim and the state disagree on an explicit polarity pair. */
export function polarityClash(claim: string, state: string): boolean {
  const c = stems(tokenize(claim));
  const s = stems(tokenize(state));
  for (const [a, b] of CONTRAST_PAIRS) {
    const sa = stem(a);
    const sb = stem(b);
    if ((c.has(sa) && s.has(sb) && !s.has(sa)) || (c.has(sb) && s.has(sa) && !s.has(sb))) return true;
  }
  return false;
}

/**
 * Coarse concept tags.
 *
 * A descriptive criterion ("contains a deadline or an error") shares almost no
 * vocabulary with the state it is judging. The local engine therefore appends
 * regex-detected concept labels to the state before scoring, so criteria have
 * something to match against. This is a hand-written approximation of what a
 * language model does properly; it is why the local numbers are illustrative.
 */
const CONCEPTS: { tag: string; test: RegExp }[] = [
  { tag: "deadline due date friday crunch", test: /\b(by|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod)\b|\bdeadline\b|\bdue (date|on|by)\b|\bcutoff\b/i },
  { tag: "error failure exception failed broke broken", test: /\b(error|errors|exception|traceback|failed|failure|failing|timeout|timed out|broke|red)\b|\b(429|500|503)\b/i },
  { tag: "identifier path reference id file path", test: /\b[A-Z]{2,}-\d+|\b[\w-]+\.(rb|ts|tsx|py|yml|yaml|json|md|sql)\b|\b\w+_\w+\b|\b(acct|ord|inv|po|mem|ch|trk)_\w+/i },
  { tag: "decision decided chose plan instead", test: /\b(decided|we will|i'll use|instead|chose|the plan is|going with|should)\b/i },
  { tag: "constraint approval must only required limit budget", test: /\b(must|only|required|cannot|can't|approval|approve|budget|limit)\b/i },
  { tag: "tool result returned output passed failed", test: /→|\breturned\b|\bexamples?, \d+ (failures|passed)\b|\b\d+ (passed|failed)\b/i },
  { tag: "chatter status small talk update reminder thanks", test: /\b(thanks|thank you|great|sounds good|reminder|progress update|status update|on track|still investigating)\b/i },
  { tag: "unrelated environment trivia password wifi lunch weather", test: /\b(wifi|password|lunch|weather|birthday|parking|coffee)\b/i },
  { tag: "repetition unchanged repeated again same read", test: /\b(unchanged|same as before|again|re-?read|identical|retried|retry)\b/i },
  { tag: "correction wrong reopened redone reverted apology pushed back", test: /\b(wrong|my mistake|sorry|you're right|reopen|reopened|revert|reverted|should have|instead of|backed off)\b/i },
  { tag: "verification test suite ran checked rspec pytest", test: /\b(test|tests|spec|specs|rspec|pytest|verified|verification|checked)\b|\b0 failures\b/i },
  { tag: "personal data email address home address leaked", test: /[\w.+-]+@[\w-]+\.[\w.]+|\b\d+\s+\w+\s+(street|road|avenue|lane)\b/i },
  { tag: "refund money charge credit", test: /\b(refund|refunded|chargeback|credit note|money)\b/i },
  { tag: "customer blocked impact urgent escalation today", test: /\b(blocked|cannot access|could not|urgent|today|escalat|frustrat|double|twice|charged twice|third day)\b/i },
  { tag: "reusable rule general always whenever in future", test: /\b(always|never|rule|general|whenever|in future|from now on|similar|recur)\b/i },
  { tag: "skill instructions procedure runbook checklist", test: /\b(runbook|checklist|steps|procedure|how to|guide|instructions)\b/i },
  { tag: "goal purchase buy cart checkout", test: /\b(buy|purchase|add to cart|checkout|order)\b/i },
  { tag: "answer query figure number", test: /\$\d|\b\d+(\.\d+)?\s*(ms|milliseconds|million|tokens|requests|percent)\b/i },
];

export function enrich(text: string): string {
  const tags: string[] = [];
  for (const concept of CONCEPTS) {
    if (concept.test.test(text)) tags.push(concept.tag);
  }
  return tags.length ? `${text}\n[concept tags: ${tags.join("; ")}]` : text;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function softmax(logits: number[], temperature = 1): number[] {
  const scaled = logits.map((l) => l / Math.max(temperature, 1e-6));
  const max = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function round(value: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
