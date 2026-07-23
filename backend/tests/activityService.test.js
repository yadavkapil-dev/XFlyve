const loadService = () => {
  jest.resetModules();

  const Activity = { create: jest.fn() };
  const getRequestId = jest.fn();

  jest.doMock("../models/activity", () => Activity);
  jest.doMock("../utils/requestContext", () => ({ getRequestId }));
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return { service: require("../services/activityService"), Activity, getRequestId };
};

describe("activityService.logActivity", () => {
  afterEach(() => jest.restoreAllMocks());

  test("writes an activity record with all provided fields", async () => {
    const { service, Activity, getRequestId } = loadService();
    getRequestId.mockReturnValueOnce("req-abc-123");
    Activity.create.mockResolvedValueOnce({ _id: "activity-1" });

    await service.logActivity({
      actorId: "driver-1",
      actorRole: "driver",
      action: "POD_SUBMITTED",
      resourceType: "jobpod",
      resourceId: "pod-1",
      relatedJobId: "job-1",
      before: null,
      after: { status: "pending" },
      metadata: { note: "extra" },
    });

    expect(Activity.create).toHaveBeenCalledWith({
      actorId: "driver-1",
      actorRole: "driver",
      action: "POD_SUBMITTED",
      resourceType: "jobpod",
      resourceId: "pod-1",
      relatedJobId: "job-1",
      before: null,
      after: { status: "pending" },
      metadata: { note: "extra" },
      requestId: "req-abc-123",
    });
  });

  test("populates requestId from the current async-local request context (Phase 2 correlation ID)", async () => {
    const { service, Activity, getRequestId } = loadService();
    getRequestId.mockReturnValueOnce("correlation-xyz");
    Activity.create.mockResolvedValueOnce({});

    await service.logActivity({
      actorId: "admin-1",
      actorRole: "admin",
      action: "JOB_CREATED",
      resourceType: "job",
      resourceId: "job-1",
    });

    expect(Activity.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: "correlation-xyz" }));
  });

  test("falls back to null requestId when no request context is active", async () => {
    const { service, Activity, getRequestId } = loadService();
    getRequestId.mockReturnValueOnce(undefined);
    Activity.create.mockResolvedValueOnce({});

    await service.logActivity({
      actorId: "admin-1",
      actorRole: "admin",
      action: "JOB_CREATED",
      resourceType: "job",
      resourceId: "job-1",
    });

    expect(Activity.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: null }));
  });

  test("defaults relatedJobId/before/after/metadata to null when omitted", async () => {
    const { service, Activity } = loadService();
    Activity.create.mockResolvedValueOnce({});

    await service.logActivity({
      actorId: "admin-1",
      actorRole: "admin",
      action: "JOB_CREATED",
      resourceType: "job",
      resourceId: "job-1",
    });

    expect(Activity.create).toHaveBeenCalledWith(
      expect.objectContaining({ relatedJobId: null, before: null, after: null, metadata: null })
    );
  });

  test("a write failure is swallowed — never throws back to the caller (matches notificationService's contract)", async () => {
    const { service, Activity } = loadService();
    Activity.create.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.logActivity({
        actorId: "admin-1",
        actorRole: "admin",
        action: "JOB_CREATED",
        resourceType: "job",
        resourceId: "job-1",
      })
    ).resolves.toBeUndefined();
  });
});
