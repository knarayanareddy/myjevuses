import { USE_CASES } from "../src/usecases/index.js";
import { LocalProvider } from "../src/engine/local.js";

const provider = new LocalProvider();
for (const uc of USE_CASES) {
  const input = Object.fromEntries(uc.inputs.map((f) => [f.key, f.default]));
  try {
    const t0 = Date.now();
    const r = await uc.run(input, provider);
    console.log(`\n=== ${uc.index}. ${uc.title} (${Date.now() - t0}ms) ===`);
    console.log(r.summary.map((s) => `${s.label}=${s.value}`).join(" | "));
    for (const d of r.decisions) console.log(`  [${d.status}] ${d.title}: ${d.detail.slice(0, 120)}`);
    const ps = r.panels.flatMap((p) => p.entries);
    console.log(`  questions=${ps.length} tokens=${r.usage.tokens} cost=$${r.usage.costUsd.toFixed(6)}`);
    for (const e of ps.slice(0, 4)) {
      const a = e.answer as any;
      console.log(`   - ${e.question.kind} ${e.question.id}: ${a.p !== undefined ? a.p : a.pick ?? a.score}`);
    }
  } catch (err) {
    console.log(`\n=== ${uc.index}. ${uc.title} FAILED ===`);
    console.log(err);
  }
}
