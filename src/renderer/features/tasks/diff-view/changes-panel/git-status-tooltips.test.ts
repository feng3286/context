import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { getBranchTooltipText, getPublishTooltipText } from './git-status-tooltips';

const mockT = ((key: string) => key) as TFunction<'translation', undefined>;

describe('git status tooltips', () => {
  it('shows initial-commit guidance for missing branch tooltip', () => {
    expect(getBranchTooltipText(undefined, mockT)).toBe('gitStatusTooltips:createInitialCommit');
  });

  it('shows initial-commit guidance for disabled publish/add-remote button when branch is missing', () => {
    expect(
      getPublishTooltipText({
        isPublishing: false,
        branchName: undefined,
        shouldOfferAddRemote: true,
        t: mockT,
      })
    ).toBe('gitStatusTooltips:createInitialCommit');
  });

  it('preserves existing publish tooltip behavior when branch exists', () => {
    expect(
      getPublishTooltipText({
        isPublishing: false,
        branchName: 'main',
        shouldOfferAddRemote: true,
        t: mockT,
      })
    ).toBe('gitStatusTooltips:addRemoteThenPublish');

    expect(
      getPublishTooltipText({
        isPublishing: false,
        branchName: 'main',
        shouldOfferAddRemote: false,
        t: mockT,
      })
    ).toBe('gitStatusTooltips:publishBranch');
  });
});
