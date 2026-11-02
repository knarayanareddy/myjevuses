import { REPO_INDEX, type CodeChunk } from "../data/repo-index.js";
import type { JevProvider } from "../engine/types.js";
import { tokenize } from "../engine/text.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

type Chunk = CodeChunk;

/**
 * The corpus is generated at build time (`npm run index:repo`) rather than read
 * from disk, so the same code runs in Node and in the static browser build.
 */
export function repoChunks(): Chunk[] {
  return REPO_INDEX;
}

function lexicalScore(query: string, text: string): number {
  const q = new Set(tokenize(query));
  const t = tokenize(text);
  const tf = new Map<string, number>();
  for (const token of t) tf.set(token, (tf.get(token) ?? 0) + 1);
  let score = 0;
  for (const token of q) {
    const count = tf.get(token);
    if (count) score += 1 + Math.log(count);
  }
  return score / Math.sqrt(Math.max(8, t.length));
}

export const jevgrep: UseCaseMeta = {
  id: "jevgrep",
  index: 9,
  title: "Jevgrep code search",
  tagline: "Search this repository by what the code does, not what it says.",
  category: "Retrieval",
  verdict: "Strong fit",
  primitives: ["Noul"],
  whyItFits: "Lexical search finds candidates, but not intent: 'where do we stop the agent from clicking something disabled' has no shared keywords with the answer. One Noul per shortlisted chunk reranks by behaviour, which is a bounded yes/no over text you can afford to send.",
  gates: {
    answerSpace: "Per chunk: does this code perform the described behaviour.",
    repeats: "Every agent file lookup, every IDE query, every coding session.",
    latencyOrCost: "16 chunks per request is the published shape; shortlist size is the only knob.",
    wrongAnswerCaught: "The shortlist stays visible, so a miss is debuggable rather than mysterious.",
  },
  sharpEdge:
    "This searches a snapshot, not your live working tree across a monorepo, and it is only as good as the shortlist. If the candidate generator misses the right file, no amount of reranking finds it — tune recall first, precision second.",
  codeOwns: ["Chunking with line numbers", "Lexical shortlist", "Final ordering and cutoff", "Reading files"],
  jevOwns: ["Does this chunk implement the described behaviour"],
  inputs: [
    {
      key: "query",
      label: "Semantic query",
      type: "textarea",
      rows: 2,
      default: "where do we stop the browser agent from clicking something that is disabled",
    },
    {
      key: "shortlist",
      label: "Shortlist size",
      type: "select",
      default: "12",
      options: ["4", "8", "12", "16"].map((v) => ({ value: v, label: `${v} chunks` })),
    },
  ],
  presets: [
    {
      label: "No shared keywords",
      note: "The words in the query appear nowhere in the answer chunk.",
      input: { query: "how do we keep the context small by loading instructions only when needed", shortlist: "8" },
    },
    {
      label: "Cost question",
      note: "Ask what something costs — the chunk that computes cost is not the one that mentions pricing.",
      input: { query: "what does a single request cost to run", shortlist: "8" },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const query = input.query ?? "";
    const limit = Math.max(2, Math.min(20, Number(input.shortlist) || 8));
    const chunks = repoChunks();
    const panel = new Panel(provider);
    // A code search reranker tolerates a low bar because the shortlist is
    // already narrow; the cost of a false positive is one wasted snippet.
    const RELEVANT_AT = 0.35;

    const scored = chunks
      .map((chunk) => ({ chunk, lexical: lexicalScore(query, chunk.text) }))
      .sort((a, b) => b.lexical - a.lexical);
    const shortlist = scored.slice(0, limit);

    await panel.run(
      shortlist.map((s) => `File ${s.chunk.file} lines ${s.chunk.startLine}–${s.chunk.startLine + s.chunk.text.split("\n").length}`).join("\n"),
      [], // placeholder; real questions are per-chunk below, since state differs
    );

    for (const item of shortlist) {
      await panel.run(item.chunk.text, [
        {
          kind: "noul",
          id: `rel-${item.chunk.id}`,
          prompt: `This code does what the query asks: ${query}`,
        },
      ], {
        [`rel-${item.chunk.id}`]: (a) => ({
          verdict: a.kind === "noul" ? (a.p >= RELEVANT_AT ? "relevant" : "not relevant") : "",
          threshold: RELEVANT_AT,
          itemId: item.chunk.id,
        }),
      });
    }

    const ranked = shortlist
      .map((item) => ({ ...item, p: panel.noul(`rel-${item.chunk.id}`) }))
      .sort((a, b) => b.p - a.p);
    const kept = ranked.filter((r) => r.p >= RELEVANT_AT);

    return {
      summary: [
        { label: "Chunks indexed", value: String(chunks.length) },
        { label: "Shortlisted", value: String(shortlist.length), hint: "lexical recall" },
        { label: `Above ${RELEVANT_AT}`, value: String(kept.length), tone: "accent" },
        { label: "Cost", value: money(panel.costUsd), hint: `${shortlist.length} requests` },
      ],
      panels: [
        {
          title: "Relevance panel",
          note: `One Noul per shortlisted chunk (state differs per chunk, so this fans out). Top result: ${kept[0] ? kept[0].chunk.id : "none"}.`,
          entries: panel.entries.filter((e) => e.question.kind === "noul"),
        },
      ],
      artifacts: [
        {
          title: "Ranked code",
          kind: "table",
          note: "Before = lexical rank from the shortlist; after = semantic rerank. The gap between them is the whole value of this pattern.",
          rows: ranked.map((r) => ({
            id: r.chunk.id,
            label: `${r.chunk.file}:${r.chunk.startLine}`,
            value: r.p.toFixed(2),
            status: r.p >= RELEVANT_AT ? "pass" : "drop",
            meta: `lexical #${shortlist.findIndex((s) => s.chunk.id === r.chunk.id) + 1} · ${truncate(r.chunk.text.split("\n")[0], 80)}`,
          })),
        },
        {
          title: kept[0] ? `${kept[0].chunk.file}:${kept[0].chunk.startLine}` : "No confident match",
          kind: "code",
          preview: kept[0]?.chunk.text ?? "// nothing cleared the threshold",
          rows: [],
        },
      ],
      decisions: [
        {
          title: kept.length ? "Results returned" : "No confident result",
          detail: kept.length
            ? `${kept.length} chunk(s) above threshold. Returning code that answers the behaviour beats returning keyword neighbours with the words but not the logic.`
            : `Nothing cleared ${RELEVANT_AT}. Returning nothing is correct — expanding the shortlist is the fix, not lowering the threshold.`,
          status: kept.length ? "ok" : "warn",
        },
        {
          title: "Recall before precision",
          detail: `The shortlist is lexical and capped at ${limit} chunks. If the answer is not in it, the reranker cannot recover it.`,
          status: "info",
        },
      ],
      code: [
        {
          title: "Shortlist, then rerank",
          language: "ts",
          body: `const shortlist = indexRepo()
  .map(chunk => ({ chunk, lexical: lexicalScore(query, chunk.text) }))
  .sort((a, b) => b.lexical - a.lexical)
  .slice(0, 16);

const ranked = [];
for (const { chunk } of shortlist) {
  const { answers } = await jev.ask({
    state: chunk.text,
    questions: { rel: noul(\`This code does what the query asks: \${query}\`) },
  });
  ranked.push({ chunk, p: answers.rel.noul });
}
ranked.sort((a, b) => b.p - a.p);
return ranked.filter(r => r.p >= 0.5);`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "The corpus is this repository's own src/ tree, chunked at top-level declarations with line numbers preserved and regenerated at build time — no filesystem at runtime, which is what lets this run in a static build.",
        "The published tools in this space (jgrep, oko, jevr) all follow this shape: deterministic retrieval, semantic rerank, visible shortlist.",
      ],
    };
  },
};
