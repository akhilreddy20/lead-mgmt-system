# Lead Management System

Full-stack CRM for managing leads from multiple sources with auto-assignment, follow-up tracking, escalation, payment verification, and lead-to-student conversion.

## Features
- **Multi-source leads**: Ads, API, Manual, Website, Referral
- **Auto-assignment**: Round-robin to telecallers
- **Manual reassignment** with history tracking
- **Status management** with enforced valid transitions & optimistic locking (prevents concurrent updates)
- **Telecaller updates**: status, notes, follow-up scheduling
- **Escalation**: telecaller → counsellor with reason
- **Follow-up tracking** with overdue detection
- **Full activity timeline** (audit log per lead)
- **Payment proof** with versioning and verification flow
- **Lead → Student conversion** with data lock

## Tech Stack
- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **Frontend**: React (Vite), TypeScript, TailwindCSS, React Query

## Setup

### Prerequisites
- Node.js 18+
- MongoDB running locally or a MongoDB Atlas URI

### Backend
```bash
cd backend
cp .env.example .env   # Edit with your MongoDB URI and JWT secret
npm install
npm run dev            # Runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev            # Runs on http://localhost:5173 (proxies API to :5000)
```

### Default Flow
1. Register as admin at `/login`
2. Create telecaller/counsellor users
3. Add leads → auto-assigned via round-robin
4. Telecallers update status, add notes, schedule follow-ups
5. Escalate to counsellor when needed
6. Add payment, upload proof → counsellor verifies
7. Convert qualified leads to students (locks lead data)

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login |
| POST | /api/leads | Create lead |
| GET | /api/leads | List leads (filtered) |
| PATCH | /api/leads/:id/status | Update status (with version check) |
| PATCH | /api/leads/:id/assign | Reassign lead |
| PATCH | /api/leads/:id/escalate | Escalate to counsellor |
| POST | /api/leads/:id/convert | Convert to student |
| GET | /api/leads/:id/activity | Activity timeline |
| POST | /api/follow-ups | Create follow-up |
| GET | /api/follow-ups | List follow-ups |
| POST | /api/payments | Add payment with proof |
| PATCH | /api/payments/:id/verify | Verify/reject payment |
| GET | /api/dashboard/stats | Dashboard stats |
