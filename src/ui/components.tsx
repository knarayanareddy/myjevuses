import type { PanelEntry, Artifact, Decision, CodeSample, RunResult } from "../usecases/types.js";
import { formatUsd } from "./api.js";

export function Primitives({ list }: { list: string[] }) {
  return (
    <span className="chips">
      {list.map((p) => (
        <span key={p} className="chip chip-primitive">
          {p}
        </span>
      ))}
    </span>
  );
}

export function StatusDot({ status }: { status: Decision["status"] }) {
  return <span className={`dot dot-${status}`} aria-hidden />;
}

function probabilityRow(label: string, value: number, picked: boolean, extra?: string) {
  return (
    <div className={`prob-row${picked ? " is-picked" : ""}`} key={`${label}-${extra ?? ""}`}>
      <div className="prob-label">
        <span className="prob-name" title={label}>
          {label}
        </span>
        {extra ? <span className="prob-extra">{extra}</span> : null}
      </div>
      <div className="prob-track">
        <div className="prob-fill" style={{ width: `${Math.max(1.5, value * 100)}%` }} />
      </div>
      <span className="prob-value">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

export function PanelEntryView({ entry }: { entry: PanelEntry }) {
  const { question, answer, verdict, threshold } = entry;

  return (
    <article className="panel-entry">
      <header className="panel-entry-head">
        <span className={`kind kind-${question.kind}`}>{question.kind}</span>
        <p className="panel-prompt">{question.prompt}</p>
        {verdict ? <span className="verdict">{verdict}</span> : null}
      </header>

      {question.kind === "choice" && answer.kind === "choice" ? (
        <div className="probs">
          {Object.entries(answer.probs).map(([id, value]) => {
            const option = question.options.find((o) => o.id === id);
            const label = option?.label ?? (id === "__none__" ? "none of the above" : id);
            return probabilityRow(label, value, id === answer.pick, option?.detail);
          })}
        </div>
      ) : null}

      {question.kind === "score" && answer.kind === "score" ? (
        <div className="score-block">
          <div className="score-headline">
            <span className="score-number">{answer.score.toFixed(2)}</span>
            <span className="score-scale">of {Math.max(...question.levels.map((l) => l.value))}</span>
          </div>
          <div className="probs">
            {question.levels.map((level) => {
              const value = answer.probs[String(level.value)] ?? 0;
              const nearest = question.levels.reduce((best, candidate) =>
                Math.abs(candidate.value - answer.score) < Math.abs(best.value - answer.score) ? candidate : best
              );
              return probabilityRow(`${level.value} · ${level.label}`, value, level.value === nearest.value, level.detail);
            })}
          </div>
        </div>
      ) : null}

      {question.kind === "noul" && answer.kind === "noul" ? (
        <div className="noul-block">
          <div className="noul-value">{answer.p.toFixed(3)}</div>
          <div className="noul-track">
            <div className="noul-fill" style={{ width: `${Math.max(1, answer.p * 100)}%` }} />
            {threshold !== undefined ? (
              <div className="noul-threshold" style={{ left: `${threshold * 100}%` }}>
                <span>{threshold.toFixed(2)}</span>
              </div>
            ) : null}
          </div>
          <div className="noul-note">
            probability of “yes”
            {threshold !== undefined ? ` · threshold ${threshold.toFixed(2)}` : ""}
          </div>
        </div>
      ) : null}

      {answer.kind === "choice" ? (
        <div className="panel-entry-foot">
          <span>confidence {answer.confidence.toFixed(2)}</span>
          <span>{Object.keys(answer.probs).length} options</span>
        </div>
      ) : null}
    </article>
  );
}

export function ArtifactView({ artifact }: { artifact: Artifact }) {
  return (
    <section className="artifact">
      <header className="artifact-head">
        <h4>{artifact.title}</h4>
        {artifact.note ? <p>{artifact.note}</p> : null}
      </header>

      {artifact.kind === "code" && artifact.preview ? (
        <pre className="code-block">{artifact.preview}</pre>
      ) : null}

      {artifact.kind !== "code" ? (
        <ul className={`artifact-list artifact-${artifact.kind}`}>
          {artifact.rows.map((row) => (
            <li key={row.id} className={`artifact-row status-${row.status ?? "neutral"}`}>
              <span className="artifact-label">{row.label}</span>
              {row.value ? <span className="artifact-value">{row.value}</span> : null}
              {row.meta ? <span className="artifact-meta">{row.meta}</span> : null}
            </li>
          ))}
        </ul>
      ) : artifact.rows.length ? (
        <ul className="artifact-list artifact-table">
          {artifact.rows.map((row) => (
            <li key={row.id} className={`artifact-row status-${row.status ?? "neutral"}`}>
              <span className="artifact-label">{row.label}</span>
              {row.value ? <span className="artifact-value">{row.value}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function DecisionsView({ decisions }: { decisions: Decision[] }) {
  return (
    <div className="decisions">
      {decisions.map((decision, i) => (
        <article key={i} className={`decision decision-${decision.status}`}>
          <div className="decision-head">
            <StatusDot status={decision.status} />
            <h4>{decision.title}</h4>
          </div>
          <p>{decision.detail}</p>
        </article>
      ))}
    </div>
  );
}

export function CodeView({ samples }: { samples: CodeSample[] }) {
  return (
    <div className="code-samples">
      {samples.map((sample) => (
        <section key={sample.title} className="code-sample">
          <header>
            <h4>{sample.title}</h4>
            <span className="lang">{sample.language}</span>
          </header>
          <pre className="code-block">{sample.body}</pre>
        </section>
      ))}
    </div>
  );
}

export function UsageStrip({ result }: { result: RunResult }) {
  return (
    <div className="usage-strip">
      <div>
        <span className="usage-label">provider</span>
        <span className="usage-value">{result.usage.provider || "local-simulation"}</span>
      </div>
      <div>
        <span className="usage-label">tokens</span>
        <span className="usage-value">{result.usage.tokens.toLocaleString()}</span>
      </div>
      <div>
        <span className="usage-label">cost</span>
        <span className="usage-value">{formatUsd(result.usage.costUsd)}</span>
      </div>
      <div>
        <span className="usage-label">model time</span>
        <span className="usage-value">{result.usage.latencyMs.toFixed(1)} ms</span>
      </div>
    </div>
  );
}
