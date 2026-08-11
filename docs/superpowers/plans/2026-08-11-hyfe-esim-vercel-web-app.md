# HYFE eSIM Vercel Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a TypeScript Next.js web application that reproduces the authorized, human-controlled HYFE eSIM trial flow in a Vercel-compatible UI without altering the original Python scripts.

**Architecture:** A Next.js App Router client wizard calls same-origin Node.js Route Handlers. A stateless encrypted HTTP-only cookie holds short-lived upstream session values and opaque server-owned number selections; sensitive identity, OTP, CAPTCHA values, request/response bodies, and diagnostic payloads are never persisted. The server-side HYFE client preserves request order, headers, response extraction, timeout behavior, manual consent gates, and no-retry final submit semantics from `hyfe_esim_flow_v4_browser.py`.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Vitest, Testing Library, Node `crypto`, native `fetch`, CSS Modules/global CSS.

## Global Constraints

- Preserve `hyfe_esim_flow_v4_browser.py` and `hyfe_esim_flow.py` byte-for-byte.
- Do not solve, fabricate, scrape, harvest, or bypass CAPTCHA; accept only a manually provided official response.
- Do not log, store, expose in localStorage, or return identity fields, OTPs, CAPTCHA responses, cookies, bearer tokens, CSRF tokens, TNC tokens, consent IDs, or encrypted MSISDN values.
- Final submit must send at most one upstream request and must never automatically retry a timeout.
- Use `runtime = 'nodejs'` for every API route that uses crypto or upstream session state.
- Require `FLOW_STATE_ENCRYPTION_KEY` as base64-encoded 32 random bytes in production.

---

### Task 1: Create a Vercel-ready project foundation

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`, `.env.example`, `README.md`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Preserve: `hyfe_esim_flow.py`, `hyfe_esim_flow_v4_browser.py`

**Interfaces:**
- Produces `npm run dev`, `npm run build`, `npm run test`, and `npm run lint` scripts.
- Produces a root layout with Indonesian language metadata and a neutral initial page shell.

- [ ] **Step 1: Write the failing configuration test**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('ships Vercel scripts and never ignores the Python references', () => {
  const root = resolve(__dirname, '..');
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  expect(pkg.scripts).toMatchObject({ build: expect.any(String), test: expect.any(String) });
  expect(existsSync(resolve(root, 'hyfe_esim_flow_v4_browser.py'))).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/project-config.test.ts`

Expected: FAIL because `package.json` and test tooling do not yet exist.

- [ ] **Step 3: Add the smallest project configuration that satisfies the test**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

Create the remaining configuration files with strict TypeScript enabled, Vitest jsdom setup, and a `.gitignore` covering `.next`, `node_modules`, `.env*` except `.env.example`, Python virtual environments, and `.DS_Store`.

- [ ] **Step 4: Run the test and build scaffold**

Run: `npm install && npm test -- tests/project-config.test.ts && npm run build`

Expected: the configuration test passes and Next.js completes a production build.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts vitest.setup.ts .gitignore .env.example README.md app tests/project-config.test.ts
git commit -m "chore: scaffold Vercel TypeScript app"
```

### Task 2: Build pure validation and upstream response helpers

**Files:**
- Create: `lib/validation.ts`, `lib/hyfe/response.ts`, `lib/hyfe/types.ts`
- Test: `tests/validation.test.ts`, `tests/response.test.ts`

**Interfaces:**
- Produces `identitySchema`, `numberSearchSchema`, `otpSchema`, `finalSubmitSchema` and `formatZodIssues`.
- Produces `firstValue(value, ...paths)`, `findNumberCandidates(value)`, `summarizeFinal(value)`, and `safeExcerpt(value)`.

- [ ] **Step 1: Write failing validation tests**

```ts
expect(identitySchema.safeParse({
  fullName: 'Rezky Maulana', whatsapp: '81212345678', email: 'rezky@example.com', eid: '1'.repeat(32),
}).success).toBe(true);
expect(identitySchema.safeParse({ fullName: '', whatsapp: '0812', email: 'x', eid: '1' }).success).toBe(false);
expect(otpSchema.safeParse({ otp: 'A12b34', captcha: 'x'.repeat(100) }).success).toBe(true);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/validation.test.ts tests/response.test.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement explicit schemas and response parsing**

```ts
export const identitySchema = z.object({
  fullName: z.string().trim().min(1, 'Nama lengkap wajib diisi.'),
  whatsapp: z.string().regex(/^8\d{8,}$/, 'WhatsApp harus diawali 8 dan minimal 9 digit.'),
  email: z.string().email('Format email tidak valid.'),
  eid: z.string().regex(/^\d{32}$/, 'EID harus tepat 32 digit.'),
});
```

Implement recursive candidate extraction using `encrypt` with all display keys from the Python script. Make malformed JSON/objects harmless and return only safe summaries.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- tests/validation.test.ts tests/response.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit pure flow helpers**

```bash
git add lib/validation.ts lib/hyfe/response.ts lib/hyfe/types.ts tests/validation.test.ts tests/response.test.ts
git commit -m "feat: add HYFE validation helpers"
```

### Task 3: Implement encrypted, server-owned flow state

**Files:**
- Create: `lib/flow-state.ts`, `lib/http.ts`
- Test: `tests/flow-state.test.ts`

**Interfaces:**
- Produces `FlowState`, `newFlowState()`, `sealFlowState(state, key)`, `openFlowState(token, key)`, and `createSelectionId(state, encrypted)`.
- Produces `FlowHttpError` and `toApiError(error)`.

- [ ] **Step 1: Write failing state tests**

```ts
const key = Buffer.alloc(32, 7).toString('base64');
const sealed = sealFlowState({ ...newFlowState(), csrf: 'secret' }, key);
expect(openFlowState(sealed, key)?.csrf).toBe('secret');
expect(openFlowState(`${sealed}x`, key)).toBeNull();
expect(createSelectionId(newFlowState(), 'upstream-encrypted')).not.toContain('upstream-encrypted');
```

- [ ] **Step 2: Run the state tests to verify failure**

Run: `npm test -- tests/flow-state.test.ts`

Expected: FAIL because encryption helpers do not exist.

- [ ] **Step 3: Implement AES-256-GCM state sealing**

Use a fresh 12-byte IV, `createCipheriv('aes-256-gcm', key, iv)`, versioned base64url encoding, and authenticated tag verification. Set a twenty-minute expiry on state. Throw a generic safe error when `FLOW_STATE_ENCRYPTION_KEY` is unavailable or invalid.

- [ ] **Step 4: Run state tests**

Run: `npm test -- tests/flow-state.test.ts`

Expected: PASS, including a changed-token rejection.

- [ ] **Step 5: Commit state layer**

```bash
git add lib/flow-state.ts lib/http.ts tests/flow-state.test.ts
git commit -m "feat: secure short-lived flow state"
```

### Task 4: Port the HTTP flow as a server-only TypeScript client

**Files:**
- Create: `lib/hyfe/client.ts`, `lib/hyfe/config.ts`
- Test: `tests/hyfe-client.test.ts`

**Interfaces:**
- Produces `HyfeClient` with `bootstrap()`, `findNumbers(input)`, `createConsent(email)`, `sendOtp(email, fullName)`, and `submit(input)`.
- Consumes and returns server-only `FlowState`; no raw upstream headers/body are exposed by routes.

- [ ] **Step 1: Write failing client tests with mocked `fetch`**

```ts
const client = new HyfeClient(fetchMock);
await expect(client.bootstrap()).resolves.toMatchObject({ state: { csrf: 'csrf' } });
expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/hyfe-apply/esim-trial'), expect.objectContaining({ method: 'GET' }));
```

Also cover a known no-match 404, malformed session JSON, and final submit timeout where the request count is exactly one.

- [ ] **Step 2: Run the client tests to verify failure**

Run: `npm test -- tests/hyfe-client.test.ts`

Expected: FAIL because `HyfeClient` does not exist.

- [ ] **Step 3: Implement the upstream sequence**

Port defaults, request ID, request headers, cookie merging, CSRF extraction, candidate payload shape, TNC token/opt-in flow, OTP request, final payload, 10-second connect/30-second ordinary response behavior, and final 60-second timeout. Do not log body values. Use `AbortSignal.timeout` and never retry final submit.

- [ ] **Step 4: Run client tests**

Run: `npm test -- tests/hyfe-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the client**

```bash
git add lib/hyfe/client.ts lib/hyfe/config.ts tests/hyfe-client.test.ts
git commit -m "feat: port HYFE server flow"
```

### Task 5: Add stateful API route handlers

**Files:**
- Create: `app/api/flow/bootstrap/route.ts`, `app/api/flow/numbers/route.ts`, `app/api/flow/consent/route.ts`, `app/api/flow/otp/route.ts`, `app/api/flow/submit/route.ts`, `lib/api-route.ts`
- Test: `tests/api-routes.test.ts`

**Interfaces:**
- Every route returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
- Every successful transition sends a replacement `hyfe_flow` HTTP-only, Secure, SameSite=Lax cookie.

- [ ] **Step 1: Write failing API tests**

```ts
const response = await POST(new Request('http://localhost/api/flow/otp', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', fullName: 'A' }) }));
expect(response.status).toBe(409);
expect(await response.json()).toEqual(expect.objectContaining({ ok: false }));
```

Cover missing state, invalid payloads, consent without explicit acknowledgement, and that response JSON excludes secrets.

- [ ] **Step 2: Run API tests to verify failure**

Run: `npm test -- tests/api-routes.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement narrow POST-only routes**

Read state from the encrypted cookie, run validation, call `HyfeClient`, rotate state, and return minimal safe data. Mark all routes `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`. Delete the cookie after a successful final response; retain state for an ambiguous timeout to avoid a blind re-submit.

- [ ] **Step 4: Run API tests**

Run: `npm test -- tests/api-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API boundary**

```bash
git add app/api lib/api-route.ts tests/api-routes.test.ts
git commit -m "feat: add secure HYFE API routes"
```

### Task 6: Implement the accessible guided web UI

**Files:**
- Create: `components/hyfe-flow.tsx`, `components/step-indicator.tsx`, `components/form-field.tsx`, `components/result-panel.tsx`, `lib/client-api.ts`
- Modify: `app/page.tsx`, `app/globals.css`
- Test: `tests/hyfe-flow.test.tsx`

**Interfaces:**
- `HyfeFlow` owns non-sensitive visual form state and invokes `postFlow<T>(path, body)`.
- The final confirmation button is disabled until OTP, CAPTCHA, and a final one-time-submit acknowledgement are present.

- [ ] **Step 1: Write a failing component test**

```tsx
render(<HyfeFlow />);
expect(screen.getByRole('heading', { name: /HYFE eSIM Trial/i })).toBeVisible();
expect(screen.getByRole('button', { name: /Mulai sesi/i })).toBeEnabled();
expect(screen.queryByRole('button', { name: /Kirim sekali/i })).not.toBeInTheDocument();
```

Add a test that consent cannot proceed until its acknowledgement is checked and a test that the final button sends one POST only.

- [ ] **Step 2: Run component tests to verify failure**

Run: `npm test -- tests/hyfe-flow.test.tsx`

Expected: FAIL because the wizard does not exist.

- [ ] **Step 3: Implement the wizard UI**

Use a calm responsive card layout, clear Indonesian copy, semantic labels, `aria-live` request feedback, error summary focus, masked review values, and a conspicuous no-retry final warning. Keep CAPTCHA as a manual multiline/paste field with a link to the official flow; do not render a token harvesting or CAPTCHA-solving mechanism.

- [ ] **Step 4: Run component tests**

Run: `npm test -- tests/hyfe-flow.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit UI**

```bash
git add app/page.tsx app/globals.css components lib/client-api.ts tests/hyfe-flow.test.tsx
git commit -m "feat: add guided eSIM web interface"
```

### Task 7: Verify deployability, document Vercel setup, and publish

**Files:**
- Modify: `README.md`, `.env.example`
- Preserve: `hyfe_esim_flow.py`, `hyfe_esim_flow_v4_browser.py`

**Interfaces:**
- README documents Node version, install/run/test/build commands, environment variable generation, Vercel import, and known upstream/CAPTCHA limitations.

- [ ] **Step 1: Write the failing documentation assertion**

```ts
expect(readFileSync('README.md', 'utf8')).toContain('FLOW_STATE_ENCRYPTION_KEY');
expect(readFileSync('README.md', 'utf8')).toContain('Vercel');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-config.test.ts`

Expected: FAIL until deployment documentation is complete.

- [ ] **Step 3: Complete documentation and validate**

Document `openssl rand -base64 32`, production variable setup, Vercel root-directory configuration, manual CAPTCHA limitation, and no-retry final submit. Then run:

```bash
npm run lint
npm test
npm run build
git diff --check
git status --short
```

Expected: all commands pass, no whitespace errors, Python scripts remain present and unmodified.

- [ ] **Step 4: Commit and push the full deliverable**

```bash
git add .
git commit -m "feat: add HYFE eSIM Vercel web app"
git push -u origin main
```

Expected: GitHub `rezkym/hyfexl` `main` contains the full application, documentation, design/plan, and original Python files.
