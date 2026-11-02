import type { UseCaseMeta } from "./types.js";
import { browserAction } from "./browser-action.js";
import { contextCompaction } from "./context-compaction.js";
import { skillLoading } from "./skill-loading.js";
import { toolCompilation } from "./tool-compilation.js";
import { citationVerification } from "./citation-verification.js";
import { extractionVerification } from "./extraction-verification.js";
import { traceEvaluation } from "./trace-evaluation.js";
import { semanticRegression } from "./semantic-regression.js";
import { jevgrep } from "./jevgrep.js";
import { entityAlignment } from "./entity-alignment.js";
import { retrievalRerank } from "./retrieval-rerank.js";
import { memoryGate } from "./memory-gate.js";

export const USE_CASES: UseCaseMeta[] = [
  browserAction,
  contextCompaction,
  skillLoading,
  toolCompilation,
  citationVerification,
  extractionVerification,
  traceEvaluation,
  semanticRegression,
  jevgrep,
  entityAlignment,
  retrievalRerank,
  memoryGate,
];

export function getUseCase(id: string): UseCaseMeta | undefined {
  return USE_CASES.find((uc) => uc.id === id);
}

/** Metadata only — no functions cross the wire. */
export function listMeta() {
  return USE_CASES.map(({ run, ...meta }) => meta);
}

export type { UseCaseMeta };
