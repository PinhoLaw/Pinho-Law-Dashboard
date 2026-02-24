/**
 * PinhoOps AI — Custom GitHub Checkpoint Saver
 *
 * Commits full state to GitHub after every LangGraph step.
 * Provides complete audit log of all AI operations.
 */

import type { BaseCheckpointSaver, Checkpoint, CheckpointMetadata } from '@langchain/langgraph';
import { commitWithAudit, readState, writeState, STATE_FILES } from '@/lib/ops/github';

interface StoredCheckpoint {
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  parent_id?: string;
}

/**
 * Custom checkpoint saver that persists LangGraph state to GitHub.
 * Every checkpoint creates a commit with full audit trail.
 */
export class GitHubCheckpointSaver implements BaseCheckpointSaver {
  private readonly checkpointFile = 'checkpoints.json' as any;
  private cache: Map<string, StoredCheckpoint> = new Map();

  async getTuple(config: { configurable?: { thread_id?: string; checkpoint_id?: string } }): Promise<{
    config: any;
    checkpoint: Checkpoint;
    metadata: CheckpointMetadata;
    parent_config?: any;
  } | undefined> {
    const threadId = config.configurable?.thread_id || 'default';
    const checkpointId = config.configurable?.checkpoint_id;

    const key = checkpointId || `latest-${threadId}`;
    const cached = this.cache.get(key);

    if (cached) {
      return {
        config: { configurable: { thread_id: threadId, checkpoint_id: key } },
        checkpoint: cached.checkpoint,
        metadata: cached.metadata,
        parent_config: cached.parent_id
          ? { configurable: { thread_id: threadId, checkpoint_id: cached.parent_id } }
          : undefined,
      };
    }

    return undefined;
  }

  async *list(
    config: { configurable?: { thread_id?: string } },
    options?: { limit?: number },
  ): AsyncGenerator<{
    config: any;
    checkpoint: Checkpoint;
    metadata: CheckpointMetadata;
    parent_config?: any;
  }> {
    const threadId = config.configurable?.thread_id || 'default';
    const entries = Array.from(this.cache.entries())
      .filter(([key]) => key.includes(threadId))
      .slice(0, options?.limit || 10);

    for (const [key, stored] of entries) {
      yield {
        config: { configurable: { thread_id: threadId, checkpoint_id: key } },
        checkpoint: stored.checkpoint,
        metadata: stored.metadata,
        parent_config: stored.parent_id
          ? { configurable: { thread_id: threadId, checkpoint_id: stored.parent_id } }
          : undefined,
      };
    }
  }

  async put(
    config: { configurable?: { thread_id?: string; checkpoint_id?: string } },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<{ configurable: { thread_id: string; checkpoint_id: string } }> {
    const threadId = config.configurable?.thread_id || 'default';
    const checkpointId = `cp-${Date.now()}-${threadId}`;
    const parentId = config.configurable?.checkpoint_id;

    // Store in local cache
    this.cache.set(checkpointId, { checkpoint, metadata, parent_id: parentId });
    this.cache.set(`latest-${threadId}`, { checkpoint, metadata, parent_id: parentId });

    // Commit state to GitHub with audit trail
    try {
      const stateUpdates: Partial<Record<string, unknown>> = {};
      const channelValues = checkpoint.channel_values as Record<string, unknown>;

      if (channelValues?.tasks) stateUpdates[STATE_FILES.tasks] = channelValues.tasks;
      if (channelValues?.billing) stateUpdates[STATE_FILES.billing] = channelValues.billing;
      if (channelValues?.sales) stateUpdates[STATE_FILES.sales] = channelValues.sales;
      if (channelValues?.promises) stateUpdates[STATE_FILES.promises] = channelValues.promises;
      if (channelValues?.kpi) stateUpdates[STATE_FILES.kpi] = channelValues.kpi;

      if (Object.keys(stateUpdates).length > 0) {
        const step = metadata.step ?? 'unknown';
        const nodeId = (metadata as any).source ?? 'graph';
        await commitWithAudit(
          stateUpdates,
          `Checkpoint ${checkpointId} — step ${step} — node ${nodeId}`,
          'pinhoops-langgraph',
        );
      }
    } catch (err) {
      console.error('[Checkpoint] GitHub commit failed:', err);
      // Don't throw — checkpoint is still in memory
    }

    return {
      configurable: { thread_id: threadId, checkpoint_id: checkpointId },
    };
  }

  async putWrites(
    _config: any,
    _writes: Array<[string, unknown]>,
    _taskId: string,
  ): Promise<void> {
    // Writes are handled in put()
  }
}
