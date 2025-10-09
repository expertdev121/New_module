"use client";

import { signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, Users, Home, UserPlus, UserCog, FolderOpen, CreditCard } from "lucide-react";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const isActive = (path: string) => {
    if (path === "/contacts") {
      return pathname.startsWith("/contacts");
    }
    return pathname === path;
  };

  return (
    <Card className="w-64 h-full p-4">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Admin Dashboard</h2>
        <nav className="space-y-2">
          <Button
            variant={isActive("/dashboard") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => router.push("/dashboard")}
          >
            <Home className="mr-2 h-4 w-4" />
            Dashboard Home
          </Button>
          <Button
            variant={isActive("/contacts") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => router.push("/contacts")}
          >
            <Users className="mr-2 h-4 w-4" />
            Financial module
          </Button>
          <Button
            variant={isActive("/admin/add-user") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => router.push("/admin/add-user")}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
          <Button
            variant={isActive("/admin/users") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => router.push("/admin/users")}
          >
            <UserCog className="mr-2 h-4 w-4" />
            Manage Users
          </Button>
          <Button
            variant={isActive("/admin/categories") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => router.push("/admin/categories")}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Manage Categories
          </Button>
          <Button
            variant={isActive("/admin/payment-methods") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => router.push("/admin/payment-methods")}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Payment Methods
          </Button>
        </nav>
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </Card>
  );
}
