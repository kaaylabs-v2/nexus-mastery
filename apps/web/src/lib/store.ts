import { create } from "zustand";
import { type AuthUser, USE_MOCK, MOCK_LEARNER } from "./auth";

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  login: (role?: "learner" | "org_admin") => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: USE_MOCK ? MOCK_LEARNER : null,
  isAuthenticated: USE_MOCK,
  isLoading: false,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  login: (role = "learner") => {
    if (USE_MOCK) {
      const { MOCK_LEARNER, MOCK_ADMIN } = require("./auth");
      set({
        user: role === "org_admin" ? MOCK_ADMIN : MOCK_LEARNER,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      window.location.href = "/api/auth/login";
    }
  },
  logout: () => {
    if (USE_MOCK) {
      set({ user: null, isAuthenticated: false });
    } else {
      window.location.href = "/api/auth/logout";
    }
  },
}));

// Connection state for WebSocket
interface ConnectionState {
  isConnected: boolean;
  isStreaming: boolean;
  setConnected: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  isStreaming: false,
  setConnected: (v) => set({ isConnected: v }),
  setStreaming: (v) => set({ isStreaming: v }),
}));
