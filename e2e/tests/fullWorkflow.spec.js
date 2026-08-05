// One strong end-to-end workflow, driven through the real UI against the
// real backend (see ../playwright.config.js's webServer entries and
// ../../backend/tests/e2e/start-e2e-backend.js for how both are booted
// against an isolated mongodb-memory-server instance and torn down after).
//
// Screen-to-screen transitions use page.goto() directly rather than
// clicking Navbar links — the Navbar renders a second, hidden copy of the
// same nav items for its mobile drawer, and clicking through it for every
// transition adds selector fragility that has nothing to do with the
// actual workflow under test. Every business action (login, create job,
// start/complete job, upload POD, approve POD) is a real UI interaction.
const { test, expect } = require("@playwright/test");
const { PASSWORD } = require("../../backend/tests/integration/factories");

const ADMIN_EMAIL = "e2e-admin@example.com";
const DRIVER_EMAIL = "e2e-driver@example.com";
const DRIVER_NAME = "E2E Driver";
const TRUCK_NUMBER = "E2E-TRUCK-1";
const JOB_TITLE = "E2E Full Workflow Run";

const login = async (page, email) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test("admin creates a job through to invoicing readiness, with the driver completing it in real time", async ({
  browser,
}) => {
  test.setTimeout(90_000);

  const adminContext = await browser.newContext();
  const driverContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const driverPage = await driverContext.newPage();

  await test.step("Admin login", async () => {
    await login(adminPage, ADMIN_EMAIL);
    await expect(adminPage).toHaveURL(/\/home$/);
  });

  await test.step("Driver login (socket connects here, ahead of the job being created)", async () => {
    await login(driverPage, DRIVER_EMAIL);
    await expect(driverPage).toHaveURL(/\/driver-home$/);
  });

  await test.step("Admin creates and assigns a job", async () => {
    await adminPage.goto("/jobs/create");

    await adminPage.getByLabel("Run Title").fill(JOB_TITLE);
    await adminPage.getByLabel("Run Description").fill("Full E2E workflow coverage run.");
    await adminPage.getByLabel("Pickup Location").fill("Warehouse A");
    await adminPage.getByLabel("Delivery Location").fill("Customer B");

    await adminPage.getByLabel("Assigned Driver").click();
    await adminPage.getByRole("option", { name: new RegExp(DRIVER_NAME) }).click();

    await adminPage.getByLabel("Select Truck").click();
    await adminPage.getByRole("option", { name: new RegExp(TRUCK_NUMBER) }).click();

    // Local date parts, not toISOString() (UTC) — CreateJob's own "past date"
    // check uses dayjs(), which reads the local system clock, and this test
    // runs in a timezone ahead of UTC where the two can disagree on "today".
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    await adminPage.getByLabel("Run Date").fill(today);
    await adminPage.getByLabel("Start Time").fill("08:00");

    await adminPage.getByLabel("Run Type").click();
    await adminPage.getByRole("option", { name: "Local" }).click();

    await adminPage.getByRole("button", { name: "Create Run" }).click();
    await expect(adminPage.getByText("Run created successfully.")).toBeVisible();
  });

  await test.step("Driver receives the live notification (real Socket.IO push, no reload)", async () => {
    const bell = driverPage.getByLabel(/Notifications \(1 unread\)/);
    await expect(bell).toBeVisible({ timeout: 15_000 });
    await bell.click();
    await expect(driverPage.getByText("New job assigned")).toBeVisible();
    await driverPage.keyboard.press("Escape");
  });

  await test.step("Driver starts the job", async () => {
    await driverPage.goto("/driver/jobs");
    await expect(driverPage.getByText(JOB_TITLE)).toBeVisible();

    await driverPage.getByRole("button", { name: "Start Job" }).click();
    await expect(driverPage.getByText("In progress")).toBeVisible();
  });

  await test.step("Driver completes the job", async () => {
    await driverPage.getByRole("button", { name: "Complete Job" }).click();
    await expect(driverPage.getByRole("button", { name: "Upload POD" })).toBeVisible();
  });

  await test.step("Driver uploads the POD", async () => {
    await driverPage.getByRole("button", { name: "Upload POD" }).click();
    await expect(driverPage).toHaveURL(/\/driver\/pods\/upload\//);

    await driverPage.locator('input[type="file"]').setInputFiles({
      name: "pod.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake e2e pod content"),
    });
    await driverPage.getByRole("button", { name: "Upload POD" }).click();
    await expect(driverPage.getByText("Pending approval")).toBeVisible();
  });

  await test.step("Admin reviews the POD", async () => {
    await adminPage.goto("/pods");
    await expect(adminPage.getByText(`Job: ${JOB_TITLE}`)).toBeVisible();
  });

  await test.step("Admin approves the POD", async () => {
    await adminPage.getByRole("button", { name: "Approve" }).first().click();
    await expect(adminPage.getByText("POD approved.")).toBeVisible();
    await expect(adminPage.getByText("No PODs waiting for approval.")).toBeVisible();
  });

  await test.step("Verify invoice readiness", async () => {
    await adminPage.goto("/invoicing");
    await expect(adminPage.getByText("Ready to invoice").first()).toBeVisible();
    await expect(adminPage.getByText(JOB_TITLE)).toBeVisible({ timeout: 10_000 });
  });

  await test.step("Verify activity timeline", async () => {
    await adminPage.goto("/jobs");
    // Scoped to this test's own job card, not just the first "Edit" button
    // on the page — accessibility.spec.js seeds other jobs into this same
    // shared backend instance (see playwright.config.js's single webServer),
    // including one deliberately left incomplete, so ".first()" is not
    // reliably this test's own job once more than one job exists.
    const jobCard = adminPage.getByTestId(`job-card-${JOB_TITLE}`);
    await jobCard.getByRole("button", { name: "Edit" }).click();

    await expect(adminPage.getByText("Activity Timeline")).toBeVisible();
    await expect(adminPage.getByText(/created this job/)).toBeVisible();
    await expect(adminPage.getByText(/assigned this job/)).toBeVisible();
    await expect(adminPage.getByText(/started this job/)).toBeVisible();
    await expect(adminPage.getByText(/completed this job/)).toBeVisible();
    await expect(adminPage.getByText(/submitted a proof of delivery/)).toBeVisible();
    await expect(adminPage.getByText(/approved a proof of delivery/)).toBeVisible();
  });

  await adminContext.close();
  await driverContext.close();
});
