"use client"
import { TagsManagement } from "@/components/tags/tags-management";

import { useParams } from "next/navigation";

export default function TagsPage() {
  const params = useParams();
  const contactId = Number(params.contactId); 

  return (
    <div className="container mx-auto py-6">
      {contactId && <TagsManagement contactId={contactId} />}
    </div>
  );
}

