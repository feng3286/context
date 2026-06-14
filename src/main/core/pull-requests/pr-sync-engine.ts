import { randomUUID } from 'node:crypto';
import type { Octokit } from '@octokit/rest';
import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { prSyncProgressChannel, prUpdatedChannel } from '@shared/events/prEvents';
import type {
  MergeableState,
  MergeStateStatus,
  PrSyncProgress,
  PullRequest,
  PullRequestStatus,
} from '@shared/pull-requests';
import { getOctokit } from '@main/core/github/services/octokit-provider';
import {
  GET_PR_BY_NUMBER_QUERY,
  GET_PR_CHECK_RUNS_BY_URL_QUERY,
  INCREMENTAL_SYNC_PRS_QUERY,
  SYNC_PRS_QUERY,
} from '@main/core/github/services/pr-queries';
import {
  isGitHubUrl,
  normalizeGitHubUrl,
  splitNormalizedUrl,
} from '@main/core/github/services/utils';
import { db } from '@main/db/client';
import { KV } from '@main/db/kv';
import {
  projectRemotes,
  pullRequestAssignees,
  pullRequestChecks,
  pullRequestLabels,
  pullRequests,
  pullRequestUsers,
} from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { githubRateLimiter } from '@main/lib/rate-limiter';
import { withRetry } from '@main/lib/retry';
import { assemblePullRequest } from './pr-utils';

const PR_SYNC_MAX_COUNT = 300;
const PR_ARCHIVE_AGE_MONTHS = 6;

type FullSyncCursor = {
  /** The `updatedAt` of the last PR we have seen (pagination cursor). */
  lastUpdatedAt: string;
  /** true once we have reached the count limit or the beginning of history. */
  done: boolean;
  /** GraphQL page cursor from the last completed page. */
  pageCursor?: string;
};

type IncrementalSyncCursor = {
  /** We only fetch PRs updated after this timestamp on each incremental sync. */
  lastUpdatedAt: string;
  /** GraphQL page cursor for resuming mid-page. */
  pageCursor?: string;
  done: boolean;
};

type PrKvSchema = {
  [key: string]: FullSyncCursor | IncrementalSyncCursor | string;
};

// ---------------------------------------------------------------------------
// GQL node shapes
// ---------------------------------------------------------------------------

interface GqlUser {
  databaseId?: number; // absent for Mannequin actors
  login: string;
  avatarUrl: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
}

function actorUserId(actor: GqlUser): string {
  return actor.databaseId != null ? String(actor.databaseId) : `login:${actor.login}`;
}

interface GqlPrNode {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
  commitCount?: { totalCount: number };
  body: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: MergeableState;
  mergeStateStatus: MergeStateStatus | null;
  author: GqlUser | null;
  headRepository: { nameWithOwner: string; url: string; owner: { login: string } } | null;
  baseRepository: { url: string } | null;
  labels: { nodes: Array<{ name: string; color: string }> };
  assignees: { nodes: GqlUser[] };
  reviewDecision: string | null;
}

interface GqlCheckRunNode {
  __typename: 'CheckRun';
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  checkSuite: {
    app: { name: string; logoUrl: string } | null;
    workflowRun: { workflow: { name: string } } | null;
  } | null;
}

interface GqlStatusContextNode {
  __typename: 'StatusContext';
  context: string;
  state: string;
  targetUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// PrSyncEngine
// ---------------------------------------------------------------------------

export class PrSyncEngine {
  private readonly kv = new KV<PrKvSchema>('pr');

  // Per-repository in-flight promise + AbortController
  private readonly _inflight = new Map<string, Promise<void>>();
  private readonly _controllers = new Map<string, AbortController>();
  // Per-operation deduplication for single-PR and check-run syncs
  private readonly _singleInflight = new Map<string, Promise<void>>();
  private readonly _checksInflight = new Map<string, Promise<void>>();

  constructor(private readonly getOctokit: () => Promise<Octokit>) {}

  // ── Public sync API ────────────────────────────────────────────────────────

  /**
   * Smart sync: resumes a full sync if one is incomplete, otherwise runs an
   * incremental sync. Deduplicated — no-op if a sync is already in-flight.
   */
  sync(repositoryUrl: string): void {
    const key = `sync:${repositoryUrl}`;
    if (this._inflight.has(key)) {
      log.info('PrSyncEngine: sync already in flight, skipping', { repositoryUrl });
      return;
    }

    const ctrl = new AbortController();
    this._controllers.set(repositoryUrl, ctrl);

    const promise = this._getFullSyncCursor(repositoryUrl)
      .then((cursor) => {
        if (ctrl.signal.aborted) return;
        return cursor?.done
          ? this._runIncrementalSync(repositoryUrl, ctrl.signal)
          : this._runFullSync(repositoryUrl, ctrl.signal);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') {
          log.error('PrSyncEngine: sync failed', { repositoryUrl, error: String(e) });
        }
      })
      .finally(() => {
        this._controllers.delete(repositoryUrl);
        this._inflight.delete(key);
      });

    this._inflight.set(key, promise);
  }

  /** Cancel any in-flight sync, wipe both cursors, and start a fresh full sync. */
  forceFullSync(repositoryUrl: string): void {
    this.cancel(repositoryUrl);
    void Promise.all([
      this.kv.del(`fullsync:${repositoryUrl}`),
      this.kv.del(`incrementalsync:${repositoryUrl}`),
    ]).then(() => this.sync(repositoryUrl));
  }

  /** Abort and discard any in-flight sync for this repository URL. */
  cancel(repositoryUrl: string): void {
    const ctrl = this._controllers.get(repositoryUrl);
    if (ctrl) {
      ctrl.abort();
      this._controllers.delete(repositoryUrl);
      this._inflight.delete(`sync:${repositoryUrl}`);
    }
  }

  /** Cancel any in-flight syncs for a project and clean up its PR rows and KV cursors. */
  async deleteProjectData(projectId: string): Promise<void> {
    log.info('PrSyncEngine: deleteProjectData', { projectId });

    const remoteRows = await db
      .select({ remoteUrl: projectRemotes.remoteUrl })
      .from(projectRemotes)
      .where(eq(projectRemotes.projectId, projectId));

    if (remoteRows.length === 0) return;

    for (const { remoteUrl: url } of remoteRows) {
      this.cancel(url);

      const shared = await db
        .select({ projectId: projectRemotes.projectId })
        .from(projectRemotes)
        .where(and(eq(projectRemotes.remoteUrl, url), ne(projectRemotes.projectId, projectId)))
        .limit(1);

      if (shared.length > 0) {
        log.info(
          'PrSyncEngine: deleteProjectData — remote shared with other project, skipping data cleanup',
          { url }
        );
        continue;
      }

      log.info('PrSyncEngine: deleteProjectData — deleting PR rows and KV cursors', { url });
      await db.delete(pullRequests).where(eq(pullRequests.repositoryUrl, url));
      await Promise.all([
        this.kv.del(`fullsync:${url}`),
        this.kv.del(`incrementalsync:${url}`),
        this.kv.del(`users-synced-at:${url}`),
      ]);
    }
  }

  // ── Full sync (private implementation) ────────────────────────────────────

  /**
   * Paginate through all PRs for a repository ordered by updatedAt DESC.
   * Saves a cursor after each page so it can be resumed on restart.
   * Sets `done: true` once the cutoff is reached or history is exhausted.
   */
  private async _runFullSync(repositoryUrl: string, signal: AbortSignal): Promise<void> {
    log.info('PrSyncEngine: runFullSync start', { repositoryUrl });
    const { owner, repo } = splitNormalizedUrl(repositoryUrl);
    const octokit = await this.getOctokit().catch((e: unknown) => {
      log.warn('PrSyncEngine: runFullSync — failed to get Octokit (not authenticated?)', {
        repositoryUrl,
        error: String(e),
      });
      throw e;
    });

    // Resume from an existing cursor if available
    const existing = (await this.kv.get(`fullsync:${repositoryUrl}`)) as FullSyncCursor | null;
    let pageCursor: string | undefined = existing?.done ? undefined : existing?.pageCursor;

    let synced = 0;

    this._emitProgress({ remoteUrl: repositoryUrl, kind: 'full', status: 'running', synced: 0 });

    try {
      for (;;) {
        if (signal.aborted) return;

        const response = await withRetry(
          () =>
            githubRateLimiter.acquire().then(() =>
              octokit.graphql<{
                repository: {
                  pullRequests: {
                    totalCount: number;
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                    nodes: GqlPrNode[];
                  };
                };
              }>(SYNC_PRS_QUERY, { owner, repo, cursor: pageCursor ?? null, request: { signal } })
            ),
          { signal }
        );

        const { nodes, pageInfo, totalCount } = response.repository.pullRequests;
        const batch: GqlPrNode[] = nodes.slice();

        if (batch.length > 0) {
          await this._upsertBatch(repositoryUrl, batch);
          synced += batch.length;
        }

        const lastUpdatedAt =
          batch[batch.length - 1]?.updatedAt ?? existing?.lastUpdatedAt ?? new Date().toISOString();
        const done = !pageInfo.hasNextPage || synced >= PR_SYNC_MAX_COUNT;

        await this.kv.set(`fullsync:${repositoryUrl}`, {
          lastUpdatedAt,
          done,
          pageCursor: done ? undefined : (pageInfo.endCursor ?? undefined),
        } as FullSyncCursor);

        this._emitProgress({
          remoteUrl: repositoryUrl,
          kind: 'full',
          status: 'running',
          synced,
          total: Math.min(totalCount, PR_SYNC_MAX_COUNT),
        });

        if (done) break;
        pageCursor = pageInfo.endCursor ?? undefined;
      }

      await this._archiveOldPrs(repositoryUrl);
      this._emitProgress({ remoteUrl: repositoryUrl, kind: 'full', status: 'done', synced });
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') {
        this._emitProgress({ remoteUrl: repositoryUrl, kind: 'full', status: 'cancelled' });
        return;
      }
      this._emitProgress({
        remoteUrl: repositoryUrl,
        kind: 'full',
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  // ── Incremental sync (private implementation) ─────────────────────────────

  /**
   * Fetch only open PRs updated since the last incremental-sync cursor.
   * Resumable: saves a page cursor so it can continue where it left off.
   * Callers must ensure full sync is complete before calling this (sync() does this).
   */
  private async _runIncrementalSync(repositoryUrl: string, signal: AbortSignal): Promise<void> {
    log.info('PrSyncEngine: runIncrementalSync started', { repositoryUrl });

    const { owner, repo } = splitNormalizedUrl(repositoryUrl);
    const octokit = await this.getOctokit().catch((e: unknown) => {
      log.warn('PrSyncEngine: runIncrementalSync — failed to get Octokit (not authenticated?)', {
        repositoryUrl,
        error: String(e),
      });
      throw e;
    });

    const fullCursor = (await this.kv.get(`fullsync:${repositoryUrl}`)) as FullSyncCursor | null;
    const incrementalCursor = (await this.kv.get(
      `incrementalsync:${repositoryUrl}`
    )) as IncrementalSyncCursor | null;
    const sinceUpdatedAt =
      incrementalCursor?.lastUpdatedAt ?? fullCursor?.lastUpdatedAt ?? new Date(0).toISOString();

    let pageCursor: string | undefined = incrementalCursor?.done
      ? undefined
      : incrementalCursor?.pageCursor;
    let synced = 0;
    let lastUpdatedAt = sinceUpdatedAt;

    this._emitProgress({
      remoteUrl: repositoryUrl,
      kind: 'incremental',
      status: 'running',
      synced: 0,
    });

    try {
      for (;;) {
        if (signal.aborted) return;

        const response = await withRetry(
          () =>
            githubRateLimiter.acquire().then(() =>
              octokit.graphql<{
                repository: {
                  pullRequests: {
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                    nodes: GqlPrNode[];
                  };
                };
              }>(INCREMENTAL_SYNC_PRS_QUERY, {
                owner,
                repo,
                cursor: pageCursor ?? null,
                request: { signal },
              })
            ),
          { signal }
        );

        const { nodes, pageInfo } = response.repository.pullRequests;
        let reachedBoundary = false;
        const batch: GqlPrNode[] = [];

        for (const node of nodes) {
          if (node.updatedAt < sinceUpdatedAt) {
            reachedBoundary = true;
            break;
          }
          batch.push(node);
        }

        if (batch.length > 0) {
          await this._upsertBatch(repositoryUrl, batch);
          synced += batch.length;
          lastUpdatedAt = batch[0].updatedAt; // most recent first
        }

        // If we've processed too many PRs, the cursor is too stale — reset to a full sync.
        if (synced >= PR_SYNC_MAX_COUNT) {
          log.info('PrSyncEngine: incremental overflow — resetting to full sync', {
            repositoryUrl,
            synced,
          });
          await this.kv.del(`fullsync:${repositoryUrl}`);
          await this.kv.del(`incrementalsync:${repositoryUrl}`);
          this._emitProgress({
            remoteUrl: repositoryUrl,
            kind: 'incremental',
            status: 'done',
            synced,
          });
          return;
        }

        const done = reachedBoundary || !pageInfo.hasNextPage;

        await this.kv.set(`incrementalsync:${repositoryUrl}`, {
          lastUpdatedAt,
          pageCursor: done ? undefined : (pageInfo.endCursor ?? undefined),
          done,
        } as IncrementalSyncCursor);

        this._emitProgress({
          remoteUrl: repositoryUrl,
          kind: 'incremental',
          status: 'running',
          synced,
        });

        if (done) break;
        pageCursor = pageInfo.endCursor ?? undefined;
      }

      this._emitProgress({
        remoteUrl: repositoryUrl,
        kind: 'incremental',
        status: 'done',
        synced,
      });
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') {
        this._emitProgress({ remoteUrl: repositoryUrl, kind: 'incremental', status: 'cancelled' });
        return;
      }
      this._emitProgress({
        remoteUrl: repositoryUrl,
        kind: 'incremental',
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  // ── Single PR sync ─────────────────────────────────────────────────────────

  /** Sync a single PR by number. Deduplicated — awaits any in-flight call for the same PR. */
  async syncSingle(repositoryUrl: string, prNumber: number): Promise<PullRequest | null> {
    const key = `single:${repositoryUrl}:${prNumber}`;
    if (this._singleInflight.has(key)) {
      await this._singleInflight.get(key);
      return null;
    }

    const ctrl = new AbortController();
    let result: PullRequest | null = null;

    const promise = this._runSyncSingle(repositoryUrl, prNumber, ctrl.signal)
      .then((pr) => {
        result = pr;
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') {
          log.error('PrSyncEngine: syncSingle failed', {
            repositoryUrl,
            prNumber,
            error: String(e),
          });
        }
      })
      .finally(() => {
        this._singleInflight.delete(key);
      });

    this._singleInflight.set(key, promise);
    await promise;
    return result;
  }

  private async _runSyncSingle(
    repositoryUrl: string,
    prNumber: number,
    signal: AbortSignal
  ): Promise<PullRequest | null> {
    if (signal.aborted) return null;

    const { owner, repo } = splitNormalizedUrl(repositoryUrl);
    const octokit = await this.getOctokit();

    const response = await withRetry(() =>
      githubRateLimiter.acquire().then(() =>
        octokit.graphql<{
          repository: { pullRequest: GqlPrNode | null };
        }>(GET_PR_BY_NUMBER_QUERY, { owner, repo, number: prNumber })
      )
    );

    const node = response.repository.pullRequest;
    if (!node) return null;

    const [pr] = await this._upsertBatch(repositoryUrl, [node]);
    if (pr) {
      this._notifyPrUpdated(pr);
    }

    this._emitProgress({ remoteUrl: repositoryUrl, kind: 'single', status: 'done', synced: 1 });
    return pr ?? null;
  }

  // ── Check runs sync ────────────────────────────────────────────────────────

  /**
   * Fetch and store check runs for a PR. Deduplicated — awaits any in-flight call.
   * Returns true if any check is still running (caller should re-invoke soon).
   */
  async syncChecks(pullRequestUrl: string, headRefOid: string): Promise<boolean> {
    const key = `checks:${pullRequestUrl}:${headRefOid}`;
    if (this._checksInflight.has(key)) {
      await this._checksInflight.get(key);
      return false;
    }

    const ctrl = new AbortController();
    let result = false;

    const promise = this._runSyncChecks(pullRequestUrl, headRefOid, ctrl.signal)
      .then((r) => {
        result = r;
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') {
          log.error('PrSyncEngine: syncChecks failed', { pullRequestUrl, error: String(e) });
        }
      })
      .finally(() => {
        this._checksInflight.delete(key);
      });

    this._checksInflight.set(key, promise);
    await promise;
    return result;
  }

  private async _runSyncChecks(
    pullRequestUrl: string,
    headRefOid: string,
    signal: AbortSignal
  ): Promise<boolean> {
    if (signal.aborted) return false;

    // Detect stale checks: delete if commitSha changed
    const existing = await db
      .select({ commitSha: pullRequestChecks.commitSha })
      .from(pullRequestChecks)
      .where(eq(pullRequestChecks.pullRequestUrl, pullRequestUrl))
      .limit(1);

    if (existing.length > 0 && existing[0].commitSha !== headRefOid) {
      await db
        .delete(pullRequestChecks)
        .where(eq(pullRequestChecks.pullRequestUrl, pullRequestUrl));
    }

    // Fetch fresh check runs from GitHub
    const pr = await db
      .select({ identifier: pullRequests.identifier, repositoryUrl: pullRequests.repositoryUrl })
      .from(pullRequests)
      .where(eq(pullRequests.url, pullRequestUrl))
      .limit(1);

    if (!pr[0]) return false;

    const prNumber = pr[0].identifier ? parseInt(pr[0].identifier.replace('#', ''), 10) : NaN;
    if (isNaN(prNumber)) return false;

    if (!isGitHubUrl(pr[0].repositoryUrl)) return false;
    const { owner, repo } = splitNormalizedUrl(normalizeGitHubUrl(pr[0].repositoryUrl));
    const octokit = await this.getOctokit();

    type CheckNode = GqlCheckRunNode | GqlStatusContextNode;
    const allNodes: CheckNode[] = [];
    let cursor: string | undefined;

    for (;;) {
      if (signal.aborted) return false;

      const response: {
        repository: {
          pullRequest: {
            commits: {
              nodes: Array<{
                commit: {
                  oid: string;
                  statusCheckRollup: {
                    contexts: {
                      pageInfo: { hasNextPage: boolean; endCursor: string | null };
                      nodes: CheckNode[];
                    };
                  } | null;
                };
              }>;
            };
          } | null;
        };
      } = await withRetry(() =>
        githubRateLimiter.acquire().then(() =>
          octokit.graphql(GET_PR_CHECK_RUNS_BY_URL_QUERY, {
            owner,
            repo,
            number: prNumber,
            cursor: cursor ?? null,
          })
        )
      );

      const contexts =
        response.repository.pullRequest?.commits.nodes[0]?.commit?.statusCheckRollup?.contexts;
      if (!contexts) break;

      allNodes.push(...contexts.nodes);
      if (!contexts.pageInfo.hasNextPage) break;
      cursor = contexts.pageInfo.endCursor ?? undefined;
    }

    // Delete and re-insert
    await db.delete(pullRequestChecks).where(eq(pullRequestChecks.pullRequestUrl, pullRequestUrl));

    if (allNodes.length > 0) {
      await db.insert(pullRequestChecks).values(
        allNodes.map((node) => {
          if (node.__typename === 'CheckRun') {
            return {
              id: randomUUID(),
              pullRequestUrl,
              commitSha: headRefOid,
              name: node.name,
              status: node.status,
              conclusion: node.conclusion ?? 'NEUTRAL',
              detailsUrl: node.detailsUrl ?? null,
              startedAt: node.startedAt ?? null,
              completedAt: node.completedAt ?? null,
              workflowName: node.checkSuite?.workflowRun?.workflow?.name ?? null,
              appName: node.checkSuite?.app?.name ?? null,
              appLogoUrl: node.checkSuite?.app?.logoUrl ?? null,
            };
          }
          // StatusContext
          return {
            id: randomUUID(),
            pullRequestUrl,
            commitSha: headRefOid,
            name: node.context,
            status: node.state === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED',
            conclusion:
              node.state === 'SUCCESS'
                ? 'SUCCESS'
                : node.state === 'FAILURE' || node.state === 'ERROR'
                  ? 'FAILURE'
                  : 'NEUTRAL',
            detailsUrl: node.targetUrl ?? null,
            startedAt: node.createdAt,
            completedAt: node.state !== 'PENDING' ? node.createdAt : null,
            workflowName: null,
            appName: null,
            appLogoUrl: null,
          };
        })
      );
    }

    // Return true if any check is still in-progress
    const hasRunning = allNodes.some((n) => {
      if (n.__typename === 'CheckRun') {
        return (
          n.status === 'IN_PROGRESS' ||
          n.status === 'QUEUED' ||
          n.status === 'WAITING' ||
          n.status === 'PENDING'
        );
      }
      return n.state === 'PENDING';
    });

    // Notify the renderer with the fully-assembled PR so checks appear reactively.
    await this._notifyPrWithChecks(pullRequestUrl);

    return hasRunning;
  }

  private async _notifyPrWithChecks(pullRequestUrl: string): Promise<void> {
    const [prRow] = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.url, pullRequestUrl))
      .limit(1);

    if (!prRow) return;

    const [checkRows, labelRows, assigneeJoins] = await Promise.all([
      db
        .select()
        .from(pullRequestChecks)
        .where(eq(pullRequestChecks.pullRequestUrl, pullRequestUrl)),
      db
        .select()
        .from(pullRequestLabels)
        .where(eq(pullRequestLabels.pullRequestId, pullRequestUrl)),
      db
        .select({ user: pullRequestUsers })
        .from(pullRequestAssignees)
        .innerJoin(pullRequestUsers, eq(pullRequestAssignees.userId, pullRequestUsers.userId))
        .where(eq(pullRequestAssignees.pullRequestUrl, pullRequestUrl)),
    ]);

    let authorRow: typeof pullRequestUsers.$inferSelect | null = null;
    if (prRow.authorUserId) {
      const [a] = await db
        .select()
        .from(pullRequestUsers)
        .where(eq(pullRequestUsers.userId, prRow.authorUserId))
        .limit(1);
      authorRow = a ?? null;
    }

    const assembled = assemblePullRequest(
      prRow,
      authorRow,
      labelRows,
      assigneeJoins.map((j) => j.user),
      checkRows
    );
    this._notifyPrUpdated(assembled);
  }

  // ── Users sync ─────────────────────────────────────────────────────────────

  /** Sync users referenced by PRs in this repository. Runs at most once per day. */
  async syncUsers(repositoryUrl: string): Promise<void> {
    const tsKey = `users-synced-at:${repositoryUrl}`;
    const lastSync = (await this.kv.get(tsKey)) as string | null;
    if (lastSync) {
      const age = Date.now() - new Date(lastSync).getTime();
      if (age < 24 * 60 * 60 * 1000) return;
    }
    await this.kv.set(tsKey, new Date().toISOString());
    // Users are upserted inline during _upsertBatch, so this is a no-op for now.
    // Reserved for future use (e.g. refreshing user profile pics in bulk).
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _upsertBatch(repositoryUrl: string, nodes: GqlPrNode[]): Promise<PullRequest[]> {
    if (nodes.length === 0) return [];

    // 1. Collect all unique user IDs across authors and assignees
    const userMap = new Map<string, typeof pullRequestUsers.$inferInsert>();
    const prUrls: string[] = [];

    for (const node of nodes) {
      prUrls.push(node.url);

      // Author
      if (node.author) {
        const uid = actorUserId(node.author);
        userMap.set(uid, {
          userId: uid,
          userName: node.author.login,
          displayName: node.author.login,
          avatarUrl: node.author.avatarUrl ?? null,
          url: node.author.url ?? null,
          userCreatedAt: node.author.createdAt ?? null,
          userUpdatedAt: node.author.updatedAt ?? null,
        });
      }

      // Assignees
      for (const a of node.assignees.nodes) {
        const uid = actorUserId(a);
        if (!userMap.has(uid)) {
          userMap.set(uid, {
            userId: uid,
            userName: a.login,
            displayName: a.login,
            avatarUrl: a.avatarUrl ?? null,
            url: a.url ?? null,
            userCreatedAt: a.createdAt ?? null,
            userUpdatedAt: a.updatedAt ?? null,
          });
        }
      }
    }

    // 2. Bulk upsert all users in a single query
    if (userMap.size > 0) {
      await db
        .insert(pullRequestUsers)
        .values([...userMap.values()])
        .onConflictDoUpdate({
          target: pullRequestUsers.userId,
          set: {
            userName: sql`excluded.user_name`,
            displayName: sql`excluded.display_name`,
            avatarUrl: sql`excluded.avatar_url`,
          },
        });
    }

    // 3. Bulk upsert all PR rows in a single query
    const prValues = nodes.map((node) => {
      const headRepositoryUrl = node.headRepository?.url
        ? normalizeGitHubUrl(node.headRepository.url)
        : repositoryUrl;
      const baseRepositoryUrl = node.baseRepository?.url
        ? normalizeGitHubUrl(node.baseRepository.url)
        : repositoryUrl;
      const status: PullRequestStatus =
        node.state === 'MERGED' ? 'merged' : node.state === 'CLOSED' ? 'closed' : 'open';
      const authorUserId = node.author ? actorUserId(node.author) : null;

      return {
        url: node.url,
        provider: 'github' as const,
        repositoryUrl: baseRepositoryUrl,
        baseRefName: node.baseRefName,
        baseRefOid: node.baseRefOid,
        headRepositoryUrl,
        headRefName: node.headRefName,
        headRefOid: node.headRefOid,
        identifier: `#${node.number}`,
        title: node.title,
        description: node.body ?? null,
        status,
        isDraft: node.isDraft ? 1 : 0,
        authorUserId,
        additions: node.additions,
        deletions: node.deletions,
        changedFiles: node.changedFiles,
        commitCount: node.commitCount?.totalCount ?? null,
        mergeableStatus: node.mergeable,
        mergeStateStatus: node.mergeStateStatus ?? null,
        reviewDecision: node.reviewDecision ?? null,
        pullRequestCreatedAt: node.createdAt,
        pullRequestUpdatedAt: node.updatedAt,
      };
    });

    const prRows = await db
      .insert(pullRequests)
      .values(prValues)
      .onConflictDoUpdate({
        target: pullRequests.url,
        set: {
          baseRefName: sql`excluded.base_ref_name`,
          baseRefOid: sql`excluded.base_ref_oid`,
          headRepositoryUrl: sql`excluded.head_repository_url`,
          headRefName: sql`excluded.head_ref_name`,
          headRefOid: sql`excluded.head_ref_oid`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          status: sql`excluded.status`,
          isDraft: sql`excluded.is_draft`,
          authorUserId: sql`excluded.author_user_id`,
          additions: sql`excluded.additions`,
          deletions: sql`excluded.deletions`,
          changedFiles: sql`excluded.changed_files`,
          commitCount: sql`excluded.commit_count`,
          mergeableStatus: sql`excluded.mergeable_status`,
          mergeStateStatus: sql`excluded.merge_state_status`,
          reviewDecision: sql`excluded.review_decision`,
          pullRequestUpdatedAt: sql`excluded.pull_request_updated_at`,
        },
      })
      .returning();

    if (prRows.length === 0) return [];

    // 4. Bulk delete + insert labels for all PRs
    await db.delete(pullRequestLabels).where(inArray(pullRequestLabels.pullRequestId, prUrls));
    const labelValues: (typeof pullRequestLabels.$inferInsert)[] = [];
    for (const node of nodes) {
      for (const l of node.labels.nodes) {
        labelValues.push({
          pullRequestId: node.url,
          name: l.name,
          color: l.color ?? null,
        });
      }
    }
    if (labelValues.length > 0) {
      await db.insert(pullRequestLabels).values(labelValues);
    }

    // 5. Bulk delete + insert assignees for all PRs
    await db
      .delete(pullRequestAssignees)
      .where(inArray(pullRequestAssignees.pullRequestUrl, prUrls));
    const assigneeValues: (typeof pullRequestAssignees.$inferInsert)[] = [];
    for (const node of nodes) {
      for (const a of node.assignees.nodes) {
        assigneeValues.push({
          pullRequestUrl: node.url,
          userId: actorUserId(a),
        });
      }
    }
    if (assigneeValues.length > 0) {
      await db.insert(pullRequestAssignees).values(assigneeValues);
    }

    // 6. Bulk fetch checks for all PRs
    const checkRows = await db
      .select()
      .from(pullRequestChecks)
      .where(inArray(pullRequestChecks.pullRequestUrl, prUrls));
    const checksByPr = new Map<string, typeof checkRows>();
    for (const c of checkRows) {
      if (!checksByPr.has(c.pullRequestUrl)) checksByPr.set(c.pullRequestUrl, []);
      checksByPr.get(c.pullRequestUrl)!.push(c);
    }

    // 7. Bulk fetch labels and assignees from DB (not from memory-cast objects)
    const dbLabels = await db
      .select()
      .from(pullRequestLabels)
      .where(inArray(pullRequestLabels.pullRequestId, prUrls));
    const labelsByPr = new Map<string, (typeof pullRequestLabels.$inferSelect)[]>();
    for (const l of dbLabels) {
      if (!labelsByPr.has(l.pullRequestId)) labelsByPr.set(l.pullRequestId, []);
      labelsByPr.get(l.pullRequestId)!.push(l);
    }

    const dbAssignees = await db
      .select()
      .from(pullRequestAssignees)
      .where(inArray(pullRequestAssignees.pullRequestUrl, prUrls));
    // Collect unique assignee user IDs, then fetch their rows
    const assigneeUserIds = new Set<string>();
    for (const a of dbAssignees) assigneeUserIds.add(a.userId);
    const assigneeUserRows =
      assigneeUserIds.size > 0
        ? await db
            .select()
            .from(pullRequestUsers)
            .where(inArray(pullRequestUsers.userId, [...assigneeUserIds]))
        : [];
    const userRowById = new Map(assigneeUserRows.map((u) => [u.userId, u]));

    const assigneesByPr = new Map<string, (typeof pullRequestUsers.$inferSelect)[]>();
    for (const a of dbAssignees) {
      const userRow = userRowById.get(a.userId);
      if (userRow) {
        if (!assigneesByPr.has(a.pullRequestUrl)) assigneesByPr.set(a.pullRequestUrl, []);
        assigneesByPr.get(a.pullRequestUrl)!.push(userRow);
      }
    }

    // Build a Map for O(1) node lookup
    const nodeByUrl = new Map<string, GqlPrNode>();
    for (const node of nodes) nodeByUrl.set(node.url, node);

    // 8. Assemble results
    const results: PullRequest[] = [];
    for (const prRow of prRows) {
      const node = nodeByUrl.get(prRow.url);
      if (!node) continue;

      const authorRow = node.author
        ? {
            userId: actorUserId(node.author),
            userName: node.author.login,
            displayName: node.author.login,
            avatarUrl: node.author.avatarUrl || null,
            url: node.author.url ?? null,
            userCreatedAt: node.author.createdAt ?? null,
            userUpdatedAt: node.author.updatedAt ?? null,
          }
        : null;

      const prLabels = labelsByPr.get(prRow.url) ?? [];
      const prAssignees = assigneesByPr.get(prRow.url) ?? [];
      const prChecks = checksByPr.get(prRow.url) ?? [];

      results.push(assemblePullRequest(prRow, authorRow, prLabels, prAssignees, prChecks));
    }

    return results;
  }

  private async _archiveOldPrs(repositoryUrl: string): Promise<void> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - PR_ARCHIVE_AGE_MONTHS);
    const cutoffIso = cutoff.toISOString();

    await db
      .delete(pullRequests)
      .where(
        and(
          eq(pullRequests.repositoryUrl, repositoryUrl),
          inArray(pullRequests.status, ['closed', 'merged']),
          lt(pullRequests.pullRequestUpdatedAt, cutoffIso)
        )
      );

    log.info('PrSyncEngine: archived old PRs', { repositoryUrl, cutoffIso });
  }

  private _notifyPrUpdated(pr: PullRequest): void {
    events.emit(prUpdatedChannel, { prs: [pr] });
  }

  private _emitProgress(progress: PrSyncProgress): void {
    events.emit(prSyncProgressChannel, progress);
  }

  // ── Mutation helpers (for controller use) ──────────────────────────────────

  async createPullRequest(params: {
    repositoryUrl: string;
    head: string;
    base: string;
    title: string;
    body?: string;
    draft: boolean;
  }): Promise<{ url: string; number: number }> {
    const { owner, repo } = splitNormalizedUrl(params.repositoryUrl);
    const octokit = await this.getOctokit();
    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      head: params.head,
      base: params.base,
      title: params.title,
      body: params.body,
      draft: params.draft,
    });
    const { html_url: url, number } = response.data;
    return { url, number };
  }

  async mergePullRequest(
    repositoryUrl: string,
    prNumber: number,
    options: { strategy: 'merge' | 'squash' | 'rebase'; commitHeadOid?: string }
  ): Promise<{ sha: string | null; merged: boolean }> {
    const { owner, repo } = splitNormalizedUrl(repositoryUrl);
    const octokit = await this.getOctokit();
    const response = await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: options.strategy,
      sha: options.commitHeadOid,
    });
    return { sha: response.data.sha ?? null, merged: response.data.merged };
  }

  async markReadyForReview(repositoryUrl: string, prNumber: number): Promise<void> {
    const { owner, repo } = splitNormalizedUrl(repositoryUrl);
    const octokit = await this.getOctokit();
    const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    await octokit.graphql(
      `mutation MarkReadyForReview($id: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $id }) {
          pullRequest { isDraft }
        }
      }`,
      { id: data.node_id }
    );
  }

  async getPullRequestFiles(
    repositoryUrl: string,
    prNumber: number
  ): Promise<
    {
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }[]
  > {
    const { owner, repo } = splitNormalizedUrl(repositoryUrl);
    const octokit = await this.getOctokit();
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }

  private async _getFullSyncCursor(repositoryUrl: string): Promise<{ done: boolean } | null> {
    return (await this.kv.get(`fullsync:${repositoryUrl}`)) as FullSyncCursor | null;
  }
}

export const prSyncEngine = new PrSyncEngine(getOctokit);
