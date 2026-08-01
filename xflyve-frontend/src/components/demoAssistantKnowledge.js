const normalizeText = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const assistantTopics = [
  {
    id: "overview",
    title: "What is XFlyve?",
    suggestedQuestion: "What is XFlyve?",
    phrases: ["what is xflyve", "explain xflyve", "describe xflyve", "what does xflyve do"],
    keywords: ["xflyve overview", "logistics platform", "transport platform", "operations platform"],
    answer:
      "XFlyve is a full-stack logistics workflow platform for small transport operations. It centralises jobs, drivers, trucks, PODs, work diaries, daily work logs, approvals, and invoice-readiness checks in one role-based web app.",
  },
  {
    id: "problem",
    title: "Problem XFlyve Solves",
    suggestedQuestion: "What problem does XFlyve solve?",
    phrases: ["what problem does xflyve solve", "problem xflyve solves", "why build xflyve", "what pain point"],
    keywords: ["spreadsheets calls", "whatsapp follow ups", "paper records", "manual coordination", "missing documents"],
    answer:
      "XFlyve addresses the coordination mess common in small transport teams: spreadsheets, calls, WhatsApp follow-ups, paper driver records, informal POD sharing, and no single place to see job progress or missing documents.",
  },
  {
    id: "admin-features",
    title: "Admin Features",
    suggestedQuestion: "What can an admin do?",
    phrases: ["what can an admin do", "admin features", "administrator features", "admin workflow", "admin tools"],
    keywords: ["manage jobs", "review pods", "monitor work logs", "admin dashboard", "invoice readiness"],
    answer:
      "Admins can create and edit jobs, manage drivers and trucks, assign trucks, review and approve or reject PODs, monitor driver-submitted work diaries and daily work logs, bulk-download a day's approved PODs or a driver's work diaries for a date range, and view jobs that meet invoice-readiness rules.",
  },
  {
    id: "driver-features",
    title: "Driver Features",
    suggestedQuestion: "What can a driver do?",
    phrases: ["what can a driver do", "driver features", "driver workflow", "driver tools", "driver portal"],
    keywords: ["assigned jobs", "start jobs", "complete jobs", "upload pod", "submit work logs"],
    answer:
      "Drivers can log in, see only their assigned jobs, start and complete jobs, upload PODs and track their approval status, upload work diary documents for interstate jobs, and submit job-linked daily work logs.",
  },
  {
    id: "job-workflow",
    title: "Job Workflow",
    suggestedQuestion: "How does the job workflow work?",
    phrases: ["how does the job workflow work", "pending in progress completed", "pending to completed", "job status transition", "job lifecycle"],
    keywords: ["pending completed", "in progress completed", "startedat completedat", "invalid transition"],
    answer:
      "Jobs follow pending → in-progress → completed. The backend rejects invalid transitions, prevents pending jobs from being completed directly, sets startedAt once when work begins, and sets completedAt once when work finishes.",
  },
  {
    id: "truck-status",
    title: "Truck Status Workflow",
    suggestedQuestion: "How does truck status automation work?",
    phrases: ["how does truck status automation work", "truck status automation", "available on route available", "automatic truck status"],
    keywords: ["truck becomes on route", "truck returns available", "start job truck", "complete job truck"],
    answer:
      "Truck status is derived from the job workflow. A truck with no active job is available, becomes on-route when the driver starts its assigned job, and returns to available when that job is completed.",
  },
  {
    id: "driver-management",
    title: "Driver Management",
    suggestedQuestion: "How does driver management work?",
    phrases: ["how does driver management work", "driver management", "manage drivers", "edit drivers", "delete drivers"],
    keywords: ["create driver", "update driver", "archive driver", "restore driver", "duplicate email"],
    answer:
      "Admins can create, edit, and archive driver accounts. Driver updates preserve the same document reference for historical jobs, password changes are optional, and recreated archived drivers can be restored instead of breaking old job links.",
  },
  {
    id: "truck-management",
    title: "Truck Management",
    suggestedQuestion: "How does truck management work?",
    phrases: ["how does truck management work", "truck management", "manage trucks", "edit trucks", "delete trucks"],
    keywords: ["create truck", "archive truck", "restore truck", "duplicate truck number", "out of service"],
    answer:
      "Admins can manage truck records while keeping historical job references intact. Archived trucks are hidden from normal workflows, active duplicates are rejected clearly, and out-of-service is the manual admin-controlled downtime state.",
  },
  {
    id: "truck-assignment",
    title: "Truck Assignment",
    suggestedQuestion: "How does truck assignment work?",
    phrases: ["how does truck assignment work", "truck assignment", "assign truck to driver", "daily truck assignment"],
    keywords: ["assigned truck driver", "truck assignment date", "driver truck assignment", "selected truck assigned driver"],
    answer:
      "Truck assignment links drivers and trucks for operations. Job forms use available trucks, avoid out-of-service trucks, preserve manually selected drivers, and warn instead of silently replacing a driver when a selected truck assignment conflicts.",
  },
  {
    id: "local-work-logs",
    title: "Local Work Logs",
    suggestedQuestion: "What do local work logs collect?",
    phrases: ["what do local work logs collect", "local work logs", "local logs", "local job logs", "local daily work"],
    keywords: ["pickup time", "finish time", "total hours", "local deliveries", "local notes"],
    answer:
      "Local job work logs collect truck pickup time, finish time, number of deliveries, total hours, and optional notes. Local submissions do not require kilometre fields.",
  },
  {
    id: "interstate-work-logs",
    title: "Interstate Work Logs",
    suggestedQuestion: "What do interstate work logs collect?",
    phrases: ["what do interstate work logs collect", "interstate work logs", "interstate logs", "interstate job logs", "kilometre work logs"],
    keywords: ["start kilometres", "end kilometres", "interstate deliveries", "end km", "start km"],
    answer:
      "Interstate work logs collect start kilometres, end kilometres, number of deliveries, and optional notes. They do not require local pickup time, finish time, or total hours, and end kilometres cannot be lower than start kilometres.",
  },
  {
    id: "work-log-difference",
    title: "Local vs Interstate Work Logs",
    suggestedQuestion: "What is the difference between local and interstate work logs?",
    phrases: ["difference between local and interstate work logs", "local versus interstate work logs", "local vs interstate work logs"],
    keywords: ["local interstate difference", "hours kilometres difference", "pickup kilometres"],
    answer:
      "Local logs are time-based: pickup time, finish time, deliveries, total hours, and notes. Interstate logs are distance-based: start kilometres, end kilometres, deliveries, and notes. The frontend only shows relevant fields and the backend enforces the same rules.",
  },
  {
    id: "pod-workflow",
    title: "POD Workflow",
    suggestedQuestion: "How does POD approval work?",
    phrases: ["how does pod approval work", "pod approval workflow", "proof of delivery", "proof of delivery approval", "pod workflow"],
    keywords: ["upload pod", "approve pod", "reject pod", "proof of delivery", "cloudinary pod"],
    answer:
      "Drivers upload Proof of Delivery documents for jobs they own. The backend verifies ownership and file rules, uploads through Cloudinary, and admins can approve or reject the POD. Approved POD records are protected from driver changes.",
  },
  {
    id: "work-diary-workflow",
    title: "Work Diary Workflow",
    suggestedQuestion: "How does the work diary work?",
    phrases: ["how does the work diary work", "work diary workflow", "nhvr work diary", "work diary rules", "compliance records"],
    keywords: ["interstate only diary", "work diary upload", "nhvr compliance", "no approval work diary", "bulk download diaries"],
    answer:
      "Work diaries exist only for interstate jobs — a local job never has a diary-upload option, and the backend rejects a diary linked to a local job. Unlike PODs, work diaries have no approval workflow: once uploaded, they're always editable or deletable by the driver or an admin. Admins can bulk-download a driver's diary pages for a date range for NHVR compliance requests, including for archived (ex-)drivers.",
  },
  {
    id: "notifications",
    title: "Notifications",
    suggestedQuestion: "How do notifications work?",
    phrases: ["how do notifications work", "notification system", "notification bell", "job notifications"],
    keywords: ["admin notifications", "notification bell", "unread count", "pod submitted notification", "diary submitted notification"],
    answer:
      "Notifications go both ways. Admins are notified when a driver submits a POD, work diary, or work log. Drivers are notified when they're assigned or reassigned to a job, and when their POD is approved or rejected. Each notification names the driver and job involved, the notification bell groups them by job, and shows an unread count.",
  },
  {
    id: "auth-roles",
    title: "Authentication and Roles",
    suggestedQuestion: "How do authentication and roles work?",
    phrases: ["how do authentication and roles work", "authentication and roles", "role based access", "jwt authentication"],
    keywords: ["jwt roles", "admin driver roles", "protected routes", "ownership checks", "authorization"],
    answer:
      "XFlyve uses JWT authentication with role-based frontend routes and backend authorization checks. Admins and drivers see different navigation, and drivers are blocked from acting on another driver's jobs, PODs, diaries, or work logs.",
  },
  {
    id: "tech-stack",
    title: "Technology Stack",
    suggestedQuestion: "What technologies were used?",
    phrases: ["what technologies were used", "technology stack", "tech stack", "what stack", "built with", "react express mongo"],
    keywords: ["react vite", "material ui", "node express", "mongodb mongoose", "axios jwt"],
    answer:
      "The frontend uses React, Vite, Material UI, React Router, Axios, and Context API. The backend uses Node.js, Express, MongoDB, Mongoose, JWT auth, validation middleware, Cloudinary/Multer uploads, and Winston logging.",
  },
  {
    id: "testing-validation",
    title: "Testing and Validation",
    suggestedQuestion: "What testing was implemented?",
    phrases: ["what testing was implemented", "tests and validation", "automated tests", "jest tests", "validation rules"],
    keywords: ["jest coverage", "job workflow tests", "work log tests", "express validator", "backend validation"],
    answer:
      "The backend has Jest tests for job transitions, startedAt/completedAt behavior, truck status lifecycle, invoice-readiness rules, and job-type-specific work-log validation. Express validators and controller checks enforce key rules server-side.",
  },
  {
    id: "deployment",
    title: "Deployment",
    suggestedQuestion: "How is XFlyve deployed?",
    phrases: ["how is xflyve deployed", "deployment setup", "where is it deployed", "hosting setup", "vercel render"],
    keywords: ["vercel frontend", "render backend", "mongodb atlas", "docker", "github actions"],
    answer:
      "The project is structured for a separated deployment: React/Vite frontend on Vercel, Express backend on Render, MongoDB Atlas for data, and Docker/GitHub Actions support in the repository.",
  },
  {
    id: "future-improvements",
    title: "Future Improvements",
    suggestedQuestion: "What would you build next?",
    phrases: ["what would you build next", "future improvements", "what next", "roadmap", "next features"],
    keywords: ["calendar views", "audit history", "reporting improvements", "better exports"],
    answer:
      "Good next steps would be richer reporting, calendar views, deeper audit history, improved exports, stronger search/filtering, and more visual operations dashboards. These are future improvements, not current production claims.",
  },
  {
    id: "limitations",
    title: "Project Limitations",
    suggestedQuestion: "What are the current limitations?",
    phrases: ["what are the current limitations", "project limitations", "current limitations", "what is not included", "what does it not do"],
    keywords: ["no payments", "no invoice generation", "no customer portal", "no payroll automation", "no real time tracking", "not multi tenant"],
    answer:
      "Current limitations: XFlyve checks invoice readiness but does not generate invoices, process payments, automate payroll, provide a customer portal, offer real-time GPS tracking, or operate as a multi-tenant SaaS product.",
  },
];

export const suggestedQuestions = assistantTopics.map((topic) => topic.suggestedQuestion);

const normalizedSuggestedQuestionToTopic = new Map(
  assistantTopics.map((topic) => [normalizeText(topic.suggestedQuestion), topic])
);

const availableTopics = assistantTopics.map((topic) => topic.title).join(", ");

export const fallbackAnswer =
  `I did not understand that demo question. I can answer about these topics: ${availableTopics}. Try one of the suggested questions below.`;

const countMatches = (normalizedQuestion, terms) =>
  terms.reduce((score, term) => {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return score;
    return normalizedQuestion.includes(normalizedTerm) ? score + 1 : score;
  }, 0);

const keywordScore = (normalizedQuestion, keywords) =>
  keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) return score;

    if (normalizedKeyword.includes(" ")) {
      return normalizedQuestion.includes(normalizedKeyword) ? score + 1 : score;
    }

    const tokenMatches = normalizedQuestion.split(" ").includes(normalizedKeyword);
    return tokenMatches ? score + 1 : score;
  }, 0);

export const getAssistantAnswer = (question) => {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion) return fallbackAnswer;

  const exactTopic = normalizedSuggestedQuestionToTopic.get(normalizedQuestion);
  if (exactTopic) return exactTopic.answer;

  const scoredTopics = assistantTopics
    .map((topic) => {
      const phraseMatches = countMatches(normalizedQuestion, topic.phrases);
      const keywordMatches = keywordScore(normalizedQuestion, topic.keywords);
      return {
        topic,
        phraseMatches,
        keywordMatches,
        score: phraseMatches * 3 + keywordMatches,
      };
    })
    .filter(({ score, phraseMatches, keywordMatches }) => (
      score >= 2 || phraseMatches > 0 || keywordMatches >= 2
    ))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.phraseMatches !== left.phraseMatches) return right.phraseMatches - left.phraseMatches;
      return right.keywordMatches - left.keywordMatches;
    });

  if (!scoredTopics.length) return fallbackAnswer;
  return scoredTopics[0].topic.answer;
};
