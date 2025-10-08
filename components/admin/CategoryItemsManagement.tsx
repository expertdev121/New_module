"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Search, X, Plus, Edit, Power, PowerOff, Trash2 } from "lucide-react";
import { CategoryItemFormDialog } from "./category-item-form-dialog";
import { GenericDeleteConfirmationDialog } from "@/components/ui/generic-delete-confirmation-dialog";
import { toast } from "sonner";

interface CategoryItem {
  id: number;
  name: string;
  occId: number | null;
  categoryId: number;
  categoryName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: number;
  name: string;
}

interface CategoryItemsManagementProps {
  categoryId: number | null;
  onSelectItem: (id: number) => void;
  onItemUpdate?: () => void;
}

export function CategoryItemsManagement({ categoryId, onSelectItem, onItemUpdate }: CategoryItemsManagementProps) {
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CategoryItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchItems();
  }, [categoryId, search]);

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
      if (categoryId) {
        const response = await fetch(`/api/categories/${categoryId}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setItems(data);
        } else {
          setError("Failed to fetch category items");
        }
      } else {
        const params = new URLSearchParams();
        if (search) params.append("search", search);
        const response = await fetch(`/api/category-items?${params}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setItems(data);
        } else {
          setError("Failed to fetch all category items");
        }
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

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? (
      <Badge variant="default">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    );
  };

  const handleToggleStatus = async (item: CategoryItem) => {
    setUpdatingId(item.id);
    try {
      const response = await fetch(`/api/category-items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: !item.isActive }),
      });

      if (response.ok) {
        toast.success(`Item ${!item.isActive ? 'activated' : 'suspended'} successfully`);
        fetchItems();
        onItemUpdate?.();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update item status');
      }
    } catch (error) {
      toast.error('An error occurred while updating item status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleEditItem = (item: CategoryItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingItem(null);
    }
  };

  const handleItemSuccess = () => {
    fetchItems();
    onItemUpdate?.();
  };

  const handleDeleteItem = (item: CategoryItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    setDeletingId(itemToDelete.id);
    try {
      const response = await fetch(`/api/category-items/${itemToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast.success('Category item deleted successfully');
        fetchItems();
        onItemUpdate?.();
        setDeleteDialogOpen(false);
        setItemToDelete(null);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to delete category item');
      }
    } catch (error) {
      toast.error('An error occurred while deleting category item');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading items...</div>;
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
              placeholder="Search items..."
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
          <Button onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>OCC ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.categoryName || "-"}</TableCell>
                <TableCell>{item.occId || "-"}</TableCell>
                <TableCell>{getStatusBadge(item.isActive)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditItem(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(item)}
                      disabled={updatingId === item.id}
                    >
                      {item.isActive ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteItem(item)}
                      disabled={deletingId === item.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CategoryItemFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        item={editingItem}
        categories={categories}
        onSuccess={handleItemSuccess}
      />

      <GenericDeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Category Item"
        description="Are you sure you want to delete this category item? This action cannot be undone."
        itemName={itemToDelete?.name || ""}
        isDeleting={deletingId !== null}
      />
    </>
  );
}
