import type { UseCaseMeta, RunResult } from "../usecases/types.js";

export type MetaWire = Omit<UseCaseMeta, "run">;
export type RunPayload = RunResult & { input: Record<string, string>; wallMs: number };

export type ProviderStatus = { live: boolean; label: string; detail: string };

/**
 * Two deployments of the same app:
 *
 *  - served (default): the UI calls /api/run/:id and the modules execute in Node,
 *    where a TYPESAFE_API_KEY can reach live Jev.
 *  - static (GitHub Pages): there is no server, so the same modules execute in
 *    the browser against the local engine. Same panels, same decisions.
 */
export const STATIC_BUILD = import.meta.env.VITE_STATIC === "1";

const STATIC_PROVIDER: ProviderStatus = {
  live: false,
  label: "Static · local engine",
  detail:
    "This is the GitHub Pages build, so every panel runs in your browser against the deterministic local engine. The demo structure, thresholds and decisions are the served app's; the probabilities are illustrative. Run the same repo with TYPESAFE_API_KEY for live Jev.",
};

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* keep the status text */
    }
    throw new Error(detail + (STATIC_BUILD ? "" : " — try reloading the page"));
  }
  return (await response.json()) as T;
}

export async function fetchUseCases(): Promise<{ useCases: MetaWire[]; provider: ProviderStatus }> {
  if (STATIC_BUILD) {
    const { listMeta } = await import("../usecases/index.js");
    return { useCases: listMeta() as MetaWire[], provider: STATIC_PROVIDER };
  }
  return json(await fetch("/api/usecases"));
}

export async function runUseCase(id: string, input: Record<string, string>): Promise<RunPayload> {
  if (STATIC_BUILD) {
    const [{ getUseCase }, { LocalProvider }] = await Promise.all([
      import("../usecases/index.js"),
      import("../engine/local.js"),
    ]);
    const useCase = getUseCase(id);
    if (!useCase) throw new Error(`unknown use case: ${id}`);
    const started = performance.now();
    const result = await useCase.run(input, new LocalProvider());
    return { ...result, input, wallMs: Math.round((performance.now() - started) * 10) / 10 };
  }

  const response = await fetch(`/api/run/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const body = await json<{ result: RunPayload }>(response);
  return body.result;
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.0001) return `$${value.toExponential(1)}`;
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
