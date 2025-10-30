"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, Users, Home, UserPlus, UserCog, FolderOpen, CreditCard, FileText, Target, Tag } from "lucide-react";
import { isInIframe, navigateInParent, signOutInIframe } from "@/lib/iframe-utils";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSignOut = async () => {
    await signOutInIframe();
  };

  const isActive = (path: string) => {
    if (path === "/contacts") {
      return pathname.startsWith("/contacts");
    }
    if (path === "/pledges") {
      return pathname.startsWith("/pledges");
    }
    return pathname === path;
  };

  // Get user role from session
  const { data: session } = useSession();
  const userRole = session?.user?.role;

  // Define navigation items based on role
  const getNavigationItems = () => {
    if (userRole === "super_admin") {
      return [
        {
          path: "/admin/manage-admins",
          label: "Manage Admins",
          icon: UserCog,
        },
        {
          path: "/admin/log-reports",
          label: "Log Reports",
          icon: FileText,
        },
      ];
    } else {
      // Regular admin navigation
      return [
        {
          path: "/dashboard",
          label: "Dashboard Home",
          icon: Home,
        },
        {
          path: "/contacts",
          label: "Financial module",
          icon: Users,
        },
        // {
        //   path: "/pledges",
        //   label: "pledges/donations",
        //   icon: FileText,
        // },
        {
          path: "/admin/campaigns",
          label: "Manage Campaigns",
          icon: Target,
        },
        {
          path: "/admin/add-user",
          label: "Add User",
          icon: UserPlus,
        },
        {
          path: "/admin/users",
          label: "Manage Users",
          icon: UserCog,
        },
        {
          path: "/admin/categories",
          label: "Manage Categories",
          icon: FolderOpen,
        },
        {
          path: "/admin/payment-methods",
          label: "Payment Methods",
          icon: CreditCard,
        },
        {
          path: "/admin/tags",
          label: "Manage Tags",
          icon: Tag,
        },
      ];
    }
  };

  const navigationItems = getNavigationItems();

  return (
    <Card className="w-64 h-full p-4">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          {userRole === "super_admin" ? "Super Admin Dashboard" : "Admin Dashboard"}
        </h2>
        <nav className="space-y-2">
          {navigationItems.map((item) => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? "default" : "ghost"}
              className={`w-full justify-start ${isActive(item.path) ? "text-white" : "text-gray-800"}`}
              onClick={() => router.push(item.path)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </Button>
          ))}
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
