import type { UseCaseMeta, RunResult } from "../usecases/types.js";

export type MetaWire = Omit<UseCaseMeta, "run">;
export type RunPayload = RunResult & { input: Record<string, string>; wallMs: number };

export type ProviderStatus = { live: boolean; label: string; detail: string };

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* keep the status text */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export async function fetchUseCases(): Promise<{ useCases: MetaWire[]; provider: ProviderStatus }> {
  return json(await fetch("/api/usecases"));
}

export async function runUseCase(id: string, input: Record<string, string>): Promise<RunPayload> {
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
