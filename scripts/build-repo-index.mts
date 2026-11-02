/**
 * Regenerates src/data/repo-index.ts from this repository's own source.
 *
 * Jevgrep searches a codebase; in the static (GitHub Pages) build there is no
 * filesystem, so the corpus is generated at build time and shipped as a module.
 * Run with `npm run index:repo` (also runs before `npm run build`).
 */
import fs from "node:fs";
import path from "node:path";

type Chunk = { id: string; file: string; startLine: number; text: string };

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "src");
const OUTPUT = path.join(SOURCE_DIR, "data", "repo-index.ts");

function chunkFile(fullPath: string): Chunk[] {
  const source = fs.readFileSync(fullPath, "utf8");
  if (source.length > 120_000) return [];
  const lines = source.split("\n");
  const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
  const chunks: Chunk[] = [];

  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (/^(export\s+)?(async\s+)?(function|class|const|let|type|interface)\b/.test(line)) starts.push(i);
  });
  starts.push(lines.length);

  for (let k = 0; k < starts.length - 1; k += 1) {
    const begin = starts[k];
    const finish = Math.min(starts[k + 1], begin + 70);
    const text = lines.slice(begin, finish).join("\n").trim();
    if (text.length < 140) continue;
    if (/^const\s+[A-Z0-9_]+\s*[:=]/.test(text)) continue; // fixture constants
    if (/^export const \w+: UseCaseMeta/.test(text)) continue; // demo metadata, not behaviour
    chunks.push({ id: `${rel}:${begin + 1}`, file: rel, startLine: begin + 1, text });
  }
  return chunks;
}

function walk(dir: string, out: Chunk[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    // The search tool and the UI both quote this demo's own copy; indexing them
    // makes every query match itself.
    if (entry.name === "jevgrep.ts") continue;
    if (path.relative(SOURCE_DIR, full).startsWith("ui/")) continue;
    out.push(...chunkFile(full));
  }
}

const chunks: Chunk[] = [];
walk(SOURCE_DIR, chunks);

const body = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run index:repo\` to regenerate from this repository's src/ tree.
 *
 * This is the corpus jevgrep searches. It is committed so the static
 * GitHub Pages build has a filesystem-free index.
 */

export type CodeChunk = { id: string; file: string; startLine: number; text: string };

export const REPO_INDEX: CodeChunk[] = ${JSON.stringify(chunks, null, 2)};

export const REPO_INDEX_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};
`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, body);
console.log(`repo-index: ${chunks.length} chunks from ${new Set(chunks.map((c) => c.file)).size} files → ${path.relative(ROOT, OUTPUT)}`);
