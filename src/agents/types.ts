/**
 * Agent System Types
 * 
 * Types for agent registration, work assignment, and orchestration.
 */

import type { NodeType, EdgeType, QueryFilter } from '../core/types.js';

// ============================================================================
// Agent Types
// ============================================================================

export type AgentRole = 
  | 'human-agent'      // Primary interface with human user
  | 'code-agent'       // Implements code, refactors
  | 'doc-agent'        // Maintains documentation
  | 'research-agent'   // Gathers external information
  | 'test-agent'       // Creates and runs tests
  | 'review-agent'     // Code review, quality checks
  | 'task-agent'       // Task decomposition and management
  | 'custom';          // User-defined role

export type AgentStatus = 
  | 'idle'             // Ready for work
  | 'working'          // Currently processing a task
  | 'blocked'          // Waiting on something
  | 'offline';         // Not available

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentCapabilities {
  // Node types this agent can work on
  nodeTypes: NodeType[];
  
  // Edge types this agent can create
  edgeTypes: EdgeType[];
  
  // Tags this agent specializes in
  tags: string[];
  
  // Maximum concurrent tasks
  maxConcurrent: number;
  
  // Can this agent create new nodes?
  canCreate: boolean;
  
  // Can this agent delete nodes?
  canDelete: boolean;
  
  // Priority boost (higher = gets tasks first)
  priorityBoost: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  description?: string;
  
  // Capabilities
  capabilities: AgentCapabilities;
  
  // Query filter for tasks this agent should see
  taskFilter?: QueryFilter;
  
  // Webhook/callback for task notifications
  webhook?: {
    url: string;
    secret?: string;
  };
  
  // OpenClaw integration
  openclaw?: {
    sessionKey?: string;
    agentId?: string;
  };
  
  // Custom metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Agent State
// ============================================================================

export interface AgentState {
  id: string;
  status: AgentStatus;
  
  // Currently claimed tasks
  claimedTasks: string[];
  
  // Statistics
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    avgCompletionTimeMs: number;
    lastActiveAt: string | null;
  };
  
  // Heartbeat tracking
  lastHeartbeat: string | null;
  heartbeatIntervalMs: number;
}

export interface Agent extends AgentConfig {
  state: AgentState;
  registeredAt: string;
}

// ============================================================================
// Work Queue Types
// ============================================================================

export interface WorkItem {
  id: string;
  taskId: string;           // Node ID of the task
  priority: number;         // Computed priority (higher = more urgent)
  addedAt: string;
  
  // Targeting
  preferredAgent?: string;  // Specific agent ID
  requiredRole?: AgentRole; // Required role
  requiredTags?: string[];  // Required capabilities
  
  // Timing
  deadline?: string;        // Must be started by this time
  timeout?: number;         // Max time to complete (ms)
  
  // State
  status: 'queued' | 'claimed' | 'completed' | 'failed' | 'expired';
  claimedBy?: string;
  claimedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface WorkQueue {
  items: WorkItem[];
  
  // Queue statistics
  stats: {
    totalQueued: number;
    totalClaimed: number;
    totalCompleted: number;
    totalFailed: number;
    avgWaitTimeMs: number;
  };
}

// ============================================================================
// Claim Operations
// ============================================================================

export interface ClaimRequest {
  agentId: string;
  taskId: string;
  timeoutMs?: number;       // How long to hold the claim
}

export interface ClaimResult {
  success: boolean;
  taskId: string;
  claimedBy?: string;
  claimedAt?: string;
  expiresAt?: string;
  error?: string;
}

export interface ReleaseRequest {
  agentId: string;
  taskId: string;
  reason?: 'completed' | 'blocked' | 'timeout' | 'error' | 'reassign';
  newStatus?: 'pending' | 'blocked' | 'complete';
  error?: string;
}

export interface TransferRequest {
  fromAgentId: string;
  toAgentId: string;
  taskId: string;
  reason?: string;
}

// ============================================================================
// Orchestration Events
// ============================================================================

export type AgentEventType =
  | 'agent.registered'
  | 'agent.unregistered'
  | 'agent.status_changed'
  | 'agent.heartbeat'
  | 'work.queued'
  | 'work.claimed'
  | 'work.released'
  | 'work.transferred'
  | 'work.completed'
  | 'work.failed'
  | 'work.expired';

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  timestamp: string;
  agentId?: string;
  taskId?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Dispatch Types
// ============================================================================

export interface DispatchOptions {
  // Only dispatch to specific agents
  agentIds?: string[];
  
  // Only dispatch specific task types
  nodeTypes?: NodeType[];
  
  // Filter by tags
  tags?: string[];
  
  // Maximum tasks to dispatch per cycle
  maxTasks?: number;
  
  // Dry run - don't actually assign
  dryRun?: boolean;
}

export interface DispatchResult {
  dispatched: Array<{
    taskId: string;
    agentId: string;
  }>;
  skipped: Array<{
    taskId: string;
    reason: string;
  }>;
  errors: string[];
}
