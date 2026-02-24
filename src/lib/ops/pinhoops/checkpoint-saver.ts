/**
 * PinhoOps AI — Custom GitHub Checkpoint Saver
 *
 * Commits full state to GitHub after every LangGraph step.
 * Provides complete audit log of all AI operations.
 *
 * Uses MemorySaver as the base (in-memory) and adds GitHub
 * persistence as a side-effect on every put().
 */

import { MemorySaver } from '@langchain/langgraph';
import { commitWithAudit, STATE_FILES } from '@/lib/ops/github';

/**
 * Custom checkpoint saver that extends MemorySaver with
 * GitHub commit persistence for audit trail.
 */
export class GitHubCheckpointSaver extends MemorySaver {
  async put(
    config: any,
    checkpoint: any,
    metadata: any,
  ): Promise<any> {
    // Delegate to MemorySaver for in-memory storage
    const result = await super.put(config, checkpoint, metadata);

    // Side-effect: commit state to GitHub
    try {
      const stateUpdates: Partial<Record<string, unknown>> = {};
      const channelValues = checkpoint.channel_values as Record<string, unknown> | undefined;

      if (channelValues?.tasks) stateUpdates[STATE_FILES.tasks] = channelValues.tasks;
      if (channelValues?.billing) stateUpdates[STATE_FILES.billing] = channelValues.billing;
      if (channelValues?.sales) stateUpdates[STATE_FILES.sales] = channelValues.sales;
      if (channelValues?.promises) stateUpdates[STATE_FILES.promises] = channelValues.promises;
      if (channelValues?.kpi) stateUpdates[STATE_FILES.kpi] = channelValues.kpi;

      if (Object.keys(stateUpdates).length > 0) {
        const threadId = config?.configurable?.thread_id || 'unknown';
        const step = metadata?.step ?? 'unknown';
        const nodeId = (metadata as any)?.source ?? 'graph';
        await commitWithAudit(
          stateUpdates,
          `Checkpoint ${threadId} — step ${step} — node ${nodeId}`,
          'pinhoops-langgraph',
        );
      }
    } catch (err) {
      console.error('[Checkpoint] GitHub commit failed:', err);
      // Don't throw — checkpoint is still in memory
    }

    return result;
  }
}
