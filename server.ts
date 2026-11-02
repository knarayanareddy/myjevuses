import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUseCase, listMeta } from "./src/usecases/index.js";
import { getProvider, providerStatus } from "./src/engine/provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 5173);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: providerStatus() });
});

app.get("/api/usecases", (_req, res) => {
  res.json({ useCases: listMeta(), provider: providerStatus() });
});

app.post("/api/run/:id", async (req, res) => {
  const useCase = getUseCase(req.params.id);
  if (!useCase) {
    res.status(404).json({ error: "unknown use case" });
    return;
  }

  const raw = (req.body?.input ?? {}) as Record<string, unknown>;
  const input: Record<string, string> = {};
  for (const field of useCase.inputs) {
    const value = raw[field.key];
    input[field.key] = typeof value === "string" ? value.slice(0, 20_000) : field.default;
  }

  const started = Date.now();
  try {
    const result = await useCase.run(input, getProvider());
    res.json({ result: { ...result, input, wallMs: Date.now() - started } });
  } catch (error) {
    console.error(`[run:${useCase.id}]`, error);
    res.status(500).json({ error: error instanceof Error ? error.message : "run failed" });
  }
});

async function main() {
  if (isProduction) {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(port, "0.0.0.0", () => {
    const status = providerStatus();
    console.log(`jev-usecases listening on http://0.0.0.0:${port}`);
    console.log(`provider: ${status.label} — ${status.detail}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
