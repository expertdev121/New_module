"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCampaigns, useCreateCampaign, useUpdateCampaign, useDeleteCampaign, Campaign } from "@/lib/query/useCampaigns";
import { useToast } from "@/hooks/use-toast";

export default function CampaignManagement() {
    const { toast } = useToast();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

    const { data: campaigns = [], isLoading } = useCampaigns();
    const createCampaign = useCreateCampaign();
    const updateCampaign = useUpdateCampaign();
    const deleteCampaign = useDeleteCampaign();

    const [formData, setFormData] = useState({
        name: "",
        description: "",
        status: "active" as "active" | "inactive" | "completed",
    });

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            status: "active",
        });
    };

    const handleCreate = async () => {
        if (!formData.name.trim()) {
            toast({
                title: "Error",
                description: "Campaign name is required",
                variant: "destructive",
            });
            return;
        }

        try {
            await createCampaign.mutateAsync(formData);
            toast({
                title: "Success",
                description: "Campaign created successfully",
            });
            setIsCreateDialogOpen(false);
            resetForm();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to create campaign",
                variant: "destructive",
            });
        }
    };

    const handleEdit = async () => {
        if (!formData.name.trim()) {
            toast({
                title: "Error",
                description: "Campaign name is required",
                variant: "destructive",
            });
            return;
        }

        if (!editingCampaign) {
            toast({
                title: "Error",
                description: "No campaign selected for editing",
                variant: "destructive",
            });
            return;
        }

        try {
            await updateCampaign.mutateAsync({
                id: editingCampaign.id,
                data: formData,
            });
            toast({
                title: "Success",
                description: "Campaign updated successfully",
            });
            setIsEditDialogOpen(false);
            setEditingCampaign(null);
            resetForm();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update campaign",
                variant: "destructive",
            });
        }
    };

    const handleDelete = async (campaignId: number) => {
        try {
            await deleteCampaign.mutateAsync(campaignId);
            toast({
                title: "Success",
                description: "Campaign deleted successfully",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete campaign",
                variant: "destructive",
            });
        }
    };

    const openEditDialog = (campaign: Campaign) => {
        setEditingCampaign(campaign);
        setFormData({
            name: campaign.name,
            description: campaign.description || "",
            status: campaign.status,
        });
        setIsEditDialogOpen(true);
    };

    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case "active":
                return "default";
            case "inactive":
                return "secondary";
            case "completed":
                return "outline";
            default:
                return "secondary";
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-64">Loading campaigns...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Campaign Management</h2>
                    <p className="text-gray-600">Manage your campaigns and track their performance</p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={resetForm}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Campaign
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Campaign</DialogTitle>
                            <DialogDescription>
                                Add a new campaign to track donations and engagement.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="name">Campaign Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Enter campaign name"
                                />
                            </div>
                            <div>
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Enter campaign description"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <Label htmlFor="status">Status</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(value: "active" | "inactive" | "completed") =>
                                        setFormData({ ...formData, status: value })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreate} disabled={createCampaign.isPending}>
                                {createCampaign.isPending ? "Creating..." : "Create Campaign"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4">
                {campaigns.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <div className="text-gray-400 mb-4">
                                <Plus className="w-12 h-12" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
                            <p className="text-gray-500 text-center mb-4">
                                Create your first campaign to start tracking donations and engagement.
                            </p>
                            <Button onClick={() => setIsCreateDialogOpen(true)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Create Campaign
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    campaigns.map((campaign) => (
                        <Card key={campaign.id}>
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold">{campaign.name}</h3>
                                            <Badge variant={getStatusBadgeVariant(campaign.status)}>
                                                {campaign.status}
                                            </Badge>
                                        </div>
                                        {campaign.description && (
                                            <p className="text-gray-600 mb-3">{campaign.description}</p>
                                        )}
                                        <div className="text-sm text-gray-500">
                                            Created: {new Date(campaign.createdAt).toLocaleDateString()}
                                            {campaign.updatedAt !== campaign.createdAt && (
                                                <span className="ml-4">
                                                    Updated: {new Date(campaign.updatedAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm">
                                                <MoreHorizontal className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditDialog(campaign)}>
                                                <Edit className="w-4 h-4 mr-2" />
                                                Edit
                                            </DropdownMenuItem>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem
                                                        onSelect={(e) => e.preventDefault()}
                                                        className="text-red-600"
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to delete &quot;{campaign.name}&quot;? This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDelete(campaign.id)}
                                                            className="bg-red-600 hover:bg-red-700"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Campaign</DialogTitle>
                        <DialogDescription>
                            Update the campaign details.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="edit-name">Campaign Name *</Label>
                            <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Enter campaign name"
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                                id="edit-description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Enter campaign description"
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-status">Status</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value: "active" | "inactive" | "completed") =>
                                    setFormData({ ...formData, status: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} disabled={updateCampaign.isPending}>
                            {updateCampaign.isPending ? "Updating..." : "Update Campaign"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
