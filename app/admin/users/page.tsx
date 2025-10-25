"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersTable } from "@/components/admin/users-table";
import { ArrowLeft } from "lucide-react";

interface User {
  id: number;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/auth/login");
    } else if (session.user.role !== "admin") {
      router.push("/contacts");
    } else {
      fetchUsers();
    }
  }, [session, status, router]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/admin/users", {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      } else {
        setError("Failed to fetch users");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!session || session.user.role !== "admin") {
    return null; // Will redirect
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manage Users</h1>
        <p className="text-muted-foreground">
          View and manage all user accounts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
          <CardDescription>
            Manage user accounts, roles, and status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 mb-4">{error}</div>
          )}
          <UsersTable users={users} onUserUpdate={fetchUsers} />
        </CardContent>
      </Card>
    </div>
  );
}
