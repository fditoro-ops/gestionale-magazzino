import { z } from "zod";

export const CashClosureStatusSchema = z.enum([
  "DRAFT",
  "CLOSED",
  "VERIFIED",
  "CANCELLED",
]);

const MoneySchema = z.coerce.number().min(0);

export const CreateCashClosureSchema = z.object({
  business_date: z.string().min(1),
  operator_id: z.string().trim().nullable().optional(),
  operator_name: z.string().trim().nullable().optional(),

  theoretical_base: MoneySchema,
  cash_declared: MoneySchema.optional().default(0),
  card_declared: MoneySchema.optional().default(0),
  satispay_declared: MoneySchema.optional().default(0),
  other_declared: MoneySchema.optional().default(0),

  notes: z.string().trim().nullable().optional(),
});

export const UpdateCashClosureSchema = z.object({
  business_date: z.string().min(1).optional(),
  operator_id: z.string().trim().nullable().optional(),
  operator_name: z.string().trim().nullable().optional(),

  theoretical_base: MoneySchema.optional(),
  cash_declared: MoneySchema.optional(),
  card_declared: MoneySchema.optional(),
  satispay_declared: MoneySchema.optional(),
  other_declared: MoneySchema.optional(),

  notes: z.string().trim().nullable().optional(),
});

export const ListCashClosuresQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: CashClosureStatusSchema.optional(),
  operatorId: z.string().optional(),
});
