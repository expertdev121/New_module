"use client";

import { useState, useEffect } from "react";
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
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CategoryItem {
  id: number;
  name: string;
  occId: number | null;
  categoryId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CategoryItemsManagementProps {
  categoryId: number;
  onSelectItem: (id: number) => void;
}

export function CategoryItemsManagement({ categoryId, onSelectItem }: CategoryItemsManagementProps) {
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchItems();
  }, [categoryId]);

  const fetchItems = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data); // Now data is full item objects
      } else {
        setError("Failed to fetch category items");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? (
      <Badge variant="default">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading items...</div>;
  }

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
            <TableHead>Name</TableHead>
            <TableHead>OCC ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.occId || "-"}</TableCell>
              <TableCell>{getStatusBadge(item.isActive)}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectItem(item.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
