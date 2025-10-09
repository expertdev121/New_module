"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import ContactsTable from "@/components/contacts/contacts-table";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/dashboard/sidebar";

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return; // Still loading
    if (!session) {
      // Not authenticated, but we'll show the login button instead of redirecting
    }
  }, [session, status]);

  if (status === "loading") {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!session) {
    return (
      <main className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Contacts</h1>
          <p className="mb-4">You need to be logged in to view contacts.</p>
          <Button onClick={() => router.push("/auth/login")}>
            Login
          </Button>
        </div>
      </main>
    );
  }

  const isAdmin = session.user.role === "admin";

  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-bold mb-6">Contacts</h1>
      <Suspense
        fallback={<div className="text-center py-8">Loading contacts...</div>}
      >
        <ContactsTable />
      </Suspense>
    </div>
  );
}
