# Lead Management System

[![CI](https://github.com/akhilreddy20/lead-mgmt-system/actions/workflows/ci.yml/badge.svg)](https://github.com/akhilreddy20/lead-mgmt-system/actions/workflows/ci.yml)

A full-stack CRM for an admissions team. Leads arrive from several sources and are auto-assigned to telecallers. They move through an enforced status workflow, can be escalated to counsellors, and become students after a payment is verified. Every change goes into an audit log.

**Live demo:** https://lead-mgmt-system.vercel.app

**Stack:** Node.js · Express · MongoDB (Mongoose) · React + TypeScript (Vite) · React Query · Tailwind · Docker · GitHub Actions

## Features

- **Multi-source intake:** UI (ads / manual / website / referral) and an external `POST /api/leads/api-source` endpoint secured with an API key
- **Automatic assignment** to the least-loaded active telecaller, done in one atomic query
- **Status workflow** with enforced transitions and **optimistic concurrency control**
- **Escalation** from telecaller to counsellor, plus manual reassignment with history
- **Follow-ups** with overdue detection
- **Payments:** proof upload with versioning and a one-time verify/reject decision
- **Conversion** to student (only with a verified payment); locks the lead afterwards
- **Activity timeline** (audit log) per lead
- **Role-based access** for admin, counsellor and telecaller, with per-lead checks

## Engineering notes

### Concurrency

| Problem | Approach |
|---|---|
| Two users edit the same lead | Each lead has a `version` field. Updates use `findOneAndUpdate({ _id, version }, { …, $inc: { version: 1 } })`, so checking and writing happen in **one atomic operation**. If the version moved, the client gets **409** and refreshes. A test fires 10 concurrent updates with the same version and asserts that exactly one succeeds. |
| Two leads arrive at once and pick the same telecaller | Assignment is a single `findOneAndUpdate` sorted by `currentLeadCount` with `$inc`, so there's no read-then-write gap. A test creates 20 leads concurrently and asserts an even 10/10 split. |
| Double-click on "Convert" | The lead is claimed atomically (`isConverted: false → true`) before the student is created. If creating the student fails, the claim is rolled back. `Student.leadId` is also unique. |
| Payment verified twice, or verified and rejected at once | The decision only applies while the payment is still `pending` (atomic filter), so it can happen once. |
| Concurrent notes | Added with `$push`, so notes never overwrite each other. |

### Security

- **Object-level authorization.** Non-admins can only read or change leads assigned or escalated to them, along with those leads' payments, follow-ups and activity. Other leads return 404, so lead ids can't be probed.
- **Registration.** The first account becomes admin. Later sign-ups can only be telecaller or counsellor, and stay **inactive until an admin activates them**. Deactivated users are blocked right away, even with a valid token.
- **No mass assignment.** Lead creation only accepts allow-listed fields. `status`, `version`, `isLocked` and `assignedTo` are set by the server.
- **Private uploads.** Payment proofs get random filenames and are only served by `GET /api/payments/:id/proof`, which checks auth and lead access. Uploads must be JPG, PNG or PDF, with the extension matching the MIME type, and at most 5 MB.
- **External API.** `X-API-Key` is compared in constant time.
- **CORS** allow-list comes from env, and 500 responses don't include internal error details.

### Data model

`User` · `Lead` (embedded notes, assignment history, escalation) · `FollowUp` · `Payment` (proof versions) · `Student` · `ActivityLog`. Indexes support the per-user lead lists, overdue queries and the assignment query.

## Running locally

```bash
# Option A: Docker (MongoDB + API)
docker compose up --build              # API on http://localhost:5000

# Option B: manual
cd backend && cp .env.example .env     # set MONGODB_URI, JWT_SECRET, LEAD_API_KEY
npm ci && npm run dev                  # http://localhost:5000

cd frontend && npm ci && npm run dev   # http://localhost:5173 (proxies /api to :5000)
```

**First run:** register once. The first account becomes the admin. Later sign-ups appear on the **Users** page for the admin to activate.

## Tests

```bash
cd backend
npm test                                                     # unit tests (no DB needed)
docker run -d -p 27017:27017 mongo:7
MONGODB_URI_TEST=mongodb://localhost:27017/lead_mgmt_test npm test   # + integration tests
```

The integration tests run against a real MongoDB. They cover registration rules, mass assignment, per-lead authorization, stale-version 409s, concurrent updates and assignment, private proof files, one-time payment decisions and conversion under concurrency. CI runs them on every push, using a MongoDB service container.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register (first user becomes admin; later users need activation) |
| POST | /api/auth/login | Login |
| GET | /api/users | List users (admin) |
| GET | /api/users/counsellors | Active counsellors (for escalation) |
| PATCH | /api/users/:id/active | Activate / deactivate (admin) |
| POST | /api/leads | Create lead |
| POST | /api/leads/api-source | Create lead from an external system (`X-API-Key`) |
| GET | /api/leads | List leads (scoped to the caller, paginated) |
| PATCH | /api/leads/:id/status | Update status (`version` required, 409 on conflict) |
| PATCH | /api/leads/:id/assign | Reassign lead |
| PATCH | /api/leads/:id/escalate | Escalate to counsellor |
| POST | /api/leads/:id/convert | Convert to student (needs a verified payment) |
| GET | /api/leads/:id/activity | Activity timeline |
| POST | /api/follow-ups | Create follow-up |
| GET | /api/follow-ups | List follow-ups |
| POST | /api/payments | Add payment with optional proof |
| GET | /api/payments/:id/proof | Download proof (authenticated) |
| PATCH | /api/payments/:id/verify | Verify / reject payment (once) |
| GET | /api/dashboard/stats | Dashboard stats (scoped to the caller) |

## What I'd do next

- Write the audit log in the same **MongoDB transaction** as the lead update (needs a replica set), so they can't drift apart
- Move proofs to S3 with short-lived signed URLs
- Add cursor-based pagination instead of `skip` for large lead lists
- Add rate limiting on `/auth` and `/api-source`
