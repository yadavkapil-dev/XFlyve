// Regression coverage for the exact bug fixed tonight: DemoAssistant used to
// render on every authenticated page too (`shouldShow = isPublicPath ||
// Boolean(user)`), not just the pre-login landing/login routes. It now
// depends ONLY on the current route — no AuthContext/user check at all — so
// these tests drive visibility purely via MemoryRouter's initialEntries.
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DemoAssistant from "./DemoAssistant";

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DemoAssistant />
    </MemoryRouter>
  );

describe("DemoAssistant — visibility is route-only, never auth-based", () => {
  test("PASS: renders on the public landing page (/)", () => {
    renderAt("/");
    expect(screen.getByText("Demo Assistant")).toBeInTheDocument();
  });

  test("PASS: renders on the login page (/login)", () => {
    renderAt("/login");
    expect(screen.getByText("Demo Assistant")).toBeInTheDocument();
  });

  test("PASS (regression): does NOT render on an authenticated admin page (/home)", () => {
    renderAt("/home");
    expect(screen.queryByText("Demo Assistant")).not.toBeInTheDocument();
  });

  test("PASS (regression): does NOT render on an authenticated admin page (/jobs)", () => {
    renderAt("/jobs");
    expect(screen.queryByText("Demo Assistant")).not.toBeInTheDocument();
  });

  test("PASS: does NOT render on an unrelated public route (/forgot-password)", () => {
    renderAt("/forgot-password");
    expect(screen.queryByText("Demo Assistant")).not.toBeInTheDocument();
  });

  test("PASS: a trailing slash on the login path still normalizes to a public route", () => {
    renderAt("/login/");
    expect(screen.getByText("Demo Assistant")).toBeInTheDocument();
  });
});
