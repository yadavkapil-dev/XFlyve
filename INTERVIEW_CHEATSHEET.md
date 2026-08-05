# XFlyve — Interview Cheatsheet

Fast-scan reference. Verified against code on `main` today — test counts from actually running the suites, not recalled.

---

## 1. Elevator Pitch

- Logistics ops tool for small trucking companies (spreadsheets/group-chat replacement)
- Job assignment, POD approval, NHVR compliance records, invoice-readiness tracking, real-time updates
- Full-stack: React + Node/Express + MongoDB + Socket.IO + Cloudinary + a real LLM-backed AI assistant
- Built and tested like production: automated tests at 3 layers, CI/CD gating real deploys

---

## 2. Architecture

- **Frontend:** React 19 + Vite, Material UI v7, React Router v7 → deployed to Vercel
- **Backend:** Node.js + Express 5 + Mongoose 8 → deployed to Render
- **Database:** MongoDB (Docker locally, real deployment in prod)
- **File storage:** Cloudinary (PODs, work diary PDFs) — Multer in-memory upload, magic-byte validated
- **Real-time:** Socket.IO, JWT-authenticated handshake, per-user private rooms
- **AI:** OpenRouter (free-tier LLM) via raw `fetch`, no vendor SDK
- **Email:** Resend, optional, fire-and-forget
- **app.js vs server.js split:** app.js = Express wiring only, server.js = runtime bootstrap (DB connect, sockets, listen) — lets integration tests mount a real app with no real DB/port

---

## 3. Core Modules

- Auth (JWT, bcrypt, password reset)
- Jobs (lifecycle, transitions, truck assignment)
- Trucks (status, daily assignment records)
- PODs (upload, approve/reject)
- Work Diary (interstate-only PDFs, no approval)
- Work Logs (structured hours/km, no approval)
- Invoicing (readiness list + manual "Mark as Invoiced")
- Notifications (Socket.IO + REST)
- Activity (append-only per-job audit log)
- AI Assistant (6 read-only tools)

---

## 4. Main Workflow (current, accurate order)

1. Admin creates job → assigns driver + truck for a date (double-booking blocked)
2. Driver notified (Socket.IO live push + in-app + email)
3. Driver starts job → truck atomically claimed (`available → on-route`)
4. Driver completes job → truck released (`→ available`)
5. Driver uploads POD (magic-byte validated PDF → Cloudinary)
6. Admin approves or rejects POD (rejection → driver notified + emailed)
7. Approved POD + completed status → job appears on Invoicing page
8. Admin clicks "Mark as Invoiced" → confirmation dialog → `invoiceStatus: "invoiced"` → job leaves the ready list
9. Every step above also writes an Activity entry, visible per-job

Separately, anytime: driver uploads Work Diary (interstate only) and submits Work Logs — neither has an approval step.

---

## 5. Authentication

- JWT, `{ id, role }` payload, signed with `JWT_SECRET`, **7-day expiry**
- **No refresh token, no rotation** — deliberate, documented scope decision
- Bearer header only — no cookies anywhere
- Every request re-checks `recordStatus`/`active` against the DB, not just the JWT signature — deactivation takes effect immediately
- Passwords: bcrypt, **cost factor 12**, hashed in a Mongoose `pre("save")` hook
- Double-hash guard: regex checks if value is already a bcrypt hash before re-hashing
- Password reset: 256-bit random token, only a SHA-256 **hash** stored, 1-hour TTL, single-use, anti-enumeration (same response whether or not the email exists)

---

## 6. Database (collections + relationships)

- `Driver` — both admins and drivers, one collection, `role` enum field
- `Job` — `assignedTo` → Driver, `assignedTruck` → Truck, `podIds` → JobPod[]
- `Truck` — `status` (available/on-route/out-of-service/maintenance)
- `DailyTruckAssignment` — per-day driver+truck pairing, **3 unique compound indexes** (driver+truck+date, driver+date, truck+date)
- `JobPod` — `driverId` → Driver, `jobId` → Job (nullable), `status` (pending/approved/rejected)
- `WorkDiary` — `driverId`, `jobId` (interstate only), **no status field at all**
- `DailyWorkLog` — `driverId`, `jobIds`[], **no status field at all**
- `Notification` — `recipient`, `relatedJobId` (nullable), `read` boolean
- `Activity` — `actorId`, `resourceType`/`resourceId`, `relatedJobId`, append-only, no `updatedAt`

Known dead/vestigial fields (confirmed still present):
- `Job.podUrl` — dead, superseded by `podIds`
- `Truck.assignedDriver` — backend-wired, frontend never uses it (real assignment is via `DailyTruckAssignment`)

---

## 7. Business Rules (state machine)

- Job status: `pending → in-progress → completed` — **server-enforced**, driver can't skip or reverse
- Truck status changes as a **side effect** of job transitions, not manually:
  - job starts → truck `available → on-route` (atomic conditional update)
  - job completes/reassigns → truck `→ available`
- Truck unavailable if `status !== "available"` or `recordStatus === "archived"`
- Admin can override any field directly (bypasses the driver transition table) — intentional
- POD: `pending → approved` or `pending → rejected`, admin-only, no job-status dependency (POD can technically be approved before job is completed)
- Work Diary / Work Log: **no state machine — no approval concept at all**, by design (removed in a past simplification)

---

## 8. Invoice Readiness (current, accurate rule)

- Job is invoice-ready if: `status === "completed"` **AND** `recordStatus !== "archived"` **AND** `invoiceStatus` is `pending`/`ready` **AND** has ≥1 **approved POD**
- **Work Diary and Work Logs do NOT gate this** — POD is the only requirement
- Previously (old rule, now removed): interstate jobs also required an approved diary — deliberately dropped
- "Mark as Invoiced": one button → confirmation dialog → `PUT /api/jobs/:jobId { invoiceStatus: "invoiced" }` → job leaves the list
- No undo/history UI — was built, tested, then deliberately removed as unnecessary complexity on top of an already-confirmed action

---

## 9. Security

- RBAC: `admin` / `driver`, enforced in route middleware (`requireAdmin`/`requireDriver`/`requireDriverOrAdmin`)
- Ownership checks inside controllers on top of role checks (driver can only touch their own POD/diary/log/job)
- Rate limiting — **3 separate limiters**:
  - Global: 100 req / 15 min per IP
  - Login/forgot-password/reset-password: 10 req / 15 min (⚠️ signup is NOT covered by this stricter limiter)
  - AI chat: 20 req / hour, **keyed by user ID, not IP** (protects shared OpenRouter quota)
- File upload: magic-byte check (`%PDF-` signature), not just client-supplied MIME type
- Helmet (default config) + CORS whitelist (env-configured) + `trust proxy: 1` (Render's single reverse proxy)
- Swagger UI mounted **before** Helmet so its CSP doesn't break the docs UI

---

## 10. Testing (real current counts — just run)

- **Backend:** `npm test` → **57 test suites, 512 tests** (Jest + Supertest + mongodb-memory-server)
- **Frontend:** `npm test` → **19 test files, 176 tests** (Vitest + React Testing Library)
- **E2E:** `npm test` → **5 tests** (Playwright: 4 axe-core accessibility scans + 1 full workflow test)
- Integration tests use real Mongoose schemas/indexes against an isolated in-memory MongoDB — never a real DB, even in CI

---

## 11. Docker & CI/CD (current, accurate scope)

- **Docker:** multi-stage builds both services. Backend → non-root user, `/healthz` healthcheck. Frontend → build stage discarded, final image is bare Nginx serving static files only (no Node in prod image)
- **CI/CD DOES run the full test suite AND DOES deploy** — GitHub Actions, on push/PR to `main` and `production-readiness`:
  1. Backend unit + integration tests
  2. Frontend lint + unit tests + production build
  3. E2E test (`needs: [backend, frontend]`)
  4. Docker build for both images (`needs: [backend, frontend, e2e]`), pushed to Docker Hub only on an actual push
  5. **Deploy job** (`needs: [docker]`, `if: push && ref == main`) — triggers real Render + Vercel deploy hooks, polls both until healthy
- Deploy only fires on push to `main` — never on PRs, never on `production-readiness`
- Requires each platform's own auto-deploy to be turned OFF in its dashboard, or it races ahead of this gate

---

## 12. Biggest Bugs Fixed

- **Trucks security gate:** `GET /api/admin/trucks` had no `requireAdmin` — every sibling route in the file did. Any driver token could list the whole fleet. Fixed with one line + a new 403/200 integration test.
- **Sort-order → E2E regression:** flipping admin lists to newest-first (correct fix) made an E2E test fail — traced to the test blindly clicking `.first()` "Edit" button, which had been accidentally matching the right job only by sort-order coincidence. Fixed by scoping the test to its own job via `data-testid`, not by touching the sort fix.
- **workDate vs uploadDate compliance bug:** Work Diary date filters matched on upload date instead of the actual trip date — a late-uploaded diary for an earlier trip could be missed in an NHVR compliance date lookup. Fixed to filter on trip date, falling back to upload date only for legacy null-workDate records.
- **Vercel SPA 404:** refreshing/deep-linking any route on the deployed frontend 404'd — no SPA rewrite rule for the static host. Fixed with a 5-line `vercel.json` rewrite-all-to-index.html rule. Never showed up locally (Vite dev server already does this by default).
- **Resend sandbox logging leak:** Resend's SDK has its own internal error logger that can echo a recipient's email address into console output during sandbox-restriction errors. Fixed by shadowing the SDK instance's `logError` with a no-op, and only ever logging structured fields (`name`/`statusCode`/`code`), never the free-text `.message`.

---

## 13. Limitations (real, current — not hypothetical)

- **No refresh-token rotation** — single 7-day JWT, no MFA/SSO/session management (deliberate scope decision)
- **`exportDriversExcel` and `exportUsersCsv.js` still leak admin accounts** into a drivers-only export — role filter was added to `getAllDrivers` but never backported to these two. **Confirmed still open today.**
- **Pagination gaps** — driver's own jobs/work logs (`getMyJobs`, `getAssignedJobs`, `getMyLogs`, `getLogsByDriver`), truck assignment history (`getAllAssignments`) — all return full unpaginated result sets
- Notification list capped at newest 20/session client-side (backend supports real pagination, frontend doesn't call for more)
- **No multi-tenant support** — by design, single-company tool, every admin sees everything
- **No invoicing/payroll calculation** — by design, "Mark as Invoiced" is a status flag only, no amounts/documents/accounting integration
- No GPS/live tracking, no route optimization — out of scope
- Backend has no ESLint configured (frontend does)
- `Job.podUrl` and `Truck.assignedDriver` are dead/vestigial fields still in the schema

---

## 14. Common Interview Questions (prompts only, no answers)

- Why no refresh tokens yet?
- How do you stop a driver from seeing another driver's data?
- Walk me through what happens when a job is completed.
- How do you prevent two admins double-booking the same truck?
- Why did you remove approval workflows from Work Diary/Work Logs?
- Why does invoicing only depend on the POD, not the diary?
- What happens if the AI model tries to call a tool it shouldn't have access to?
- Tell me about a bug where your own fix caused a different test to fail.
- What would you fix first if you kept working on this?
- What's still broken or incomplete that you haven't fixed?
- How is a Socket.IO notification guaranteed to reach only the right user?
- Why is the Activity log read-only with no edit/delete route?
- What's the actual gap in the exportDriversExcel bug, and why hasn't it been fixed?
- How does your CI/CD pipeline stop a broken build from reaching production?
- Why is the AI assistant restricted to read-only, zero-argument tools?

---

## 15. Closing Checklist

- [ ] Re-run all 3 test suites once before the interview — don't quote counts from memory
- [ ] Re-read the trucks-gate bug diff (cleanest concrete "bug I found" story)
- [ ] Re-read the sort-order/E2E regression narrative — practice telling it in under 90 seconds
- [ ] Confirm the 6 AI tool names and "zero arguments" rule out loud once
- [ ] Know the exportDriversExcel bug is still open — don't imply it's fixed
- [ ] Know the difference between "by design" limitations (multi-tenant, invoicing/payroll) and "real gaps" (refresh tokens, pagination, the export bug) — don't blur the two
- [ ] One breath — describe the system accurately, don't defend it as perfect
