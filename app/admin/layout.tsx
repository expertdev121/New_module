export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 p-8 overflow-y-auto">
      {children}
    </div>
  );
}
