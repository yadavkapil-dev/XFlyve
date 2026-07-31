/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from "react";
import { getProfile } from "../api";

export const AuthContext = createContext();

const normalizeUser = (userData) => {
  if (!userData) return null;

  const id = userData.id || userData._id || "";

  return {
    id,
    _id: userData._id || id,
    name: userData.name || "",
    role: userData.role || "",
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getProfile();
        const normalizedUser = normalizeUser(res.data.data);
        setUser(normalizedUser);
        localStorage.setItem("user", JSON.stringify(normalizedUser));
      } catch {
        setUser(null);
        setToken(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [token]);

  const loginUser = (userData, token) => {
    const normalizedUser = normalizeUser(userData);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(normalizedUser));
    setToken(token);
    setUser(normalizedUser);
  };

  const logoutUser = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  // Include token in context value
  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logoutUser, token }}>
      {children}
    </AuthContext.Provider>
  );
};

// Export useAuth hook properly
export const useAuth = () => useContext(AuthContext);
