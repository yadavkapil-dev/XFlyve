const loadService = () => {
  jest.resetModules();

  const Notification = { create: jest.fn() };
  const Driver = { find: jest.fn() };
  const emitToUser = jest.fn();

  jest.doMock("../models/notification", () => Notification);
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../sockets/socketServer", () => ({ emitToUser }));
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return {
    service: require("../services/notificationService"),
    Notification,
    Driver,
    emitToUser,
  };
};

const selectLean = (value) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) });

describe("notificationService.notifyUser", () => {
  afterEach(() => jest.restoreAllMocks());

  test("stores the notification and emits it to the recipient's room", async () => {
    const { service, Notification, emitToUser } = loadService();
    const created = { _id: "notif1", recipient: "driver1", toObject: () => ({ _id: "notif1", recipient: "driver1" }) };
    Notification.create.mockResolvedValueOnce(created);

    await service.notifyUser({
      recipient: "driver1",
      type: "pod_approved",
      title: "POD approved",
      message: "Your proof of delivery has been approved.",
      resourceType: "jobpod",
      resourceId: "pod1",
    });

    expect(Notification.create).toHaveBeenCalledWith({
      recipient: "driver1",
      type: "pod_approved",
      title: "POD approved",
      message: "Your proof of delivery has been approved.",
      resourceType: "jobpod",
      resourceId: "pod1",
    });
    expect(emitToUser).toHaveBeenCalledWith("driver1", "notification:new", { _id: "notif1", recipient: "driver1" });
  });

  test("a write failure is swallowed — never throws back to the caller", async () => {
    const { service, Notification, emitToUser } = loadService();
    Notification.create.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.notifyUser({
        recipient: "driver1",
        type: "pod_approved",
        title: "t",
        message: "m",
        resourceType: "jobpod",
        resourceId: "pod1",
      })
    ).resolves.toBeNull();
    expect(emitToUser).not.toHaveBeenCalled();
  });
});

describe("notificationService.notifyAdmins", () => {
  afterEach(() => jest.restoreAllMocks());

  test("creates and emits one notification per active admin", async () => {
    const { service, Notification, Driver, emitToUser } = loadService();
    Driver.find.mockReturnValueOnce(selectLean([{ _id: "admin1" }, { _id: "admin2" }]));
    Notification.create.mockImplementation((doc) =>
      Promise.resolve({ ...doc, _id: `notif-${doc.recipient}`, toObject: () => ({ ...doc, _id: `notif-${doc.recipient}` }) })
    );

    await service.notifyAdmins({
      type: "job_started",
      title: "Job started",
      message: "A job has been started.",
      resourceType: "job",
      resourceId: "job1",
    });

    expect(Driver.find).toHaveBeenCalledWith({ role: "admin", recordStatus: { $ne: "archived" } });
    expect(Notification.create).toHaveBeenCalledTimes(2);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ recipient: "admin1", type: "job_started" }));
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ recipient: "admin2", type: "job_started" }));
    expect(emitToUser).toHaveBeenCalledWith("admin1", "notification:new", expect.any(Object));
    expect(emitToUser).toHaveBeenCalledWith("admin2", "notification:new", expect.any(Object));
  });

  test("no admins found: does not throw, creates nothing", async () => {
    const { service, Notification, Driver } = loadService();
    Driver.find.mockReturnValueOnce(selectLean([]));

    await expect(
      service.notifyAdmins({ type: "job_started", title: "t", message: "m", resourceType: "job", resourceId: "job1" })
    ).resolves.toBeUndefined();
    expect(Notification.create).not.toHaveBeenCalled();
  });

  test("a Driver.find failure is swallowed — never throws back to the caller", async () => {
    const { service, Driver } = loadService();
    Driver.find.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    await expect(
      service.notifyAdmins({ type: "job_started", title: "t", message: "m", resourceType: "job", resourceId: "job1" })
    ).resolves.toBeUndefined();
  });
});
