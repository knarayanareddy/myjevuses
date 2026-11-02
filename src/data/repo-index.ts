/**
 * GENERATED FILE — do not edit by hand.
 * Run `npm run index:repo` to regenerate from this repository's src/ tree.
 *
 * This is the corpus jevgrep searches. It is committed so the static
 * GitHub Pages build has a filesystem-free index.
 */

export type CodeChunk = { id: string; file: string; startLine: number; text: string };

export const REPO_INDEX: CodeChunk[] = [
  {
    "id": "src/data/repo-index.ts:11",
    "file": "src/data/repo-index.ts",
    "startLine": 11,
    "text": "export const REPO_INDEX: CodeChunk[] = [\n  {\n    \"id\": \"src/engine/local.ts:39\",\n    \"file\": \"src/engine/local.ts\",\n    \"startLine\": 39,\n    \"text\": \"export class LocalProvider implements JevProvider {\\n  name = \\\"local-simulation\\\";\\n\\n  async ask(request: AskRequest): Promise<AskResult> {\\n    const started = performance.now();\\n    // IDF is built from the state only. Words that appear solely in a question\\n    // fall back to the default weight, which keeps a long prompt from\\n    // dominating the score of a short state.\\n    const enriched = enrich(request.state);\\n    const stateSentences = sentences(enriched);\\n    const docs = [tokenize(enriched), ...stateSentences.map(tokenize)];\\n    const weights = idf(docs);\\n\\n    const answers = request.questions.map((q) => this.answer(q, enriched, weights));\\n    const tokens =\\n      estimateTokens(request.state) +\\n      request.questions.reduce((sum, q) => sum + questionTokens(q), 0);\\n\\n    return {\\n      answers,\\n      tokens,\\n      costUsd: (tokens / 1_000_000) * PRICE_PER_MILLION_INPUT,\\n      latencyMs: Math.round((performance.now() - started) * 10) / 10,\\n      provider: this.name,\\n    };\\n  }\\n\\n  private answer(q: Question, state: string, weights: ReturnType<typeof idf>): Answer {\\n    if (q.kind === \\\"choice\\\") return this.choice(q, state, weights);\\n    if (q.kind === \\\"score\\\") return this.score(q, state, weights);\\n    return this.noul(q, state, weights);\\n  }\\n\\n  private choice(\\n    q: Extract<Question, { kind: \\\"choice\\\" }>,\\n    state: string,\\n    weights: ReturnType<typeof idf>\\n  ): Answer {\\n    const options: ChoiceOption[] = q.allowNone\\n      ? [\\n          ...q.options,\\n          { id: \\\"__none__\\\", label: \\\"none of the above\\\", detail: \\\"nothing in the list fits\\\" },\\n        ]\\n      : q.options;\\n\\n    const logits = options.map((option) => {\\n      const text = `${option.label} ${option.detail ?? \\\"\\\"}`;\\n      // Three cheap signals:\\n      //  answersPrompt — how much of the question this option accounts for\\n      //  grounded      — how much of the option is actually present in the state\\n      //  decisive      — rare question terms that only this option covers\\n      const answersPrompt = coverage(q.prompt, text, weights);\\n      const grounded = coverage(text, state, weights);\\n      const decisive = decisiveCoverage(q.prompt, text, weights, 4);\\n      return answersPrompt * 0.52 + grounded * 0.13 + decisive * 0.35;\\n    });\\n\\n    const probs = softmax(logits, 0.07);\\n    const byId = new Map(options.map((option, i) => [option.id, probs[i]]));\\n    const best = [...byId.entries()].sort((a, b) => b[1] - a[1])[0];\\n\\n    return {\\n      kind: \\\"choice\\\",\\n      id: q.id,\\n      pick: best[0],\\n      probs: Object.fromEntries(\\n        [...byId.entries()]\\n          .map(([id, p]) => [id, round(p, 4)] as [string, number])\\n          .sort((a, b) => b[1] - a[1])\\n      ),\"\n  },\n  {\n    \"id\": \"src/engine/provider.ts:6\",\n    \"file\": \"src/engine/provider.ts\",\n    \"startLine\": 6,\n    \"text\": \"let cachedKey: string | null = null;\\n\\n/**\\n * Provider selection.\\n *\\n * With TYPESAFE_API_KEY set, every use case calls the real Jev endpoint.\\n * Without it, the deterministic LocalProvider stands in so the showcase runs\\n * offline. The UI surfaces which one answered on every result.\\n */\"\n  },\n  {\n    \"id\": \"src/engine/provider.ts:15\",\n    \"file\": \"src/engine/provider.ts\",\n    \"startLine\": 15,\n    \"text\": \"export function getProvider(): JevProvider {\\n  const key = process.env.TYPESAFE_API_KEY?.trim() || \\\"\\\";\\n  const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || undefined;\\n  const signature = `${key}|${model ?? \\\"\\\"}`;\\n  if (cached && cachedKey === signature) return cached;\\n\\n  cached = key\\n    ? new TypeSafeProvider(key, model)\\n    : new LocalProvider();\\n  cachedKey = signature;\\n  return cached;\\n}\"\n  },\n  {\n    \"id\": \"src/engine/provider.ts:28\",\n    \"file\": \"src/engine/provider.ts\",\n    \"startLine\": 28,\n    \"text\": \"export function providerStatus(): { live: boolean; label: string; detail: string } {\\n  const key = process.env.TYPESAFE_API_KEY?.trim();\\n  if (key) {\\n    return {\\n      live: true,\\n      label: \\\"Live Jev\\\",\\n      detail: `TypeSafe API · model ${process.env.TYPESAFE_DEFAULT_MODEL?.trim() || \\\"jev-latest\\\"}`,\\n    };\\n  }\\n  return {\\n    live: false,\\n    label: \\\"Local simulation\\\",\\n    detail:\\n      \\\"No TYPESAFE_API_KEY set. A deterministic lexical engine answers the same typed panels so the demos run offline. Numbers are illustrative, not TypeSafe's.\\\",\\n  };\\n}\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:18\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 18,\n    \"text\": \"export function tokenize(text: string): string[] {\\n  const raw = text\\n    .toLowerCase()\\n    .replace(/[`\\\"'’]/g, \\\"\\\")\\n    .split(/[^a-z0-9_.@/-]+/)\\n    .map((token) => token.replace(/^[._-]+|[._-]+$/g, \\\"\\\"))\\n    .filter((token) => (token.length > 2 || /^\\\\d+$/.test(token)) && !STOPWORDS.has(token));\\n\\n  const out: string[] = [];\\n  for (const token of raw) {\\n    out.push(stem(token));\\n    // Compound identifiers (emails, paths, dates, keys) should also match by\\n    // their parts, otherwise \\\"northwind.example\\\" never matches \\\"a@northwind.example\\\".\\n    if (/_/.test(token)) {\\n      for (const part of token.split(/_+/)) {\\n        if (part.length > 2) out.push(stem(part));\\n      }\\n    }\\n    if (token.length > 6 && /[@._:/-]/.test(token)) {\\n      for (const part of token.split(/[@._:/-]+/)) {\\n        if (part.length > 2) out.push(stem(part));\\n      }\\n    }\\n  }\\n  return out;\\n}\\n\\n/**\\n * Weight for a term: identifiers and long words carry the decision, common\\n * words are almost free. This is what makes a missing invoice number matter\\n * more than the word \\\"document\\\" being present.\\n */\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:50\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 50,\n    \"text\": \"export function termWeight(token: string): number {\\n  let weight = 1;\\n  if (/\\\\d/.test(token)) weight += 2;\\n  if (/[@._:/-]/.test(token)) weight += 1;\\n  if (token.length > 9) weight += 1;\\n  return weight;\\n}\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:58\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 58,\n    \"text\": \"export function stem(token: string): string {\\n  if (token.length <= 4) return token;\\n  for (const suffix of [\\\"ingly\\\", \\\"edly\\\", \\\"ations\\\", \\\"ation\\\", \\\"ments\\\", \\\"ment\\\", \\\"ness\\\", \\\"ings\\\", \\\"ing\\\", \\\"ies\\\", \\\"ied\\\", \\\"ers\\\", \\\"ed\\\", \\\"es\\\", \\\"s\\\"]) {\\n    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {\\n      const base = token.slice(0, -suffix.length);\\n      if (suffix === \\\"ies\\\" || suffix === \\\"ied\\\") return `${base}y`;\\n      return base;\\n    }\\n  }\\n  return token;\\n}\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:70\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 70,\n    \"text\": \"export function sentences(text: string): string[] {\\n  return text\\n    .split(/(?<=[.!?])\\\\s+|\\\\n{2,}/)\\n    .map((s) => s.trim())\\n    .filter(Boolean);\\n}\\n\\n/**\\n * Question scaffolding. Words that belong to how a question is phrased rather\\n * than to what it is about are ignored when scoring overlap, otherwise a long\\n * prompt mechanically dominates a short piece of evidence.\\n */\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:98\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 98,\n    \"text\": \"export function idf(docs: string[][]): TermWeights {\\n  const df = new Map<string, number>();\\n  for (const doc of docs) {\\n    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);\\n  }\\n  const n = Math.max(1, docs.length);\\n  const weights: TermWeights = new Map();\\n  for (const [term, count] of df) {\\n    weights.set(term, Math.log((n + 1) / (count + 0.5)) + 0.15);\\n  }\\n  return weights;\\n}\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:111\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 111,\n    \"text\": \"export function termFrequency(tokens: string[]): Map<string, number> {\\n  const tf = new Map<string, number>();\\n  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);\\n  return tf;\\n}\\n\\n/**\\n * How much of `query` is covered by `doc`, weighted by term rarity.\\n * Returns 0..1. Rare, discriminating terms dominate because they carry high IDF.\\n */\\n/**\\n * Weighted share of `query`'s content terms that appear in `doc`.\\n * Returns 0..1.\\n */\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:125\",\n    \"file\": \"src/engine/text.ts\",\n    \"startLine\": 125,\n    \"text\": \"export function coverage(query: string, doc: string, _weights?: TermWeights): number {\\n  const queryTokens = new Set(tokenize(query).filter((token) => !isScaffold(token)));\\n  // A question made only of scaffolding carries no signal either way.\\n  if (queryTokens.size === 0) return 0.5;\\n  if (queryTokens.size === 0) return 0.5;\\n  const docTokens = new Set(tokenize(doc));\\n  let total = 0;\\n  let hit = 0;\\n  for (const token of queryTokens) {\\n    const weight = termWeight(token);\\n    total += weight;\\n    if (docTokens.has(token)) hit += weight;\\n  }\\n  return total === 0 ? 0.5 : hit / total;\\n}\\n\\n/** Coverage of only the k heaviest query terms — the ones that decide true/false. */\"\n  },\n  {\n    \"id\": \"src/engine/text.ts:142\",\n    \"file\": \"src/engine/text.ts\","
  },
  {
    "id": "src/engine/local.ts:39",
    "file": "src/engine/local.ts",
    "startLine": 39,
    "text": "export class LocalProvider implements JevProvider {\n  name = \"local-simulation\";\n\n  async ask(request: AskRequest): Promise<AskResult> {\n    const started = performance.now();\n    // IDF is built from the state only. Words that appear solely in a question\n    // fall back to the default weight, which keeps a long prompt from\n    // dominating the score of a short state.\n    const enriched = enrich(request.state);\n    const stateSentences = sentences(enriched);\n    const docs = [tokenize(enriched), ...stateSentences.map(tokenize)];\n    const weights = idf(docs);\n\n    const answers = request.questions.map((q) => this.answer(q, enriched, weights));\n    const tokens =\n      estimateTokens(request.state) +\n      request.questions.reduce((sum, q) => sum + questionTokens(q), 0);\n\n    return {\n      answers,\n      tokens,\n      costUsd: (tokens / 1_000_000) * PRICE_PER_MILLION_INPUT,\n      latencyMs: Math.round((performance.now() - started) * 10) / 10,\n      provider: this.name,\n    };\n  }\n\n  private answer(q: Question, state: string, weights: ReturnType<typeof idf>): Answer {\n    if (q.kind === \"choice\") return this.choice(q, state, weights);\n    if (q.kind === \"score\") return this.score(q, state, weights);\n    return this.noul(q, state, weights);\n  }\n\n  private choice(\n    q: Extract<Question, { kind: \"choice\" }>,\n    state: string,\n    weights: ReturnType<typeof idf>\n  ): Answer {\n    const options: ChoiceOption[] = q.allowNone\n      ? [\n          ...q.options,\n          { id: \"__none__\", label: \"none of the above\", detail: \"nothing in the list fits\" },\n        ]\n      : q.options;\n\n    const logits = options.map((option) => {\n      const text = `${option.label} ${option.detail ?? \"\"}`;\n      // Three cheap signals:\n      //  answersPrompt — how much of the question this option accounts for\n      //  grounded      — how much of the option is actually present in the state\n      //  decisive      — rare question terms that only this option covers\n      const answersPrompt = coverage(q.prompt, text, weights);\n      const grounded = coverage(text, state, weights);\n      const decisive = decisiveCoverage(q.prompt, text, weights, 4);\n      return answersPrompt * 0.52 + grounded * 0.13 + decisive * 0.35;\n    });\n\n    const probs = softmax(logits, 0.07);\n    const byId = new Map(options.map((option, i) => [option.id, probs[i]]));\n    const best = [...byId.entries()].sort((a, b) => b[1] - a[1])[0];\n\n    return {\n      kind: \"choice\",\n      id: q.id,\n      pick: best[0],\n      probs: Object.fromEntries(\n        [...byId.entries()]\n          .map(([id, p]) => [id, round(p, 4)] as [string, number])\n          .sort((a, b) => b[1] - a[1])\n      ),"
  },
  {
    "id": "src/engine/provider.ts:6",
    "file": "src/engine/provider.ts",
    "startLine": 6,
    "text": "let cachedKey: string | null = null;\n\n/**\n * Provider selection.\n *\n * With TYPESAFE_API_KEY set, every use case calls the real Jev endpoint.\n * Without it, the deterministic LocalProvider stands in so the showcase runs\n * offline. The UI surfaces which one answered on every result.\n */"
  },
  {
    "id": "src/engine/provider.ts:15",
    "file": "src/engine/provider.ts",
    "startLine": 15,
    "text": "export function getProvider(): JevProvider {\n  const key = process.env.TYPESAFE_API_KEY?.trim() || \"\";\n  const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || undefined;\n  const signature = `${key}|${model ?? \"\"}`;\n  if (cached && cachedKey === signature) return cached;\n\n  cached = key\n    ? new TypeSafeProvider(key, model)\n    : new LocalProvider();\n  cachedKey = signature;\n  return cached;\n}"
  },
  {
    "id": "src/engine/provider.ts:28",
    "file": "src/engine/provider.ts",
    "startLine": 28,
    "text": "export function providerStatus(): { live: boolean; label: string; detail: string } {\n  const key = process.env.TYPESAFE_API_KEY?.trim();\n  if (key) {\n    return {\n      live: true,\n      label: \"Live Jev\",\n      detail: `TypeSafe API · model ${process.env.TYPESAFE_DEFAULT_MODEL?.trim() || \"jev-latest\"}`,\n    };\n  }\n  return {\n    live: false,\n    label: \"Local simulation\",\n    detail:\n      \"No TYPESAFE_API_KEY set. A deterministic lexical engine answers the same typed panels so the demos run offline. Numbers are illustrative, not TypeSafe's.\",\n  };\n}"
  },
  {
    "id": "src/engine/text.ts:18",
    "file": "src/engine/text.ts",
    "startLine": 18,
    "text": "export function tokenize(text: string): string[] {\n  const raw = text\n    .toLowerCase()\n    .replace(/[`\"'’]/g, \"\")\n    .split(/[^a-z0-9_.@/-]+/)\n    .map((token) => token.replace(/^[._-]+|[._-]+$/g, \"\"))\n    .filter((token) => (token.length > 2 || /^\\d+$/.test(token)) && !STOPWORDS.has(token));\n\n  const out: string[] = [];\n  for (const token of raw) {\n    out.push(stem(token));\n    // Compound identifiers (emails, paths, dates, keys) should also match by\n    // their parts, otherwise \"northwind.example\" never matches \"a@northwind.example\".\n    if (/_/.test(token)) {\n      for (const part of token.split(/_+/)) {\n        if (part.length > 2) out.push(stem(part));\n      }\n    }\n    if (token.length > 6 && /[@._:/-]/.test(token)) {\n      for (const part of token.split(/[@._:/-]+/)) {\n        if (part.length > 2) out.push(stem(part));\n      }\n    }\n  }\n  return out;\n}\n\n/**\n * Weight for a term: identifiers and long words carry the decision, common\n * words are almost free. This is what makes a missing invoice number matter\n * more than the word \"document\" being present.\n */"
  },
  {
    "id": "src/engine/text.ts:50",
    "file": "src/engine/text.ts",
    "startLine": 50,
    "text": "export function termWeight(token: string): number {\n  let weight = 1;\n  if (/\\d/.test(token)) weight += 2;\n  if (/[@._:/-]/.test(token)) weight += 1;\n  if (token.length > 9) weight += 1;\n  return weight;\n}"
  },
  {
    "id": "src/engine/text.ts:58",
    "file": "src/engine/text.ts",
    "startLine": 58,
    "text": "export function stem(token: string): string {\n  if (token.length <= 4) return token;\n  for (const suffix of [\"ingly\", \"edly\", \"ations\", \"ation\", \"ments\", \"ment\", \"ness\", \"ings\", \"ing\", \"ies\", \"ied\", \"ers\", \"ed\", \"es\", \"s\"]) {\n    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {\n      const base = token.slice(0, -suffix.length);\n      if (suffix === \"ies\" || suffix === \"ied\") return `${base}y`;\n      return base;\n    }\n  }\n  return token;\n}"
  },
  {
    "id": "src/engine/text.ts:70",
    "file": "src/engine/text.ts",
    "startLine": 70,
    "text": "export function sentences(text: string): string[] {\n  return text\n    .split(/(?<=[.!?])\\s+|\\n{2,}/)\n    .map((s) => s.trim())\n    .filter(Boolean);\n}\n\n/**\n * Question scaffolding. Words that belong to how a question is phrased rather\n * than to what it is about are ignored when scoring overlap, otherwise a long\n * prompt mechanically dominates a short piece of evidence.\n */"
  },
  {
    "id": "src/engine/text.ts:98",
    "file": "src/engine/text.ts",
    "startLine": 98,
    "text": "export function idf(docs: string[][]): TermWeights {\n  const df = new Map<string, number>();\n  for (const doc of docs) {\n    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);\n  }\n  const n = Math.max(1, docs.length);\n  const weights: TermWeights = new Map();\n  for (const [term, count] of df) {\n    weights.set(term, Math.log((n + 1) / (count + 0.5)) + 0.15);\n  }\n  return weights;\n}"
  },
  {
    "id": "src/engine/text.ts:111",
    "file": "src/engine/text.ts",
    "startLine": 111,
    "text": "export function termFrequency(tokens: string[]): Map<string, number> {\n  const tf = new Map<string, number>();\n  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);\n  return tf;\n}\n\n/**\n * How much of `query` is covered by `doc`, weighted by term rarity.\n * Returns 0..1. Rare, discriminating terms dominate because they carry high IDF.\n */\n/**\n * Weighted share of `query`'s content terms that appear in `doc`.\n * Returns 0..1.\n */"
  },
  {
    "id": "src/engine/text.ts:125",
    "file": "src/engine/text.ts",
    "startLine": 125,
    "text": "export function coverage(query: string, doc: string, _weights?: TermWeights): number {\n  const queryTokens = new Set(tokenize(query).filter((token) => !isScaffold(token)));\n  // A question made only of scaffolding carries no signal either way.\n  if (queryTokens.size === 0) return 0.5;\n  if (queryTokens.size === 0) return 0.5;\n  const docTokens = new Set(tokenize(doc));\n  let total = 0;\n  let hit = 0;\n  for (const token of queryTokens) {\n    const weight = termWeight(token);\n    total += weight;\n    if (docTokens.has(token)) hit += weight;\n  }\n  return total === 0 ? 0.5 : hit / total;\n}\n\n/** Coverage of only the k heaviest query terms — the ones that decide true/false. */"
  },
  {
    "id": "src/engine/text.ts:142",
    "file": "src/engine/text.ts",
    "startLine": 142,
    "text": "export function decisiveCoverage(query: string, doc: string, _weights?: TermWeights, k = 4): number {\n  const filtered = tokenize(query).filter((token) => !isScaffold(token));\n  const queryTokens = new Set(filtered.length ? filtered : tokenize(query));\n  if (queryTokens.size === 0) return 0.5;\n  const ranked = [...queryTokens].map((term) => ({ term, w: termWeight(term) })).sort((a, b) => b.w - a.w).slice(0, k);\n  const docTokens = new Set(tokenize(doc));\n  const total = ranked.reduce((sum, t) => sum + t.w, 0);\n  const hit = ranked.reduce((sum, t) => sum + (docTokens.has(t.term) ? t.w : 0), 0);\n  return total === 0 ? 0.5 : hit / total;\n}\n\n/**\n * Negative framing is detected from the instructional prefix only. A question\n * that quotes hostile text (\"...never arrived\") must not invert its own logic.\n */"
  },
  {
    "id": "src/engine/text.ts:157",
    "file": "src/engine/text.ts",
    "startLine": 157,
    "text": "export function isNegativeFrame(text: string): boolean {\n  const prefix = text.split(\":\")[0] ?? text;\n  return /\\b(avoid|avoids|avoided|without|prevent|prevents|prevented|never|no longer|does not|do not|did not|refrain|refrained|free of)\\b/i.test(\n    prefix\n  );\n}"
  },
  {
    "id": "src/engine/text.ts:183",
    "file": "src/engine/text.ts",
    "startLine": 183,
    "text": "function stems(words: string[]): Set<string> {\n  return new Set(words.map(stem));\n}\n\n/** True when the claim and the state disagree on an explicit polarity pair. */"
  },
  {
    "id": "src/engine/text.ts:188",
    "file": "src/engine/text.ts",
    "startLine": 188,
    "text": "export function polarityClash(claim: string, state: string): boolean {\n  const c = stems(tokenize(claim));\n  const s = stems(tokenize(state));\n  for (const [a, b] of CONTRAST_PAIRS) {\n    const sa = stem(a);\n    const sb = stem(b);\n    if ((c.has(sa) && s.has(sb) && !s.has(sa)) || (c.has(sb) && s.has(sa) && !s.has(sb))) return true;\n  }\n  return false;\n}\n\n/**\n * Coarse concept tags.\n *\n * A descriptive criterion (\"contains a deadline or an error\") shares almost no\n * vocabulary with the state it is judging. The local engine therefore appends\n * regex-detected concept labels to the state before scoring, so criteria have\n * something to match against. This is a hand-written approximation of what a\n * language model does properly; it is why the local numbers are illustrative.\n */"
  },
  {
    "id": "src/engine/text.ts:229",
    "file": "src/engine/text.ts",
    "startLine": 229,
    "text": "export function enrich(text: string): string {\n  const tags: string[] = [];\n  for (const concept of CONCEPTS) {\n    if (concept.test.test(text)) tags.push(concept.tag);\n  }\n  return tags.length ? `${text}\\n[concept tags: ${tags.join(\"; \")}]` : text;\n}"
  },
  {
    "id": "src/engine/text.ts:241",
    "file": "src/engine/text.ts",
    "startLine": 241,
    "text": "export function softmax(logits: number[], temperature = 1): number[] {\n  const scaled = logits.map((l) => l / Math.max(temperature, 1e-6));\n  const max = Math.max(...scaled);\n  const exps = scaled.map((l) => Math.exp(l - max));\n  const sum = exps.reduce((a, b) => a + b, 0);\n  return exps.map((e) => e / sum);\n}"
  },
  {
    "id": "src/engine/types.ts:21",
    "file": "src/engine/types.ts",
    "startLine": 21,
    "text": "export type Question =\n  | {\n      kind: \"choice\";\n      id: string;\n      prompt: string;\n      options: ChoiceOption[];\n      /** Every Choice should offer an escape hatch. Missing this is the #1 bug. */\n      allowNone?: boolean;\n    }\n  | {\n      kind: \"score\";\n      id: string;\n      prompt: string;\n      levels: ScoreLevel[];\n    }\n  | {\n      kind: \"noul\";\n      id: string;\n      prompt: string;\n      /** What a \"yes\" looks like, in words. Maps to TypeSafe's criteria.true. */\n      trueCriteria?: string;\n      /** What a \"no\" looks like, in words. Maps to TypeSafe's criteria.false. */\n      falseCriteria?: string;\n    };"
  },
  {
    "id": "src/engine/types.ts:75",
    "file": "src/engine/types.ts",
    "startLine": 75,
    "text": "export type AskResult = {\n  answers: Answer[];\n  tokens: number;\n  costUsd: number;\n  latencyMs: number;\n  /** Which provider produced this. \"local\" is a deterministic stand-in, not TypeSafe. */\n  provider: string;\n};"
  },
  {
    "id": "src/engine/types.ts:84",
    "file": "src/engine/types.ts",
    "startLine": 84,
    "text": "export interface JevProvider {\n  name: string;\n  ask(request: AskRequest): Promise<AskResult>;\n}\n\n/** $0.042 per 1M input tokens, output free. */"
  },
  {
    "id": "src/engine/types.ts:101",
    "file": "src/engine/types.ts",
    "startLine": 101,
    "text": "export function formatUsd(usd: number): string {\n  if (usd === 0) return \"$0\";\n  if (usd < 0.000001) return `$${usd.toExponential(1)}`;\n  if (usd < 0.01) return `$${usd.toFixed(6)}`;\n  if (usd < 1) return `$${usd.toFixed(4)}`;\n  return `$${usd.toFixed(2)}`;\n}"
  },
  {
    "id": "src/engine/typesafe.ts:27",
    "file": "src/engine/typesafe.ts",
    "startLine": 27,
    "text": "export class TypeSafeProvider implements JevProvider {\n  name = \"typesafe\";\n  private clientPromise: Promise<any> | null = null;\n\n  constructor(private apiKey: string, private model?: string) {}\n\n  private client(): Promise<any> {\n    if (!this.clientPromise) {\n      this.clientPromise = import(\"@typesafe-ai/sdk\").then((mod) => {\n        const Client = (mod as any).TypeSafeClient;\n        return new Client({ apiKey: this.apiKey, ...(this.model ? { defaultModel: this.model } : {}) });\n      });\n    }\n    return this.clientPromise;\n  }\n\n  async ask(request: AskRequest): Promise<AskResult> {\n    const started = performance.now();\n    const client = await this.client();\n    const labelToId = new Map<string, string>();\n    const questions: Record<string, any> = {};\n\n    for (const q of request.questions) {\n      if (q.kind === \"choice\") {\n        const criteria: Record<string, string | null> = {};\n        const options = q.allowNone\n          ? [...q.options, { id: \"__none__\", label: \"none of the above\", detail: \"nothing listed fits\" }]\n          : q.options;\n        for (const option of options) {\n          const label = uniqueLabel(option.label, criteria);\n          labelToId.set(`${q.id}\\u0000${label}`, option.id);\n          criteria[label] = option.detail ?? null;\n        }\n        questions[q.id] = { type: \"choice\", instructions: q.prompt, criteria };\n      } else if (q.kind === \"score\") {\n        q.levels.forEach((level, i) => {\n          if (level.value !== i) {\n            throw new Error(\n              `Score question \"${q.id}\" has non-contiguous level values; TypeSafe rubrics are indexed from 0.`\n            );\n          }\n        });\n        if (q.levels.length < 2) throw new Error(`Score question \"${q.id}\" needs at least 2 levels.`);\n        questions[q.id] = {\n          type: \"score\",\n          instructions: q.prompt,\n          criteria: q.levels.map((level) => level.detail ?? level.label),\n        };\n      } else {\n        const criteria =\n          q.trueCriteria || q.falseCriteria\n            ? {\n                ...(q.trueCriteria ? { true: q.trueCriteria } : {}),\n                ...(q.falseCriteria ? { false: q.falseCriteria } : {}),\n              }\n            : null;\n        questions[q.id] = { type: \"noul\", instructions: q.prompt, criteria };\n      }\n    }\n\n    const result = await client.systemOne({ state: request.state, questions });\n    const answers: Answer[] = request.questions.map((q) => {\n      const raw = result.answers[q.id];\n      if (q.kind === \"noul\") {\n        return { kind: \"noul\", id: q.id, p: Number(raw.noul) };\n      }\n      if (q.kind === \"score\") {\n        const probs: Record<string, number> = {};\n        for (const [key, value] of Object.entries(raw.probabilities ?? {})) {\n          probs[String(key)] = Number(value);"
  },
  {
    "id": "src/engine/typesafe.ts:135",
    "file": "src/engine/typesafe.ts",
    "startLine": 135,
    "text": "function uniqueLabel(label: string, existing: Record<string, unknown>): string {\n  if (!(label in existing)) return label;\n  let i = 2;\n  while (`${label} (${i})` in existing) i += 1;\n  return `${label} (${i})`;\n}\n\n/** Kept for type-level documentation of the Question union. */"
  },
  {
    "id": "src/usecases/browser-action.ts:10",
    "file": "src/usecases/browser-action.ts",
    "startLine": 10,
    "text": "export function parseDom(snapshot: string): Element[] {\n  const elements: Element[] = [];\n  let context = \"\";\n  for (const line of snapshot.split(\"\\n\")) {\n    const match = line.match(/^\\s*-\\s*([a-z]+)\\s+\"([^\"]*)\"(?:\\s*\\[ref=([a-z0-9-]+)\\])?(.*)$/i);\n    if (!match) {\n      const text = line.replace(/^\\s*-\\s*/, \"\").replace(/^\\s*/, \"\").trim();\n      if (text && !text.startsWith(\"-\")) context = text;\n      continue;\n    }\n    const [, rawRole, name, ref = \"\", rest] = match;\n    const role = rawRole.toLowerCase();\n    const flags = rest.toLowerCase();\n    // Headings and text nodes are not clickable, but they are what gives a\n    // button its meaning (\"Add to cart\" on which product?).\n    if (!INTERACTIVE.has(role) && !TYPABLE.has(role)) {\n      context = name;\n    }\n    elements.push({\n      ref: ref || `auto-${elements.length + 1}`,\n      role,\n      name,\n      context,\n      disabled: /disabled|unavailable|sold out/.test(flags),\n      hidden: flags.includes(\"hidden\") || flags.includes(\"aria-hidden\"),\n    });\n  }\n  return elements;\n}"
  },
  {
    "id": "src/usecases/browser-action.ts:40",
    "file": "src/usecases/browser-action.ts",
    "startLine": 40,
    "text": "export function candidateActions(goal: string, elements: Element[]): { id: string; label: string; detail: string }[] {\n  const candidates: { id: string; label: string; detail: string }[] = [];\n  for (const el of elements) {\n    if (el.disabled || el.hidden) continue;\n    if (INTERACTIVE.has(el.role)) {\n      candidates.push({\n        id: `click:${el.ref}`,\n        label: `click \"${el.name}\"`,\n        detail: [`role=${el.role}`, `ref=${el.ref}`, el.context && `context: ${truncate(el.context, 90)}`]\n          .filter(Boolean)\n          .join(\" · \"),\n      });\n    } else if (TYPABLE.has(el.role)) {\n      candidates.push({\n        id: `type:${el.ref}`,\n        label: `type the goal's search text into \"${el.name}\"`,\n        detail: `role=${el.role} · ref=${el.ref} · code supplies the literal text`,\n      });\n    }\n  }\n  candidates.push({ id: \"stop\", label: \"stop and report to the user\", detail: \"no further action is safe or useful\" });\n  return candidates.slice(0, 250);\n}"
  },
  {
    "id": "src/usecases/browser-action.ts:250",
    "file": "src/usecases/browser-action.ts",
    "startLine": 250,
    "text": "const result = answer.action;\nif (!candidates.some(c => c.id === result.choice)) return noop(); // re-validate\nif (result.confidence < 0.45) return escalate();\nreturn execute(result.choice);`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"The DOM is untrusted. A page can contain text engineered to sound like an instruction; the panel bounds what that can achieve to the enumerated pairs.\",\n        \"Latency here is local engine time. Real Jev is 70–500 ms from US West Coast.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/citation-verification.ts:182",
    "file": "src/usecases/citation-verification.ts",
    "startLine": 182,
    "text": "const { addresses, supports, opposes } = await jev.ask({\n  state: \\`Source:\\\\n\\${source}\\\\nClaim: \\${claim}\\\\nQuote: \\${quote}\\`,\n  questions: {\n    addresses: noul(\\`The source discusses the subject of this claim: \\${claim}\\`),\n    supports:  noul(\\`The source states this claim: \\${claim}\\`),\n    opposes:   noul(\\`The source states a conflicting or narrower value: \\${claim}\\`),\n  },\n}).then(r => r.answers);"
  },
  {
    "id": "src/usecases/citation-verification.ts:191",
    "file": "src/usecases/citation-verification.ts",
    "startLine": 191,
    "text": "const label =\n  !quoteVerbatim      ? \"fabricated-quote\" :\n  supports.noul >= 0.5 ? \"supported\" :\n  addresses.noul >= 0.5 ? \"contradicted\" : \"unsupported\";`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"A support bot that cites a real document but misstates it is worse than one that cites nothing: the citation transfers credibility to the error.\",\n        \"A genuine quote can still fail to support a claim — that is the cherry-pick case, and it is why the quote check and the support check stay separate.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/citation-verification.ts:206",
    "file": "src/usecases/citation-verification.ts",
    "startLine": 206,
    "text": "function locale(source: string, claim: string): string {\n  const words = claim.toLowerCase().split(/\\W+/).filter((w) => w.length > 4);\n  const sentence = source\n    .split(/(?<=[.!?])\\s+/)\n    .find((s) => words.some((w) => s.toLowerCase().includes(w)));\n  return sentence ? truncate(sentence, 100) : \"no overlapping sentence found\";\n}"
  },
  {
    "id": "src/usecases/citation-verification.ts:214",
    "file": "src/usecases/citation-verification.ts",
    "startLine": 214,
    "text": "function numbersIn(text: string): string[] {\n  return [...new Set(text.match(/\\d[\\d,.]*/g) ?? [])]\n    .map((n) => n.replace(/[.,]$/, \"\"))\n    .filter((n) => n.length > 0);\n}"
  },
  {
    "id": "src/usecases/context-compaction.ts:203",
    "file": "src/usecases/context-compaction.ts",
    "startLine": 203,
    "text": "const compacted = kept.join(\"\\\\n\");`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"Unlike a summariser, the output cannot hallucinate a fact: it is a subset of the input.\",\n        \"A summariser would cut tokens further. This trades ratio for fidelity — the right call when the trace contains identifiers, error strings, or numbers a summary would round away.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/entity-alignment.ts:217",
    "file": "src/usecases/entity-alignment.ts",
    "startLine": 217,
    "text": "const { answers } = await jev.ask({\n  state: render(B),\n  questions: Object.fromEntries(FIELDS.map(f => [\n    f, noul(\\`This record has the same \\${f}: \\${A[f]}\\`),\n  ])),\n});"
  },
  {
    "id": "src/usecases/entity-alignment.ts:223",
    "file": "src/usecases/entity-alignment.ts",
    "startLine": 223,
    "text": "const mean = avg(FIELDS.map(f => answers[f].noul));\n\nif (conflictingTaxId(A, B)) return \"separate\";   // hard rule beats the score\nif (mean >= 0.75 && answers.name.noul >= 0.60) return \"merge\";\nif (mean < 0.45) return \"separate\";\nreturn \"review\";`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"Field-level probabilities are the audit trail: when a merge is challenged, you can show which fields carried it.\",\n        \"For real dedupe, run this only on blocking candidate pairs. Scoring every pair is quadratic and pointless.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/extraction-verification.ts:26",
    "file": "src/usecases/extraction-verification.ts",
    "startLine": 26,
    "text": "export function cheapExtractor(text: string): Field[] {\n  const grab = (re: RegExp) => text.match(re)?.[1]?.trim() ?? \"\";\n  const invoice = grab(/Invoice\\s+([A-Z]{2,4}-\\d{4}-\\d{4})/i);\n  const po = grab(/\\b(PO-\\d{5})\\b/);\n  const subtotal = grab(/Subtotal:\\s*\\$([\\d,]+\\.\\d{2})/i);\n  const tax = grab(/Tax[^:]*:\\s*\\$([\\d,]+\\.\\d{2})/i);\n  const total = grab(/Total due:\\s*\\$([\\d,]+\\.\\d{2})/i);\n  const vendor = grab(/From:\\s*(\\S+@[\\w.-]+)/i);\n  const dueRaw = grab(/payment due\\s+(\\d{2}\\/\\d{2}\\/\\d{4})/i);\n  const terms = grab(/Payment terms:\\s*([^.]+)\\./i);\n\n  // The extraction bug this demo is built around: the locale is DD/MM but the\n  // cheap parser assumes MM/DD, so \"30/11/2026\" becomes 2026-11-03.\n  let dueDate = \"\";\n  const parts = dueRaw.split(\"/\");\n  if (parts.length === 3) dueDate = `${parts[2]}-${parts[0]}-${parts[1]}`;\n\n  return [\n    { name: \"invoice_id\", value: invoice, method: \"regex /Invoice\\\\s+(INV-…)/\" },\n    { name: \"po_number\", value: po, method: \"regex /PO-\\\\d{5}/\" },\n    { name: \"vendor_email\", value: vendor, method: \"regex From: …\" },\n    { name: \"subtotal\", value: subtotal, method: \"regex /Subtotal:/\" },\n    { name: \"tax\", value: tax, method: \"regex /Tax/\" },\n    { name: \"total\", value: total, method: \"regex /Total due:/\" },\n    { name: \"due_date\", value: dueDate, method: \"naive DD/MM → MM/DD\" },\n    { name: \"terms\", value: terms, method: \"regex /Payment terms:/\" },\n  ];\n}"
  },
  {
    "id": "src/usecases/extraction-verification.ts:215",
    "file": "src/usecases/extraction-verification.ts",
    "startLine": 215,
    "text": "const { answers } = await jev.ask({\n  state: document,\n  questions: Object.fromEntries(fields.map(f => [\n    f.name, noul(\\`The document states that \\${f.name} is \"\\${f.value}\".\\`),\n  ])),\n});\nfor (const f of fields) {\n  const p = answers[f.name].noul;\n  if (p >= 0.90) commit(f);              // fast path\n  else if (p >= 0.50) queueForReasoning(f);\n  else reExtract(f);\n}\nassertArithmetic(fields);                // never Jev's job`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"This is the 'cascade' pattern: the expensive model sees only 1–2 fields per document instead of all of them.\",\n        \"The seeded bug is a date: '30/11/2026' read as MM/DD becomes 2026-11-03, a value the document never states. The audit catches it because the string is absent, not because it understands dates.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/index.ts:30",
    "file": "src/usecases/index.ts",
    "startLine": 30,
    "text": "export function getUseCase(id: string): UseCaseMeta | undefined {\n  return USE_CASES.find((uc) => uc.id === id);\n}\n\n/** Metadata only — no functions cross the wire. */"
  },
  {
    "id": "src/usecases/memory-gate.ts:255",
    "file": "src/usecases/memory-gate.ts",
    "startLine": 255,
    "text": "const promote =\n  answers.corrected.noul   >= 0.5 &&\n  answers.reusable.noul    >= 0.5 &&\n  answers.specific.noul    <  0.5 &&\n  answers.duplicate.noul   <  0.5 &&\n  answers.lessonClass.choice !== \"none\";\n\nif (promote) writeMemory({ ...answers.lessonClass, quote: findCorrection(trace), trace: runId });`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"The caveat: this is the use case I would pilot offline before letting it write to memory. Run it on 200 historical traces, review every promotion by hand, then automate.\",\n        \"A promoted lesson is a permanent prompt change. Keep the review queue for the first month — the false-positive cost is silent behaviour drift.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/memory-gate.ts:274",
    "file": "src/usecases/memory-gate.ts",
    "startLine": 274,
    "text": "function hash(value: string): number {\n  let h = 0;\n  for (let i = 0; i < value.length; i++) h = (h << 5) - h + value.charCodeAt(i);\n  return h;\n}"
  },
  {
    "id": "src/usecases/memory-gate.ts:280",
    "file": "src/usecases/memory-gate.ts",
    "startLine": 280,
    "text": "function memoryEntries(memory: string): string[] {\n  return memory\n    .split(\"\\n\")\n    .map((line) => line.replace(/^\\s*[-*]\\s*/, \"\").trim())\n    .filter(Boolean);\n}"
  },
  {
    "id": "src/usecases/memory-gate.ts:287",
    "file": "src/usecases/memory-gate.ts",
    "startLine": 287,
    "text": "function jaccard(a: string, b: string): number {\n  const left = new Set(tokenize(a));\n  const right = new Set(tokenize(b));\n  if (left.size === 0 || right.size === 0) return 0;\n  let shared = 0;\n  for (const token of left) if (right.has(token)) shared += 1;\n  return shared / (left.size + right.size - shared);\n}"
  },
  {
    "id": "src/usecases/retrieval-rerank.ts:68",
    "file": "src/usecases/retrieval-rerank.ts",
    "startLine": 68,
    "text": "function vector(text: string): Map<string, number> {\n  const tf = new Map<string, number>();\n  for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + 1);\n  return tf;\n}"
  },
  {
    "id": "src/usecases/retrieval-rerank.ts:74",
    "file": "src/usecases/retrieval-rerank.ts",
    "startLine": 74,
    "text": "function cosine(a: Map<string, number>, b: Map<string, number>): number {\n  let dot = 0;\n  let na = 0;\n  let nb = 0;\n  for (const [term, count] of a) {\n    na += count * count;\n    const other = b.get(term);\n    if (other) dot += count * other;\n  }\n  for (const count of b.values()) nb += count * count;\n  return dot / Math.sqrt(Math.max(1e-9, na * nb));\n}"
  },
  {
    "id": "src/usecases/retrieval-rerank.ts:231",
    "file": "src/usecases/retrieval-rerank.ts",
    "startLine": 231,
    "text": "const scored = [];\nfor (const p of candidates) {\n  const { answers } = await jev.ask({\n    state: p.text,\n    questions: { answers: noul(\\`This passage answers the query: \\${query}\\`) },\n  });\n  scored.push({ ...p, p: answers.answers.noul });\n}"
  },
  {
    "id": "src/usecases/retrieval-rerank.ts:239",
    "file": "src/usecases/retrieval-rerank.ts",
    "startLine": 239,
    "text": "const context = scored\n  .filter(p => p.p >= 0.5)\n  .sort((a, b) => b.p - a.p)\n  .slice(0, 3);   // code owns the token budget`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"The embedding step here is a TF cosine stand-in so the demo runs offline; production uses a real embedding model for recall and Jev only for the ordering.\",\n        \"Passage set is fixed at twelve so the before/after comparison stays legible.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/skill-loading.ts:17",
    "file": "src/usecases/skill-loading.ts",
    "startLine": 17,
    "text": "export function parseCatalog(text: string): Skill[] {\n  return text\n    .split(\"\\n\")\n    .map((line) => line.trim())\n    .filter(Boolean)\n    .map((line) => {\n      const [name, tokens, ...rest] = line.split(\"|\").map((part) => part.trim());\n      return { name, tokens: Number(tokens) || estimateTokens(rest.join(\" \")), description: rest.join(\" | \") };\n    });\n}"
  },
  {
    "id": "src/usecases/skill-loading.ts:218",
    "file": "src/usecases/skill-loading.ts",
    "startLine": 218,
    "text": "const load = skills\n  .filter(s => s.name === answers.primary.choice || answers[\\`need_\\${s.name}\\`].noul > 0.5)\n  .slice(0, 2);  // code enforces the budget, not the model`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"Cost of a wrong route is asymmetric: a missed skill produces a worse answer, a surplus skill only costs tokens. Tune the threshold accordingly.\",\n        \"The local engine scores lexical overlap, so a skill that merely shares a word (postgres-index-tuning shares 'Postgres') can over-fire. Real Jev reads the description — verify thresholds on your own catalogue.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/tool-compilation.ts:4",
    "file": "src/usecases/tool-compilation.ts",
    "startLine": 4,
    "text": "type ArgSpec =\n  | { name: string; kind: \"choice\"; description: string; options: string[]; required: boolean }\n  | { name: string; kind: \"noul\"; description: string; required: boolean }\n  | { name: string; kind: \"literal\"; description: string; required: boolean };"
  },
  {
    "id": "src/usecases/tool-compilation.ts:246",
    "file": "src/usecases/tool-compilation.ts",
    "startLine": 246,
    "text": "const args = {};\nfor (const arg of spec.args) {\n  if (arg.type === \"enum\") {\n    args[arg.name] = (await jev.ask({\n      state, questions: { a: choice(\\`What should \\${arg.name} be?\\`, arg.values) },\n    })).answers.a.choice;\n  } else if (arg.type === \"boolean\") {\n    args[arg.name] = (await jev.ask({ state, questions: { a: noul(arg.question) } })).answers.a.noul > 0.5;\n  } else {\n    args[arg.name] = composeInCode(arg, request);  // never generated\n  }\n}\nif (!spec.validate(args)) return block();\nreturn execute(spec.name, args);`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"Two round trips, not one: the argument panel is built from the chosen function's schema, so unknown arguments are not expressible.\",\n        \"Cost scales with questions asked in parallel, not with a generated JSON blob.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/tool-compilation.ts:271",
    "file": "src/usecases/tool-compilation.ts",
    "startLine": 271,
    "text": "function composeLiteral(name: string, request: string): string {\n  if (name === \"title\") {\n    const first = request.split(/(?<=[.!?])\\s/)[0] ?? request;\n    return first.replace(/^(hi|hello)[^—–-]*[—–-]\\s*/i, \"\").slice(0, 110);\n  }\n  if (name === \"charge_id\") {\n    const match = request.match(/(?:ch_|acct_)[A-Za-z0-9]+/);\n    return match ? match[0] : \"\";\n  }\n  return \"\";\n}"
  },
  {
    "id": "src/usecases/tool-compilation.ts:283",
    "file": "src/usecases/tool-compilation.ts",
    "startLine": 283,
    "text": "function validate(fn: ToolSpec, args: Record<string, unknown>): { ok: boolean; errors: string[] } {\n  const errors: string[] = [];\n  for (const arg of fn.args) {\n    const value = args[arg.name];\n    if (arg.required && (value === undefined || value === null || value === \"\")) {\n      errors.push(`${arg.name} is required and missing`);\n      continue;\n    }\n    if (arg.kind === \"choice\" && value !== undefined && !arg.options.includes(String(value))) {\n      errors.push(`${arg.name}=\"${String(value)}\" is outside ${arg.options.join(\"|\")}`);\n    }\n  }\n  return { ok: errors.length === 0, errors };\n}"
  },
  {
    "id": "src/usecases/trace-evaluation.ts:239",
    "file": "src/usecases/trace-evaluation.ts",
    "startLine": 239,
    "text": "const loop = labels.filter(l => l.repeat >= 0.5).length >= 2;`,\n        },\n      ],\n      usage: panel.usage(),\n      notes: [\n        \"The record is the artifact: five numbers you can graph per build, not a paragraph.\",\n        \"Exact-duplicate detection is free and deterministic, so it runs alongside the semantic check and takes the max.\",\n      ],\n    };\n  },\n};"
  },
  {
    "id": "src/usecases/trace-evaluation.ts:251",
    "file": "src/usecases/trace-evaluation.ts",
    "startLine": 251,
    "text": "function similar(a: string, b: string): boolean {\n  if (!a || !b) return false;\n  if (a === b) return true;\n  const aw = new Set(a.split(/\\s+/));\n  const bw = new Set(b.split(/\\s+/));\n  let shared = 0;\n  for (const w of aw) if (bw.has(w)) shared += 1;\n  return shared / Math.max(aw.size, bw.size) > 0.85;\n}"
  },
  {
    "id": "src/usecases/types.ts:3",
    "file": "src/usecases/types.ts",
    "startLine": 3,
    "text": "export type InputField = {\n  key: string;\n  label: string;\n  type: \"textarea\" | \"text\" | \"select\";\n  default: string;\n  help?: string;\n  rows?: number;\n  options?: { value: string; label: string }[];\n};"
  },
  {
    "id": "src/usecases/types.ts:13",
    "file": "src/usecases/types.ts",
    "startLine": 13,
    "text": "export type PanelEntry = {\n  question: Question;\n  answer: Answer;\n  /** What the code did with this answer. */\n  verdict?: string;\n  threshold?: number;\n  itemId?: string;\n};"
  },
  {
    "id": "src/usecases/types.ts:22",
    "file": "src/usecases/types.ts",
    "startLine": 22,
    "text": "export type ArtifactRow = {\n  id: string;\n  label: string;\n  value?: string;\n  status?: \"keep\" | \"drop\" | \"flag\" | \"pass\" | \"fail\" | \"neutral\";\n  meta?: string;\n};"
  },
  {
    "id": "src/usecases/types.ts:57",
    "file": "src/usecases/types.ts",
    "startLine": 57,
    "text": "export type RunResult = {\n  summary: SummaryChip[];\n  panels: { title: string; note?: string; entries: PanelEntry[] }[];\n  artifacts: Artifact[];\n  decisions: Decision[];\n  code: CodeSample[];\n  usage: { tokens: number; costUsd: number; latencyMs: number; provider: string };\n  notes?: string[];\n};"
  },
  {
    "id": "src/usecases/types.ts:67",
    "file": "src/usecases/types.ts",
    "startLine": 67,
    "text": "export type UseCaseMeta = {\n  id: string;\n  index: number;\n  title: string;\n  tagline: string;\n  category: \"Agent loop\" | \"Context\" | \"Verification\" | \"Retrieval\" | \"Memory\" | \"Quality\";\n  verdict: \"Canonical fit\" | \"Strong fit\" | \"Fit with a caveat\";\n  primitives: (\"Choice\" | \"Score\" | \"Noul\")[];\n  whyItFits: string;\n  /** The four hard requirements from the README's feasibility gate. */\n  gates: {\n    answerSpace: string;\n    repeats: string;\n    latencyOrCost: string;\n    wrongAnswerCaught: string;\n  };\n  sharpEdge: string;\n  codeOwns: string[];\n  jevOwns: string[];\n  inputs: InputField[];\n  presets?: { label: string; note?: string; input: Record<string, string> }[];\n  run: (input: Record<string, string>, provider: JevProvider) => Promise<RunResult>;\n};"
  },
  {
    "id": "src/usecases/types.ts:91",
    "file": "src/usecases/types.ts",
    "startLine": 91,
    "text": "export const DEFAULT_THRESHOLD = 0.5;\n\n/**\n * Collects a panel's answers while accumulating usage, so every use case\n * reports one honest cost/latency figure for the whole run.\n */"
  },
  {
    "id": "src/usecases/types.ts:97",
    "file": "src/usecases/types.ts",
    "startLine": 97,
    "text": "export class Panel {\n  entries: PanelEntry[] = [];\n  tokens = 0;\n  costUsd = 0;\n  latencyMs = 0;\n  provider = \"\";\n\n  constructor(private readonly jev: JevProvider) {}\n\n  async run(\n    state: string,\n    questions: Question[],\n    verdicts: Record<string, (answer: Answer) => { verdict?: string; threshold?: number; itemId?: string }> = {}\n  ): Promise<void> {\n    if (questions.length === 0) return;\n    const result = await this.jev.ask({ state, questions });\n    this.tokens += result.tokens;\n    this.costUsd += result.costUsd;\n    this.latencyMs += result.latencyMs;\n    this.provider = result.provider;\n    for (const question of questions) {\n      const answer = result.answers.find((a) => a.id === question.id);\n      if (!answer) continue;\n      const extra = verdicts[question.id]?.(answer) ?? {};\n      this.entries.push({ question, answer, ...extra });\n    }\n  }\n\n  choice(id: string): ChoiceAnswer {\n    const found = this.entries.find((e) => e.question.id === id)?.answer;\n    if (!found || found.kind !== \"choice\") throw new Error(`no choice answer for ${id}`);\n    return found;\n  }\n\n  noul(id: string): number {\n    const found = this.entries.find((e) => e.question.id === id)?.answer;\n    if (!found || found.kind !== \"noul\") throw new Error(`no noul answer for ${id}`);\n    return found.p;\n  }\n\n  score(id: string): ScoreAnswer {\n    const found = this.entries.find((e) => e.question.id === id)?.answer;\n    if (!found || found.kind !== \"score\") throw new Error(`no score answer for ${id}`);\n    return found;\n  }\n\n  answer(id: string): Answer {\n    const found = this.entries.find((e) => e.question.id === id)?.answer;\n    if (!found) throw new Error(`no answer for ${id}`);\n    return found;\n  }\n\n  usage() {\n    return {\n      tokens: this.tokens,\n      costUsd: this.costUsd,\n      latencyMs: Math.round(this.latencyMs * 10) / 10,\n      provider: this.provider,\n    };\n  }\n}"
  },
  {
    "id": "src/usecases/types.ts:159",
    "file": "src/usecases/types.ts",
    "startLine": 159,
    "text": "export function truncate(text: string, max = 70): string {\n  const clean = text.replace(/\\s+/g, \" \").trim();\n  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;\n}"
  },
  {
    "id": "src/usecases/types.ts:168",
    "file": "src/usecases/types.ts",
    "startLine": 168,
    "text": "export function money(usd: number): string {\n  if (usd === 0) return \"$0\";\n  if (usd < 0.0001) return `$${usd.toExponential(1)}`;\n  if (usd < 0.01) return `$${usd.toFixed(5)}`;\n  return `$${usd.toFixed(3)}`;\n}"
  },
  {
    "id": "src/usecases/types.ts:175",
    "file": "src/usecases/types.ts",
    "startLine": 175,
    "text": "export function perThousand(costUsd: number, items: number): string {\n  if (items <= 0) return \"—\";\n  return money((costUsd / items) * 1000);\n}\n\nexport { type Answer, type NoulAnswer };"
  }
];

export const REPO_INDEX_GENERATED_AT = "2026-11-02T11:56:47.301Z";
