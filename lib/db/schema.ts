import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  date,
  boolean,
  numeric,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const titleEnum = pgEnum("title", [
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "eng",
  "other",
  "rabbi",
]);

export const genderEnum = pgEnum("gender", ["male", "female"]);

export const receiptTypeEnum = pgEnum("receipt_type", [
  "invoice",
  "confirmation",
  "receipt",
  "other",
]);

export const relationshipEnum = pgEnum("relationship", [
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
]);

export const programEnum = pgEnum("program", [
  "LH",
  "LLC",
  "ML",
  "Kollel",
  "Madrich",
]);

export const trackEnum = pgEnum("track", [
  "Alef",
  "Bet",
  "Gimmel",
  "Dalet",
  "Heh",
  "March Draft",
  "August Draft",
  "Room & Board",
  "Other Draft",
]);

export const trackDetailEnum = pgEnum("track_detail", [
  "Full Year",
  "Fall",
  "Spring",
  "Until Pesach",
]);

export const statusEnum = pgEnum("status", [
  "Student",
  "Active Soldier",
  "Staff",
  "Withdrew",
  "Transferred Out",
  "Left Early",
  "Asked to Leave",
]);

export const machzorEnum = pgEnum("machzor", [
  "10.5",
  "10",
  "9.5",
  "9",
  "8.5",
  "8",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
    "ach", "bill_pay", "cash", "check", "credit", "credit_card", "expected",
    "goods_and_services", "matching_funds", "money_order", "p2p", "pending","bank_transfer",
    "refund", "scholarship", "stock", "student_portion", "unknown", "wire", "xfer",'other'
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "processing",
]);

export const frequencyEnum = pgEnum("frequency", [
  "weekly",
  "monthly",
  "quarterly",
  "biannual",
  "annual",
  "one_time",
  "custom",
]);

export const planStatusEnum = pgEnum("plan_status", [
  "active",
  "completed",
  "cancelled",
  "paused",
  "overdue",
]);

export const currencyEnum = pgEnum("currency", [
  "USD",
  "ILS",
  "EUR",
  "JPY",
  "GBP",
  "AUD",
  "CAD",
  "ZAR",
]);

// *** NEW ENUMS FOR SOLICITOR SYSTEM ***
export const solicitorStatusEnum = pgEnum("solicitor_status", [
  "active",
  "inactive",
  "suspended",
]);

export const bonusPaymentTypeEnum = pgEnum("bonus_payment_type", [
  "tuition",
  "donation",
  "both",
]);

// new enum for distribution type
export const distributionTypeEnum = pgEnum("distribution_type", [
  "fixed",
  "custom",
]);

// new enum for installment status
export const installmentStatusEnum = pgEnum("installment_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);

export const contact = pgTable("contact", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").unique(),
  phone: text("phone"),
  title: text("title"),
  gender: genderEnum("gender"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Contact = typeof contact.$inferSelect;
export type NewContact = typeof contact.$inferInsert;

export const studentRoles = pgTable(
  "student_roles",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),
    year: text("year").notNull().default("2024-2025"),
    program: programEnum("program").notNull(),
    track: trackEnum("track").notNull(),
    trackDetail: trackDetailEnum("track_detail"),
    status: statusEnum("status").notNull(),
    machzor: machzorEnum("machzor"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isActive: boolean("is_active").default(true).notNull(),
    additionalNotes: text("additional_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    contactIdIdx: index("student_roles_contact_id_idx").on(table.contactId),
  })
);

export type StudentRole = typeof studentRoles.$inferSelect;
export type NewStudentRole = typeof studentRoles.$inferInsert;

export const contactRoles = pgTable(
  "contact_roles",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),
    roleName: text("role_name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    contactIdIdx: index("contact_roles_contact_id_idx").on(table.contactId),
    roleNameIdx: index("contact_roles_role_name_idx").on(table.roleName),
  })
);

export type ContactRole = typeof contactRoles.$inferSelect;
export type NewContactRole = typeof contactRoles.$inferInsert;

export const relationships = pgTable(
  "relationships",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),
    relatedContactId: integer("related_contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),
    relationshipType: relationshipEnum("relationship_type").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    contactIdIdx: index("relationships_contact_id_idx").on(table.contactId),
    relatedContactIdIdx: index("relationships_related_contact_id_idx").on(
      table.relatedContactId
    ),
    uniqueRelationship: uniqueIndex("relationships_unique").on(
      table.contactId,
      table.relatedContactId,
      table.relationshipType
    ),
  })
);

export type Relationship = typeof relationships.$inferSelect;
export type NewRelationship = typeof relationships.$inferInsert;

export const category = pgTable("category", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;

export const pledge = pgTable("pledge", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .references(() => contact.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: integer("category_id").references(() => category.id, {
    onDelete: "set null",
  }),
  pledgeDate: date("pledge_date").notNull(),
  description: text("description"),
  originalAmount: numeric("original_amount", {
    precision: 10,
    scale: 2,
  }).notNull(),
  currency: currencyEnum("currency").notNull().default("USD"),
  // These fields remain unchanged, to be kept in sync by backend logic
  totalPaid: numeric("total_paid", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),
  originalAmountUsd: numeric("original_amount_usd", {
    precision: 10,
    scale: 2,
  }),
  totalPaidUsd: numeric("total_paid_usd", { precision: 10, scale: 2 }).default(
    "0"
  ),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 2 }),
  balanceUsd: numeric("balance_usd", { precision: 10, scale: 2 }),
  campaignCode: text("campaign_code"),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Pledge = typeof pledge.$inferSelect;
export type NewPledge = typeof pledge.$inferInsert;

export const paymentPlan = pgTable(
  "payment_plan",
  {
    id: serial("id").primaryKey(),
    pledgeId: integer("pledge_id")
      .references(() => pledge.id, { onDelete: "cascade" })
      .notNull(),

    planName: text("plan_name"),
    frequency: frequencyEnum("frequency").notNull(),
    // NEW FIELD: Distribution type
    distributionType: distributionTypeEnum("distribution_type").notNull().default("fixed"),

    totalPlannedAmount: numeric("total_planned_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    currency: currencyEnum("currency").notNull(),
    installmentAmount: numeric("installment_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    numberOfInstallments: integer("number_of_installments").notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 2 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    nextPaymentDate: date("next_payment_date"),

    installmentsPaid: integer("installments_paid").default(0).notNull(),
    totalPaid: numeric("total_paid", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    totalPaidUsd: numeric("total_paid_usd", { precision: 10, scale: 2 }),
    remainingAmount: numeric("remaining_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),

    planStatus: planStatusEnum("plan_status").notNull().default("active"),
    autoRenew: boolean("auto_renew").default(false).notNull(),
    remindersSent: integer("reminders_sent").default(0).notNull(),
    lastReminderDate: date("last_reminder_date"),

    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pledgeIdIdx: index("payment_plan_pledge_id_idx").on(table.pledgeId),
    statusIdx: index("payment_plan_status_idx").on(table.planStatus),
    nextPaymentIdx: index("payment_plan_next_payment_idx").on(
      table.nextPaymentDate
    ),
  })
);

export type PaymentPlan = typeof paymentPlan.$inferSelect;
export type NewPaymentPlan = typeof paymentPlan.$inferInsert;

export const exchangeRate = pgTable(
  "exchange_rate",
  {
    id: serial("id").primaryKey(),
    baseCurrency: currencyEnum("base_currency").notNull().default("USD"),
    targetCurrency: currencyEnum("target_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    date: date("date").notNull(),

    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueRate: uniqueIndex("exchange_rate_unique_idx").on(
      table.baseCurrency,
      table.targetCurrency,
      table.date
    ),
    baseCurrencyIdx: index("exchange_rate_base_currency_idx").on(table.baseCurrency),
    targetCurrencyIdx: index("exchange_rate_target_currency_idx").on(table.targetCurrency),
    dateIdx: index("exchange_rate_date_idx").on(table.date),
  })
);

export type ExchangeRate = typeof exchangeRate.$inferSelect;
export type NewExchangeRate = typeof exchangeRate.$inferInsert;

// NEW TABLES FOR SOLICITOR SYSTEM
// Solicitor table - links to existing contact
export const solicitor = pgTable(
  "solicitor",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull()
      .unique(), // One-to-one with contact
    solicitorCode: text("solicitor_code").unique(), // Optional unique identifier
    status: solicitorStatusEnum("status").notNull().default("active"),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }), // Default rate if no specific bonus rule
    hireDate: date("hire_date"), // Made nullable by removing .notNull()
    terminationDate: date("termination_date"), // Made nullable by removing .notNull()
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    contactIdIdx: index("solicitor_contact_id_idx").on(table.contactId),
    statusIdx: index("solicitor_status_idx").on(table.status),
    codeIdx: index("solicitor_code_idx").on(table.solicitorCode),
  })
);

export type Solicitor = typeof solicitor.$inferSelect;
export type NewSolicitor = typeof solicitor.$inferInsert;

// Bonus rules for flexible commission structures
export const bonusRule = pgTable(
  "bonus_rule",
  {
    id: serial("id").primaryKey(),
    solicitorId: integer("solicitor_id")
      .references(() => solicitor.id, { onDelete: "cascade" })
      .notNull(),
    ruleName: text("rule_name").notNull(),
    bonusPercentage: numeric("bonus_percentage", {
      precision: 5,
      scale: 2,
    }).notNull(),
    paymentType: bonusPaymentTypeEnum("payment_type").notNull().default("both"),
    minAmount: numeric("min_amount", { precision: 10, scale: 2 }), // Minimum payment to qualify
    maxAmount: numeric("max_amount", { precision: 10, scale: 2 }), // Maximum bonus cap
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"), // NULL means ongoing
    isActive: boolean("is_active").default(true).notNull(),
    priority: integer("priority").default(1).notNull(), // Higher number = higher priority if multiple rules apply
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    solicitorIdIdx: index("bonus_rule_solicitor_id_idx").on(table.solicitorId),
    effectiveDatesIdx: index("bonus_rule_effective_dates_idx").on(
      table.effectiveFrom,
      table.effectiveTo
    ),
    priorityIdx: index("bonus_rule_priority_idx").on(table.priority),
  })
);

export type BonusRule = typeof bonusRule.$inferSelect;
export type NewBonusRule = typeof bonusRule.$inferInsert;

// NEW TABLE: Installment Schedules
export const installmentSchedule = pgTable(
  "installment_schedule",
  {
    id: serial("id").primaryKey(),
    paymentPlanId: integer("payment_plan_id")
      .references(() => paymentPlan.id, { onDelete: "cascade" })
      .notNull(),
    installmentDate: date("installment_date").notNull(),
    installmentAmount: numeric("installment_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    currency: currencyEnum("currency").notNull(),
    status: installmentStatusEnum("status").notNull().default("pending"),
    paidDate: date("paid_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    // paymentId foreign key: Removed direct 'references' to break circular dependency
    // The relationship will be defined in the relations block below.
    paymentId: integer("payment_id"),
  },
  (table) => ({
    paymentPlanIdIdx: index("installment_schedule_payment_plan_id_idx").on(
      table.paymentPlanId
    ),
    installmentDateIdx: index("installment_schedule_installment_date_idx").on(
      table.installmentDate
    ),
    statusIdx: index("installment_schedule_status_idx").on(table.status),
    // Index for paymentId remains
    paymentIdIdx: index("installment_schedule_payment_id_idx").on(table.paymentId),
  })
);

export type InstallmentSchedule = typeof installmentSchedule.$inferSelect;
export type NewInstallmentSchedule = typeof installmentSchedule.$inferInsert;

 // PAYMENT TABLE
export const payment = pgTable(
  "payment",
  {
    id: serial("id").primaryKey(),
    pledgeId: integer("pledge_id").references(() => pledge.id, {
      onDelete: "set null",
    }),
    paymentPlanId: integer("payment_plan_id").references(() => paymentPlan.id, {
      onDelete: "set null",
    }),
    installmentScheduleId: integer("installment_schedule_id").references(
      () => installmentSchedule.id,
      { onDelete: "set null" }
    ),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: currencyEnum("currency").notNull(),
    amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }),
    amountInPledgeCurrency: numeric("amount_pledge_currency", {
      precision: 10,
      scale: 2,
    }),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }),
    paymentDate: date("payment_date").notNull(),
    receivedDate: date("received_date"),
    checkDate: date("check_date"), // NEW FIELD
    account: text("account"), // NEW FIELD
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    methodDetail: text("method_detail"),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("completed"),
    referenceNumber: text("reference_number"),
    checkNumber: text("check_number"),
    receiptNumber: text("receipt_number"),
    receiptType: receiptTypeEnum("receipt_type"),
    receiptIssued: boolean("receipt_issued").default(false).notNull(),
    solicitorId: integer("solicitor_id").references(() => solicitor.id, {
      onDelete: "set null",
    }),
    bonusPercentage: numeric("bonus_percentage", { precision: 5, scale: 2 }),
    bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }),
    bonusRuleId: integer("bonus_rule_id").references(() => bonusRule.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pledgeIdIdx: index("payment_pledge_id_idx").on(table.pledgeId),
    paymentPlanIdIdx: index("payment_payment_plan_id_idx").on(table.paymentPlanId),
    paymentDateIdx: index("payment_payment_date_idx").on(table.paymentDate),
    statusIdx: index("payment_status_idx").on(table.paymentStatus),
    methodIdx: index("payment_method_idx").on(table.paymentMethod),
    referenceIdx: index("payment_reference_idx").on(table.referenceNumber),
    solicitorIdIdx: index("payment_solicitor_id_idx").on(table.solicitorId),
    installmentScheduleIdIdx: index("payment_installment_schedule_id_idx").on(table.installmentScheduleId),
  })
);

export type Payment = typeof payment.$inferSelect;
export type NewPayment = typeof payment.$inferInsert;

// PAYMENT_ALLOCATIONS TABLE
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id")
      .references(() => payment.id, { onDelete: "cascade" })
      .notNull(),
    pledgeId: integer("pledge_id")
      .references(() => pledge.id, { onDelete: "cascade" })
      .notNull(),
    installmentScheduleId: integer("installment_schedule_id").references(
      () => installmentSchedule.id,
      { onDelete: "set null" }
    ),
    allocatedAmount: numeric("allocated_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    currency: currencyEnum("currency").notNull(),
    allocatedAmountUsd: numeric("allocated_amount_usd", {
      precision: 10,
      scale: 2,
    }),
    receiptNumber: text("receipt_number"), // NEW FIELD
    receiptType: receiptTypeEnum("receipt_type"), // NEW FIELD
    receiptIssued: boolean("receipt_issued").default(false).notNull(), // NEW FIELD
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    paymentIdIdx: index("payment_allocations_payment_id_idx").on(table.paymentId),
    pledgeIdIdx: index("payment_allocations_pledge_id_idx").on(table.pledgeId),
    installmentScheduleIdIdx: index("payment_allocations_installment_schedule_id_idx").on(table.installmentScheduleId),
    uniqueAllocation: uniqueIndex("payment_allocations_unique").on(
      table.paymentId,
      table.pledgeId,
      table.installmentScheduleId
    ),
  })
);

export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type NewPaymentAllocation = typeof paymentAllocations.$inferInsert;

// Bonus calculations for audit trail and reporting
export const bonusCalculation = pgTable(
  "bonus_calculation",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id")
      .references(() => payment.id, { onDelete: "cascade" })
      .notNull()
      .unique(), // One calculation per payment
    solicitorId: integer("solicitor_id")
      .references(() => solicitor.id, { onDelete: "cascade" })
      .notNull(),
    bonusRuleId: integer("bonus_rule_id").references(() => bonusRule.id, {
      onDelete: "set null",
    }),
    paymentAmount: numeric("payment_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    bonusPercentage: numeric("bonus_percentage", {
      precision: 5,
      scale: 2,
    }).notNull(),
    bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }).notNull(),
    calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
    isPaid: boolean("is_paid").default(false).notNull(),
    paidAt: timestamp("paid_at"),
    notes: text("notes"),
  },
  (table) => ({
    paymentIdIdx: index("bonus_calculation_payment_id_idx").on(table.paymentId),
    solicitorIdIdx: index("bonus_calculation_solicitor_id_idx").on(
      table.solicitorId
    ),
    calculatedAtIdx: index("bonus_calculation_calculated_at_idx").on(
      table.calculatedAt
    ),
    isPaidIdx: index("bonus_calculation_is_paid_idx").on(table.isPaid),
  })
);

export type BonusCalculation = typeof bonusCalculation.$inferSelect;
export type NewBonusCalculation = typeof bonusCalculation.$inferInsert;

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action").notNull(),
  fieldName: text("field_name"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: integer("changed_by").references(() => contact.id, {
    onDelete: "set null",
  }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// *** UPDATED RELATIONS (with new solicitor relations) ***

export const contactRelations = relations(contact, ({ many }) => ({
  contactRoles: many(contactRoles),
  studentRoles: many(studentRoles),
  relationshipsAsSource: many(relationships, {
    relationName: "relationSource",
  }),
  relationshipsAsTarget: many(relationships, {
    relationName: "relationTarget",
  }),
  pledges: many(pledge),
  auditLogs: many(auditLog),
  // *** NEW RELATION ***
  solicitor: many(solicitor),
}));

export const contactRolesRelations = relations(contactRoles, ({ one }) => ({
  contact: one(contact, {
    fields: [contactRoles.contactId],
    references: [contact.id],
  }),
}));

export const studentRolesRelations = relations(studentRoles, ({ one }) => ({
  contact: one(contact, {
    fields: [studentRoles.contactId],
    references: [contact.id],
  }),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  contact: one(contact, {
    fields: [relationships.contactId],
    references: [contact.id],
    relationName: "relationSource",
  }),
  relatedContact: one(contact, {
    fields: [relationships.relatedContactId],
    references: [contact.id],
    relationName: "relationTarget",
  }),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  pledges: many(pledge),
}));

export const pledgeRelations = relations(pledge, ({ one, many }) => ({
  contact: one(contact, {
    fields: [pledge.contactId],
    references: [contact.id],
  }),
  category: one(category, {
    fields: [pledge.categoryId],
    references: [category.id],
  }),
  paymentPlans: many(paymentPlan),
  payments: many(payment), // KEPT: Direct payment relation
  // NEW RELATION: Pledge can have many allocations (for split payments)
  paymentAllocations: many(paymentAllocations),
}));

export const paymentPlanRelations = relations(paymentPlan, ({ one, many }) => ({
  pledge: one(pledge, {
    fields: [paymentPlan.pledgeId],
    references: [pledge.id],
  }),
  payments: many(payment),
  installmentSchedules: many(installmentSchedule),
}));

export const installmentScheduleRelations = relations(
  installmentSchedule,
  ({ one, many }) => ({ // ADDED 'many' for paymentAllocations
    paymentPlan: one(paymentPlan, {
      fields: [installmentSchedule.paymentPlanId],
      references: [paymentPlan.id],
    }),
    // payment relation now defined here, as it was removed from pgTable definition
    payment: one(payment, {
      fields: [installmentSchedule.paymentId],
      references: [payment.id],
    }),
    // NEW RELATION: An installment schedule can have multiple allocations
    // (e.g., partial payments, or parts of different split payments)
    paymentAllocations: many(paymentAllocations),
  })
);

// *** UPDATED PAYMENT RELATIONS (with solicitor and paymentAllocations) ***
export const paymentRelations = relations(payment, ({ one, many }) => ({ // ADDED 'many' for paymentAllocations
  pledge: one(pledge, { // KEPT: Direct pledge relation
    fields: [payment.pledgeId],
    references: [pledge.id],
  }),
  paymentPlan: one(paymentPlan, {
    fields: [payment.paymentPlanId],
    references: [paymentPlan.id],
  }),
  installmentSchedule: one(installmentSchedule, { // KEPT: Direct installment relation
    fields: [payment.installmentScheduleId],
    references: [installmentSchedule.id],
  }),
  solicitor: one(solicitor, {
    fields: [payment.solicitorId],
    references: [solicitor.id],
  }),
  bonusRule: one(bonusRule, {
    fields: [payment.bonusRuleId],
    references: [bonusRule.id],
  }),
  bonusCalculation: one(bonusCalculation, {
    fields: [payment.id],
    references: [bonusCalculation.paymentId],
  }),
  // NEW RELATION: A payment can have multiple allocations
  paymentAllocations: many(paymentAllocations),
}));


// *** NEW SOLICITOR RELATIONS ***
export const solicitorRelations = relations(solicitor, ({ one, many }) => ({
  contact: one(contact, {
    fields: [solicitor.contactId],
    references: [contact.id],
  }),
  bonusRules: many(bonusRule),
  bonusCalculations: many(bonusCalculation),
  payments: many(payment),
}));

export const bonusRuleRelations = relations(bonusRule, ({ one, many }) => ({
  solicitor: one(solicitor, {
    fields: [bonusRule.solicitorId],
    references: [solicitor.id],
  }),
  bonusCalculations: many(bonusCalculation),
  payments: many(payment),
}));

export const bonusCalculationRelations = relations(
  bonusCalculation,
  ({ one }) => ({
    payment: one(payment, {
      fields: [bonusCalculation.paymentId],
      references: [payment.id],
    }),
    solicitor: one(solicitor, {
      fields: [bonusCalculation.solicitorId],
      references: [solicitor.id],
    }),
    bonusRule: one(bonusRule, {
      fields: [bonusCalculation.bonusRuleId],
      references: [bonusRule.id],
    }),
  })
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  changedByContact: one(contact, {
    fields: [auditLog.changedBy],
    references: [contact.id],
  }),
}));

// NEW RELATIONS for paymentAllocations
export const paymentAllocationsRelations = relations(
  paymentAllocations,
  ({ one }) => ({
    payment: one(payment, { 
      fields: [paymentAllocations.paymentId],
      references: [payment.id],
    }),
    pledge: one(pledge, {
      fields: [paymentAllocations.pledgeId],
      references: [pledge.id],
    }),
    installmentSchedule: one(installmentSchedule, {
      fields: [paymentAllocations.installmentScheduleId],
      references: [installmentSchedule.id],
    }),
  })
);
