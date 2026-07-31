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

describe("NotificationBell — grouping by relatedJobId", () => {
  let markOneRead;
  let markAllRead;

  beforeEach(() => {
    markOneRead = vi.fn();
    markAllRead = vi.fn();
  });

  test("PASS: two notifications sharing a relatedJobId render under one job-title heading, not two separate entries", async () => {
    const notifications = [
      baseNotification({
        _id: "n2",
        title: "Job completed",
        message: "Kapil Yadav completed Britztanz.",
        relatedJobId: { _id: "job1", title: "Britztanz" },
      }),
      baseNotification({
        _id: "n1",
        title: "Job started",
        message: "Kapil Yadav started Britztanz.",
        relatedJobId: { _id: "job1", title: "Britztanz" },
      }),
    ];
    useNotifications.mockReturnValue({ notifications, unreadCount: 2, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (2 unread)"));

    // Exactly one "Britztanz" heading, with both notifications listed beneath it.
    expect(screen.getAllByText("Britztanz")).toHaveLength(1);
    expect(screen.getByText("Kapil Yadav completed Britztanz.")).toBeInTheDocument();
    expect(screen.getByText("Kapil Yadav started Britztanz.")).toBeInTheDocument();
  });

  test("PASS: the most recent job's group heading appears before an older job's group heading", async () => {
    const notifications = [
      baseNotification({ _id: "n2", relatedJobId: { _id: "job-new", title: "Newer Run" } }),
      baseNotification({ _id: "n1", relatedJobId: { _id: "job-old", title: "Older Run" } }),
    ];
    useNotifications.mockReturnValue({ notifications, unreadCount: 2, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (2 unread)"));

    const headings = screen.getAllByText(/Run$/).map((el) => el.textContent);
    expect(headings.indexOf("Newer Run")).toBeLessThan(headings.indexOf("Older Run"));
  });

  test("PASS: a notification with no relatedJobId renders individually, without a job heading", async () => {
    const notification = baseNotification({ relatedJobId: null });
    useNotifications.mockReturnValue({ notifications: [notification], unreadCount: 1, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (1 unread)"));

    expect(screen.getByText("Job assigned")).toBeInTheDocument();
    expect(screen.getByText("You have a new job")).toBeInTheDocument();
  });

  test("PASS: clicking a notification inside a job group still marks only that one read", async () => {
    const notifications = [
      baseNotification({ _id: "n2", title: "Job completed", relatedJobId: { _id: "job1", title: "Britztanz" } }),
      baseNotification({ _id: "n1", title: "Job started", read: true, relatedJobId: { _id: "job1", title: "Britztanz" } }),
    ];
    useNotifications.mockReturnValue({ notifications, unreadCount: 1, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (1 unread)"));
    await userEvent.click(screen.getByText("Job completed"));

    expect(markOneRead).toHaveBeenCalledWith("n2");
    expect(markOneRead).toHaveBeenCalledTimes(1);
  });

  test("PASS: mixed groups and standalone notifications render in their original recency order", async () => {
    const notifications = [
      baseNotification({ _id: "n3", title: "Standalone latest" }),
      baseNotification({ _id: "n2", title: "Grouped entry", relatedJobId: { _id: "job1", title: "Britztanz" } }),
      baseNotification({ _id: "n1", title: "Standalone oldest" }),
    ];
    useNotifications.mockReturnValue({ notifications, unreadCount: 3, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (3 unread)"));

    const allText = document.body.textContent;
    const latestIdx = allText.indexOf("Standalone latest");
    const groupIdx = allText.indexOf("Britztanz");
    const oldestIdx = allText.indexOf("Standalone oldest");
    expect(latestIdx).toBeLessThan(groupIdx);
    expect(groupIdx).toBeLessThan(oldestIdx);
  });
});

describe("NotificationBell — scroll container (regression: panel used to clip instead of scroll)", () => {
  test("PASS: the header/divider don't scroll, but the notification list is a flex-growing overflow-y:auto region", async () => {
    const markOneRead = vi.fn();
    const markAllRead = vi.fn();
    useNotifications.mockReturnValue({ notifications: [baseNotification()], unreadCount: 1, markOneRead, markAllRead });
    render(<NotificationBell />);

    await userEvent.click(screen.getByLabelText("Notifications (1 unread)"));

    const menu = document.querySelector("ul[role='menu']");
    const [header, divider, list] = Array.from(menu.children);

    // Regression guard for the "stuck panel" bug: the fix relies on the
    // header/divider staying fixed-size (flexGrow: 0) while only the list
    // region grows and scrolls (flexGrow: 1, overflowY: auto). If someone
    // reintroduces `overflow: hidden` on the outer Paper without this inner
    // scroll region, this is what would silently break.
    expect(getComputedStyle(header).flexGrow).toBe("0");
    expect(getComputedStyle(divider).flexGrow).toBe("0");
    expect(getComputedStyle(list).flexGrow).toBe("1");
    expect(getComputedStyle(list).overflowY).toBe("auto");
  });
});
