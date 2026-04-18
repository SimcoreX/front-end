"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthSessionResponse, AuthUser } from "@/lib/types/auth";

type AuthState = {
  isAuthenticated: boolean;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  userPlan: string | null;
  userStatus: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionExpiresAt: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  login: (session: AuthSessionResponse) => void;
  setSession: (session: AuthSessionResponse) => void;
  setUser: (user: AuthUser) => void;
  setHydrated: (value: boolean) => void;
  logout: () => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      userEmail: null,
      userName: null,
      userRole: null,
      userPlan: null,
      userStatus: null,
      accessToken: null,
      refreshToken: null,
      sessionExpiresAt: null,
      user: null,
      hydrated: false,
      login: (session) =>
        set({
          isAuthenticated: true,
          userEmail: session.user?.email ?? null,
          userName: session.user?.name ?? null,
          userRole: session.user?.role ?? null,
          userPlan: session.user?.plan ?? null,
          userStatus: session.user?.status ?? null,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken ?? null,
          sessionExpiresAt: session.sessionExpiresAt,
          user: session.user ?? null,
        }),
      setSession: (session) =>
        set((state) => ({
          isAuthenticated: true,
          userEmail: session.user?.email ?? state.userEmail,
          userName: session.user?.name ?? state.userName,
          userRole: session.user?.role ?? state.userRole,
          userPlan: session.user?.plan ?? state.userPlan,
          userStatus: session.user?.status ?? state.userStatus,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken ?? null,
          sessionExpiresAt: session.sessionExpiresAt,
          user: session.user ?? state.user,
        })),
      setUser: (user) =>
        set({
          user,
          userEmail: user.email,
          userName: user.name,
          userRole: user.role,
          userPlan: user.plan,
          userStatus: user.status,
          isAuthenticated: true,
        }),
      setHydrated: (value) => set({ hydrated: value }),
      logout: () =>
        set({
          isAuthenticated: false,
          userEmail: null,
          userName: null,
          userRole: null,
          userPlan: null,
          userStatus: null,
          accessToken: null,
          refreshToken: null,
          sessionExpiresAt: null,
          user: null,
        }),
      clearSession: () =>
        set({
          isAuthenticated: false,
          userEmail: null,
          userName: null,
          userRole: null,
          userPlan: null,
          userStatus: null,
          accessToken: null,
          refreshToken: null,
          sessionExpiresAt: null,
          user: null,
        }),
    }),
    {
      name: "simcorex-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        userEmail: state.userEmail,
        userName: state.userName,
        userRole: state.userRole,
        userPlan: state.userPlan,
        userStatus: state.userStatus,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        sessionExpiresAt: state.sessionExpiresAt,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
