import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { z } from "zod";
import { NewStudentRole } from "../db/schema";

interface StudentRole {
  id: number;
  contactId: number;
  program: "LH" | "LLC" | "ML" | "Kollel" | "Madrich";
  status:
    | "Student"
    | "Active Soldier"
    | "Staff"
    | "Withdrew"
    | "Transferred Out"
    | "Left Early"
    | "Asked to Leave";
  year: string;
  track?: string;
  trackDetail?:string;
  machzor?: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  additionalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface StudentRolesResponse {
  studentRoles: StudentRole[];
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
    program?: "LH" | "LLC" | "ML" | "Kollel" | "Madrich";
    status?:
      | "Student"
      | "Active Soldier"
      | "Staff"
      | "Withdrew"
      | "Transferred Out"
      | "Left Early"
      | "Asked to Leave";
    year?: string;
    isActive?: boolean;
    contactId?: number;
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
  program: z.enum(["LH", "LLC", "ML", "Kollel", "Madrich"]).optional(),
  status: z
    .enum([
      "Student",
      "Active Soldier",
      "Staff",
      "Withdrew",
      "Transferred Out",
      "Left Early",
      "Asked to Leave",
    ])
    .optional(),
  year: z.string().optional(),
  isActive: z.boolean().optional(),
  contactId: z.number().positive().optional(),
});

type QueryParams = z.infer<typeof querySchema>;

const API_BASE_URL = "/api/student-roles";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const fetchStudentRoles = async (
  params: QueryParams
): Promise<StudentRolesResponse> => {
  const validatedParams = querySchema.parse(params);
  const response = await api.get<StudentRolesResponse>("", {
    params: validatedParams,
  });
  return response.data;
};

const createStudentRole = async (
  data: NewStudentRole
): Promise<StudentRole> => {
  const response = await api.post<{
    message: string;
    studentRole: StudentRole;
  }>("", data);
  return response.data.studentRole;
};

const deactivateStudentRole = async (id: number): Promise<StudentRole> => {
  const response = await api.patch<{
    message: string;
    studentRole: StudentRole;
  }>(`/${id}`, { isActive: false });
  return response.data.studentRole;
};

export const useStudentRoles = (params: QueryParams) => {
  return useQuery<StudentRolesResponse, AxiosError<ErrorResponse>>({
    queryKey: [
      "studentRoles",
      params.page,
      params.limit,
      params.search,
      params.sortBy,
      params.sortOrder,
      params.program,
      params.status,
      params.year,
      params.isActive,
      params.contactId,
    ],
    queryFn: () => fetchStudentRoles(params),
    staleTime: 60 * 1000,
  });
};

export const useCreateStudentRole = () => {
  const queryClient = useQueryClient();

  return useMutation<StudentRole, AxiosError<ErrorResponse>, NewStudentRole>({
    mutationFn: createStudentRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studentRoles"] });
    },
    onError: (error) => {
      console.error(
        "Error creating student role:",
        error.response?.data || error.message
      );
    },
  });
};

export const useDeactivateStudentRole = () => {
  const queryClient = useQueryClient();

  return useMutation<StudentRole, AxiosError<ErrorResponse>, number>({
    mutationFn: deactivateStudentRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studentRoles"] });
    },
    onError: (error) => {
      console.error(
        "Error deactivating student role:",
        error.response?.data || error.message
      );
    },
  });
};
