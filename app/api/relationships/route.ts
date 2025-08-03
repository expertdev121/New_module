import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, desc, asc, or, ilike, and, eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { relationships, contact } from "@/lib/db/schema";
import { relationshipSchema } from "@/lib/form-schemas/relationships";


// --- Types ---
const validRelationshipEnumValues = [
  "mother",
  "father",
  "grandmother",
  "grandfather",
  "grandparent",
  "grandchild",       // <-- Added for strict typing!
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
] as const;

type ValidRelationshipType = (typeof validRelationshipEnumValues)[number];

type RelationshipResult = {
  id: number;
  contactId: number;
  relatedContactId: number;
  relationshipType: string;
  displayRelationshipType: string;
  directionalDisplay: string;
  isActive: boolean;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  relatedContactName: string | null;
  relatedContactGender: string | null;
  isReverse: boolean;
  isReciprocal: boolean;
};


// --- Mappings ---
const DIRECTIONAL_DISPLAY_MAP: Record<
  string,
  { forward: string; reverse: string }
> = {
  mother: { forward: "Mother", reverse: "Child" },
  father: { forward: "Father", reverse: "Child" },
  grandmother: { forward: "Grandmother", reverse: "Grandchild" },
  grandfather: { forward: "Grandfather", reverse: "Grandchild" },
  grandparent: { forward: "Grandparent", reverse: "Grandchild" },
  grandchild: { forward: "Grandchild", reverse: "Grandparent" },
  parent: { forward: "Parent", reverse: "Child" },
  "step-parent": { forward: "Step-parent", reverse: "Stepchild" },
  stepmother: { forward: "Stepmother", reverse: "Stepchild" },
  stepfather: { forward: "Stepfather", reverse: "Stepchild" },
  sister: { forward: "Sister", reverse: "Sister" },
  brother: { forward: "Brother", reverse: "Brother" },
  "step-sister": { forward: "Step-sister", reverse: "Step-sister" },
  "step-brother": { forward: "Step-brother", reverse: "Step-brother" },
  stepson: { forward: "Stepson", reverse: "Step-parent" },
  daughter: { forward: "Daughter", reverse: "Parent" },
  son: { forward: "Son", reverse: "Parent" },
  aunt: { forward: "Aunt", reverse: "Niece/Nephew" },
  uncle: { forward: "Uncle", reverse: "Niece/Nephew" },
  "aunt/uncle": { forward: "Aunt/Uncle", reverse: "Niece/Nephew" },
  nephew: { forward: "Nephew", reverse: "Aunt/Uncle" },
  niece: { forward: "Niece", reverse: "Aunt/Uncle" },
  grandson: { forward: "Grandson", reverse: "Grandparent" },
  granddaughter: { forward: "Granddaughter", reverse: "Grandparent" },
  "cousin (m)": { forward: "Male Cousin", reverse: "Cousin" },
  "cousin (f)": { forward: "Female Cousin", reverse: "Cousin" },
  spouse: { forward: "Spouse", reverse: "Spouse" },
  partner: { forward: "Partner", reverse: "Partner" },
  wife: { forward: "Wife", reverse: "Husband" },
  husband: { forward: "Husband", reverse: "Wife" },
  "former husband": { forward: "Former Husband", reverse: "Former Wife" },
  "former wife": { forward: "Former Wife", reverse: "Former Husband" },
  fiance: { forward: "Fiancé/Fiancée", reverse: "Fiancé/Fiancée" },
  "divorced co-parent": { forward: "Divorced Co-parent", reverse: "Divorced Co-parent" },
  "separated co-parent": { forward: "Separated Co-parent", reverse: "Separated Co-parent" },
  "legal guardian": { forward: "Legal Guardian", reverse: "Ward" },
  "legal guardian partner": { forward: "Legal Guardian Partner", reverse: "Ward" },
  friend: { forward: "Friend", reverse: "Friend" },
  neighbor: { forward: "Neighbor", reverse: "Neighbor" },
  relative: { forward: "Relative", reverse: "Relative" },
  business: { forward: "Business", reverse: "Contact" },
  owner: { forward: "Owner", reverse: "Business" },
  chevrusa: { forward: "Chevrusa", reverse: "Chevrusa" },
  congregant: { forward: "Congregant", reverse: "Rabbi" },
  rabbi: { forward: "Rabbi", reverse: "Congregant" },
  contact: { forward: "Contact", reverse: "Contact" },
  foundation: { forward: "Foundation", reverse: "Donor" },
  donor: { forward: "Donor", reverse: "Foundation/Fund" },
  fund: { forward: "Fund", reverse: "Donor" },
  "rebbi contact": { forward: "Rebbi Contact", reverse: "Student" },
  "rebbi contact for": { forward: "Student", reverse: "Rebbi Contact" },
  employee: { forward: "Employee", reverse: "Employer" },
  employer: { forward: "Employer", reverse: "Employee" },
  machatunim: { forward: "Machatanim", reverse: "Machatanim" },
};

const RECIPROCAL_MAPPING: Record<string, ValidRelationshipType> = {
  mother: "son",
  father: "son",
  grandmother: "grandchild",
  grandfather: "grandchild",
  grandparent: "grandchild",
  grandchild: "grandparent",
  parent: "son",
  "step-parent": "stepson",
  stepmother: "stepson",
  stepfather: "stepson",
  sister: "sister",
  brother: "brother",
  "step-sister": "step-brother",
  "step-brother": "step-sister",
  stepson: "stepmother",
  daughter: "mother",
  son: "mother",
  aunt: "nephew",
  uncle: "nephew",
  "aunt/uncle": "nephew",
  nephew: "aunt",
  niece: "aunt",
  grandson: "grandmother",
  granddaughter: "grandmother",
  "cousin (m)": "cousin (f)",
  "cousin (f)": "cousin (m)",
  spouse: "spouse",
  partner: "partner",
  wife: "husband",
  husband: "wife",
  "former husband": "former wife",
  "former wife": "former husband",
  fiance: "fiance",
  "divorced co-parent": "divorced co-parent",
  "separated co-parent": "separated co-parent",
  "legal guardian": "legal guardian partner",
  "legal guardian partner": "legal guardian",
  friend: "friend",
  neighbor: "neighbor",
  relative: "relative",
  business: "contact",
  owner: "business",
  chevrusa: "chevrusa",
  congregant: "rabbi",
  rabbi: "congregant",
  contact: "contact",
  foundation: "donor",
  donor: "foundation",
  fund: "donor",
  "rebbi contact": "contact",
  "rebbi contact for": "contact",
  employee: "employer",
  employer: "employee",
  machatunim: "machatunim",
};


// --- Helpers ---
function getDirectionalDisplay(relationshipType: string, isReverse: boolean): string {
  const mapping = DIRECTIONAL_DISPLAY_MAP[relationshipType];
  if (!mapping) return relationshipType;
  return isReverse ? mapping.reverse : mapping.forward;
}

function getReciprocalRelationshipSafe(relationshipType: string): ValidRelationshipType {
  const reciprocal = RECIPROCAL_MAPPING[relationshipType];
  if (reciprocal && validRelationshipEnumValues.includes(reciprocal)) {
    return reciprocal;
  }
  if (validRelationshipEnumValues.includes(relationshipType as ValidRelationshipType)) {
    return relationshipType as ValidRelationshipType;
  }
  return "contact";
}

async function getContextualReciprocal(
  relationshipType: string,
  targetContactId: number
): Promise<ValidRelationshipType> {
  try {
    const targetContact = await db
      .select({ gender: contact.gender })
      .from(contact)
      .where(eq(contact.id, targetContactId))
      .limit(1);

    const gender = targetContact[0]?.gender;

    const contextualMapping: Record<
      string,
      { male?: ValidRelationshipType; female?: ValidRelationshipType; default: ValidRelationshipType }
    > = {
      mother: { male: "son", female: "daughter", default: "son" },
      father: { male: "son", female: "daughter", default: "son" },
      parent: { male: "son", female: "daughter", default: "son" },
      stepmother: { male: "stepson", female: "daughter", default: "stepson" },
      stepfather: { male: "stepson", female: "daughter", default: "stepson" },
      grandmother: { male: "grandson", female: "granddaughter", default: "grandson" },
      grandfather: { male: "grandson", female: "granddaughter", default: "grandson" },
      aunt: { male: "nephew", female: "niece", default: "nephew" },
      uncle: { male: "nephew", female: "niece", default: "nephew" },
      "aunt/uncle": { male: "nephew", female: "niece", default: "nephew" },
    };

    const contextual = contextualMapping[relationshipType];
    if (contextual) {
      if (gender === "male" && contextual.male) return contextual.male;
      if (gender === "female" && contextual.female) return contextual.female;
      return contextual.default;
    }
    return getReciprocalRelationshipSafe(relationshipType);
  } catch (error) {
    console.warn("Error getting contextual reciprocal, using fallback:", error);
    return getReciprocalRelationshipSafe(relationshipType);
  }
}


// --- Query Schema ---
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  relationshipType: z.enum(validRelationshipEnumValues).optional(),
  isActive: z.coerce.boolean().optional(),
  contactId: z.coerce.number().positive().optional(),
  relatedContactId: z.coerce.number().positive().optional(),
  includeReciprocals: z.coerce.boolean().default(true),
});


// --- GET Handler ---
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedParams = querySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
      relationshipType: searchParams.get("relationshipType") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
      contactId: searchParams.get("contactId") ?? undefined,
      relatedContactId: searchParams.get("relatedContactId") ?? undefined,
      // Force includeReciprocals to false to not display reciprocal values
      includeReciprocals: false,
    });

    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsedParams.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      relationshipType,
      isActive,
      contactId,
      relatedContactId,
      // includeReciprocals removed because forced false above
    } = parsedParams.data;

    const offset = (page - 1) * limit;

    if (contactId) {
      const conditions = [];

      if (search) {
        conditions.push(
          or(
            ilike(relationships.relationshipType, `%${search}%`),
            ilike(relationships.notes, `%${search}%`)
          )
        );
      }
      if (relationshipType)
        conditions.push(eq(relationships.relationshipType, relationshipType));
      if (typeof isActive === "boolean")
        conditions.push(eq(relationships.isActive, isActive));
      if (relatedContactId)
        conditions.push(
          or(
            eq(relationships.relatedContactId, relatedContactId),
            eq(relationships.contactId, relatedContactId)
          )
        );

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Only forward relationships (source == contactId)
      const forwardRelationsQuery = db
        .select({
          id: relationships.id,
          contactId: sql<number>`${contactId}`.as("contactId"),
          relatedContactId: relationships.relatedContactId,
          relationshipType: relationships.relationshipType,
          displayRelationshipType: relationships.relationshipType,
          directionalDisplay: relationships.relationshipType,
          isActive: relationships.isActive,
          notes: relationships.notes,
          createdAt: relationships.createdAt,
          updatedAt: relationships.updatedAt,
          relatedContactName: sql<string>`concat(${contact.firstName}, ' ', ${contact.lastName})`.as(
            "relatedContactName"
          ),
          relatedContactGender: contact.gender,
          isReverse: sql<boolean>`false`.as("isReverse"),
          isReciprocal: sql<boolean>`false`.as("isReciprocal"),
        })
        .from(relationships)
        .leftJoin(contact, eq(relationships.relatedContactId, contact.id))
        .where(and(eq(relationships.contactId, contactId), whereClause));

      const forwardRelations = await forwardRelationsQuery.execute();

      const mappedForwardRelations = forwardRelations.map((rel) => ({
        ...rel,
        directionalDisplay: getDirectionalDisplay(rel.relationshipType, false),
      }));

      // Deduplication is unnecessary here (no reverse relations included)
      const uniqueRelations = mappedForwardRelations;

      let sortedRelations = uniqueRelations;
      switch (sortBy) {
        case "relatedContactName":
          sortedRelations = uniqueRelations.sort((a, b) =>
            sortOrder === "asc"
              ? (a.relatedContactName ?? "").localeCompare(b.relatedContactName ?? "")
              : (b.relatedContactName ?? "").localeCompare(a.relatedContactName ?? "")
          );
          break;
        case "relationshipType":
          sortedRelations = uniqueRelations.sort((a, b) =>
            sortOrder === "asc"
              ? a.directionalDisplay.localeCompare(b.directionalDisplay)
              : b.directionalDisplay.localeCompare(a.directionalDisplay)
          );
          break;
        case "createdAt":
          sortedRelations = uniqueRelations.sort((a, b) =>
            sortOrder === "asc"
              ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          break;
        case "updatedAt":
        default:
          sortedRelations = uniqueRelations.sort((a, b) =>
            sortOrder === "asc"
              ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
              : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          break;
      }

      const paginatedRelations = sortedRelations.slice(offset, offset + limit);
      const totalCount = sortedRelations.length;
      const totalPages = Math.ceil(totalCount / limit);

      return NextResponse.json(
        {
          relationships: paginatedRelations,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
          filters: {
            search,
            relationshipType,
            isActive,
            contactId,
            relatedContactId,
            sortBy,
            sortOrder,
          },
          // Omit reciprocal related meta since no reciprocals displayed
        },
        { headers: { "X-Total-Count": totalCount.toString() } }
      );
    }

    // Non-contactId logic unchanged (single direction, so dedupe not needed)
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(relationships.relationshipType, `%${search}%`),
          ilike(relationships.notes, `%${search}%`)
        )
      );
    }
    if (relationshipType) conditions.push(eq(relationships.relationshipType, relationshipType));
    if (typeof isActive === "boolean") conditions.push(eq(relationships.isActive, isActive));
    if (relatedContactId) conditions.push(eq(relationships.relatedContactId, relatedContactId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause;
    switch (sortBy) {
      case "id":
        orderByClause = sortOrder === "asc" ? asc(relationships.id) : desc(relationships.id);
        break;
      case "contactId":
        orderByClause =
          sortOrder === "asc" ? asc(relationships.contactId) : desc(relationships.contactId);
        break;
      case "relatedContactId":
        orderByClause =
          sortOrder === "asc"
            ? asc(relationships.relatedContactId)
            : desc(relationships.relatedContactId);
        break;
      case "relationshipType":
        orderByClause =
          sortOrder === "asc"
            ? asc(relationships.relationshipType)
            : desc(relationships.relationshipType);
        break;
      case "isActive":
        orderByClause =
          sortOrder === "asc" ? asc(relationships.isActive) : desc(relationships.isActive);
        break;
      case "createdAt":
        orderByClause =
          sortOrder === "asc"
            ? asc(relationships.createdAt)
            : desc(relationships.createdAt);
        break;
      case "updatedAt":
      default:
        orderByClause =
          sortOrder === "asc"
            ? asc(relationships.updatedAt)
            : desc(relationships.updatedAt);
        break;
    }

    const query = db
      .select({
        id: relationships.id,
        contactId: relationships.contactId,
        relatedContactId: relationships.relatedContactId,
        relationshipType: relationships.relationshipType,
        displayRelationshipType: relationships.relationshipType,
        directionalDisplay: relationships.relationshipType,
        isActive: relationships.isActive,
        notes: relationships.notes,
        createdAt: relationships.createdAt,
        updatedAt: relationships.updatedAt,
        relatedContactName: sql<string>`concat(${contact.firstName}, ' ', ${contact.lastName})`.as(
          "relatedContactName"
        ),
        relatedContactGender: contact.gender,
        isReverse: sql<boolean>`false`.as("isReverse"),
        isReciprocal: sql<boolean>`false`.as("isReciprocal"),
      })
      .from(relationships)
      .leftJoin(contact, eq(relationships.relatedContactId, contact.id))
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(relationships)
      .where(whereClause);

    const [relations, totalCountResult] = await Promise.all([query.execute(), countQuery.execute()]);

    const enhancedRelations = (relations as RelationshipResult[]).map((rel) => ({
      ...rel,
      directionalDisplay: getDirectionalDisplay(rel.relationshipType, false),
    }));

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json(
      {
        relationships: enhancedRelations,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: {
          search,
          relationshipType,
          isActive,
          contactId,
          relatedContactId,
          sortBy,
          sortOrder,
        },
      },
      { headers: { "X-Total-Count": totalCount.toString() } }
    );
  } catch (error) {
    console.error("Error fetching relationships:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch relationships",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}


// --- POST Handler ---
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = relationshipSchema.parse(body);

    const relationshipType = validatedData.relationshipType as ValidRelationshipType;

    const existingRelationship = await db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.contactId, validatedData.contactId),
          eq(relationships.relatedContactId, validatedData.relatedContactId),
          eq(relationships.relationshipType, relationshipType),
          eq(relationships.isActive, true)
        )
      )
      .limit(1);

    if (existingRelationship.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate relationship",
          message: `Active relationship of type '${relationshipType}' already exists between contact ${validatedData.contactId} and related contact ${validatedData.relatedContactId}`,
        },
        { status: 409 }
      );
    }

    const [createdRelationship] = await db.insert(relationships).values(validatedData).returning();

    const reciprocalType = await getContextualReciprocal(relationshipType, validatedData.contactId);

    const isSelfRelationshipWithSameType =
      relationshipType === reciprocalType && validatedData.contactId === validatedData.relatedContactId;

    if (!isSelfRelationshipWithSameType) {
      const existingReciprocal = await db
        .select()
        .from(relationships)
        .where(
          and(
            eq(relationships.contactId, validatedData.relatedContactId),
            eq(relationships.relatedContactId, validatedData.contactId),
            eq(relationships.relationshipType, reciprocalType),
            eq(relationships.isActive, true)
          )
        )
        .limit(1);

      if (existingReciprocal.length === 0) {
        const reciprocalNote = `Auto-generated reciprocal of ${getDirectionalDisplay(relationshipType, false)} relationship`;

        await db.insert(relationships).values({
          contactId: validatedData.relatedContactId,
          relatedContactId: validatedData.contactId,
          relationshipType: reciprocalType,
          isActive: validatedData.isActive,
          notes: validatedData.notes
            ? `Reciprocal: ${validatedData.notes}`
            : reciprocalNote,
        });
      }
    }

    const enhancedRelationship = {
      ...createdRelationship,
      directionalDisplay: getDirectionalDisplay(relationshipType, false),
      reciprocalType,
      reciprocalDisplay: getDirectionalDisplay(reciprocalType, false),
    };

    return NextResponse.json(
      {
        message: "Relationship and reciprocal created successfully",
        relationship: enhancedRelationship,
        meta: {
          reciprocalCreated: !isSelfRelationshipWithSameType,
          reciprocalType,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    return ErrorHandler.handle(error);
  }
}
