/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../api";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../api";
import { useAuth } from "./AuthContext";

export const NotificationContext = createContext();

const NOTIFICATION_EVENT = "notification:new";

export const NotificationProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // The most recently received real-time event, exposed separately from
  // `notifications` (which also gets populated by the REST fetch on mount)
  // so a page can useEffect on "a live event just arrived" without also
  // firing on that unrelated initial REST load. Pages that need to react
  // to a specific event type (e.g. "pod_approved") watch this value via
  // useNotifications() and re-run their own existing fetch function —
  // see driver/UploadPod.jsx, driver/WorkDiary.jsx, driver/WorkLogs.jsx,
  // driver/Jobs.jsx.
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);

  const fetchNotifications = useCallback(async (params) => {
    try {
      const res = await getNotifications(params);
      setNotifications(res.data.data || []);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadNotificationCount();
      setUnreadCount(res.data.data?.count ?? 0);
    } catch {
      // Leave the previous count in place — a transient failure here
      // shouldn't flash the badge to zero.
    }
  }, []);

  // One socket per logged-in user — created when a token appears, torn down
  // (removing all listeners and disconnecting) when the token disappears or
  // changes, so reconnects/logouts never leave a duplicate listener or a
  // leaked connection behind.
  useEffect(() => {
    if (!user || !token) {
      setNotifications([]);
      setUnreadCount(0);
      setLastEvent(null);
      return undefined;
    }

    refreshUnreadCount();
    fetchNotifications({ limit: 20 });

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on(NOTIFICATION_EVENT, (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
      setLastEvent(notification);
    });

    // Reconnects reuse this same socket/listener — re-sync state once the
    // connection (and therefore auth) is re-established, in case anything
    // happened while offline.
    socket.on("connect", () => {
      refreshUnreadCount();
    });

    return () => {
      socket.off(NOTIFICATION_EVENT);
      socket.off("connect");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token, fetchNotifications, refreshUnreadCount]);

  const markOneRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(prev - 1, 0));
    try {
      await markNotificationRead(id);
    } catch {
      // Best-effort optimistic update; a background refresh will correct
      // the count/list if this particular request failed.
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        fetchNotifications,
        markOneRead,
        markAllRead,
        lastEvent,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
