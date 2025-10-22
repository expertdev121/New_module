import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // Custom middleware logic can be added here if needed
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (!token) return false;

        const { pathname } = req.nextUrl;

        // Super admin can access all routes
        if (token.role === "super_admin") return true;

        // Regular admin routes
        if (pathname.startsWith("/admin")) {
          return token.role === "admin";
        }

        // Dashboard routes require admin or super_admin
        if (pathname.startsWith("/dashboard")) {
          return token.role === "admin" || token.role === "super_admin";
        }

        // Contacts routes require admin or super_admin
        if (pathname.startsWith("/contacts")) {
          return token.role === "admin" || token.role === "super_admin";
        }

        // Default: authenticated users can access
        return !!token;
      },
    },
    pages: {
      signIn: "/auth/login",
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes)
     * - api/webhook (webhook endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|api/webhook|_next/static|_next/image|favicon.ico).*)",
  ],
};
