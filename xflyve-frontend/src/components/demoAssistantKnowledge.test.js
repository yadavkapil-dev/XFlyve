// Coverage for the demo assistant's canned-answer content, updated tonight
// to stop describing removed features (Work Diary/Work Log approval) as if
// they still existed, and to add the two topics that were previously
// undocumented entirely (Work Diary's interstate-only rule, Notifications).
import { describe, test, expect } from "vitest";
import {
  assistantTopics,
  suggestedQuestions,
  getAssistantAnswer,
  fallbackAnswer,
} from "./demoAssistantKnowledge";

describe("demoAssistantKnowledge — no stale claims about removed approval workflows", () => {
  test("PASS (regression): admin-features no longer claims diary/work-log approval", () => {
    const answer = getAssistantAnswer("What can an admin do?");

    expect(answer).not.toMatch(/approve or reject work diaries/i);
    expect(answer).not.toMatch(/approve or reject.*daily work records/i);
    expect(answer).toMatch(/monitor driver-submitted work diaries and daily work logs/i);
    expect(answer).toMatch(/approve or reject PODs/i);
  });

  test("PASS (regression): driver-features scopes 'approval status' to PODs only, not every submission", () => {
    const answer = getAssistantAnswer("What can a driver do?");

    expect(answer).toMatch(/upload PODs and track their approval status/i);
    expect(answer).not.toMatch(/review approval status for their submissions/i);
  });

  test("PASS (regression): future-improvements no longer lists notifications as unbuilt", () => {
    const answer = getAssistantAnswer("What would you build next?");

    expect(answer.toLowerCase()).not.toContain("notification");
  });
});

describe("demoAssistantKnowledge — new topics added tonight", () => {
  test("PASS: Work Diary Workflow topic states the interstate-only rule and no-approval behavior", () => {
    const answer = getAssistantAnswer("How does the work diary work?");

    expect(answer).toMatch(/only for interstate jobs/i);
    expect(answer).toMatch(/no approval workflow/i);
    expect(answer).toMatch(/archived \(ex-\)drivers/i);
  });

  test("PASS: Notifications topic covers both admin- and driver-facing notifications", () => {
    const answer = getAssistantAnswer("How do notifications work?");

    expect(answer).toMatch(/Admins are notified when a driver submits/i);
    expect(answer).toMatch(/Drivers are notified when they're assigned/i);
  });

  test("PASS: both new topics are exposed as suggested questions", () => {
    expect(suggestedQuestions).toContain("How does the work diary work?");
    expect(suggestedQuestions).toContain("How do notifications work?");
  });

  test("PASS: fuzzy phrase match (not an exact suggested question) still routes to Work Diary Workflow", () => {
    const answer = getAssistantAnswer("Explain the nhvr work diary process");

    expect(answer).toBe(
      assistantTopics.find((t) => t.id === "work-diary-workflow").answer
    );
  });

  test("PASS: fuzzy phrase match still routes to Notifications", () => {
    const answer = getAssistantAnswer("How does the notification bell work?");

    expect(answer).toBe(
      assistantTopics.find((t) => t.id === "notifications").answer
    );
  });
});

describe("demoAssistantKnowledge — POD approval is still accurately described (not removed, unlike Diary/Log)", () => {
  test("PASS: POD workflow still describes a real approve/reject step", () => {
    const answer = getAssistantAnswer("How does POD approval work?");

    expect(answer).toMatch(/admins can approve or reject the POD/i);
  });
});

describe("demoAssistantKnowledge — fallback behavior", () => {
  test("PASS: unrecognised input returns the fallback answer", () => {
    expect(getAssistantAnswer("asdkjqwoiuerqwoiuzxcv")).toBe(fallbackAnswer);
  });

  test("PASS: empty input returns the fallback answer", () => {
    expect(getAssistantAnswer("")).toBe(fallbackAnswer);
  });

  test("PASS: fallback answer lists every topic title, including the two added tonight", () => {
    expect(fallbackAnswer).toContain("Work Diary Workflow");
    expect(fallbackAnswer).toContain("Notifications");
  });
});
