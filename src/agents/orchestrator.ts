/**
 * Orchestrator
 * 
 * Coordinates work assignment and agent management.
 * The main entry point for the agent system.
 */

import { randomUUID } from 'crypto';
import type {
  Agent,
  AgentConfig,
  AgentStatus,
  ClaimRequest,
  ClaimResult,
  ReleaseRequest,
  TransferRequest,
  DispatchOptions,
  DispatchResult,
  WorkItem,
} from './types.js';
import type { Node, QueryFilter } from '../core/types.js';
import { AgentRegistry } from './registry.js';
import { WorkQueue } from './work-queue.js';
import type { EventBus } from '../events/event-bus.js';

export interface OrchestratorOptions {
  // Auto-enqueue pending tasks
  autoEnqueue?: boolean;
  
  // Auto-dispatch to available agents
  autoDispatch?: boolean;
  
  // Check for stale agents every N ms
  staleCheckIntervalMs?: number;
  
  // Check for expired claims every N ms
  expireCheckIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<OrchestratorOptions> = {
  autoEnqueue: true,
  autoDispatch: false, // Manual dispatch by default
  staleCheckIntervalMs: 60000, // 1 minute
  expireCheckIntervalMs: 30000, // 30 seconds
};

export class Orchestrator {
  private registry: AgentRegistry;
  private queue: WorkQueue;
  private cube: any;
  private eventBus: EventBus | null = null;
  private options: Required<OrchestratorOptions>;
  
  private staleCheckTimer: NodeJS.Timeout | null = null;
  private expireCheckTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(cubePath: string, options?: OrchestratorOptions) {
    this.registry = new AgentRegistry(cubePath);
    this.queue = new WorkQueue(this.registry);
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Set the Cube instance
   */
  setCube(cube: any): void {
    this.cube = cube;
    this.queue.setCube(cube);
  }

  /**
   * Set the event bus for notifications
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
    
    // Subscribe to task events for auto-enqueue
    if (this.options.autoEnqueue) {
      eventBus.on('node.created', (event: any) => {
        if (event.node?.type === 'task' && event.node?.status === 'pending') {
          this.queue.enqueue(event.node.id);
        }
      });

      eventBus.on('node.status_changed', (event: any) => {
        if (event.newStatus === 'pending') {
          this.queue.enqueue(event.nodeId);
        }
      });
    }
  }

  /**
   * Start the orchestrator
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Start periodic checks
    this.staleCheckTimer = setInterval(() => {
      this.checkStaleAgents();
    }, this.options.staleCheckIntervalMs);

    this.expireCheckTimer = setInterval(() => {
      this.checkExpiredClaims();
    }, this.options.expireCheckIntervalMs);
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.running = false;

    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }

    if (this.expireCheckTimer) {
      clearInterval(this.expireCheckTimer);
      this.expireCheckTimer = null;
    }
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * Register a new agent
   */
  registerAgent(config: AgentConfig): Agent {
    const agent = this.registry.register(config);
    this.emitEvent('agent.registered', { agentId: agent.id });
    return agent;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    const result = this.registry.unregister(agentId);
    if (result) {
      this.emitEvent('agent.unregistered', { agentId });
    }
    return result;
  }

  /**
   * Get an agent
   */
  getAgent(agentId: string): Agent | undefined {
    return this.registry.get(agentId);
  }

  /**
   * List all agents
   */
  listAgents(filter?: { role?: string; status?: AgentStatus }): Agent[] {
    return this.registry.list(filter as any);
  }

  /**
   * Update agent status
   */
  setAgentStatus(agentId: string, status: AgentStatus): boolean {
    const result = this.registry.setStatus(agentId, status);
    if (result) {
      this.emitEvent('agent.status_changed', { agentId, status });
    }
    return result;
  }

  /**
   * Record agent heartbeat
   */
  agentHeartbeat(agentId: string): boolean {
    const result = this.registry.heartbeat(agentId);
    if (result) {
      this.emitEvent('agent.heartbeat', { agentId });
    }
    return result;
  }

  /**
   * Get agent statistics
   */
  agentStats() {
    return this.registry.stats();
  }

  // ============================================================================
  // Work Queue Operations
  // ============================================================================

  /**
   * Add a task to the work queue
   */
  enqueue(taskId: string, options?: Parameters<WorkQueue['enqueue']>[1]): WorkItem {
    const item = this.queue.enqueue(taskId, options);
    this.emitEvent('work.queued', { taskId, workItemId: item.id });
    return item;
  }

  /**
   * Claim a task for an agent
   */
  claim(request: ClaimRequest): ClaimResult {
    const result = this.queue.claim(request);
    if (result.success) {
      this.emitEvent('work.claimed', { 
        taskId: request.taskId, 
        agentId: request.agentId 
      });
    }
    return result;
  }

  /**
   * Release a claimed task
   */
  release(request: ReleaseRequest): boolean {
    const result = this.queue.release(request);
    if (result) {
      const eventType = request.reason === 'completed' 
        ? 'work.completed' 
        : request.reason === 'error' 
          ? 'work.failed' 
          : 'work.released';
      this.emitEvent(eventType, {
        taskId: request.taskId,
        agentId: request.agentId,
        reason: request.reason,
      });
    }
    return result;
  }

  /**
   * Transfer a task between agents
   */
  transfer(request: TransferRequest): ClaimResult {
    const result = this.queue.transfer(
      request.fromAgentId,
      request.toAgentId,
      request.taskId
    );
    if (result.success) {
      this.emitEvent('work.transferred', {
        taskId: request.taskId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        reason: request.reason,
      });
    }
    return result;
  }

  /**
   * Get next available work for an agent
   */
  getNextWork(agentId: string): WorkItem | null {
    return this.queue.getNextFor(agentId);
  }

  /**
   * Get work queue state
   */
  queueState() {
    return this.queue.getState();
  }

  /**
   * Get queued items
   */
  getQueued(): WorkItem[] {
    return this.queue.getQueued();
  }

  /**
   * Get claimed items
   */
  getClaimed(agentId?: string): WorkItem[] {
    return this.queue.getClaimed(agentId);
  }

  // ============================================================================
  // Dispatch (Automatic Assignment)
  // ============================================================================

  /**
   * Run a dispatch cycle - assign queued tasks to available agents
   */
  dispatch(options?: DispatchOptions): DispatchResult {
    const result: DispatchResult = {
      dispatched: [],
      skipped: [],
      errors: [],
    };

    if (!this.cube) {
      result.errors.push('Cube not connected');
      return result;
    }

    // Get pending tasks
    let tasks: Node[] = [];
    
    const filter: QueryFilter = {
      type: 'task',
      status: 'pending',
    };

    if (options?.nodeTypes) {
      filter.type = options.nodeTypes;
    }

    if (options?.tags) {
      filter.tagsAny = options.tags;
    }

    const queryResult = this.cube.query({ filter });
    if (queryResult.success && queryResult.data) {
      tasks = queryResult.data;
    }

    // Limit tasks
    if (options?.maxTasks) {
      tasks = tasks.slice(0, options.maxTasks);
    }

    // Try to assign each task
    for (const task of tasks) {
      // Skip if already in queue and claimed
      const existing = this.queue.getState().items.find(i => i.taskId === task.id);
      if (existing && existing.status === 'claimed') {
        result.skipped.push({ taskId: task.id, reason: 'Already claimed' });
        continue;
      }

      // Find capable agents
      let agents = this.registry.findCapable({
        nodeType: task.type,
        tags: task.tags,
      });

      // Filter by specific agent IDs if provided
      if (options?.agentIds) {
        agents = agents.filter(a => options.agentIds!.includes(a.id));
      }

      if (agents.length === 0) {
        result.skipped.push({ taskId: task.id, reason: 'No capable agents' });
        continue;
      }

      // Dry run - just report what would happen
      if (options?.dryRun) {
        result.dispatched.push({ taskId: task.id, agentId: agents[0].id });
        continue;
      }

      // Enqueue if not already
      if (!existing) {
        this.queue.enqueue(task.id);
      }

      // Claim for best agent
      const claimResult = this.claim({
        agentId: agents[0].id,
        taskId: task.id,
      });

      if (claimResult.success) {
        result.dispatched.push({ taskId: task.id, agentId: agents[0].id });
      } else {
        result.errors.push(`Failed to claim ${task.id}: ${claimResult.error}`);
      }
    }

    return result;
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Check for stale agents
   */
  private checkStaleAgents(): void {
    const stale = this.registry.checkStale();
    for (const agentId of stale) {
      this.emitEvent('agent.status_changed', { agentId, status: 'offline' });
      
      // Release any claimed tasks
      const claimed = this.queue.getClaimed(agentId);
      for (const item of claimed) {
        this.release({
          agentId,
          taskId: item.taskId,
          reason: 'timeout',
        });
      }
    }
  }

  /**
   * Check for expired claims
   */
  private checkExpiredClaims(): void {
    const expired = this.queue.checkExpired();
    for (const item of expired) {
      this.emitEvent('work.expired', { 
        taskId: item.taskId, 
        agentId: item.claimedBy 
      });
    }
  }

  /**
   * Emit an event
   */
  private emitEvent(type: string, data: Record<string, unknown>): void {
    if (!this.eventBus) return;

    this.eventBus.emitSync({
      id: randomUUID(),
      type: type as any,
      timestamp: new Date().toISOString(),
      ...data,
    } as any);
  }
}
