// Role-protected UI: PrivateRoute is the sole gate between a route and its
// content. useAuth is mocked here since PrivateRoute's entire branching logic
// is driven by { user, loading } — the real AuthContext's own fetch-on-mount
// behavior isn't this component's concern to re-test.
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";
import { useAuth } from "../contexts/AuthContext";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const renderProtected = (allowedRoles) =>
  render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Home page</div>} />
        <Route element={<PrivateRoute allowedRoles={allowedRoles} />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("PrivateRoute — role-protected UI", () => {
  test("PASS: shows a loading state while auth is resolving, not the protected content or a redirect", () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    renderProtected([]);

    expect(screen.getByText(/loading workspace/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  test("PASS: redirects to /login when there is no authenticated user", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderProtected([]);

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  test("PASS: redirects to / when the user's role is not in allowedRoles", () => {
    useAuth.mockReturnValue({ user: { role: "driver" }, loading: false });
    renderProtected(["admin"]);

    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  test("PASS: renders the protected content when the user's role is allowed", () => {
    useAuth.mockReturnValue({ user: { role: "admin" }, loading: false });
    renderProtected(["admin"]);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  test("PASS: renders the protected content for any authenticated user when allowedRoles is empty", () => {
    useAuth.mockReturnValue({ user: { role: "driver" }, loading: false });
    renderProtected([]);

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});
