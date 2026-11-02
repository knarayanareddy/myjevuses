import type { JevProvider } from "./types.js";
import { LocalProvider } from "./local.js";
import { TypeSafeProvider } from "./typesafe.js";

let cached: JevProvider | null = null;
let cachedKey: string | null = null;

/**
 * Provider selection.
 *
 * With TYPESAFE_API_KEY set, every use case calls the real Jev endpoint.
 * Without it, the deterministic LocalProvider stands in so the showcase runs
 * offline. The UI surfaces which one answered on every result.
 */
export function getProvider(): JevProvider {
  const key = process.env.TYPESAFE_API_KEY?.trim() || "";
  const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || undefined;
  const signature = `${key}|${model ?? ""}`;
  if (cached && cachedKey === signature) return cached;

  cached = key
    ? new TypeSafeProvider(key, model)
    : new LocalProvider();
  cachedKey = signature;
  return cached;
}

export function providerStatus(): { live: boolean; label: string; detail: string } {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (key) {
    return {
      live: true,
      label: "Live Jev",
      detail: `TypeSafe API · model ${process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest"}`,
    };
  }
  return {
    live: false,
    label: "Local simulation",
    detail:
      "No TYPESAFE_API_KEY set. A deterministic lexical engine answers the same typed panels so the demos run offline. Numbers are illustrative, not TypeSafe's.",
  };
}
