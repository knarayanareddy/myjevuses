import type { JevProvider } from "../engine/types.js";
import { Panel, money, truncate, type RunResult, type UseCaseMeta } from "./types.js";

type Record_ = {
  name: string;
  email: string;
  company: string;
  address: string;
  tax_id: string;
  phone: string;
};

const A: Record_ = {
  name: "Northwind Supply B.V.",
  email: "billing@northwind-supply.example",
  company: "Northwind Supply",
  address: "41 Harbour Road, Rotterdam",
  tax_id: "NL-8821-4410-B01",
  phone: "+31 10 555 0142",
};

const B_SAME: Record_ = {
  name: "Northwind Supply BV",
  email: "billing@northwind-supply.example",
  company: "Northwind Supply B.V.",
  address: "41 Harbour Road, 3011 Rotterdam",
  tax_id: "NL-8821-4410-B01",
  phone: "+31 10 555 0142",
};

const B_NEAR: Record_ = {
  name: "Northwind Supplies Ltd",
  email: "accounts@northwind-supplies.example",
  company: "Northwind Supplies",
  address: "9 Quay Street, Manchester",
  tax_id: "GB-9912-7731",
  phone: "+44 161 555 0100",
};

const B_CONFLICT: Record_ = {
  name: "Northwind Supply B.V.",
  email: "billing@northwind-supply.example",
  company: "Northwind Supply",
  address: "41 Harbour Road, Rotterdam",
  tax_id: "NL-5510-2201-B01",
  phone: "+31 10 555 0142",
};

const FIELDS = ["name", "email", "company", "address", "tax_id", "phone"] as const;

export const entityAlignment: UseCaseMeta = {
  id: "entity-alignment",
  index: 10,
  title: "Entity alignment",
  tagline: "Merge, review, or keep apart — one field at a time.",
  category: "Retrieval",
  verdict: "Canonical fit",
  primitives: ["Noul"],
  whyItFits: "Blocking and normalisation are deterministic and cheap; deciding whether two records are the same real-world organisation is a semantic judgment. Splitting them keeps the merge rule auditable and the false-merge rate visible.",
  gates: {
    answerSpace: "Per field: does record B contain this value. Then a 3-way label from a fixed rule.",
    repeats: "Every dedupe pass, CRM sync, and vendor-master refresh.",
    latencyOrCost: "Frontier-model dedupe is unaffordable at 10M row scale.",
    wrongAnswerCaught: "Hard blockers (conflicting tax id) override the score; the review band catches the rest.",
  },
  sharpEdge:
    "A false merge is far more expensive than a missed merge: it silently overwrites one organisation with another. Tune the merge threshold against that asymmetry, and never let a name-only match merge two legal entities.",
  codeOwns: ["Normalisation", "Blocking", "Hard conflict rules", "The merge/review/separate decision"],
  jevOwns: ["Whether each field value refers to the same thing across the two records"],
  inputs: [
    {
      key: "pair",
      label: "Record pair",
      type: "select",
      default: "same",
      options: [
        { value: "same", label: "Same organisation (formatting differs)" },
        { value: "near", label: "Near miss (different legal entity)" },
        { value: "conflict", label: "Conflicting tax id" },
      ],
    },
  ],
  presets: [
    { label: "Same entity", note: "Same tax id, same email, different formatting.", input: { pair: "same" } },
    { label: "Near miss", note: "Similar name, different country and domain. Must not merge.", input: { pair: "near" } },
    { label: "Hard conflict", note: "Everything matches except the tax id — code blocks the merge.", input: { pair: "conflict" } },
  ],
  async run(input, provider: JevProvider): Promise<RunResult> {
    const pairKey = (input.pair as "same" | "near" | "conflict") ?? "same";
    const b = pairKey === "near" ? B_NEAR : pairKey === "conflict" ? B_CONFLICT : B_SAME;
    const panel = new Panel(provider);

    const normalise = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9@.+]/g, "");
    const emailLocal = (value: string) => value.split("@")[0];
    const domain = (value: string) => value.split("@")[1] ?? "";

    // Blocking: only candidate pairs that agree on something reach Jev at all.
    const blocking = {
      sameEmail: normalise(A.email) === normalise(b.email),
      sameDomain: domain(A.email) === domain(b.email),
      samePhoneDigits: A.phone.replace(/\D/g, "") === b.phone.replace(/\D/g, ""),
      sameTaxId: normalise(A.tax_id) === normalise(b.tax_id) && A.tax_id !== "",
      sameEmailLocal: emailLocal(A.email) === emailLocal(b.email),
    };
    const blockedIn = blocking.sameEmail || blocking.sameDomain || blocking.samePhoneDigits || blocking.sameTaxId;

    // State is record B; the claim carries record A's value. This asks the only
    // useful question: does B contain what A says?
    await panel.run(
      `Record B:\nname: ${b.name}\nemail: ${b.email}\ncompany: ${b.company}\naddress: ${b.address}\ntax_id: ${b.tax_id}\nphone: ${b.phone}`,
      FIELDS.map(
        (field): import("../engine/types.js").Question => ({
          kind: "noul",
          id: `same-${field}`,
          prompt: `This record has the same ${field.replace("_", " ")}: ${(A as unknown as Record<string, string>)[field]}`,
        })
      ),
      Object.fromEntries(
        FIELDS.map((field) => [
          `same-${field}`,
          (a: import("../engine/types.js").Answer) => ({
            verdict: a.kind === "noul" ? (a.p >= 0.5 ? "match" : "differs") : "",
            threshold: 0.5,
            itemId: field,
          }),
        ])
      )
    );

    const fieldScores = FIELDS.map((field) => ({ field, p: panel.noul(`same-${field}`) }));
    const mean = fieldScores.reduce((sum, f) => sum + f.p, 0) / fieldScores.length;
    const hardConflict = !blocking.sameTaxId && normalise(A.tax_id) !== "" && normalise(b.tax_id) !== "";
    const nameMatch = fieldScores.find((f) => f.field === "name")!.p;

    let label: "merge" | "review" | "separate" = "review";
    // Code owns the decision rule: hard conflicts outrank any score.
    if (hardConflict) label = "separate";
    else if (mean >= 0.75 && nameMatch >= 0.6) label = "merge";
    else if (mean < 0.45) label = "separate";
    else label = "review";

    return {
      summary: [
        { label: "Decision", value: label, tone: label === "merge" ? "good" : label === "separate" ? "bad" : "neutral" },
        { label: "Mean field match", value: mean.toFixed(2), hint: "across 6 fields" },
        { label: "Blocking candidates", value: blockedIn ? "yes" : "no", hint: "email / domain / phone / tax id" },
        { label: "Cost", value: money(panel.costUsd), hint: "one request" },
      ],
      panels: [
        {
          title: "Field identity panel",
          note: "State is record B; each question carries record A's value. A field only scores high when B actually contains that value — which is what makes this a similarity test rather than a restatement.",
          entries: panel.entries,
        },
      ],
      artifacts: [
        {
          title: "Record pair",
          kind: "table",
          rows: FIELDS.map((field) => ({
            id: field,
            label: field,
            value: `${truncate((A as unknown as Record<string, string>)[field], 34)} ↔ ${truncate((b as unknown as Record<string, string>)[field], 34)}`,
            status: field === "tax_id" && hardConflict ? "fail" : "neutral",
            meta: field === "tax_id" && hardConflict ? "hard conflict — code blocks merge" : "",
          })),
        },
        {
          title: "Decision inputs",
          kind: "list",
          note: "Deterministic blocking features computed before any model call.",
          rows: [
            ...Object.entries(blocking).map(([key, value]) => ({
              id: key,
              label: key,
              value: value ? "true" : "false",
              status: (value ? "pass" : "neutral") as "pass" | "neutral",
            })),
            { id: "rule", label: "merge if mean ≥ 0.75 and name ≥ 0.60; separate if conflicting tax id; else review", value: "code", status: "neutral" as const },
          ],
        },
      ],
      decisions: [
        {
          title: hardConflict ? "Hard conflict detected" : "No hard conflict",
          detail: hardConflict
            ? "The tax ids differ. Code returns 'separate' regardless of how similar the names or emails look — a false merge overwrites a legal entity."
            : "Tax ids agree or are absent, so the field scores decide.",
          status: hardConflict ? "blocked" : "ok",
        },
        {
          title: `Label: ${label}`,
          detail:
            label === "merge"
              ? `Mean field match ${mean.toFixed(2)} with name ${nameMatch.toFixed(2)}. Merge, keeping the richer value per field.`
              : label === "review"
                ? `Mean field match ${mean.toFixed(2)} is inconclusive. A human decides; the pair is queued with both records side by side.`
                : `Mean field match ${mean.toFixed(2)} — too low to be the same entity.`,
          status: label === "merge" ? "ok" : label === "review" ? "warn" : "info",
        },
        {
          title: blockedIn ? "Inside the candidate set" : "Not a blocking candidate",
          detail: blockedIn
            ? "The pair agreed on at least one blocking key, which is why it was scored at all."
            : "No blocking key agreed, so this pair would normally never be compared. Shown here to demonstrate the rule.",
          status: "info",
        },
      ],
      code: [
        {
          title: "Block in code, judge with Jev",
          language: "ts",
          body: `const blocking = blockingKeys(A, B);       // email, domain, phone, tax id
if (!blocking.any) return NEVER_COMPARED;

const { answers } = await jev.ask({
  state: render(B),
  questions: Object.fromEntries(FIELDS.map(f => [
    f, noul(\`This record has the same \${f}: \${A[f]}\`),
  ])),
});
const mean = avg(FIELDS.map(f => answers[f].noul));

if (conflictingTaxId(A, B)) return "separate";   // hard rule beats the score
if (mean >= 0.75 && answers.name.noul >= 0.60) return "merge";
if (mean < 0.45) return "separate";
return "review";`,
        },
      ],
      usage: panel.usage(),
      notes: [
        "Field-level probabilities are the audit trail: when a merge is challenged, you can show which fields carried it.",
        "For real dedupe, run this only on blocking candidate pairs. Scoring every pair is quadratic and pointless.",
      ],
    };
  },
};
