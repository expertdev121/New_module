"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoriesTable } from "./categories-table";
import { CategoryItemsManagement } from "./CategoryItemsManagement";
import { CategoryGroupsManagement } from "./CategoryGroupsManagement";
import { CategoryFormDialog } from "./category-form-dialog";
import { Search, X, Plus } from "lucide-react";

interface Category {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CategoriesManagementProps {
  categories: Category[];
  onCategoryUpdate: () => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export function CategoriesManagement({ categories, onCategoryUpdate, search, onSearchChange }: CategoriesManagementProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleSearch = (value: string) => {
    onSearchChange(value);
  };

  const clearSearch = () => {
    onSearchChange("");
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingCategory(null);
    }
  };

  const handleCategorySuccess = () => {
    onCategoryUpdate();
  };

  return (
    <>
      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search categories..."
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
            <Button onClick={handleAddCategory}>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
          <CategoriesTable
            categories={categories}
            onCategoryUpdate={onCategoryUpdate}
            onSelectCategory={setSelectedCategoryId}
            onEditCategory={handleEditCategory}
          />
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <CategoryItemsManagement
            categoryId={null}
            onSelectItem={setSelectedItemId}
          />
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <CategoryGroupsManagement
            categoryId={selectedCategoryId || 0}
            itemId={selectedItemId || 0}
          />
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        category={editingCategory}
        onSuccess={handleCategorySuccess}
      />
    </>
  );
}
