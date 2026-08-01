// AiAssistant had zero test coverage before tonight's left-to-right
// position move. The exact pixel position (a CSS `sx` value) isn't
// meaningfully assertable through jsdom, and was already verified visually
// via a real-browser screenshot — this file instead covers the genuinely
// untested behavior: it must never render for a logged-out visitor (it
// hits a real, rate-limited AI backend), it renders for an authenticated
// user, and the send flow round-trips through the api module correctly.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AiAssistant from "./AiAssistant";
import { useAuth } from "../contexts/AuthContext";
import { sendAiChatMessage } from "../api";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api", () => ({
  sendAiChatMessage: vi.fn(),
}));

describe("AiAssistant — authenticated-only, real assistant (not the pre-login demo one)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("PASS: renders nothing at all for a logged-out visitor", () => {
    useAuth.mockReturnValue({ user: null });
    const { container } = render(<AiAssistant />);

    expect(container).toBeEmptyDOMElement();
  });

  test("PASS: renders the launcher button for an authenticated admin", () => {
    useAuth.mockReturnValue({ user: { role: "admin", name: "Admin User" } });
    render(<AiAssistant />);

    expect(screen.getByText("XFlyve Assistant")).toBeInTheDocument();
  });

  test("PASS: admin suggestions differ from driver suggestions", async () => {
    useAuth.mockReturnValue({ user: { role: "admin", name: "Admin User" } });
    render(<AiAssistant />);
    await userEvent.click(screen.getByText("XFlyve Assistant"));

    expect(screen.getByText("Show pending PODs")).toBeInTheDocument();
    expect(screen.queryByText("What are my jobs today?")).not.toBeInTheDocument();
  });

  test("PASS: driver suggestions do not include admin-only questions", async () => {
    useAuth.mockReturnValue({ user: { role: "driver", name: "Test Driver" } });
    render(<AiAssistant />);
    await userEvent.click(screen.getByText("XFlyve Assistant"));

    expect(screen.getByText("What are my jobs today?")).toBeInTheDocument();
    expect(screen.queryByText("Show pending PODs")).not.toBeInTheDocument();
  });

  test("PASS: asking a question sends it through the api module and renders the real reply", async () => {
    useAuth.mockReturnValue({ user: { role: "admin", name: "Admin User" } });
    sendAiChatMessage.mockResolvedValue({ data: { data: { reply: "You have 3 jobs today." } } });
    render(<AiAssistant />);
    await userEvent.click(screen.getByText("XFlyve Assistant"));

    await userEvent.type(screen.getByPlaceholderText("Ask the assistant..."), "What's today's operations summary?");
    await userEvent.click(screen.getByRole("button", { name: "send assistant question" }));

    expect(sendAiChatMessage).toHaveBeenCalledWith("What's today's operations summary?");
    expect(await screen.findByText("You have 3 jobs today.")).toBeInTheDocument();
  });

  test("PASS: a failed request shows the graceful fallback message instead of nothing", async () => {
    useAuth.mockReturnValue({ user: { role: "admin", name: "Admin User" } });
    sendAiChatMessage.mockRejectedValue(new Error("network error"));
    render(<AiAssistant />);
    await userEvent.click(screen.getByText("XFlyve Assistant"));

    await userEvent.type(screen.getByPlaceholderText("Ask the assistant..."), "Any rejected documents?");
    await userEvent.click(screen.getByRole("button", { name: "send assistant question" }));

    expect(await screen.findByText(/couldn't reach the assistant/i)).toBeInTheDocument();
  });
});
