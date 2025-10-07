"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserCheck, UserX, Trash2, Edit } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface User {
  id: number;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UsersTableProps {
  users: User[];
  onUserUpdate: () => void;
}

export function UsersTable({ users, onUserUpdate }: UsersTableProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleStatusChange = async (userId: number, newStatus: "active" | "suspended") => {
    setLoading(userId);
    setError("");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        onUserUpdate();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to update user status");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    setLoading(userId);
    setError("");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: 'include',
      });

      if (response.ok) {
        onUserUpdate();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to delete user");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge variant="secondary">Admin</Badge>;
      case "user":
        return <Badge variant="outline">User</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[70px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.email}</TableCell>
              <TableCell>{getRoleBadge(user.role)}</TableCell>
              <TableCell>{getStatusBadge(user.status)}</TableCell>
              <TableCell>
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {user.status === "active" ? (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(user.id, "suspended")}
                        disabled={loading === user.id}
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Suspend
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(user.id, "active")}
                        disabled={loading === user.id}
                      >
                        <UserCheck className="mr-2 h-4 w-4" />
                        Activate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleDelete(user.id)}
                      disabled={loading === user.id}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
