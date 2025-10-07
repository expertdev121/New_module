import { Sidebar } from "@/components/dashboard/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
