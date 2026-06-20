import type { TFunction } from 'i18next';

export function getBranchTooltipText(branchName: string | null | undefined, t: TFunction): string {
  return branchName ? branchName : t('gitStatusTooltips:createInitialCommit');
}

export function getPublishTooltipText({
  isPublishing,
  branchName,
  shouldOfferAddRemote,
  t,
}: {
  isPublishing: boolean;
  branchName: string | null | undefined;
  shouldOfferAddRemote: boolean;
  t: TFunction;
}): string {
  if (isPublishing) return t('gitStatusTooltips:publishing');
  if (!branchName) return t('gitStatusTooltips:createInitialCommit');
  if (shouldOfferAddRemote) return t('gitStatusTooltips:addRemoteThenPublish');
  return t('gitStatusTooltips:publishBranch');
}
