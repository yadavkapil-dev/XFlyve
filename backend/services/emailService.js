const { Resend } = require("resend");
const logger = require("../utils/logger");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// The SDK's own internal error logging (this.logError -> console.error)
// bypasses our logger entirely and fires whenever NODE_ENV !== "production"
// — and the raw API error it prints can echo the recipient's address back
// (e.g. Resend's sandbox-mode "you can only send testing emails to your own
// verified address" style messages). There's no supported constructor
// option for this (checked the installed SDK source directly — only
// baseUrl/userAgent are configurable), so this shadows the instance method
// with a no-op. Scoped to this one owned instance only, no global/env
// mutation. If a future SDK version renames/restructures logError, this
// silently stops taking effect (their default noisy behavior returns)
// rather than breaking anything — we don't depend on it for correctness,
// only for suppressing this specific info leak.
if (resend) {
  resend.logError = () => {};
}

// onboarding@resend.dev is Resend's built-in sandbox sender — works with no
// domain verification, fine until a real verified sending domain is set up.
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "XFlyve <onboarding@resend.dev>";

// resend.emails.send() resolves with { data, error } rather than rejecting
// on API-level failures (invalid recipient, sandbox restrictions, rate
// limits) — a thrown/rejected error only happens for lower-level failures
// (network, DNS). Every send below checks both. Deliberately never logs
// `.message` from either shape: a thrown network error's message is safe
// (describes the connection failure, e.g. "fetch failed"), but a resolved
// API error's message is the same field that can echo the recipient's
// email in sandbox-restriction responses — rather than trust that
// distinction differently in every call site, one rule is applied
// everywhere: only ever log structured, non-free-text fields.
const describeSendFailure = (err) => ({
  name: err?.name,
  statusCode: err?.statusCode,
  code: err?.code,
});

const logSendResult = (label, result) => {
  if (result?.error) {
    logger.error(`Failed to send ${label} email: %o`, describeSendFailure(result.error));
  }
};

const logSendError = (label, err) => {
  logger.error(`Failed to send ${label} email: %o`, describeSendFailure(err));
};

// Deliberately not async/awaited by callers: a forgot-password response
// must not hang on a slow or down email provider. Resolution/failure is
// logged here, never thrown back to the request that triggered it. Never
// logs the reset URL or token — only that a send was attempted/failed.
const sendPasswordResetEmail = (to, resetUrl) => {
  if (!resend) {
    logger.warn("RESEND_API_KEY not configured — skipping password reset email send.");
    return;
  }

  resend.emails
    .send({
      from: FROM_ADDRESS,
      to,
      subject: "Reset your XFlyve password",
      html: `
        <p>We received a request to reset the password for your XFlyve account.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email.</p>
      `,
    })
    .then((result) => logSendResult("password reset", result))
    .catch((err) => logSendError("password reset", err));
};

// Same fire-and-forget contract as sendPasswordResetEmail above. Job
// title/pickupLocation/deliveryLocation are already HTML-entity-escaped by
// createJobValidator's .escape() at write time, so they're safe to embed
// directly here — same trust boundary the rest of the app already relies on.
const sendJobAssignedEmail = (to, job) => {
  if (!resend) {
    logger.warn("RESEND_API_KEY not configured — skipping job assigned email send.");
    return;
  }

  const jobsUrl = `${process.env.FRONTEND_URL}/driver/jobs`;

  resend.emails
    .send({
      from: FROM_ADDRESS,
      to,
      subject: "New job assigned",
      html: `
        <p>You've been assigned a new job: <strong>${job.title}</strong>.</p>
        <p>${job.pickupLocation} &rarr; ${job.deliveryLocation}</p>
        <p><a href="${jobsUrl}">View it in XFlyve</a></p>
      `,
    })
    .then((result) => logSendResult("job assigned", result))
    .catch((err) => logSendError("job assigned", err));
};

// Unlike job title/locations above, rejectionReason is free-text admin
// input with no .escape() applied at write time (see jobPodValidator etc.),
// so it's escaped here before going into HTML.
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
  );

const DOCUMENT_LABELS = {
  pod: "proof of delivery",
  diary: "work diary",
  worklog: "work log",
};

// Same fire-and-forget contract as sendPasswordResetEmail above.
const sendDocumentRejectedEmail = (to, { documentType, reason }) => {
  if (!resend) {
    logger.warn("RESEND_API_KEY not configured — skipping document rejected email send.");
    return;
  }

  const label = DOCUMENT_LABELS[documentType] || "document";

  resend.emails
    .send({
      from: FROM_ADDRESS,
      to,
      subject: `Your ${label} was rejected`,
      html: `
        <p>Your ${label} was rejected${reason ? `: ${escapeHtml(reason)}` : "."}</p>
        <p><a href="${process.env.FRONTEND_URL}">Open XFlyve</a></p>
      `,
    })
    .then((result) => logSendResult("document rejected", result))
    .catch((err) => logSendError("document rejected", err));
};

module.exports = { sendPasswordResetEmail, sendJobAssignedEmail, sendDocumentRejectedEmail };
