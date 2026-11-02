import type { JevProvider } from "../engine/types.js";
import { tokenize } from "../engine/text.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

const PASSAGES = [
  {
    id: "p1",
    title: "Pricing",
    text: "Jev is priced at $0.042 per million input tokens, and output is free. A single ticket classification costs roughly $0.0004, against $0.0304 for a frontier model.",
  },
  {
    id: "p2",
    title: "Latency",
    text: "End-to-end latency is 70 to 500 milliseconds, measured from the US West Coast. From Europe, add the round trip before designing an interface around 100 ms.",
  },
  {
    id: "p3",
    title: "Parallel questions",
    text: "Questions are evaluated in parallel inside one request. Thirteen questions on the same state were 12.2x cheaper and 10x faster than asking them one at a time, with identical answers.",
  },
  {
    id: "p4",
    title: "What it returns",
    text: "Every answer carries a probability distribution over the options you enumerated. There is no generated text and no rationale, only numbers you threshold in code.",
  },
  {
    id: "p5",
    title: "Limits",
    text: "Throughput is 250,000 tokens per second and 1,200 requests per minute. Context is 64k tokens per request, with docs advising 32k or less for state plus the longest question.",
  },
  {
    id: "p6",
    title: "Arithmetic",
    text: "Do not ask the model to add, count, or compare dates. It extracts values; your code computes totals, deadlines, and differences.",
  },
  {
    id: "p7",
    title: "Guardrails",
    text: "Checking an output for leakage or an unsupported claim costs about $0.00006 per check, which is cheap enough to check every response instead of sampling.",
  },
  {
    id: "p8",
    title: "Skill routing",
    text: "A skill router asks which instructions the current turn needs, reports an 88% reduction in tokens, and loads only the matching skill file.",
  },
  {
    id: "p9",
    title: "Calibration",
    text: "Thresholds are workload-specific. Label roughly fifty examples yourself, then fit per-question thresholds against that labelled set before trusting a number in production.",
  },
  {
    id: "p10",
    title: "Hostile state",
    text: "Text written to argue for its own classification can shift the answer. For a moderation or guardrail check, that is the attack, so red-team the panel before trusting it.",
  },
  {
    id: "p11",
    title: "Batching",
    text: "Batch fifty to one hundred short items per call when the state is small. Batching cuts request count; the per-question token cost stays linear.",
  },
  {
    id: "p12",
    title: "Where to start",
    text: "Start with shadow routing: run the panel against real tickets for a month and compare its picks to what humans did, with nothing acting on the output.",
  },
];

function vector(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [term, count] of a) {
    na += count * count;
    const other = b.get(term);
    if (other) dot += count * other;
  }
  for (const count of b.values()) nb += count * count;
  return dot / Math.sqrt(Math.max(1e-9, na * nb));
}

export const retrievalRerank: UseCaseMeta = {
  id: "retrieval-rerank",
  index: 11,
  title: "Retrieval reranking",
  tagline: "Embeddings fetch a wide shortlist; Jev orders what actually answers.",
  category: "Retrieval",
  verdict: "Strong fit",
  primitives: ["Noul"],
  whyItFits: "Embedding similarity finds passages about the topic; it cannot tell whether a passage answers the question. One Noul per passage is a bounded judgment, and the generation model gets its evidence in the right order.",
  gates: {
    answerSpace: "Per passage: does this answer the query.",
    repeats: "Every RAG request, every support answer, every agent lookup.",
    latencyOrCost: "Reordering the same passages changes answer quality at near-zero marginal cost.",
    wrongAnswerCaught: "Keep the retrieval set visible; the threshold decides what reaches the generator.",
  },
  sharpEdge:
    "Reranking cannot fix retrieval. If the answer is not in the candidate set, a better order only gives the generator better irrelevant evidence. Measure recall first, then rerank.",
  codeOwns: ["Embedding the query and passages (here: TF cosine as a stand-in)", "Candidate cutoff", "Context assembly", "Token budget"],
  jevOwns: ["Does this passage answer the query"],
  inputs: [
    {
      key: "query",
      label: "Query",
      type: "textarea",
      rows: 2,
      default: "How much does Jev cost per million tokens, and how does that compare to a frontier model?",
    },
    {
      key: "topK",
      label: "Passages sent to the generator",
      type: "select",
      default: "3",
      options: ["2", "3", "4"].map((v) => ({ value: v, label: `top ${v}` })),
    },
  ],
  presets: [
    {
      label: "Latency question",
      note: "One passage is about speed; a different one is about limits.",
      input: { query: "What is the latency, and from where was it measured?", topK: "3" },
    },
    {
      label: "Out-of-corpus question",
      note: "Nothing answers this. The correct behaviour is to keep the set empty.",
      input: { query: "Which cloud regions can I deploy it to, and is there an on-prem option?", topK: "3" },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const query = input.query ?? "";
    const topK = Math.max(1, Math.min(6, Number(input.topK) || 3));
    const panel = new Panel(provider);

    // Stand-in for embeddings: TF cosine over the passage and the query.
    const qv = vector(query);
    const retrieved = PASSAGES.map((p) => ({ ...p, similarity: cosine(qv, vector(`${p.title} ${p.text}`)) }))
      .sort((a, b) => b.similarity - a.similarity)
      .map((p, i) => ({ ...p, rank: i + 1 }));

    for (const passage of retrieved) {
      await panel.run(passage.text, [
        {
          kind: "noul",
          id: `answers-${passage.id}`,
          prompt: `This passage answers the query: ${query}`,
        },
      ], {
        [`answers-${passage.id}`]: (a) => ({
          verdict: a.kind === "noul" ? (a.p >= 0.42 ? "answers" : "does not answer") : "",
          threshold: 0.42,
          itemId: passage.id,
        }),
      });
    }

    const reranked = retrieved
      .map((p) => ({ ...p, p: panel.noul(`answers-${p.id}`) }))
      .sort((a, b) => b.p - a.p);
    const selected = reranked.filter((p) => p.p >= 0.42).slice(0, topK);
    const before = retrieved.slice(0, topK);
    const contextTokens = selected.reduce((sum, p) => sum + Math.ceil(p.text.length / 4), 0);

    const movedIn = selected.filter((p) => !before.some((b) => b.id === p.id));
    const movedOut = before.filter((p) => !selected.some((s) => s.id === p.id));

    return {
      summary: [
        { label: "Candidates", value: `${retrieved.length} → ${selected.length}`, hint: `top ${topK} after rerank` },
        { label: "Reordered", value: `${movedIn.length} in / ${movedOut.length} out`, tone: movedIn.length ? "accent" : "neutral" },
        { label: "Context", value: `${contextTokens} tokens`, hint: "evidence actually sent" },
        { label: "Cost", value: money(panel.costUsd), hint: `${retrieved.length} Nouls` },
      ],
      panels: [
        {
          title: "Answerability panel",
          note: "One Noul per candidate passage. 'Does this passage answer the query' is a different question from 'is this passage about the query' — that difference is what reranking buys.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Order before and after",
          kind: "table",
          note: "Before is embedding order; after is answerability. Highlighted rows changed position.",
          rows: reranked.map((p) => ({
            id: p.id,
            label: p.title,
            value: `#${p.rank} → #${reranked.findIndex((r) => r.id === p.id) + 1}`,
            status: selected.some((s) => s.id === p.id) ? "keep" : "drop",
            meta: `cos ${p.similarity.toFixed(2)} · answers ${p.p.toFixed(2)} · ${truncate(p.text, 70)}`,
          })),
        },
        {
          title: "Context sent to the generator",
          kind: "code",
          preview: selected.length
            ? selected.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`).join("\n\n")
            : "// no passage cleared the threshold — answer 'I don't have that' instead of guessing",
          rows: [],
        },
      ],
      decisions: [
        {
          title: selected.length ? "Evidence reordered" : "No evidence",
          detail: selected.length
            ? `${movedIn.length} passage(s) entered the top ${topK} after reranking${movedOut.length ? `, displacing ${movedOut.map((p) => p.title).join(", ")}` : ""}.`
            : "No passage answers this query. Returning an empty context is the honest behaviour; the generator should say it does not know.",
          status: selected.length ? "ok" : "warn",
        },
        {
          title: "Reranking is not retrieval",
          detail: `All ${retrieved.length} candidates were fetched by cosine similarity. A reranker can only reorder what it is given — if recall missed the answer, order cannot recover it.`,
          status: "info",
        },
        {
          title: "Threshold kept in code",
          detail: "0.42 cuts the tail. Anything below the threshold never reaches the generator, so a confidently wrong passage cannot crowd out the honest 'no answer'.",
          status: "ok",
        },
      ],
      code: [
        {
          title: "Rerank before generating",
          language: "ts",
          body: `const candidates = await vectorStore.search(embed(query), { limit: 24 }); // wide
const scored = [];
for (const p of candidates) {
  const { answers } = await jev.ask({
    state: p.text,
    questions: { answers: noul(\`This passage answers the query: \${query}\`) },
  });
  scored.push({ ...p, p: answers.answers.noul });
}
const context = scored
  .filter(p => p.p >= 0.5)
  .sort((a, b) => b.p - a.p)
  .slice(0, 3);   // code owns the token budget`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "The embedding step here is a TF cosine stand-in so the demo runs offline; production uses a real embedding model for recall and Jev only for the ordering.",
        "Passage set is fixed at twelve so the before/after comparison stays legible.",
      ],
    };
  },
};
