# myjevuses — remediation plan

This is proposed future work, not a record of changes or execution. Findings refer to the [review](REVIEW.md). The exact observed paths are listed per task; new documents or tests below are proposed paths. Each phase exits only on its listed evidence, not on a green count alone.

## Phase 0 — baseline and decisions

Entry: pinned prototype and owner available. Exit: reproducible baseline and an explicit static/live deployment decision.

### T00 — Establish boundaries (F01, F03; owner decision)

Prerequisites: owner permission for an isolated checkout and synthetic fixtures. Observed: `package.json`, `server.ts`, `.github/workflows/pages.yml`; proposed: `docs/operating-boundary.md`.
1. Record the target SHA, Node version, lockfile and actual hosting/ingress configuration; distinguish a workflow success from a deployed Pages URL.
2. With owner approval, install in the isolated checkout and run the existing `test`, `typecheck`, `build:pages` scripts as planned baseline actions; preserve exit codes and output, including failures.
3. Trace both modes, key access, input flow, logs and any persistence; decide whether live provider access, data processing and spend are authorized.

Deliverable: baseline results and signed-off deployment/data-flow decision. Verification: compare actual scripts and deployment settings to the record; an unavailable account or failing command remains an explicit blocker.
- [ ] Baseline records exact revision, environment and failures.
- [ ] Owner chooses audience, data policy, budget and live/static boundary.

## Phase 1 — confirmed defects and boundaries

Entry: T00 decision. Exit: no unbounded live route in the chosen deployment and provider responses fail safely.

### T01 — Restrict and sanitize served API (F01)

Prerequisites: T00; owner selects trusted identities and ingress. Observed: `server.ts`, `src/engine/provider.ts`; proposed: `tests/server-boundary.test.ts`.
1. Map ingress and existing controls; restrict binding or access as appropriate, then enforce authenticated, authorized access to live execution rather than trusting the browser UI.
2. Implement rate and concurrency limits and an owner-approved spend cap with a defined fail-closed response; preserve the existing request-size guard and return stable sanitized errors.
3. Exercise the actual HTTP route with a fake provider: unauthenticated, unauthorized, unknown ID, oversized body, valid request, quota exhaustion and a synthetic secret-bearing exception.

Deliverable: bounded API and documented configuration. Verification: independent route tests must fail if authorization is bypassed, quotas are removed or synthetic exception text is returned; confirm the host's ingress cannot bypass the controls.
- [ ] Access, budget and quota behavior are independently demonstrated.
- [ ] Client responses and captured logs do not expose synthetic secrets.

### T02 — Validate provider mapping and provenance (F04, F05; injection risk)

Prerequisites: T00, approved SDK contract and synthetic request/response fixtures; T01 before any exposed live trial. Observed: `src/engine/typesafe.ts`, `src/engine/provider.ts`, `src/ui/api.ts`, `tests/engine.test.ts`; proposed: `tests/typesafe-boundary.test.ts`.
1. Verify the pinned SDK's actual response contract and trace each use case's consumed answer; define required keys, finite probability ranges and membership in the requested options, including the explicit none option.
2. Validate at the adapter boundary, reject missing, out-of-range, non-finite or unknown values with a safe, visible failure; distinguish key configured from a successful live request and label local results as illustrative.
3. Add independent fake-SDK tests for duplicate labels, missing answers, invalid choices, malformed scores, timeout and adversarial state; assess high-stakes decisions separately rather than treating a model score as authorization.

Deliverable: documented mapping contract, clear provenance states and boundary tests. Verification: inject an unknown choice and a non-finite probability; tests must fail if validation is disabled. A successful fake test is not a live provider verification.
- [ ] Invalid responses cannot silently become trusted answers.
- [ ] Configured, successful, failed and simulated states are distinguishable.

## Phase 2 — reproducible automation

Entry: T00 baseline. Exit: intentional source changes cannot bypass freshness, typecheck or behavior gates.

### T03 — Index freshness and CI (F02, F03)

Prerequisites: T00; independent of T01/T02. Observed: `package.json`, `scripts/build-repo-index.mts`, `src/data/repo-index.ts`, `.github/workflows/pages.yml`.
1. In a clean checkout, run the existing `index:repo` script as a planned action and compare generated output with the committed index; resolve discrepancies by review, not by assuming current staleness.
2. Align the workflow with the intended index-generation policy, add a deterministic freshness gate and run existing `test` and `typecheck` scripts before the Pages build.
3. Check static hash deep links and served routes against built artifacts; report build, artifact upload and actual deployment as separate outcomes.

Deliverable: reproducible build gate and recorded checks. Verification: change an indexed source without refreshing the committed index and prove the gate fails; restore the fixture and confirm the intended build succeeds.
- [ ] Index drift and type errors cause actionable failures.
- [ ] Deployment outcome is not inferred from a skipped Pages job.

## Phase 3 — security, UX and operations

Entry: T00; T01 and T02 required for live release, T03 for either release. Exit: evidence matches the chosen deployment's risks.

### T04 — Supply chain and data protection (preventive)

Prerequisites: T00 data-flow decision. Observed: `package-lock.json`, `package.json`, `.github/workflows/pages.yml`, `server.ts`; proposed: `docs/security-operations.md`.
1. Review lockfile integrity, dependency advisories and workflow action provenance; pin actions to reviewed immutable revisions where appropriate without weakening checks.
2. Map input, response and log retention, third-party processing and key injection; minimize collection and establish deletion/access policies appropriate to the actual host.
3. Build with synthetic canary credentials under the actual server-side variable names and independently scan static artifacts and logs; establish budget alerts and operational ownership.

Deliverable: dependency review, data-flow policy and canary evidence. Verification: positive-control the scan with a deliberately included canary and prove it detects exposure; verify the synthetic credential was present in the build process environment. A static build may intentionally never consume that server-only key, so absence does not prove other secret paths safe.
- [ ] Dependencies and action revisions have reviewed provenance.
- [ ] Data handling, credential custody and spend ownership are approved.

### T05 — Accessibility, release and recovery (preventive)

Prerequisites: T03/T04 and owner-approved hosting; T01/T02 also required for live mode. Observed: `src/ui/App.tsx`, `src/ui/api.ts`, `.github/workflows/pages.yml`; proposed: `docs/release-recovery.md`.
1. Test keyboard, focus, screen reader, contrast and narrow screens across loading, errors, twelve case routes and static/live labels; repair observed failures.
2. Record artifact SHA, release operator, deployment steps and previous known-good artifact; deploy only after approval and inspect the actual site and route behavior.
3. Exercise rollback to the prior artifact and verify its served identity; if durable data exists, separately test an authorized backup restore and record recovery time and data loss.

Deliverable: accessibility results and a release/rollback record. Verification: force a synthetic provider failure and verify accessible messaging without a mouse; observe the restored version, not merely a successful rollback command.
- [ ] Mode, failure and navigation behavior pass agreed accessibility checks.
- [ ] Release and rollback are observed; restore is demonstrated if applicable.

## Dependencies and independent acceptance

| Task | Depends on | Release significance |
|---|---|---|
| T00 | Owner approval | Establishes scope and baseline |
| T01 | T00 | Required for exposed live mode |
| T02 | T00; T01 before live trial | Required for live provider use |
| T03 | T00 | Required for either build |
| T04 | T00 | Security and data-policy gate |
| T05 | T03, T04; T01/T02 for live | Final release evidence |

Independent reviewer checks negative controls, actual route and adapter behavior, static bundle provenance, and the deployed artifact; tests must fail when protection is deliberately broken, not merely repeat implementation logic. No test count proves completeness.

### Production acceptance and owner approvals

- [ ] Approve audience, ingress, credentials, third-party processing, budget, retention and hosting before live access.
- [ ] Confirm baseline and gates, accessibility evidence, artifact identity and deployment observation for the selected mode.
- [ ] Approve release and rollback authority; preserve the previous immutable artifact. Restore persistent data only after owner-approved, observed backup and recovery tests; if no durable data exists, document that decision.
- [ ] Record unresolved findings and limitations; never treat this static review as certification.
