import z from 'zod';

export const customAgentEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  cli: z.string().min(1),
  autoApproveFlag: z.string().optional(),
  initialPromptFlag: z.string().optional(),
  defaultArgs: z.array(z.string()).optional(),
  resumeFlag: z.string().optional(),
  sessionIdFlag: z.string().optional(),
  useKeystrokeInjection: z.boolean().default(false),
  installCommand: z.string().optional(),
  docUrl: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  extraArgs: z.string().optional(),
});

export type CustomAgentEntry = z.infer<typeof customAgentEntrySchema>;
