// Notification bell + unread count: NotificationBell has no state or API
// calls of its own — it only reads notifications/unreadCount/mark-read
// helpers from NotificationContext, so that hook is mocked directly rather
// than exercising the real socket/HTTP-backed provider.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "./NotificationBell";
import { useNotifications } from "../contexts/NotificationContext";

vi.mock("../contexts/NotificationContext", () => ({
  useNotifications: vi.fn(),
}));

const baseNotification = (overrides = {}) => ({
  _id: "n1",
  title: "Job assigned",
  message: "You have a new job",
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("NotificationBell — bell + unread count", () => {
  let markOneRead;
  let markAllRead;

  beforeEach(() => {
    markOneRead = vi.fn();
    markAllRead = vi.fn();
  });

  test("PASS: shows the unread count in the badge and its accessible label", () => {
    useNotifications.mockReturnValue({ notifications: [], unreadCount: 3, markOneRead, markAllRead });
    render(<NotificationBell />);

    expect(screen.getByLabelText("Notifications (3 unread)")).toBeInTheDocument();
  });

  test("PASS: the unread suffix disappears once the count is zero", () => {
    useNotifications.mockReturnValue({ notifications: [], unreadCount: 0, markOneRead, markAllRead });
    render(<NotificationBell />);

    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    expect(screen.queryByText(/unread\)/)).not.toBeInTheDocument();
  });

  test("PASS: opening the dropdown with no notifications shows the empty state", async () => {
    useNotifications.mockReturnValue({ notifications: [], unreadCount: 0, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications"));

    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });

  test("PASS: clicking an unread notification marks only that one read", async () => {
    const notification = baseNotification();
    useNotifications.mockReturnValue({ notifications: [notification], unreadCount: 1, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (1 unread)"));
    await userEvent.click(screen.getByText("Job assigned"));

    expect(markOneRead).toHaveBeenCalledWith("n1");
    expect(markOneRead).toHaveBeenCalledTimes(1);
  });

  test("PASS: clicking a notification that is already read does not call markOneRead again", async () => {
    const notification = baseNotification({ read: true });
    useNotifications.mockReturnValue({ notifications: [notification], unreadCount: 0, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications"));
    await userEvent.click(screen.getByText("Job assigned"));

    expect(markOneRead).not.toHaveBeenCalled();
  });

  test("PASS: 'Mark all read' is shown only when unreadCount > 0, and invokes markAllRead", async () => {
    useNotifications.mockReturnValue({
      notifications: [baseNotification()],
      unreadCount: 1,
      markOneRead,
      markAllRead,
    });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (1 unread)"));
    await userEvent.click(screen.getByText("Mark all read"));

    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  test("PASS: 'Mark all read' is absent once unreadCount is zero", async () => {
    useNotifications.mockReturnValue({
      notifications: [baseNotification({ read: true })],
      unreadCount: 0,
      markOneRead,
      markAllRead,
    });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications"));

    expect(screen.queryByText("Mark all read")).not.toBeInTheDocument();
  });
});
