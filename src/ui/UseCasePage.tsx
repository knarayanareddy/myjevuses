import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { runUseCase, type MetaWire, type ProviderStatus, type RunPayload } from "./api.js";
import { ArtifactView, CodeView, DecisionsView, PanelEntryView, Primitives, UsageStrip } from "./components.js";

type Tab = "decision" | "panel" | "artifacts" | "code" | "gates";

const TABS: { id: Tab; label: string }[] = [
  { id: "decision", label: "Decisions" },
  { id: "panel", label: "Question panel" },
  { id: "artifacts", label: "Artefacts" },
  { id: "code", label: "Code" },
  { id: "gates", label: "Fit & limits" },
];

export function UseCasePage({
  useCases,
  provider,
}: {
  useCases: MetaWire[];
  provider: ProviderStatus;
}) {
  const { id = "" } = useParams();
  const useCase = useCases.find((uc) => uc.id === id);
  const [input, setInput] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("decision");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const defaults = useMemo(() => {
    if (!useCase) return {} as Record<string, string>;
    return Object.fromEntries(useCase.inputs.map((field) => [field.key, field.default]));
  }, [useCase]);

  const execute = useCallback(
    async (values: Record<string, string>) => {
      if (!useCase) return;
      setRunning(true);
      setError(null);
      try {
        const payload = await runUseCase(useCase.id, values);
        setResult(payload);
        setTab("decision");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "run failed");
      } finally {
        setRunning(false);
      }
    },
    [useCase]
  );

  useEffect(() => {
    setResult(null);
    setInput(defaults);
    setActivePreset(null);
    setTab("decision");
    void execute(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCase?.id]);

  if (!useCase) {
    return (
      <main className="not-found">
        <h1>No such use case</h1>
        <Link to="/">← back to all twelve</Link>
      </main>
    );
  }

  const index = useCases.findIndex((uc) => uc.id === useCase.id);
  const next = useCases[(index + 1) % useCases.length];

  return (
    <main className="detail">
      <nav className="breadcrumb">
        <Link to="/">← all use cases</Link>
        <span className="crumb-sep">/</span>
        <span>
          {String(useCase.index).padStart(2, "0")} · {useCase.category}
        </span>
      </nav>

      <header className="detail-head">
        <h1>{useCase.title}</h1>
        <p className="detail-tagline">{useCase.tagline}</p>
        <div className="detail-meta">
          <Primitives list={useCase.primitives} />
          <span className="dot-sep">·</span>
          <span className="verdict-pill">{useCase.verdict}</span>
        </div>
      </header>

      <div className="detail-layout">
        <aside className="control-panel">
          <div className="control-head">
            <h3>Run it</h3>
            <span className="control-sub">{running ? "working…" : result ? `${result.wallMs} ms wall` : "idle"}</span>
          </div>

          {useCase.presets?.length ? (
            <div className="presets">
              <span className="field-label">Presets</span>
              <div className="preset-row">
                {useCase.presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`preset${activePreset === preset.label ? " is-active" : ""}`}
                    title={preset.note}
                    onClick={() => {
                      const merged = { ...defaults, ...preset.input };
                      setActivePreset(preset.label);
                      setInput(merged);
                      void execute(merged);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form
            className="input-form"
            onSubmit={(event) => {
              event.preventDefault();
              void execute(input);
            }}
          >
            {useCase.inputs.map((field) => (
              <label key={field.key} className="field">
                <span className="field-label">{field.label}</span>
                {field.type === "textarea" ? (
                  <textarea
                    rows={field.rows ?? 4}
                    value={input[field.key] ?? field.default}
                    onChange={(event) => {
                      setActivePreset(null);
                      setInput((prev) => ({ ...prev, [field.key]: event.target.value }));
                    }}
                  />
                ) : field.type === "select" ? (
                  <select
                    value={input[field.key] ?? field.default}
                    onChange={(event) => {
                      setActivePreset(null);
                      setInput((prev) => ({ ...prev, [field.key]: event.target.value }));
                    }}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={input[field.key] ?? field.default}
                    onChange={(event) => {
                      setActivePreset(null);
                      setInput((prev) => ({ ...prev, [field.key]: event.target.value }));
                    }}
                  />
                )}
                {field.help ? <span className="field-help">{field.help}</span> : null}
              </label>
            ))}
            <button type="submit" className="run-button" disabled={running}>
              {running ? "Running panel…" : "Run panel"}
            </button>
          </form>

          {error ? <div className="error-box">{error}</div> : null}

          {result ? (
            <>
              <UsageStrip result={result} />
              <div className="summary-chips">
                {result.summary.map((chip) => (
                  <div key={chip.label} className={`summary-chip tone-${chip.tone ?? "neutral"}`}>
                    <span className="summary-label">{chip.label}</span>
                    <span className="summary-value">{chip.value}</span>
                    {chip.hint ? <span className="summary-hint">{chip.hint}</span> : null}
                  </div>
                ))}
              </div>
              <p className="provider-footnote">
                {provider.live ? "Answered by live Jev." : "Answered by the local simulation engine."} Cost is computed
                at $0.042 per 1M input tokens.
              </p>
            </>
          ) : null}
        </aside>

        <section className="result-panel">
          <div className="tabs">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`tab${tab === item.id ? " is-active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.id === "panel" && result ? <span className="tab-count">{result.panels.reduce((n, p) => n + p.entries.length, 0)}</span> : null}
              </button>
            ))}
          </div>

          {running && !result ? <Skeleton /> : null}

          {error && !result ? <div className="empty-state">The panel could not run. Adjust the input and retry.</div> : null}

          {result && tab === "decision" ? (
            <div className="tab-body">
              <DecisionsView decisions={result.decisions} />
              {result.artifacts.slice(0, 2).map((artifact) => (
                <ArtifactView key={artifact.title} artifact={artifact} />
              ))}
              {result.notes?.length ? (
                <div className="notes">
                  {result.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {result && tab === "panel" ? (
            <div className="tab-body">
              {result.panels.map((panel) => (
                <section key={panel.title} className="panel-group">
                  <header>
                    <h3>{panel.title}</h3>
                    {panel.note ? <p>{panel.note}</p> : null}
                  </header>
                  <div className="panel-entries">
                    {panel.entries.map((entry, i) => (
                      <PanelEntryView key={`${entry.question.id}-${i}`} entry={entry} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {result && tab === "artifacts" ? (
            <div className="tab-body">
              {result.artifacts.map((artifact) => (
                <ArtifactView key={artifact.title} artifact={artifact} />
              ))}
            </div>
          ) : null}

          {result && tab === "code" ? (
            <div className="tab-body">
              <p className="code-lede">
                The decision logic, as it exists in the module that just ran. Everything that must be exact — candidate
                generation, validation, thresholds, arithmetic — is here; the model only supplies probabilities.
              </p>
              <CodeView samples={result.code} />
            </div>
          ) : null}

          {tab === "gates" ? (
            <div className="tab-body">
              <section className="gate-section">
                <h3>Why it fits</h3>
                <p className="gate-why">{useCase.whyItFits}</p>
              </section>

              <section className="gate-section">
                <h3>The four hard requirements</h3>
                <div className="gate-grid">
                  <GateCard label="Answer space known in advance" detail={useCase.gates.answerSpace} />
                  <GateCard label="The decision repeats" detail={useCase.gates.repeats} />
                  <GateCard label="Latency or cost matters" detail={useCase.gates.latencyOrCost} />
                  <GateCard label="A wrong answer can be caught" detail={useCase.gates.wrongAnswerCaught} />
                </div>
              </section>

              <section className="gate-section split">
                <div>
                  <h3>Code owns</h3>
                  <ul className="owned-list">
                    {useCase.codeOwns.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Jev owns</h3>
                  <ul className="owned-list owned-jev">
                    {useCase.jevOwns.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="sharp-edge">
                <h4>Where this breaks</h4>
                <p>{useCase.sharpEdge}</p>
              </section>
            </div>
          ) : null}
        </section>
      </div>

      <nav className="detail-next">
        <span>Next</span>
        <Link to={`/u/${next.id}`}>
          {String(next.index).padStart(2, "0")} · {next.title} →
        </Link>
      </nav>
    </main>
  );
}

function GateCard({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="gate-card">
      <div className="gate-check">✓</div>
      <div>
        <h4>{label}</h4>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton">
      <div className="skeleton-line w60" />
      <div className="skeleton-line w90" />
      <div className="skeleton-line w75" />
      <div className="skeleton-line w40" />
    </div>
  );
}
