import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { z } from "zod";

interface Relationship {
  id: number;
  contactId: number;
  relatedContactId: number;
  relationshipType:
  | "mother"
  | "father"
  | "grandmother"
  | "grandchild"
  | "grandfather"
  | "grandparent"
  | "parent"
  | "step-parent"
  | "stepmother"
  | "stepfather"
  | "sister"
  | "brother"
  | "step-sister"
  | "step-brother"
  | "stepson"
  | "daughter"
  | "son"
  | "aunt"
  | "uncle"
  | "aunt/uncle"
  | "nephew"
  | "niece"
  | "grandson"
  | "granddaughter"
  | "cousin (m)"
  | "cousin (f)"
  | "spouse"
  | "partner"
  | "wife"
  | "husband"
  | "former husband"
  | "former wife"
  | "fiance"
  | "divorced co-parent"
  | "separated co-parent"
  | "legal guardian"
  | "legal guardian partner"
  | "friend"
  | "neighbor"
  | "relative"
  | "business"
  | "owner"
  | "chevrusa"
  | "congregant"
  | "rabbi"
  | "contact"
  | "foundation"
  | "donor"
  | "fund"
  | "rebbi contact"
  | "rebbi contact for"
  | "employee"
  | "employer"
  | "machatunim"
  // Added missing types below:
  | "His Sister"
  | "Her Sister"
  | "Her Brother"
  | "His Brother"
  | "His Aunt"
  | "Her Aunt"
  | "His Uncle"
  | "Her Uncle"
  | "His Parents"
  | "Her Parents"
  | "Her Mother"
  | "His Mother"
  | "His Father"
  | "His Parents"
  | "Her Nephew"
  | "His Nephew"
  | "His Niece"
  | "Her Niece"
  | "His Grandparents"
  | "Her Grandparents"
  | "Her Father"
  | "Their Daughter"
  | "Their Son"
  | "His Daughter"
  | "His Son"
  | "Her Daughter"
  | "Her Son"
  | "His Cousin (M)"
  | "Her Grandfather"
  | "Her Grandmother"
  | "His Grandfather"
  | "His Grandmother"
  | "His Wife"
  | "Her Husband"
  | "Her Former Husband"
  | "His Former Wife"
  | "His Cousin (F)"
  | "Her Cousin (M)"
  | "Her Cousin (F)"
  | "Partner"
  | "Friend"
  | "Neighbor"
  | "Relative"
  | "Business"
  | "Chevrusa"
  | "Congregant"
  | "Contact"
  | "Donor"
  | "Fiance"
  | "Foundation"
  | "Fund"
  | "Her Step Son"
  | "His Step Mother"
  | "Owner"
  | "Rabbi"
  | "Their Granddaughter"
  | "Their Grandson"
  | "Employee"
  | "Employer";
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  relatedContactName: string;
  displayRelationshipType: string;
}

interface RelationshipsResponse {
  relationships: Relationship[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters: {
    search?: string;
    relationshipType?: Relationship["relationshipType"];
    isActive?: boolean;
    contactId?: number;
    relatedContactId?: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  };
}

interface ErrorResponse {
  error: string;
  message?: string;
  details?: { field: string; message: string }[];
  timestamp?: string;
}

// Query parameters schema (matches backend querySchema)
const querySchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  relationshipType: z
    .enum([
   "mother",
   "father",
  "grandmother",
  "grandchild",
  "grandfather",
  "grandparent",
  "parent",
  "step-parent",
  "stepmother",
   "stepfather",
   "sister",
   "brother",
   "step-sister",
   "step-brother",
   "stepson",
   "daughter",
   "son",
   "aunt",
   "uncle",
   "aunt/uncle",
   "nephew",
   "niece",
   "grandson",
   "granddaughter",
   "cousin (m)",
   "cousin (f)",
   "spouse",
   "partner",
   "wife",
   "husband",
   "former husband",
   "former wife",
   "fiance",
   "divorced co-parent",
   "separated co-parent",
   "legal guardian",
   "legal guardian partner",
   "friend",
   "neighbor",
   "relative",
   "business",
   "owner",
   "chevrusa",
   "congregant",
   "rabbi",
   "contact",
   "foundation",
   "donor",
   "fund",
   "rebbi contact",
  "rebbi contact for",
  "employee",
  "employer",
  "machatunim",
      "His Sister",
  "Her Sister",
  "Her Brother",
   "His Brother",
   "His Aunt",
   "Her Aunt",
   "His Uncle",
   "Her Uncle",
   "His Parents",
   "Her Parents",
   "Her Mother",
   "His Mother",
   "His Father",
   "His Parents",
   "Her Nephew",
   "His Nephew",
   "His Niece",
   "Her Niece",
   "His Grandparents",
   "Her Grandparents",
   "Her Father",
   "Their Daughter",
   "Their Son",
   "His Daughter",
   "His Son",
   "Her Daughter",
   "Her Son",
   "His Cousin (M)",
   "Her Grandfather",
   "Her Grandmother",
   "His Grandfather",
   "His Grandmother",
   "His Wife",
   "Her Husband",
   "Her Former Husband",
   "His Former Wife",
   "His Cousin (F)",
   "Her Cousin (M)",
   "Her Cousin (F)",
   "Partner",
   "Friend",
   "Neighbor",
   "Relative",
   "Business",
   "Chevrusa",
   "Congregant",
   "Contact",
   "Donor",
   "Fiance",
   "Foundation",
   "Fund",
  "Her Step Son",
  "His Step Mother",
  "Owner",
  "Rabbi",
  "Their Granddaughter",
  "Their Grandson",
  "Employee",
  "Employer"
    ])
    .optional(),
  isActive: z.boolean().optional(),
    contactId: z.number().positive().optional(),
      relatedContactId: z.number().positive().optional(),
});

// Schema for updating relationships (partial)
const updateRelationshipSchema = z.object({
  contactId: z.number().positive().optional(),
  relatedContactId: z.number().positive().optional(),
  relationshipType: z
    .enum([
      "mother",
      "father",
      "grandmother",
      "grandfather",
      "sister",
      "spouse",
      "brother",
      "partner",
      "step-brother",
      "step-sister",
      "stepmother",
      "stepfather",
      "divorced co-parent",
      "separated co-parent",
      "legal guardian",
      "step-parent",
      "legal guardian partner",
      "grandparent",
      "aunt",
      "uncle",
      "aunt/uncle",
    ])
    .optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

type QueryParams = z.infer<typeof querySchema>;
type UpdateRelationship = z.infer<typeof updateRelationshipSchema>;
type NewRelationship = {
  contactId: number;
  relatedContactId: number;
  relationshipType: Relationship["relationshipType"];
  isActive: boolean;
  notes?: string;
};

// API base URL
const API_BASE_URL = "/api/relationships";

// Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// GET: Fetch relationships
const fetchRelationships = async (
  params: QueryParams
): Promise<RelationshipsResponse> => {
  const validatedParams = querySchema.parse(params);
  const response = await api.get<RelationshipsResponse>("", {
    params: validatedParams,
  });
  return response.data;
};

// POST: Create a new relationship
const createRelationship = async (
  data: NewRelationship
): Promise<Relationship> => {
  const response = await api.post<{
    message: string;
    relationship: Relationship;
  }>("", data);
  return response.data.relationship;
};

// DELETE: Delete a relationship
const deleteRelationship = async (id: number): Promise<Relationship> => {
  const response = await api.delete<{
    success: boolean;
    message: string;
    relationship: Relationship;
  }>(`/${id}`);
  return response.data.relationship;
};

// PATCH: Update a relationship
const updateRelationship = async (
  id: number,
  data: UpdateRelationship
): Promise<Relationship> => {
  const validatedData = updateRelationshipSchema.parse(data);
  const response = await api.patch<{
    message: string;
    relationship: Relationship;
  }>(`?id=${id}`, validatedData);
  return response.data.relationship;
};

export const useRelationships = (params: QueryParams) => {
  return useQuery<RelationshipsResponse, AxiosError<ErrorResponse>>({
    queryKey: [
      "relationships",
      params.page,
      params.limit,
      params.search,
      params.sortBy,
      params.sortOrder,
      params.relationshipType,
      params.isActive,
      params.contactId,
      params.relatedContactId,
    ],
    queryFn: () => fetchRelationships(params),
    staleTime: 60 * 1000,
  });
};

export const useCreateRelationship = () => {
  const queryClient = useQueryClient();
  return useMutation<Relationship, AxiosError<ErrorResponse>, NewRelationship>({
    mutationFn: createRelationship,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
    },
    onError: (error) => {
      console.error(
        "Error creating relationship:",
        error.response?.data || error.message
      );
    },
  });
};

export const useDeleteRelationship = () => {
  const queryClient = useQueryClient();
  return useMutation<Relationship, AxiosError<ErrorResponse>, number>({
    mutationFn: deleteRelationship,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
    },
    onError: (error) => {
      console.error(
        "Error deleting relationship:",
        error.response?.data || error.message
      );
    },
  });
};

export const useUpdateRelationship = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Relationship,
    AxiosError<ErrorResponse>,
    { id: number; data: UpdateRelationship }
  >({
    mutationFn: ({ id, data }) => updateRelationship(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
    },
    onError: (error) => {
      console.error(
        "Error updating relationship:",
        error.response?.data || error.message
      );
    },
  });
};
