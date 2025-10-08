"use client";

import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CategoryGroupsManagementProps {
  categoryId: number;
  itemId: number;
}

export function CategoryGroupsManagement({ categoryId, itemId }: CategoryGroupsManagementProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Mock loading
    setTimeout(() => setLoading(false), 1000);
  }, [categoryId, itemId]);

  if (loading) {
    return <div className="text-center py-8">Loading groups...</div>;
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Groups management for Category ID: {categoryId}, Item ID: {itemId} - API implementation pending.
        </AlertDescription>
      </Alert>
    </div>
  );
}
