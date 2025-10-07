"use client";

import { SessionProvider } from "next-auth/react";
import { TanstackQueryProvider } from "@/app/query-provider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TanstackQueryProvider>
        <NuqsAdapter>
          {children}
          <Toaster position="top-center" />
        </NuqsAdapter>
      </TanstackQueryProvider>
    </SessionProvider>
  );
}
