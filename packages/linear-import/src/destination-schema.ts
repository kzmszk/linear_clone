import { z } from 'zod';

const mappingSchema = z.object({
  kind: z.string(),
  sourceId: z.string(),
  sourceRevision: z.string(),
  payloadHash: z.string(),
  destinationId: z.string().nullable(),
});
const referenceSchema = z.object({
  kind: z.string(),
  sourceId: z.string(),
  field: z.string(),
  targetKind: z.string(),
  targetSourceId: z.string(),
  destinationId: z.string().nullable(),
  targetDestinationId: z.string().nullable(),
});
const fileSchema = z.object({
  sourceId: z.string(),
  sourceUrl: z.string().optional(),
  issueId: z.string().nullable().optional(),
  destinationId: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  checksum: z.string().nullable().optional(),
  size: z.number().int().nonnegative().nullable().optional(),
  contentType: z.string().nullable().optional(),
});
export const destinationVerifySchema = z.object({
  runId: z.string(),
  records: z.number().int().nonnegative(),
  kinds: z.record(z.string(), z.number().int().nonnegative()),
  mappings: z.array(mappingSchema).default([]),
  unresolved: z.array(z.string()).default([]),
  references: z.array(referenceSchema).optional(),
  files: z.array(fileSchema).optional(),
});
export type DestinationVerify = z.infer<typeof destinationVerifySchema>;

export type DestinationChecks = {
  mismatches: string[];
  unsupported: string[];
  summary: {
    countsMatch: boolean;
    mappingsMatch: boolean;
    entitiesMatch: boolean;
    referencesMatch: boolean;
    filesMatch: boolean;
  };
};

export type Mapping = z.infer<typeof mappingSchema>;
export type DestinationFile = z.infer<typeof fileSchema>;
