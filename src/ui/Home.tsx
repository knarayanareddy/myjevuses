import { Link } from "react-router-dom";
import { STATIC_BUILD, type MetaWire, type ProviderStatus } from "./api.js";
import { Primitives } from "./components.js";

const PRIMITIVES = [
  {
    name: "Choice",
    shape: "pick one of up to 255",
    returns: "the pick, a probability for every option, a confidence",
  },
  { name: "Score", shape: "position on an ordered rubric", returns: "a probability-weighted score and the legend" },
  { name: "Noul", shape: "is this statement true", returns: "one probability. 0.5 means uncertain, not medium" },
];

export function Home({ useCases, provider }: { useCases: MetaWire[]; provider: ProviderStatus }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-eyebrow">
          <span className="pulse" />
          Jev · System One · twelve working demos
        </div>
        <h1>
          Twelve agentic use cases,
          <br />
          <span className="accent">built, not summarised.</span>
        </h1>
        <p className="hero-lede">
          Jev returns typed answers and probabilities for decisions ordinary code cannot express reliably. Code keeps
          the workflow. Each demo below is a real module in this repository: a deterministic candidate set, a typed
          question panel, thresholds, and a decision you can read in the source.
        </p>
        <div className="hero-stats">
          <div>
            <span className="stat-value">12</span>
            <span className="stat-label">use cases</span>
          </div>
          <div>
            <span className="stat-value">0</span>
            <span className="stat-label">api keys needed</span>
          </div>
          <div>
            <span className="stat-value">3</span>
            <span className="stat-label">primitives, no prose</span>
          </div>
          <div>
            <span className="stat-value">$0.042</span>
            <span className="stat-label">per 1M input tokens</span>
          </div>
        </div>
        {!provider.live ? (
          <div className="provider-banner">
            <strong>{provider.label}.</strong>{" "}
            {STATIC_BUILD
              ? "This is the GitHub Pages build, so every panel runs in your browser. Same modules, thresholds and decisions as the served app; a deterministic local engine stands in for Jev."
              : "No TYPESAFE_API_KEY is set in this environment, so a deterministic lexical engine answers the same typed panels."}{" "}
            The demo structure, thresholds, and code paths are real; the probabilities are illustrative. Add a key and
            restart to rerun every demo against live Jev.
          </div>
        ) : (
          <div className="provider-banner provider-live">
            <strong>Live Jev.</strong> {provider.detail}. Every panel below is answered by TypeSafe.
          </div>
        )}
      </section>

      <section className="primitives">
        {PRIMITIVES.map((primitive) => (
          <article key={primitive.name} className="primitive-card">
            <header>
              <span className="mono-tag">{primitive.name}</span>
              <span className="primitive-shape">{primitive.shape}</span>
            </header>
            <p>{primitive.returns}</p>
          </article>
        ))}
      </section>

      <section className="grid-section">
        <div className="section-head">
          <h2>The twelve</h2>
          <p>Every card opens a runnable demo with the panel, the artefacts, and the code that owns the decision.</p>
        </div>
        <div className="card-grid">
          {useCases.map((useCase) => (
            <Link key={useCase.id} to={`/u/${useCase.id}`} className="usecase-card">
              <div className="card-top">
                <span className="card-index">{String(useCase.index).padStart(2, "0")}</span>
                <span className="card-category">{useCase.category}</span>
              </div>
              <h3>{useCase.title}</h3>
              <p>{useCase.tagline}</p>
              <div className="card-foot">
                <Primitives list={useCase.primitives} />
                <span className={`verdict-pill verdict-${useCase.verdict.split(" ")[0].toLowerCase()}`}>
                  {useCase.verdict}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="closing">
        <h2>What the twelve have in common</h2>
        <div className="closing-grid">
          <article>
            <h4>Code generates the answer space</h4>
            <p>
              Every option list, tool schema, and candidate pair is produced deterministically before Jev is called.
              The model never invents a value — it selects among values you can defend.
            </p>
          </article>
          <article>
            <h4>Questions are cheap, so ask everything</h4>
            <p>
              Questions on the same state run in parallel. Adding the ninth question costs tokens, not latency, which
              is why each panel asks more than it strictly needs and lets code discard the rest.
            </p>
          </article>
          <article>
            <h4>The number is never the last word</h4>
            <p>
              Thresholds, hard conflict rules, and validators live in code. A probability that fails a threshold routes
              to a human or a reasoning model; it never silently becomes an action.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
