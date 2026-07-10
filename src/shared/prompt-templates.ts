import z from 'zod';

export const PROMPT_TEMPLATE_CATEGORIES = [
  'review',
  'test',
  'refactor',
  'explain',
  'custom',
] as const;

export type PromptTemplateCategory = (typeof PROMPT_TEMPLATE_CATEGORIES)[number];

export const promptTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required'),
  content: z.string().min(1, 'Content is required'),
  category: z.enum(PROMPT_TEMPLATE_CATEGORIES).default('custom'),
  enabled: z.boolean().default(true),
  order: z.number().int().default(0),
  isSystem: z.boolean().default(false),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'review-default',
    name: 'Review changes',
    content:
      'Review all changes in this worktree. Focus on correctness, regressions, edge cases, and missing tests. List concrete issues first, then note residual risks.',
    category: 'review',
    enabled: true,
    order: 0,
    isSystem: true,
  },
  {
    id: 'review-security',
    name: 'Security review',
    content:
      'Review all changes for security vulnerabilities including: injection attacks, authentication bypasses, sensitive data exposure, insecure dependencies, and common OWASP patterns. List findings by severity.',
    category: 'review',
    enabled: true,
    order: 1,
    isSystem: true,
  },
  {
    id: 'test-generate',
    name: 'Generate tests',
    content:
      'Write comprehensive tests for the changes in this worktree. Cover happy paths, edge cases, and error conditions. Follow existing test patterns and conventions in the codebase.',
    category: 'test',
    enabled: true,
    order: 0,
    isSystem: true,
  },
  {
    id: 'review-performance',
    name: 'Performance review',
    content:
      'Review changes for performance issues: N+1 queries, unnecessary re-renders, missing indexes, large allocations, inefficient loops, and memory leaks. Suggest concrete improvements with before/after complexity.',
    category: 'review',
    enabled: true,
    order: 2,
    isSystem: true,
  },
];
