// Regression coverage for the landing-page copy audit done tonight. The
// "ready to pay or invoice" overclaim (implying the app calculates pay or
// generates invoices, when it actually only surfaces which jobs are ready
// for a human to act on) was fixed once, then reappeared and had to be
// fixed a second time — so this guards against a third recurrence, plus
// checks the new AI Assistant feature card exists.
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";

const renderLandingPage = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );

describe("LandingPage — payroll/invoice copy accuracy (regression)", () => {
  test("PASS: renders without crashing", () => {
    renderLandingPage();
    expect(screen.getByText("Run your transport operations from one calm dashboard.")).toBeInTheDocument();
  });

  test("PASS (regression): the page text nowhere claims the app calculates pay or 'is ready to pay'", () => {
    renderLandingPage();
    const bodyText = document.body.textContent;

    expect(bodyText).not.toMatch(/ready to pay or invoice/i);
    expect(bodyText).not.toMatch(/ready for weekly pay and invoicing/i);
    expect(bodyText).not.toMatch(/payroll preparation/i);
    expect(bodyText).not.toMatch(/prepare\s+(the\s+)?(weekly\s+driver\s+)?(pay\s+data\s+and\s+)?invoices\b/i);
  });

  test("PASS: hero subheadline says jobs are ready to invoice, not ready to pay", () => {
    renderLandingPage();

    expect(
      screen.getByText(/compliance documents, and which jobs are ready to invoice/i)
    ).toBeInTheDocument();
  });

  test("PASS: WhyChooseUs bullet separates invoice-readiness from pay-data aggregation", () => {
    renderLandingPage();

    expect(
      screen.getByText(/See which jobs are ready to invoice, and pull together each driver's hours and deliveries for weekly pay/i)
    ).toBeInTheDocument();
  });

  test("PASS: Pay-ready records card explicitly states the app does not calculate or process payroll", () => {
    renderLandingPage();

    expect(screen.getByText(/the app doesn't calculate or process payroll/i)).toBeInTheDocument();
  });

  test("PASS: Invoice readiness card ties readiness to an approved POD specifically", () => {
    renderLandingPage();

    expect(screen.getByText(/have an approved POD and are ready for invoice preparation/i)).toBeInTheDocument();
  });
});

describe("LandingPage — features added/corrected in tonight's accuracy audit", () => {
  test("PASS: the AI Assistant feature card is present (previously missing entirely)", () => {
    renderLandingPage();

    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByText(/same access rules as the rest of the app/i)).toBeInTheDocument();
  });

  test("PASS: POD records card states admins approve or reject it", () => {
    renderLandingPage();

    expect(screen.getByText(/admins approve or reject it/i)).toBeInTheDocument();
  });

  test("PASS: Compliance records card states the interstate-only rule for work diaries", () => {
    renderLandingPage();

    expect(screen.getByText(/NHVR work diary uploads for interstate jobs/i)).toBeInTheDocument();
  });
});
