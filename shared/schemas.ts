import { z } from 'zod';

export const VerdictSchema = z.enum(['junk', 'maybe', 'keep']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const CategorySchema = z.enum([
  'installer',
  'duplicate',
  'old_media',
  'important_doc',
  'archive',
  'log_or_temp',
  'other',
]);
export type Category = z.infer<typeof CategorySchema>;

export const FileMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(), // bytes
  modifiedTime: z.string().optional(),
  viewedByMeTime: z.string().optional(),
  parents: z.array(z.string()).optional(),
  quotaBytesUsed: z.number().optional(),
});
export type FileMeta = z.infer<typeof FileMetaSchema>;

export const AnalysisSchema = z.object({
  id: z.string(),
  verdict: VerdictSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(80),
  category: CategorySchema,
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const AnalyzeRequestSchema = z.object({
  files: z.array(FileMetaSchema).min(1).max(25),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.object({
  results: z.array(AnalysisSchema),
  source: z.enum(['gemini', 'heuristic']),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const TrashRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(25),
});
export type TrashRequest = z.infer<typeof TrashRequestSchema>;

export const TrashResultSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  bytesFreed: z.number().optional(),
});
export type TrashResult = z.infer<typeof TrashResultSchema>;

export const TrashResponseSchema = z.object({
  results: z.array(TrashResultSchema),
});
export type TrashResponse = z.infer<typeof TrashResponseSchema>;

export const RestoreRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(25),
});
export type RestoreRequest = z.infer<typeof RestoreRequestSchema>;

export const RestoreResultSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
export type RestoreResult = z.infer<typeof RestoreResultSchema>;

export const RestoreResponseSchema = z.object({
  results: z.array(RestoreResultSchema),
});
export type RestoreResponse = z.infer<typeof RestoreResponseSchema>;

export const UserProfileSchema = z.object({
  authenticated: z.boolean(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  photoUrl: z.string().url().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;
