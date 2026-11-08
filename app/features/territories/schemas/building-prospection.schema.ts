import { z } from 'zod'

export const buildingProspectionSchema = z.object({
  'prospection-date': z.string().default(''),
  'has-residential': z.string().default(''),
  homes: z.string().default(''),
  phones: z.string().default(''),
  liberals: z.string().default(''),
  access: z.string().default(''),
  pmr: z.string().optional(),
  doors: z.string().optional(),
  mailboxes: z.string().optional(),
  'residential-notes': z.string().default(''),
  hotel: z.string().optional(),
  campus: z.string().optional(),
  landromat: z.string().optional(),
  'shared-entrance-buildings': z.string().default(''),
  // One value per shop, in order. Conform reads an empty field among several as undefined: kept as '' so the
  // shops' categories and notes stay paired.
  shopkinds: z.array(z.string().default('')).default([]),
  'commerce-notes': z.array(z.string().default('')).default([]),
})

export type BuildingProspectionInput = z.infer<typeof buildingProspectionSchema>
