/**
 * Work Queue
 * 
 * Manages the queue of tasks waiting to be claimed by agents.
 * Handles priority, deadlines, and expiration.
 */

import { randomUUID } from 'crypto';
import type {
  WorkItem,
  WorkQueue as WorkQueueType,
  ClaimRequest,
  ClaimResult,
  ReleaseRequest,
  AgentRole,
} from './types.js';
import type { Node, Priority } from '../core/types.js';
import { AgentRegistry } from './registry.js';

const PRIORITY_VALUES: Record<Priority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

export class WorkQueue {
  private items: Map<string, WorkItem> = new Map();
  private registry: AgentRegistry;
  private cube: any; // Will be typed properly when integrated

  // Statistics
  private stats = {
    totalQueued: 0,
    totalClaimed: 0,
    totalCompleted: 0,
    totalFailed: 0,
    waitTimes: [] as number[],
  };

  constructor(registry: AgentRegistry) {
    this.registry = registry;
  }

  /**
   * Set the Cube instance
   */
  setCube(cube: any): void {
    this.cube = cube;
  }

  /**
   * Add a task to the queue
   */
  enqueue(
    taskId: string,
    options?: {
      preferredAgent?: string;
      requiredRole?: AgentRole;
      requiredTags?: string[];
      deadline?: string;
      timeout?: number;
    }
  ): WorkItem {
    // Check if already queued
    if (this.items.has(taskId)) {
      return this.items.get(taskId)!;
    }

    // Get task node for priority calculation
    let priority = PRIORITY_VALUES.normal;
    if (this.cube) {
      const result = this.cube.get(taskId);
      if (result.success && result.data) {
        const node = result.data as Node;
        priority = this.calculatePriority(node);
      }
    }

    const item: WorkItem = {
      id: randomUUID(),
      taskId,
      priority,
      addedAt: new Date().toISOString(),
      preferredAgent: options?.preferredAgent,
      requiredRole: options?.requiredRole,
      requiredTags: options?.requiredTags,
      deadline: options?.deadline,
      timeout: options?.timeout,
      status: 'queued',
    };

    this.items.set(taskId, item);
    this.stats.totalQueued++;

    return item;
  }

  /**
   * Calculate priority based on node properties
   */
  private calculatePriority(node: Node): number {
    let priority = PRIORITY_VALUES[node.priority] || PRIORITY_VALUES.normal;

    // Boost for due date proximity
    if (node.dueAt) {
      const dueMs = new Date(node.dueAt).getTime();
      const nowMs = Date.now();
      const hoursUntilDue = (dueMs - nowMs) / (1000 * 60 * 60);

      if (hoursUntilDue < 0) {
        priority += 500; // Overdue!
      } else if (hoursUntilDue < 24) {
        priority += 200; // Due within a day
      } else if (hoursUntilDue < 72) {
        priority += 50; // Due within 3 days
      }
    }

    // Boost if blocking other tasks
    const blockingEdges = node.edges.filter(e => e.type === 'blocks');
    priority += blockingEdges.length * 20;

    return priority;
  }

  /**
   * Remove a task from the queue
   */
  dequeue(taskId: string): WorkItem | undefined {
    const item = this.items.get(taskId);
    if (item) {
      this.items.delete(taskId);
    }
    return item;
  }

  /**
   * Get next available work for an agent
   */
  getNextFor(agentId: string): WorkItem | null {
    const agent = this.registry.get(agentId);
    if (!agent) return null;

    // Check if agent can take more work
    if (agent.state.claimedTasks.length >= agent.capabilities.maxConcurrent) {
      return null;
    }

    // Find matching queued items
    const candidates = Array.from(this.items.values())
      .filter(item => {
        if (item.status !== 'queued') return false;

        // Check preferred agent
        if (item.preferredAgent && item.preferredAgent !== agentId) {
          return false;
        }

        // Check required role
        if (item.requiredRole && agent.role !== item.requiredRole) {
          return false;
        }

        // Check required tags
        if (item.requiredTags && item.requiredTags.length > 0) {
          const hasRequiredTag = item.requiredTags.some(tag =>
            agent.capabilities.tags.includes(tag)
          );
          if (!hasRequiredTag) return false;
        }

        return true;
      })
      .sort((a, b) => b.priority - a.priority); // Highest priority first

    return candidates[0] || null;
  }

  /**
   * Claim a task
   */
  claim(request: ClaimRequest): ClaimResult {
    const { agentId, taskId, timeoutMs } = request;

    // Validate agent
    const agent = this.registry.get(agentId);
    if (!agent) {
      return { success: false, taskId, error: 'Agent not found' };
    }

    // Check concurrent limit
    if (agent.state.claimedTasks.length >= agent.capabilities.maxConcurrent) {
      return { success: false, taskId, error: 'Agent at max concurrent tasks' };
    }

    // Get work item
    const item = this.items.get(taskId);
    if (!item) {
      return { success: false, taskId, error: 'Task not in queue' };
    }

    if (item.status !== 'queued') {
      return { 
        success: false, 
        taskId, 
        error: `Task already ${item.status}`,
        claimedBy: item.claimedBy,
      };
    }

    // Claim it
    const now = new Date();
    item.status = 'claimed';
    item.claimedBy = agentId;
    item.claimedAt = now.toISOString();

    // Calculate expiry
    const expiresAt = timeoutMs 
      ? new Date(now.getTime() + timeoutMs).toISOString()
      : undefined;

    // Update agent
    this.registry.addClaimedTask(agentId, taskId);
    
    // Update cube node
    if (this.cube) {
      this.cube.update(taskId, {
        status: 'claimed',
        assignedTo: agentId,
        lockedBy: agentId,
      });
    }

    // Track stats
    this.stats.totalClaimed++;
    const waitTime = now.getTime() - new Date(item.addedAt).getTime();
    this.stats.waitTimes.push(waitTime);

    return {
      success: true,
      taskId,
      claimedBy: agentId,
      claimedAt: item.claimedAt,
      expiresAt,
    };
  }

  /**
   * Release a claimed task
   */
  release(request: ReleaseRequest): boolean {
    const { agentId, taskId, reason, newStatus, error } = request;

    const item = this.items.get(taskId);
    if (!item || item.claimedBy !== agentId) {
      return false;
    }

    const completed = reason === 'completed';
    
    // Update item
    if (completed) {
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
      this.stats.totalCompleted++;
    } else if (reason === 'error') {
      item.status = 'failed';
      item.error = error;
      this.stats.totalFailed++;
    } else {
      // Return to queue
      item.status = 'queued';
      item.claimedBy = undefined;
      item.claimedAt = undefined;
    }

    // Update agent
    this.registry.removeClaimedTask(agentId, taskId, completed);

    // Update cube node
    if (this.cube && newStatus) {
      this.cube.update(taskId, {
        status: newStatus,
        lockedBy: null,
      });
    }

    // Remove completed/failed items from queue
    if (item.status === 'completed' || item.status === 'failed') {
      this.items.delete(taskId);
    }

    return true;
  }

  /**
   * Transfer a task to another agent
   */
  transfer(fromAgentId: string, toAgentId: string, taskId: string): ClaimResult {
    // Release from current agent (without completion)
    const released = this.release({
      agentId: fromAgentId,
      taskId,
      reason: 'reassign',
    });

    if (!released) {
      return { success: false, taskId, error: 'Failed to release from current agent' };
    }

    // Claim for new agent
    return this.claim({ agentId: toAgentId, taskId });
  }

  /**
   * Check for expired claims
   */
  checkExpired(): WorkItem[] {
    const now = Date.now();
    const expired: WorkItem[] = [];

    for (const item of this.items.values()) {
      if (item.status === 'claimed' && item.timeout && item.claimedAt) {
        const claimedAt = new Date(item.claimedAt).getTime();
        if (now - claimedAt > item.timeout) {
          // Release back to queue
          if (item.claimedBy) {
            this.release({
              agentId: item.claimedBy,
              taskId: item.taskId,
              reason: 'timeout',
            });
          }
          expired.push(item);
        }
      }
    }

    return expired;
  }

  /**
   * Get queue state
   */
  getState(): WorkQueueType {
    const avgWaitTimeMs = this.stats.waitTimes.length > 0
      ? this.stats.waitTimes.reduce((a, b) => a + b, 0) / this.stats.waitTimes.length
      : 0;

    return {
      items: Array.from(this.items.values()),
      stats: {
        totalQueued: this.stats.totalQueued,
        totalClaimed: this.stats.totalClaimed,
        totalCompleted: this.stats.totalCompleted,
        totalFailed: this.stats.totalFailed,
        avgWaitTimeMs,
      },
    };
  }

  /**
   * Get queued items
   */
  getQueued(): WorkItem[] {
    return Array.from(this.items.values())
      .filter(item => item.status === 'queued')
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get claimed items
   */
  getClaimed(agentId?: string): WorkItem[] {
    return Array.from(this.items.values())
      .filter(item => {
        if (item.status !== 'claimed') return false;
        if (agentId && item.claimedBy !== agentId) return false;
        return true;
      });
  }

  /**
   * Clear completed/failed items older than threshold
   */
  cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;

    for (const [taskId, item] of this.items) {
      if (item.status === 'completed' || item.status === 'failed') {
        const completedAt = item.completedAt 
          ? new Date(item.completedAt).getTime() 
          : new Date(item.addedAt).getTime();
        
        if (now - completedAt > olderThanMs) {
          this.items.delete(taskId);
          removed++;
        }
      }
    }

    return removed;
  }
}
