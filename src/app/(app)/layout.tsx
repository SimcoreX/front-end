"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { useHydrated } from "@/hooks/useHydrated";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { useAuthStore } from "@/stores/authStore";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { bootstrapped } = useAuthBootstrap();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userStatus = useAuthStore((state) => state.userStatus);
  const isInactiveUser = userStatus?.toUpperCase() === "INACTIVE";

  useEffect(() => {
    if (hydrated && bootstrapped && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hydrated, bootstrapped, isAuthenticated, router]);

  useEffect(() => {
    if (!hydrated || !bootstrapped || !isAuthenticated) return;
    if (!isInactiveUser) return;
    if (pathname === "/profile") return;
    router.replace("/profile?tab=subscription");
  }, [hydrated, bootstrapped, isAuthenticated, isInactiveUser, pathname, router]);

  if (!hydrated || !bootstrapped || !isAuthenticated || (isInactiveUser && pathname !== "/profile")) {
    return <div className="min-h-screen bg-primary-950" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-primary-950 text-white lg:flex-row">
      <Sidebar />
      <main className="flex-1 px-6 py-8 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
