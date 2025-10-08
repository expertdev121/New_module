"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, X, Plus, Edit, Trash2 } from "lucide-react";
import { CategoryGroupFormDialog } from "./category-group-form-dialog";

interface CategoryGroup {
  id: number;
  name: string;
  categoryId: number;
  categoryName?: string;
  categoryItemId: number;
  categoryItemName?: string;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: number;
  name: string;
}

interface CategoryItem {
  id: number;
  name: string;
  categoryId: number;
}

interface CategoryGroupsManagementProps {
  categoryId: number;
  itemId: number;
  onGroupUpdate?: () => void;
}

export function CategoryGroupsManagement({ categoryId, itemId, onGroupUpdate }: CategoryGroupsManagementProps) {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CategoryGroup | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchItems();
    fetchGroups();
  }, [categoryId, itemId, search]);

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories?limit=1000", {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await fetch("/api/category-items", {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch items:", err);
    }
  };

  const fetchGroups = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      const response = await fetch(`/api/category-groups?${params}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      } else {
        setError("Failed to fetch category groups");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const clearSearch = () => {
    setSearch("");
  };

  const handleEditGroup = (group: CategoryGroup) => {
    setEditingGroup(group);
    setDialogOpen(true);
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingGroup(null);
    }
  };

  const handleGroupSuccess = () => {
    fetchGroups();
    onGroupUpdate?.();
  };

  if (loading) {
    return <div className="text-center py-8">Loading groups...</div>;
  }

  return (
    <>
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8"
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSearch}
                className="absolute right-1 top-1 h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button onClick={handleAddGroup}>
            <Plus className="h-4 w-4 mr-2" />
            Add Group
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell>{group.categoryName || "-"}</TableCell>
                <TableCell>{group.categoryItemName || "-"}</TableCell>
                <TableCell>
                  {new Date(group.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditGroup(group)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CategoryGroupFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        group={editingGroup}
        categories={categories}
        items={items}
        onSuccess={handleGroupSuccess}
      />
    </>
  );
}
