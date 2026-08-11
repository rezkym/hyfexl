# HYFE eSIM Web Flow Design

## Goal

Convert `hyfe_esim_flow_v4_browser.py` into a TypeScript web application that can be deployed to Vercel, while preserving the Python scripts and retaining explicit user control over consent, OTP, CAPTCHA, and the consequential final submission.

## Chosen Approach

Use a single Next.js App Router project. Browser UI presents a guided, accessible eight-stage flow and calls same-origin Route Handlers. The handlers proxy the existing HYFE HTTP sequence server-side so browser CORS restrictions do not prevent the flow.

The server keeps only short-lived session material (upstream cookies, bearer token, CSRF token, TNC token, consent ID, selected encrypted number, and a generated request ID) in an encrypted HTTP-only cookie. Personal data, OTP, CAPTCHA response, and upstream API bodies are never logged, persisted, or returned to the client beyond a small safe result summary. A Vercel serverless function has no durable local filesystem, so the Python artifact-file feature is intentionally replaced by no persistence.

## User Experience

The landing page is a single responsive wizard with visible progress and one active card per stage:

1. Start a new secure session.
2. Search a preferred or randomly chosen number and select one result.
3. Enter full name, WhatsApp number, email, and 32-digit EID; client validation gives immediate feedback.
4. Read and explicitly accept the consent notice; the application creates the TNC consent record only after the checkbox is set.
5. Explicitly request the OTP sent to the entered email address.
6. Enter the six-character OTP and a manually obtained official CAPTCHA response.
7. Review masked personal data and explicitly confirm the one-time final submission.
8. Show a status/result panel using the same safe summary fields as the Python script.

Each step exposes retry/back behavior only where safe. The final submission has no automatic retry: a timeout is surfaced as ambiguous, so the user can check the official service before manually starting another session.

## Server API

Route handlers provide five narrow operations:

- `POST /api/flow/bootstrap` initializes the official session and returns no secrets.
- `POST /api/flow/numbers` searches inventory and returns only display labels plus opaque selection IDs; retry semantics match the Python flow for random search.
- `POST /api/flow/consent` creates TNC consent after an explicit client acknowledgement.
- `POST /api/flow/otp` requests email OTP delivery after an explicit client action.
- `POST /api/flow/submit` validates the final fields and sends one upstream request with a 60-second read timeout.

Session tokens remain inside an AES-GCM encrypted cookie. Opaque selection IDs protect the encrypted upstream MSISDN token from client-side tampering. Every handler validates its own input and enforces the required prior state.

## Safety and Failure Behaviour

The app does not solve, fabricate, read, scrape, harvest, or bypass CAPTCHA. It accepts a value the user has manually obtained from the official service and warns that the upstream service can reject it when the browser session does not match. The UI neither stores tokens nor sends diagnostic payloads to analytics.

Responses from HYFE are parsed defensively. Network errors, invalid JSON, unexpected response schemas, and unrecognized 404s become Indonesian user-safe messages. Final submit has no retry. All upstream requests have explicit connect/read timeouts.

## Implementation Boundaries

- Preserve `hyfe_esim_flow_v4_browser.py` and `hyfe_esim_flow.py` unchanged.
- Use TypeScript with Next.js, React, and Node runtime Route Handlers; do not require a database, Redis, or third-party authentication provider.
- Keep the project Vercel-compatible (`npm run build` must complete locally).
- Add Vitest unit tests for flow parsing, validation, secure state handling, and HTTP error semantics. Add component tests for key consent and final-submit gates.
- Document local setup and Vercel environment variables, including a required 32-byte `FLOW_STATE_ENCRYPTION_KEY` encoded as base64.

## Acceptance Criteria

- Users can complete every equivalent stage of the Python flow through an understandable web UI.
- Only explicit user actions trigger consent, OTP, and the one-time final submit.
- CAPTCHA remains manual and no Python source files are deleted or modified.
- Upstream session secrets and sensitive identity values are absent from browser-readable persistence and logs.
- Tests and production build pass.
- The finished source, documentation, and original Python scripts are committed and pushed to `rezkym/hyfexl`.
