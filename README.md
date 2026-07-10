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

GitHub Actions is used for continuous integration and deployment workflows.

The pipeline supports automated quality checks such as:

- Dependency installation
- Application builds
- Automated tests
- Deployment preparation

The frontend is deployed to Vercel, while the backend is hosted on Render.

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
