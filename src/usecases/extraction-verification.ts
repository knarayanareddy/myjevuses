import type { JevProvider } from "../engine/types.js";
import { Panel, money, type RunResult, type UseCaseMeta } from "./types.js";

const DOC = `From: accounts@northwind-supply.example
To: ap@acme-billing.example
Subject: Invoice INV-2026-0412 — payment due 30/11/2026

Hi Acme accounts payable,

Please find the summary of invoice INV-2026-0412 against purchase order PO-88213
for the October consumables order.

Subtotal: $1,190.00
Tax (8%): $94.00
Total due: $1,284.00

Payment terms: net 30. Please reference PO-88213 on the transfer.
Remittance address: Northwind Supply, 41 Harbour Road, Rotterdam.

Thanks,
Northwind billing`;

type Field = { name: string; value: string; method: string };

/** Deliberately naive regex extractor — the "cheap" fast path. */
export function cheapExtractor(text: string): Field[] {
  const grab = (re: RegExp) => text.match(re)?.[1]?.trim() ?? "";
  const invoice = grab(/Invoice\s+([A-Z]{2,4}-\d{4}-\d{4})/i);
  const po = grab(/\b(PO-\d{5})\b/);
  const subtotal = grab(/Subtotal:\s*\$([\d,]+\.\d{2})/i);
  const tax = grab(/Tax[^:]*:\s*\$([\d,]+\.\d{2})/i);
  const total = grab(/Total due:\s*\$([\d,]+\.\d{2})/i);
  const vendor = grab(/From:\s*(\S+@[\w.-]+)/i);
  const dueRaw = grab(/payment due\s+(\d{2}\/\d{2}\/\d{4})/i);
  const terms = grab(/Payment terms:\s*([^.]+)\./i);

  // The extraction bug this demo is built around: the locale is DD/MM but the
  // cheap parser assumes MM/DD, so "30/11/2026" becomes 2026-11-03.
  let dueDate = "";
  const parts = dueRaw.split("/");
  if (parts.length === 3) dueDate = `${parts[2]}-${parts[0]}-${parts[1]}`;

  return [
    { name: "invoice_id", value: invoice, method: "regex /Invoice\\s+(INV-…)/" },
    { name: "po_number", value: po, method: "regex /PO-\\d{5}/" },
    { name: "vendor_email", value: vendor, method: "regex From: …" },
    { name: "subtotal", value: subtotal, method: "regex /Subtotal:/" },
    { name: "tax", value: tax, method: "regex /Tax/" },
    { name: "total", value: total, method: "regex /Total due:/" },
    { name: "due_date", value: dueDate, method: "naive DD/MM → MM/DD" },
    { name: "terms", value: terms, method: "regex /Payment terms:/" },
  ];
}

export const extractionVerification: UseCaseMeta = {
  id: "extraction-verification",
  index: 6,
  title: "Extraction verification",
  tagline: "Regex extracts; Jev audits the fields it isn't sure about.",
  category: "Verification",
  verdict: "Canonical fit",
  primitives: ["Noul"],
  whyItFits: "A cheap extractor handles 90% of a document, and the remaining fields are a bounded yes/no audit. Clean records never leave the fast path, so you get frontier-model accuracy at regex prices on the fields that matter.",
  gates: {
    answerSpace: "Per-field: does the document state this value for this field.",
    repeats: "Every invoice, receipt, claim, PO — millions in a batch run.",
    latencyOrCost: "The whole point: verify cheaply instead of escalating everything.",
    wrongAnswerCaught: "Thresholds route uncertain fields to a reasoning model; arithmetic is checked in code.",
  },
  sharpEdge:
    "This verifies that a value appears in the document, not that it is the right value for the field. A subtotal that also says 'total' nearby can pass. Treat a pass as 'plausible', and keep the field-level reconciliation (subtotal + tax = total) in ordinary code — never ask Jev to add.",
  codeOwns: ["Extraction", "Arithmetic", "Threshold routing", "Record assembly"],
  jevOwns: ["Does this document state this value for this field"],
  inputs: [
    { key: "document", label: "Document", type: "textarea", rows: 18, default: DOC },
  ],
  presets: [
    {
      label: "Default invoice",
      note: "Seven fields clear the fast path; the seeded date bug is the one the audit catches.",
      input: {
        document: DOC.replace("30/11/2026", "30/11/2026").replace("Tax (8%): $94.00", "Tax (8%): $94.00"),
      },
    },
    {
      label: "Missing PO",
      note: "The PO is referenced only in prose. Extraction returns an empty value and the audit rejects it.",
      input: { document: DOC.replace("against purchase order PO-88213", "against the October order") },
    },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const document = input.document ?? "";
    const fields = cheapExtractor(document);
    const panel = new Panel(provider);

    // Code verifies presence with Jev, one Noul per field, all in one request.
    await panel.run(
      `Document:\n${document}`,
      fields.map(
        (field): import("../engine/types.js").Question => ({
          kind: "noul",
          id: `field-${field.name}`,
          prompt: `The document states that ${field.name.replace(/_/g, " ")} is "${field.value}".`,
        })
      ),
      Object.fromEntries(
        fields.map((field) => {
          const qid = `field-${field.name}`;
          return [
            qid,
            (a: import("../engine/types.js").Answer) => {
              const p = a.kind === "noul" ? a.p : 0;
              return {
                verdict: p >= 0.9 ? "clean" : p >= 0.5 ? "review" : "reject",
                threshold: 0.9,
                itemId: field.name,
              };
            },
          ];
        })
      )
    );

    const audited = fields.map((field) => {
      const p = panel.noul(`field-${field.name}`);
      const route = p >= 0.9 ? "fast" : p >= 0.5 ? "reasoning" : "reject";
      return { ...field, p, route };
    });

    const fast = audited.filter((f) => f.route === "fast");
    const review = audited.filter((f) => f.route === "reasoning");
    const rejected = audited.filter((f) => f.route === "reject");

    // Arithmetic stays in code. Jev is never asked to add.
    const num = (v: string) => Number(v.replace(/,/g, ""));
    const subtotal = num(fields.find((f) => f.name === "subtotal")?.value || "0");
    const tax = num(fields.find((f) => f.name === "tax")?.value || "0");
    const total = num(fields.find((f) => f.name === "total")?.value || "0");
    const arithmeticOk = Math.abs(subtotal + tax - total) < 0.005;

    return {
      summary: [
        { label: "Fields", value: String(fields.length) },
        { label: "Fast path", value: String(fast.length), tone: "good", hint: "p ≥ 0.90" },
        { label: "Routed to reasoning", value: String(review.length), tone: review.length ? "accent" : "neutral" },
        { label: "Rejected", value: String(rejected.length), tone: rejected.length ? "bad" : "neutral" },
        { label: "Cost", value: money(panel.costUsd), hint: "one request, 8 questions", tone: "accent" },
      ],
      panels: [
        {
          title: "Per-field audit",
          note: "One request, one Noul per field. Questions are evaluated in parallel, so eight fields cost eight times the tokens but roughly one field's latency.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Record with routing",
          kind: "table",
          note: "Only the uncertain fields reach a reasoning model; the rest are committed on the fast path.",
          rows: audited.map((f) => ({
            id: f.name,
            label: f.name,
            value: f.value || "(empty)",
            status: f.route === "fast" ? "pass" : f.route === "reasoning" ? "flag" : "fail",
            meta: `${f.p.toFixed(2)} · ${f.route === "fast" ? "commit" : f.route === "reasoning" ? "escalate" : "re-extract"} · ${f.method}`,
          })),
        },
        {
          title: "Arithmetic in code",
          kind: "list",
          rows: [
            {
              id: "sum",
              label: `${subtotal.toFixed(2)} + ${tax.toFixed(2)} = ${(subtotal + tax).toFixed(2)} vs total ${total.toFixed(2)}`,
              value: arithmeticOk ? "matches" : "MISMATCH",
              status: arithmeticOk ? "pass" : "fail",
            },
            {
              id: "note",
              label: "Jev was never asked to add, compare, or compute a date — only whether a value is stated.",
              status: "neutral",
            },
          ],
        },
      ],
      decisions: [
        {
          title: rejected.length ? "Re-extraction required" : "No fields rejected",
          detail: rejected.length
            ? `${rejected.map((f) => f.name).join(", ")} scored below 0.50 — the value is probably not in the document. Sent back to the extractor, not to a bigger model.`
            : "Every extracted value appears somewhere in the document.",
          status: rejected.length ? "blocked" : "ok",
        },
        {
          title: review.length ? `${review.length} field(s) escalated` : "Fast path closed the record",
          detail: review.length
            ? `${review.map((f) => f.name).join(", ")} sit between 0.50 and 0.90. Those, and only those, go to a reasoning model with the document attached.`
            : "All fields cleared 0.90, so the record commits without a frontier-model call.",
          status: review.length ? "warn" : "ok",
        },
        {
          title: arithmeticOk ? "Ledger reconciles" : "Ledger does not reconcile",
          detail: arithmeticOk
            ? "subtotal + tax = total, computed in code from the parsed strings."
            : "The extracted amounts do not add up. Block the record — a verification pass cannot fix bad arithmetic.",
          status: arithmeticOk ? "ok" : "blocked",
        },
      ],
      code: [
        {
          title: "Cheap first, verify second",
          language: "ts",
          body: `const fields = cheapExtractor(document);            // regex, microseconds
const { answers } = await jev.ask({
  state: document,
  questions: Object.fromEntries(fields.map(f => [
    f.name, noul(\`The document states that \${f.name} is "\${f.value}".\`),
  ])),
});
for (const f of fields) {
  const p = answers[f.name].noul;
  if (p >= 0.90) commit(f);              // fast path
  else if (p >= 0.50) queueForReasoning(f);
  else reExtract(f);
}
assertArithmetic(fields);                // never Jev's job`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "This is the 'cascade' pattern: the expensive model sees only 1–2 fields per document instead of all of them.",
        "The seeded bug is a date: '30/11/2026' read as MM/DD becomes 2026-11-03, a value the document never states. The audit catches it because the string is absent, not because it understands dates.",
      ],
    };
  },
};
