import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, desc, asc, or, ilike, and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { ErrorHandler } from "@/lib/error-handler";
import { relationships, contact, user } from "@/lib/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// --- DB enum values ---
const dbRelationshipEnumValues = [
  "mother", "father", "grandmother", "grandchild", "grandfather", "grandparent", "parent", "step-parent", "stepmother", "stepfather", "sister", "brother", "step-sister", "step-brother", "stepson", "daughter", "son", "aunt", "uncle", "aunt/uncle", "nephew", "niece", "grandson", "granddaughter", "cousin (m)", "cousin (f)", "spouse", "partner", "wife", "husband", "former husband", "former wife", "fiance", "divorced co-parent", "separated co-parent", "legal guardian", "legal guardian partner", "friend", "neighbor", "relative", "business", "owner", "chevrusa", "congregant", "rabbi", "contact", "foundation", "donor", "fund", "rebbi contact", "rebbi contact for", "employee", "employer", "machatunim",
  "His Sister", "Her Sister", "Her Brother", "His Brother", "His Aunt", "Her Aunt", "His Uncle", "Her Uncle", "His Parents", "Her Parents", "Her Mother", "His Mother", "His Father", "Her Nephew", "His Nephew", "His Niece", "Her Niece", "His Grandparents", "Her Grandparents", "Her Father", "Their Daughter", "Their Son", "His Daughter", "His Son", "Her Daughter", "Her Son", "His Cousin (M)", "Her Grandfather", "Her Grandmother", "His Grandfather", "His Grandmother", "His Wife", "Her Husband", "Her Former Husband", "His Former Wife", "His Cousin (F)", "Her Cousin (M)", "Her Cousin (F)", "Partner", "Friend", "Neighbor", "Relative", "Business", "Chevrusa", "Congregant", "Contact", "Donor", "Fiance", "Foundation", "Fund", "Her Step Son", "His Step Mother", "Owner", "Rabbi", "Their Granddaughter", "Their Grandson", "Employee", "Employer"
] as const;

type RelationshipType = typeof dbRelationshipEnumValues[number];
const [firstRelationshipType, ...restRelationshipTypes] = dbRelationshipEnumValues;

// --- Reciprocal mapping for expanded and core values ---
const RECIPROCAL_MAPPING: Record<string, RelationshipType> = {
  "Her Brother": "His Sister",
  "His Sister": "Her Brother",
  "His Brother": "Her Sister",
  "Her Sister": "His Brother",
  "His Mother": "Her Son",
  "Her Mother": "His Son",
  "His Son": "Her Mother",
  "Her Son": "His Mother",
  "His Daughter": "Her Father",
  "Her Daughter": "His Father",
  "His Father": "Her Daughter",
  "Her Father": "His Daughter",
  "His Wife": "Her Husband",
  "Her Husband": "His Wife",
  "His Niece": "Her Aunt",
  "Her Niece": "His Uncle",
  "Her Nephew": "His Aunt",
  "His Nephew": "Her Uncle",
  "His Aunt": "Her Nephew",
  "Her Aunt": "His Nephew",
  "His Uncle": "Her Niece",
  "Her Uncle": "His Niece",
  "His Grandparents": "Their Grandson",
  "Her Grandparents": "Their Grandson",
  "His Grandfather": "Their Granddaughter",
  "Her Grandfather": "Their Grandson",
  "His Grandmother": "Their Grandson",
  "Her Grandmother": "Their Grandson",
  "Their Daughter": "His Father",
  "Their Son": "His Mother",
  "Her Granddaughter": "His Grandfather",
  "His Granddaughter": "Her Grandfather",
  "Their Granddaughter": "His Grandfather",
  "Their Grandson": "Her Grandmother",
  // Generic fallbacks for core DB enums:
  mother: "son",
  father: "daughter",
  grandmother: "grandchild",
  grandfather: "grandchild",
  grandparent: "grandchild",
  grandchild: "grandparent",
  parent: "son",
  "step-parent": "stepson",
  stepmother: "stepson",
  stepfather: "stepson",
  sister: "brother",
  brother: "sister",
  "step-sister": "step-brother",
  "step-brother": "step-sister",
  stepson: "stepmother",
  daughter: "father",
  son: "mother",
  aunt: "nephew",
  uncle: "niece",
  "aunt/uncle": "niece",
  nephew: "aunt",
  niece: "uncle",
  grandson: "grandmother",
  granddaughter: "grandfather",
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
  Partner: "Partner",
  Friend: "Friend",
  Neighbor: "Neighbor",
  Relative: "Relative",
  Business: "Business",
  Chevrusa: "Chevrusa",
  Congregant: "Rabbi",
  Contact: "Contact",
  Donor: "Foundation",
  Fiance: "Fiance",
  Foundation: "Donor",
  Fund: "Donor",
  Owner: "Business",
  Rabbi: "Congregant",
  Employee: "Employer",
  Employer: "Employee"
};

function getReciprocalRelationshipSafe(relationshipType: string): RelationshipType {
  const reciprocal = RECIPROCAL_MAPPING[relationshipType];
  if (reciprocal && dbRelationshipEnumValues.includes(reciprocal)) {
    return reciprocal;
  }
  if (dbRelationshipEnumValues.includes(relationshipType as RelationshipType)) {
    return relationshipType as RelationshipType;
  }
  return "contact" as RelationshipType;
}

async function getContextualReciprocal(relationshipType: string, targetContactId: number): Promise<RelationshipType> {
  // Reciprocals now fully explicit and gendered above!
  return getReciprocalRelationshipSafe(relationshipType);
}

// --- DIRECTIONAL DISPLAY MAP (as before) ---
const DIRECTIONAL_DISPLAY_MAP: Record<string, { forward: string; reverse: string }> = {
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

function getDirectionalDisplay(relationshipType: string, isReverse: boolean): string {
  const mapping = DIRECTIONAL_DISPLAY_MAP[relationshipType];
  if (!mapping) return relationshipType;
  return isReverse ? mapping.reverse : mapping.forward;
}

// --- Zod Schemas ---
const relationshipSchema = z
  .object({
    contactId: z.coerce.number().positive("Contact ID is required"),
    relatedContactId: z.number().positive("Related contact must be selected"),
    relationshipType: z.enum(
      [firstRelationshipType, ...restRelationshipTypes] as [RelationshipType, ...RelationshipType[]],
      { required_error: "Relationship type is required" }
    ),
    isActive: z.boolean(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => data.contactId !== data.relatedContactId,
    {
      message: "Cannot create relationship with the same contact",
      path: ["relatedContactId"],
    }
  );

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  relationshipType: z.enum([
      firstRelationshipType, ...restRelationshipTypes
    ] as [RelationshipType, ...RelationshipType[]]).optional(),
  isActive: z.coerce.boolean().optional(),
  contactId: z.coerce.number().positive().optional(),
  relatedContactId: z.coerce.number().positive().optional(),
  includeReciprocals: z.coerce.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user details including locationId
    const userDetails = await db
      .select({
        role: user.role,
        locationId: user.locationId,
      })
      .from(user)
      .where(eq(user.email, session.user.email))
      .limit(1);

    if (userDetails.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentUser = userDetails[0];
    const isAdmin = currentUser.role === "admin";

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
    } = parsedParams.data;

    const offset = (page - 1) * limit;

    if (contactId) {
      const conditions = [];

      if (search) {
        conditions.push(or(ilike(relationships.relationshipType, `%${search}%`), ilike(relationships.notes, `%${search}%`)));
      }
      if (relationshipType) conditions.push(eq(relationships.relationshipType, relationshipType));
      if (typeof isActive === "boolean") conditions.push(eq(relationships.isActive, isActive));
      if (relatedContactId)
        conditions.push(or(eq(relationships.relatedContactId, relatedContactId), eq(relationships.contactId, relatedContactId)));

      // Add locationId filtering for admins
      if (isAdmin && currentUser.locationId) {
        conditions.push(eq(relationships.locationId, currentUser.locationId));
        conditions.push(isNotNull(relationships.locationId));
      }

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
          relatedContactName: sql<string>`concat(${contact.firstName}, ' ', ${contact.lastName})`.as("relatedContactName"),
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
        },
        { headers: { "X-Total-Count": totalCount.toString() } }
      );
    }

    // Non-contactId logic unchanged
    const conditions = [];
    if (search) {
      conditions.push(or(ilike(relationships.relationshipType, `%${search}%`), ilike(relationships.notes, `%${search}%`)));
    }
    if (relationshipType) conditions.push(eq(relationships.relationshipType, relationshipType));
    if (typeof isActive === "boolean") conditions.push(eq(relationships.isActive, isActive));
    if (relatedContactId) conditions.push(eq(relationships.relatedContactId, relatedContactId));

    // Add locationId filtering for admins
    if (isAdmin && currentUser.locationId) {
      conditions.push(eq(relationships.locationId, currentUser.locationId));
      conditions.push(isNotNull(relationships.locationId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause;
    switch (sortBy) {
      case "id":
        orderByClause = sortOrder === "asc" ? asc(relationships.id) : desc(relationships.id);
        break;
      case "contactId":
        orderByClause = sortOrder === "asc" ? asc(relationships.contactId) : desc(relationships.contactId);
        break;
      case "relatedContactId":
        orderByClause = sortOrder === "asc" ? asc(relationships.relatedContactId) : desc(relationships.relatedContactId);
        break;
      case "relationshipType":
        orderByClause = sortOrder === "asc" ? asc(relationships.relationshipType) : desc(relationships.relationshipType);
        break;
      case "isActive":
        orderByClause = sortOrder === "asc" ? asc(relationships.isActive) : desc(relationships.isActive);
        break;
      case "createdAt":
        orderByClause = sortOrder === "asc" ? asc(relationships.createdAt) : desc(relationships.createdAt);
        break;
      case "updatedAt":
      default:
        orderByClause = sortOrder === "asc" ? asc(relationships.updatedAt) : desc(relationships.updatedAt);
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
        relatedContactName: sql<string>`concat(${contact.firstName}, ' ', ${contact.lastName})`.as("relatedContactName"),
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

    const countQuery = db.select({ count: sql<number>`count(*)`.as("count") }).from(relationships).where(whereClause);

    const [relations, totalCountResult] = await Promise.all([query.execute(), countQuery.execute()]);

    const enhancedRelations = relations.map((rel) => ({
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = relationshipSchema.parse(body);
    const relationshipType = validatedData.relationshipType;
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
          message: `An active relationship of type '${relationshipType}' already exists between contact ${validatedData.contactId} and related contact ${validatedData.relatedContactId}.`,
        },
        { status: 409 }
      );
    }

    const [createdRelationship] = await db.insert(relationships).values(validatedData).returning();
    const reciprocalType = await getContextualReciprocal(relationshipType, validatedData.contactId);

    const isSelfRelationshipWithSameType = relationshipType === reciprocalType && validatedData.contactId === validatedData.relatedContactId;

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
          notes: validatedData.notes ? `Reciprocal: ${validatedData.notes}` : reciprocalNote,
        });
      }
    }

    const enhancedRelationship = {
      ...createdRelationship,
      directionalDisplay: getDirectionalDisplay(relationshipType, false),
      reciprocalType,
      reciprocalDisplay: getDirectionalDisplay(reciprocalType, false),
      displayRelationshipType: relationshipType,
      relationshipType,
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
            field: issue.path.join(".") || "(root)",
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    return ErrorHandler.handle(error);
  }
}
