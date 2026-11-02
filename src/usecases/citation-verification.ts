import type { JevProvider } from "../engine/types.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

const SOURCE = `Rate limits
All plans are limited per project. The standard limit is 1,200 requests per minute per project.
Bursts above the limit return HTTP 429 with a Retry-After header. Enterprise plans can raise
the limit to 6,000 requests per minute by contacting sales. Rate limit headers are returned on
every response as X-RateLimit-Remaining.`;

export const citationVerification: UseCaseMeta = {
  id: "citation-verification",
  index: 5,
  title: "Citation verification",
  tagline: "Does the quote exist, and does the evidence actually support the claim?",
  category: "Verification",
  verdict: "Canonical fit",
  primitives: ["Noul"],
  whyItFits: "Existence and support are two separate yes/no questions, and getting them confused is how citations rot. Exact-match checking is deterministic code; whether the passage supports the claim is the semantic half only Jev can do.",
  gates: {
    answerSpace: "Supported / contradicted / unsupported, derived from three probabilities.",
    repeats: "Every generated answer that carries a citation.",
    latencyOrCost: "A hallucinated citation is the most expensive sentence a support bot can write.",
    wrongAnswerCaught: "Code re-checks the quote as a literal substring before trusting any semantic verdict.",
  },
  sharpEdge:
    "A quote can be genuine and still not support the claim — the classic cherry-pick. Keep 'quote exists' and 'quote supports the claim' as separate questions; collapsing them into one check lets a fabricated quote hide behind a confident label.",
  codeOwns: ["Exact substring check of the quote", "Whitespace normalisation", "Verdict precedence", "Escalation on disagreement"],
  jevOwns: ["Does the source address the claim", "Does the source state the claim"],
  inputs: [
    { key: "claim", label: "Claim", type: "textarea", rows: 2, default: "The API allows 1,200 requests per minute per project." },
    { key: "quote", label: "Quoted passage", type: "textarea", rows: 2, default: "1,200 requests per minute per project" },
    { key: "source", label: "Source text", type: "textarea", rows: 8, default: SOURCE },
  ],
  presets: [
    {
      label: "Fabricated quote",
      note: "The quote was never in the source. Code catches this before Jev is relevant.",
      input: {
        claim: "The API allows 1,200 requests per minute per project.",
        quote: "1,200 requests per minute, and 10,000 for enterprise projects",
        source: SOURCE,
      },
    },
    {
      label: "Real quote, wrong claim",
      note: "The passage exists but says 6,000 for enterprise — the claim generalises it.",
      input: {
        claim: "Every plan allows 10,000 requests per minute per project.",
        quote: "Enterprise plans can raise the limit to 6,000 requests per minute",
        source: SOURCE,
      },
    },
    {
      label: "Figure not in source",
      note: "A real quote, a claim the source never makes, and a number that is absent.",
      input: {
        claim: "The API stores request logs for 30 days.",
        quote: "Rate limit headers are returned on every response",
        source: SOURCE,
      },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const claim = input.claim ?? "";
    const quote = input.quote ?? "";
    const source = input.source ?? "";
    const panel = new Panel(provider);

    const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
    const quoteVerbatim = normalize(source).includes(normalize(quote)) && quote.trim().length > 0;

    await panel.run(
      `Source:\n${source}\n\nClaim under review: ${claim}\nQuoted passage offered as evidence: "${quote}"`,
      [
        {
          kind: "noul",
          id: "addresses",
          prompt: `The source discusses the subject of this claim: ${claim}`,
        },
        {
          kind: "noul",
          id: "supports",
          prompt: `The source states this claim: ${claim}`,
        },

      ],
      {
        addresses: (a) => ({ verdict: a.kind === "noul" && a.p >= 0.5 ? "addresses the claim" : "silent", threshold: 0.5 }),
        supports: (a) => ({ verdict: a.kind === "noul" && a.p >= 0.5 ? "states the claim" : "does not state it", threshold: 0.5 }),
      }
    );

    const pAddresses = panel.noul("addresses");
    const pSupports = panel.noul("supports");

    // Numbers and dates are compared in code, never by the model. A claim that
    // asserts a figure the source does not contain is a contradiction, not a
    // paraphrase, and no probability should be able to overrule that.
    const claimNumbers = numbersIn(claim);
    const sourceNumbers = numbersIn(source);
    const conflictingNumbers = claimNumbers.filter((n) => !sourceNumbers.includes(n));

    // Verdict precedence lives in code, not in a prompt.
    let label: "supported" | "contradicted" | "unsupported" | "fabricated-quote";
    if (!quoteVerbatim) label = "fabricated-quote";
    else if (conflictingNumbers.length > 0) label = "contradicted";
    else if (pSupports >= 0.5) label = "supported";
    else if (pAddresses >= 0.5) label = "contradicted";
    else label = "unsupported";

    const disagreement = quoteVerbatim && pSupports < 0.5 && conflictingNumbers.length === 0;

    const decisions: RunResult["decisions"] = [
      {
        title: quoteVerbatim ? "Quote found verbatim" : "Quote not found in source",
        detail: quoteVerbatim
          ? "Normalised substring match succeeded. The quote is real; the question is whether it supports the claim."
          : "The passage does not appear in the source. Verdict is 'fabricated-quote' regardless of what the semantic panel says — code has precedence.",
        status: quoteVerbatim ? "ok" : "blocked",
      },
      {
        title: `Verdict: ${label}`,
        detail:
          label === "supported"
            ? `p(source states claim) = ${pSupports.toFixed(2)} clears 0.50, and every figure in the claim appears in the source.`
            : label === "contradicted"
              ? `Source addresses the subject (${pAddresses.toFixed(2)}) but does not state the claim (${pSupports.toFixed(2)}).`
              : label === "unsupported"
                ? `Source does not address the claim (${pAddresses.toFixed(2)}).`
                : "Quote authenticity failed first.",
        status: label === "supported" ? "ok" : label === "fabricated-quote" ? "blocked" : "warn",
      },
      {
        title: conflictingNumbers.length ? "Numeric conflict found in code" : "No numeric conflict",
        detail: conflictingNumbers.length
          ? `The claim asserts ${conflictingNumbers.map((n) => `"${n}"`).join(", ")}, which does not appear in the source. Arithmetic and value comparison are code's job; the verdict is contradicted regardless of any probability.`
          : "Every figure in the claim appears in the source, so support is a semantic question rather than an arithmetic one.",
        status: conflictingNumbers.length ? "warn" : "info",
      },
    ];

    return {
      summary: [
        {
          label: "Verdict",
          value: label,
          tone: label === "supported" ? "good" : label === "fabricated-quote" ? "bad" : "neutral",
        },
        { label: "Quote verbatim", value: quoteVerbatim ? "yes" : "no", tone: quoteVerbatim ? "good" : "bad" },
        { label: "p(supports)", value: pSupports.toFixed(2), hint: `addresses ${pAddresses.toFixed(2)}` },
        { label: "Cost", value: money(panel.costUsd), hint: "three Nouls, one request" },
      ],
      panels: [
        {
          title: "Verification panel",
          note: "Three independent yes/no probabilities. Code composes them into one label with explicit precedence, so the rules are auditable even though the model returns no rationale.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Claim / quote / source diff",
          kind: "list",
          rows: [
            { id: "claim", label: "Claim", value: truncate(claim, 90), status: "neutral" },
            { id: "quote", label: "Quote", value: truncate(quote, 90), status: quoteVerbatim ? "pass" : "fail" },
            {
              id: "evidence",
              label: "Locale of overlap",
              value: locale(source, claim),
              status: quoteVerbatim ? "keep" : "flag",
            },
          ],
        },
      ],
      decisions,
      code: [
        {
          title: "Code has precedence",
          language: "ts",
          body: `const quoteVerbatim = normalise(source).includes(normalise(quote));
const { addresses, supports, opposes } = await jev.ask({
  state: \`Source:\\n\${source}\\nClaim: \${claim}\\nQuote: \${quote}\`,
  questions: {
    addresses: noul(\`The source discusses the subject of this claim: \${claim}\`),
    supports:  noul(\`The source states this claim: \${claim}\`),
    opposes:   noul(\`The source states a conflicting or narrower value: \${claim}\`),
  },
}).then(r => r.answers);

const label =
  !quoteVerbatim      ? "fabricated-quote" :
  supports.noul >= 0.5 ? "supported" :
  addresses.noul >= 0.5 ? "contradicted" : "unsupported";`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "A support bot that cites a real document but misstates it is worse than one that cites nothing: the citation transfers credibility to the error.",
        "A genuine quote can still fail to support a claim — that is the cherry-pick case, and it is why the quote check and the support check stay separate.",
      ],
    };
  },
};

function locale(source: string, claim: string): string {
  const words = claim.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const sentence = source
    .split(/(?<=[.!?])\s+/)
    .find((s) => words.some((w) => s.toLowerCase().includes(w)));
  return sentence ? truncate(sentence, 100) : "no overlapping sentence found";
}

function numbersIn(text: string): string[] {
  return [...new Set(text.match(/\d[\d,.]*/g) ?? [])]
    .map((n) => n.replace(/[.,]$/, ""))
    .filter((n) => n.length > 0);
}
