import { TagsManagement } from "@/components/tags/tags-management";
import React from "react";

export default async function TagsManagementPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const contactIdNumber = parseInt(contactId);
  
  // Validate contactId
  if (isNaN(contactIdNumber)) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Invalid Contact ID</h1>
        <p>The provided contact ID is not valid.</p>
      </div>
    );
  }
  
  return <TagsManagement contactId={contactIdNumber} />;
}