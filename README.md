# XFlyve — Full-Stack Logistics Workflow Platform

XFlyve is a full-stack logistics workflow platform designed to replace spreadsheet-based coordination, WhatsApp messages, phone calls, and paper-based processes used by small transport companies.

It centralises job management, driver workflows, truck assignments, Proof of Delivery documents, work diaries, daily work records, approvals, reporting, and invoice-readiness checks in one role-based web application.

---

## Live Demo

- **Frontend:** https://xflyve.vercel.app
- **Backend API:** https://xflyve.onrender.com
- **GitHub:** https://github.com/yadavkapil-dev/XFlyve

> The backend is hosted on Render and may take a short time to start after a period of inactivity.

---

## The Problem

Before XFlyve, daily transport operations relied heavily on:

- WhatsApp messages and phone calls
- Manually updated spreadsheets
- Paper-based driver records
- POD documents shared informally as images
- Repeated follow-ups with drivers
- No central system for tracking job progress
- Manual checks before jobs could be invoiced

This made it difficult to understand which jobs were pending, in progress, completed, missing documentation, or ready for invoicing.

---

## The Solution

XFlyve provides one internal platform with separate workflows for administrators and drivers.

Administrators can create and assign jobs, manage drivers and trucks, review uploaded documents, track progress, and determine whether completed jobs are ready for invoicing.

Drivers can log in, view only their assigned work, update job progress, upload Proof of Delivery documents, submit work diaries, and record daily work information.

---

## Core Features

### Administrator Features

- Create, update, archive, and manage jobs
- Assign drivers and trucks
- Manage driver accounts
- Manage trucks and daily truck assignments
- Track job status from one dashboard
- Review Proof of Delivery submissions
- Approve or reject POD documents
- Review and approve work diaries
- Review daily work records
- View jobs that meet invoice-readiness requirements
- Export operational information using Excel and ZIP tools
- Access role-protected administration routes

### Driver Features

- Secure login and protected dashboard
- View assigned jobs
- View assigned truck and delivery information
- Start and complete jobs
- Upload Proof of Delivery documents
- Submit compliance work diaries
- Submit daily work records
- View previous submissions and approval status
- Access only records associated with the authenticated driver

---

## Job Workflow

Jobs follow a controlled lifecycle:

```txt
Pending → In Progress → Completed
```

The backend prevents invalid transitions, including:

- Pending directly to Completed
- Completed back to Pending
- Completed back to In Progress
- In Progress back to Pending

The system also records:

- `startedAt` when work begins
- `completedAt` when work is completed

These rules are enforced on the backend rather than relying only on the user interface.

---

## Invoice-Readiness Rules

XFlyve evaluates whether a completed job contains the documents required for invoicing.

### Local Jobs

A local job is ready for invoicing when:

- The job is completed
- The job is not archived
- An approved Proof of Delivery exists

### Interstate Jobs

An interstate job is ready for invoicing when:

- The job is completed
- The job is not archived
- An approved Proof of Delivery exists
- An approved compliance work diary exists

XFlyve currently determines invoice readiness; it does not generate financial invoices.

---

## Proof of Delivery Workflow

1. The driver completes a delivery.
2. The driver uploads the Proof of Delivery.
3. The backend confirms that the job belongs to the authenticated driver.
4. The file is uploaded to Cloudinary.
5. An administrator reviews the submission.
6. The administrator approves or rejects the document.
7. Approved records are protected from further driver modification.

The backend derives the driver identity from the authenticated JWT instead of trusting a driver ID supplied by the frontend.

---

## Work Diary Workflow

Work diaries are primarily used for interstate jobs.

The backend verifies that:

- The authenticated driver owns the selected job
- The job is an interstate job
- The uploaded file meets the configured requirements

Administrators can approve or reject submitted work diaries. Approved records are locked from driver editing or deletion.

---

## Tech Stack

### Frontend

- React
- Vite
- Material UI
- React Router
- Axios
- Context API

### Backend

- Node.js
- Express.js
- REST APIs
- MongoDB
- Mongoose
- JWT Authentication
- Role-Based Access Control

### File Storage

- Cloudinary
- Multer memory storage

### Security and Middleware

- Helmet
- CORS whitelist
- Rate limiting
- Compression
- Morgan
- Input validation
- Centralised error handling
- Ownership checks
- File type and size restrictions

### Logging and Testing

- Winston
- Jest
- Supertest
- Artillery

### DevOps and Deployment

- Docker
- GitHub Actions
- Vercel
- Render
- MongoDB Atlas

---

## Architecture

XFlyve uses a separated frontend and backend architecture.

```txt
React Frontend
      │
      │ HTTPS / JSON
      ▼
Express REST API
      │
      ├── Authentication Middleware
      ├── Role and Ownership Checks
      ├── Controllers and Business Rules
      ├── Cloudinary File Uploads
      │
      ▼
MongoDB Atlas
```

The backend follows an MVC-style structure:

- **Models** define MongoDB schemas
- **Controllers** contain request handling and business logic
- **Routes** map endpoints to controllers
- **Middleware** handles authentication, authorisation, validation, and errors
- **Utilities** contain reusable supporting functions

---

## Main Data Models

- Driver / Administrator
- Job
- Truck
- Daily Truck Assignment
- Job POD
- Work Diary
- Daily Work Log

---

## Project Structure

### Backend

```txt
backend/
├── config/
├── controllers/
├── middlewares/
├── models/
├── routes/
├── scripts/
├── tests/
├── utils/
├── Dockerfile
├── package.json
└── server.js
```

### Frontend

```txt
xflyve-frontend/
├── public/
├── src/
│   ├── api/
│   ├── components/
│   ├── contexts/
│   ├── layouts/
│   ├── pages/
│   └── utils/
├── index.html
├── package.json
└── vite.config.js
```

---

## Environment Variables

Create a `.env` file inside the backend directory.

### Backend `.env`

```env
PORT=3001
NODE_ENV=development

MONGO_URI=
JWT_SECRET=

FRONTEND_URL=http://localhost:5173
CORS_WHITELIST=http://localhost:5173

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Create a `.env` file inside the frontend directory.

### Frontend `.env`

```env
VITE_API_URL=http://localhost:3001/api
```

Do not commit real credentials or secrets to GitHub.

---

## Running Locally

### 1. Clone the Repository

```bash
git clone https://github.com/yadavkapil-dev/XFlyve.git
cd XFlyve
```

### 2. Start the Backend

```bash
cd backend
npm install
npm run start
```

For development with automatic server restarts:

```bash
npm run dev
```

The backend will run on:

```txt
http://localhost:3001
```

### 3. Start the Frontend

Open a second terminal:

```bash
cd xflyve-frontend
npm install
npm run dev
```

The frontend will run on:

```txt
http://localhost:5173
```

### Production Frontend Build

```bash
npm run build
npm run preview
```

---

## Running with Docker

From the backend directory:

```bash
docker build -t xflyve-backend .
docker run --env-file .env -p 3001:3001 xflyve-backend
```

Ensure the required MongoDB, JWT, frontend URL, and Cloudinary environment variables are configured.

---

## Testing

The backend uses Jest and Supertest for automated API and workflow testing.

Run the test suite:

```bash
cd backend
npm test
```

Run the job workflow tests:

```bash
npx jest tests/jobWorkflow.test.js
```

The workflow tests cover:

- Valid job-status transitions
- Invalid transition rejection
- Driver ownership checks
- Start and completion timestamps
- POD approval requirements
- Interstate diary requirements
- Invoice-readiness rules
- Prevention of direct pending-to-completed updates

---

## Load Testing

Artillery is used to test API behaviour under simulated traffic.

```bash
npx artillery run <load-test-file>.yml
```

Replace `<load-test-file>` with the path to the Artillery configuration in the repository.

---

## CI/CD

GitHub Actions (`.github/workflows/ci-cd.yml`) runs on every push and pull
request to `main` and `production-readiness`:

1. **Backend tests** — install, unit tests, then integration tests against an
   isolated in-memory MongoDB (`mongodb-memory-server`, via
   `backend/tests/integration/testDb.js`) — never a real Atlas connection.
2. **Frontend tests + build** — install, ESLint, Vitest, production build.
   (The backend has no ESLint configured yet, so backend lint isn't part of
   this pipeline — a known gap, not an oversight.)
3. **Docker build** — builds both images on every run (validating the
   Dockerfiles); on an actual push, also pushes them to Docker Hub tagged
   with both `latest` and the triggering commit SHA.
4. **Deploy** — only on a push to `main` (never PRs, never
   `production-readiness`), and only after the three jobs above succeed:
   triggers Render's deploy hook for the backend, polls `/healthz` until it
   reports healthy, then triggers Vercel's deploy hook for the frontend and
   confirms it's reachable.

Deployment is intentionally gated behind CI passing — see below for what
that requires in the Render/Vercel dashboards, and required GitHub secrets.

### Required GitHub secrets

| Secret | Used for | Where to get it |
|---|---|---|
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Pushing Docker images | Docker Hub account (already configured previously) |
| `RENDER_DEPLOY_HOOK_URL` | Triggering a backend deploy | Render dashboard → backend service → Settings → **Deploy Hook** |
| `VERCEL_DEPLOY_HOOK_URL` | Triggering a frontend deploy | Vercel dashboard → project → Settings → Git → **Deploy Hooks** (create one for the `main` branch) |

### Turning off Render/Vercel's own auto-deploy

Both platforms can deploy independently of this pipeline whenever they see a
new push, via their native GitHub integration. For the CI gate above to
actually mean anything (not just race against an independent deploy),
auto-deploy needs to be turned off in both dashboards, leaving the deploy
hooks above as the only way a deploy happens:

- **Render**: backend service → Settings → **Auto-Deploy** → set to *No* (or *Off*).
- **Vercel**: project → Settings → Git → confirm the connected branch, then
  disable auto-deploy for it (via an *Ignored Build Step* that always exits
  non-zero, or the project's auto-deploy toggle if your plan exposes one
  directly) — deploys still happen, but only when the deploy hook is called.

The frontend is deployed to Vercel, the backend to Render.

---

## Rollback

Both Render and Vercel keep every previous deploy addressable, so rolling
back doesn't require reverting code first.

**Backend (Render)**
1. Render dashboard → backend service → **Events** (or **Deploys**) tab.
2. Find the last deploy known to be good, identified by its commit message/SHA.
3. Click **Redeploy** (or **Rollback to this deploy**) on that entry.
4. Confirm it's healthy: `curl https://xflyve.onrender.com/healthz`.

**Frontend (Vercel)**
1. Vercel dashboard → project → **Deployments** tab.
2. Find the last deployment known to be good (each is listed with its commit SHA).
3. Open its "..." menu → **Promote to Production** — this repoints the
   production domain at that exact previous build immediately, no rebuild
   needed.
4. Confirm: visit https://xflyve.vercel.app.

**Git-based alternative (backend)**: `git revert <bad-commit-sha>` and push
to `main` — since deploy is gated on CI, the revert redeploys automatically
once the pipeline passes, no dashboard clicks needed.

**Docker images**: every CI run on a push tags both images with the
triggering commit SHA (not just `latest`), pushed to Docker Hub. To recover
the exact image behind a specific past deploy: `docker pull
<username>/xflyve-backend:<commit-sha>` (find the SHA from `git log` or the
GitHub Actions run history) — useful for inspecting or running that exact
build locally, even though Render/Vercel build from source rather than
pulling these images directly.

---

## Screenshots

Add screenshots to a folder such as:

```txt
docs/screenshots/
```

Then add them here:

```md
![Admin Dashboard](docs/screenshots/admin-dashboard.png)
![Job Management](docs/screenshots/job-management.png)
![Driver Dashboard](docs/screenshots/driver-dashboard.png)
![POD Approval](docs/screenshots/pod-approval.png)
![Invoice Readiness](docs/screenshots/invoice-readiness.png)
```

---

## Outcome

XFlyve replaced fragmented logistics processes with a centralised workflow platform.

The system provides:

- Centralised job tracking
- Clear admin and driver responsibilities
- Faster access to delivery documentation
- Structured approval workflows
- Better visibility into job progress
- Reduced dependence on spreadsheets and WhatsApp
- Consistent checks before invoicing
- More reliable operational records

---

## What I Learned

Building XFlyve strengthened my understanding of:

- Designing software around real business workflows
- Translating operational problems into technical requirements
- Full-stack application architecture
- REST API design
- MongoDB schema design
- Authentication and authorisation
- Role-based and ownership-based access control
- File handling and cloud storage
- Backend business-rule enforcement
- Automated workflow testing
- Application security
- Docker and CI/CD
- Cloud deployment and environment configuration

---

## Future Improvements

- Multi-company SaaS tenancy
- Real-time notifications
- GPS and driver-location tracking
- Route planning and optimisation
- Payroll and driver-payment workflows
- Full invoice generation
- Audit logs
- Refresh-token authentication
- Improved monitoring and observability
- Expanded automated test coverage
- Mobile application support
- AI-assisted dispatch and operational reporting

---

## Author

**Kapil Yadav**

- Portfolio: https://kapilyadav.dev
- LinkedIn: https://linkedin.com/in/yadav-kapil
- GitHub: https://github.com/yadavkapil-dev

---

## Disclaimer

XFlyve is a portfolio and internal workflow project created to demonstrate full-stack software engineering, logistics-domain understanding, workflow automation, and modern web application development.
