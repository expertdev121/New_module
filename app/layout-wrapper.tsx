"use client";

import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { CurrentBreadcrumb } from "@/components/current-page";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  // Show loading state to prevent flash of wrong layout
  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Admin layout with sidebar
  if (session?.user?.role === "admin") {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 p-8 overflow-y-auto">
          <CurrentBreadcrumb />
          {children}
        </main>
      </div>
    );
  }

  // Default layout for non-admin users
  return (
    <main className="container mx-auto py-8 max-w-7xl">
      <CurrentBreadcrumb />
      {children}
    </main>
  );
}