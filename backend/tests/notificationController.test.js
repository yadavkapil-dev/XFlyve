const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const findChain = (result) => {
  const chain = {
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const loadController = () => {
  jest.resetModules();

  const Notification = {
    find: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
    updateMany: jest.fn(),
  };
  jest.doMock("../models/notification", () => Notification);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/notificationController"), Notification };
};

const VALID_USER_ID = "507f1f77bcf86cd799439011";
const OTHER_USER_ID = "507f1f77bcf86cd799439099";
const NOTIF_ID = "507f191e810c19729de860ea";

describe("GET /api/notifications (getNotifications) — pagination/filter, scoped to req.user", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults, scoped to the authenticated user", async () => {
    const { controller, Notification } = loadController();
    const chain = findChain([{ _id: NOTIF_ID }]);
    Notification.find.mockReturnValueOnce(chain);
    Notification.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getNotifications({ query: {}, user: { id: VALID_USER_ID } }, res);

    expect(Notification.find).toHaveBeenCalledWith({ recipient: VALID_USER_ID });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("populates relatedJobId with just the job's title, for the frontend's by-job grouping", async () => {
    const { controller, Notification } = loadController();
    const chain = findChain([]);
    Notification.find.mockReturnValueOnce(chain);
    Notification.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getNotifications({ query: {}, user: { id: VALID_USER_ID } }, res);

    expect(chain.populate).toHaveBeenCalledWith("relatedJobId", "title");
  });

  test("page 2 with a smaller limit paginates correctly", async () => {
    const { controller, Notification } = loadController();
    const chain = findChain([]);
    Notification.find.mockReturnValueOnce(chain);
    Notification.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getNotifications({ query: { page: "2", limit: "5" }, user: { id: VALID_USER_ID } }, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  test("unreadOnly=true filters to unread notifications", async () => {
    const { controller, Notification } = loadController();
    const chain = findChain([]);
    Notification.find.mockReturnValueOnce(chain);
    Notification.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getNotifications({ query: { unreadOnly: "true" }, user: { id: VALID_USER_ID } }, res);

    expect(Notification.find).toHaveBeenCalledWith({ recipient: VALID_USER_ID, read: false });
  });

  test("cannot be scoped to another user via the query string", async () => {
    const { controller, Notification } = loadController();
    const chain = findChain([]);
    Notification.find.mockReturnValueOnce(chain);
    Notification.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getNotifications(
      { query: { recipient: OTHER_USER_ID }, user: { id: VALID_USER_ID } },
      res
    );

    // recipient always comes from req.user, never from req.query.
    expect(Notification.find).toHaveBeenCalledWith({ recipient: VALID_USER_ID });
  });
});

describe("GET /api/notifications/unread-count (getUnreadCount)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns the unread count for the authenticated user only", async () => {
    const { controller, Notification } = loadController();
    Notification.countDocuments.mockResolvedValueOnce(3);

    const res = makeResponse();
    await controller.getUnreadCount({ user: { id: VALID_USER_ID } }, res);

    expect(Notification.countDocuments).toHaveBeenCalledWith({ recipient: VALID_USER_ID, read: false });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 3 } });
  });
});

describe("PUT /api/notifications/:id/read (markAsRead)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("marks the caller's own notification as read", async () => {
    const { controller, Notification } = loadController();
    const notification = { _id: NOTIF_ID, recipient: { toString: () => VALID_USER_ID }, read: false, save: jest.fn().mockResolvedValue(undefined) };
    Notification.findById.mockResolvedValueOnce(notification);

    const res = makeResponse();
    await controller.markAsRead({ params: { id: NOTIF_ID }, user: { id: VALID_USER_ID } }, res);

    expect(notification.read).toBe(true);
    expect(notification.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("is a no-op (no extra save) when already read", async () => {
    const { controller, Notification } = loadController();
    const notification = { _id: NOTIF_ID, recipient: { toString: () => VALID_USER_ID }, read: true, save: jest.fn() };
    Notification.findById.mockResolvedValueOnce(notification);

    const res = makeResponse();
    await controller.markAsRead({ params: { id: NOTIF_ID }, user: { id: VALID_USER_ID } }, res);

    expect(notification.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("wrong user cannot mark another user's notification as read (403)", async () => {
    const { controller, Notification } = loadController();
    const notification = { _id: NOTIF_ID, recipient: { toString: () => OTHER_USER_ID }, read: false, save: jest.fn() };
    Notification.findById.mockResolvedValueOnce(notification);

    const res = makeResponse();
    await controller.markAsRead({ params: { id: NOTIF_ID }, user: { id: VALID_USER_ID } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(notification.save).not.toHaveBeenCalled();
  });

  test("404 when the notification does not exist", async () => {
    const { controller, Notification } = loadController();
    Notification.findById.mockResolvedValueOnce(null);

    const res = makeResponse();
    await controller.markAsRead({ params: { id: NOTIF_ID }, user: { id: VALID_USER_ID } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("400 for a malformed id", async () => {
    const { controller, Notification } = loadController();

    const res = makeResponse();
    await controller.markAsRead({ params: { id: "not-an-id" }, user: { id: VALID_USER_ID } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Notification.findById).not.toHaveBeenCalled();
  });
});

describe("PUT /api/notifications/read-all (markAllAsRead)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("marks only the authenticated user's unread notifications as read", async () => {
    const { controller, Notification } = loadController();
    Notification.updateMany.mockResolvedValueOnce({ modifiedCount: 4 });

    const res = makeResponse();
    await controller.markAllAsRead({ user: { id: VALID_USER_ID } }, res);

    expect(Notification.updateMany).toHaveBeenCalledWith(
      { recipient: VALID_USER_ID, read: false },
      { $set: { read: true } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
