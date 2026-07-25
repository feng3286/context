import { describe, expect, it } from 'vitest';
import { normalizeLocalBranchRef } from './git-utils';

describe('normalizeLocalBranchRef', () => {
  it('strips the full refs/heads/ prefix', () => {
    expect(normalizeLocalBranchRef('refs/heads/main')).toBe('main');
  });

  it('strips the disambiguated heads/ short form', () => {
    // Emitted by `--abbrev-ref` / `%(refname:short)` when a branch shares its
    // name with a tag (refs/heads/v2.2.7 + refs/tags/v2.2.7).
    expect(normalizeLocalBranchRef('heads/v2.2.7')).toBe('v2.2.7');
  });

  it('leaves an already-short name untouched', () => {
    expect(normalizeLocalBranchRef('v2.2.7')).toBe('v2.2.7');
  });

  it('preserves slashes inside the branch name', () => {
    expect(normalizeLocalBranchRef('refs/heads/feature/x')).toBe('feature/x');
    expect(normalizeLocalBranchRef('heads/feature/x')).toBe('feature/x');
  });

  it('round-trips a real branch literally named "heads/weird" via the full ref', () => {
    // Only safe with --symbolic-full-name: the full ref keeps the refs/heads/
    // prefix so the inner "heads/" segment is not mistaken for disambiguation.
    expect(normalizeLocalBranchRef('refs/heads/heads/weird')).toBe('heads/weird');
  });

  it('returns empty string unchanged (caller decides detached HEAD)', () => {
    expect(normalizeLocalBranchRef('')).toBe('');
    expect(normalizeLocalBranchRef('HEAD')).toBe('HEAD');
  });
});
