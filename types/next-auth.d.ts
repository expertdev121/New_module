import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: string;
      contactId?: string;
      locationId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    role: string;
    contactId?: string;
    locationId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    contactId?: string;
    locationId?: string;
  }
}
