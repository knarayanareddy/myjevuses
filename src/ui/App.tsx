import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { fetchUseCases, STATIC_BUILD, type MetaWire, type ProviderStatus } from "./api.js";
import { Home } from "./Home.js";
import { UseCasePage } from "./UseCasePage.js";

export function App() {
  const [useCases, setUseCases] = useState<MetaWire[]>([]);
  const [provider, setProvider] = useState<ProviderStatus>({
    live: false,
    label: "Local simulation",
    detail: "Checking provider…",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUseCases()
      .then((data) => {
        setUseCases(data.useCases);
        setProvider(data.provider);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "failed to load"));
  }, []);

  // GitHub Pages serves static files only, so deep links use the hash router.
  const Router = STATIC_BUILD ? HashRouter : BrowserRouter;

  return (
    <Router>
      <ScrollToTop />
      <header className="site-header">
        <Link to="/" className="wordmark">
          <span className="wordmark-mark">jev</span>
          <span className="wordmark-text">twelve use cases</span>
        </Link>
        <div className="header-right">
          <span className={`provider-pill${provider.live ? " is-live" : ""}`}>
            <span className="pulse" />
            {provider.live ? "live jev" : STATIC_BUILD ? "static build" : "local simulation"}
          </span>
          <a className="header-link" href="https://github.com/knarayanareddy/myjevuses" target="_blank" rel="noreferrer">
            repo ↗
          </a>
        </div>
      </header>

      {error ? <div className="load-error">Could not load use cases: {error}</div> : null}

      {useCases.length === 0 && !error ? (
        <div className="boot">
          <div className="boot-line" />
          <div className="boot-line" />
          <div className="boot-line" />
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Home useCases={useCases} provider={provider} />} />
          <Route path="/u/:id" element={<UseCasePage useCases={useCases} provider={provider} />} />
          <Route
            path="*"
            element={
              <main className="not-found">
                <h1>Nothing here</h1>
                <Link to="/">← back to all twelve</Link>
              </main>
            }
          />
        </Routes>
      )}

      <footer className="site-footer">
        <div>
          <span className="footer-mark">jev</span>
          <p>
            A runnable companion to the feasibility catalogue in <code>README.md</code>. Every number is
            vendor-reported or produced by the local simulation engine; re-benchmark on your own state before trusting a
            threshold.
          </p>
        </div>
        <div className="footer-meta">
          <span>TypeSafe · System One</span>
          <span>$0.042 / 1M input tokens</span>
          <span>70–500 ms (US West)</span>
        </div>
      </footer>
    </Router>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
