import type { PromptTemplate } from '@shared/prompt-templates';
import type { Issue } from '@shared/tasks';
import { ISSUE_PROVIDER_META } from '@renderer/features/integrations/issue-provider-meta';

export type ContextActionKind = 'linked-issue' | 'draft-comments' | 'prompt-template';

const MAX_LABEL_TITLE_LENGTH = 24;

export interface ContextAction {
  id: string;
  kind: ContextActionKind;
  label: string;
  text: string;
  provider?: Issue['provider'];
  category?: PromptTemplate['category'];
}

function normalizeWhitespace(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function issueLabel(issue: Issue): string {
  const identifier = normalizeWhitespace(issue.identifier);
  const title = truncate(normalizeWhitespace(issue.title), MAX_LABEL_TITLE_LENGTH);
  if (identifier && title) return `${identifier} ${title}`;
  if (identifier) return identifier;
  if (title) return title;
  return 'Linked issue';
}

function issueInjectionText(issue: Issue): string {
  const providerDisplay = ISSUE_PROVIDER_META[issue.provider]?.displayName ?? issue.provider;
  const parts = [
    `Provider: ${providerDisplay}`,
    `Identifier: ${normalizeWhitespace(issue.identifier)}`,
    `Title: ${normalizeWhitespace(issue.title)}`,
    `URL: ${normalizeWhitespace(issue.url)}`,
    issue.description ? `Description: ${normalizeWhitespace(issue.description)}` : undefined,
    issue.status ? `Status: ${normalizeWhitespace(issue.status)}` : undefined,
    issue.assignees?.length
      ? `Assignees: ${issue.assignees.map(normalizeWhitespace).filter(Boolean).join(', ')}`
      : undefined,
    issue.project ? `Project: ${normalizeWhitespace(issue.project)}` : undefined,
  ].filter(Boolean);

  if (parts.length === 0) {
    return 'Linked issue context';
  }

  return parts.join(' | ');
}

export function buildLinkedIssueContextAction(issue?: Issue): ContextAction | null {
  if (!issue) return null;
  const normalizedIdentifier = normalizeWhitespace(issue.identifier) || 'unknown';
  return {
    id: `linked-issue:${issue.provider}:${normalizedIdentifier}`,
    kind: 'linked-issue',
    label: issueLabel(issue),
    text: issueInjectionText(issue),
    provider: issue.provider,
  };
}

export function buildPromptTemplateContextActions(templates: PromptTemplate[]): ContextAction[] {
  return templates
    .filter((t) => t.enabled && t.content.trim())
    .map((t) => ({
      id: `prompt-template:${t.id}`,
      kind: 'prompt-template' as const,
      label: t.name,
      text: t.content.trim(),
      category: t.category,
    }));
}

export function buildDraftCommentsContextAction(args: {
  count: number;
  formattedComments?: string;
}): ContextAction | null {
  const text = (args.formattedComments ?? '').trim();
  if (!text || args.count <= 0) return null;

  return {
    id: 'draft-comments',
    kind: 'draft-comments',
    label: `Comments (${args.count})`,
    text,
  };
}

export function buildTaskContextActions(
  linkedIssue?: Issue,
  draftComments?: { count: number; formattedComments?: string },
  promptTemplates?: PromptTemplate[]
): ContextAction[] {
  const linkedIssueAction = buildLinkedIssueContextAction(linkedIssue);
  const draftCommentsAction = draftComments ? buildDraftCommentsContextAction(draftComments) : null;
  const templateActions = promptTemplates ? buildPromptTemplateContextActions(promptTemplates) : [];
  const actions: ContextAction[] = [];
  if (linkedIssueAction) actions.push(linkedIssueAction);
  if (draftCommentsAction) actions.push(draftCommentsAction);
  actions.push(...templateActions);
  return actions;
}
