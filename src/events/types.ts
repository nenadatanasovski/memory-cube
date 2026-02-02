/**
 * Event System Types
 * 
 * Extended event definitions for the Memory Cube event system.
 */

import type { Node, Edge, NodeStatus, NodeValidity, EdgeType } from '../core/types.js';

// ============================================================================
// Event Types (extending core types)
// ============================================================================

export type EventType =
  // Node lifecycle
  | 'node.created'
  | 'node.updated'
  | 'node.deleted'
  | 'node.status_changed'
  | 'node.validity_changed'
  // Edge lifecycle
  | 'edge.created'
  | 'edge.deleted'
  // Code events (for file watching)
  | 'code.file_changed'
  | 'code.file_created'
  | 'code.file_deleted'
  // Agent events
  | 'agent.task_claimed'
  | 'agent.task_released'
  | 'agent.task_completed'
  | 'agent.task_blocked'
  // System events
  | 'cube.initialized'
  | 'cube.index_rebuilt'
  | 'trigger.fired'
  | 'trigger.error';

// ============================================================================
// Event Payloads
// ============================================================================

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: string; // ISO date
  source?: string;   // What caused this event (agent, system, file-watcher, etc.)
}

export interface NodeCreatedEvent extends BaseEvent {
  type: 'node.created';
  node: Node;
}

export interface NodeUpdatedEvent extends BaseEvent {
  type: 'node.updated';
  nodeId: string;
  before: Partial<Node>;
  after: Partial<Node>;
  changedFields: string[];
}

export interface NodeDeletedEvent extends BaseEvent {
  type: 'node.deleted';
  nodeId: string;
  node: Node; // Snapshot before deletion
}

export interface NodeStatusChangedEvent extends BaseEvent {
  type: 'node.status_changed';
  nodeId: string;
  previousStatus: NodeStatus;
  newStatus: NodeStatus;
}

export interface NodeValidityChangedEvent extends BaseEvent {
  type: 'node.validity_changed';
  nodeId: string;
  previousValidity: NodeValidity;
  newValidity: NodeValidity;
  reason?: string;
}

export interface EdgeCreatedEvent extends BaseEvent {
  type: 'edge.created';
  edge: Edge;
  fromNodeId: string;
  toNodeId: string;
}

export interface EdgeDeletedEvent extends BaseEvent {
  type: 'edge.deleted';
  edge: Edge;
  fromNodeId: string;
  toNodeId: string;
}

export interface CodeFileChangedEvent extends BaseEvent {
  type: 'code.file_changed';
  filePath: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export interface AgentTaskEvent extends BaseEvent {
  type: 'agent.task_claimed' | 'agent.task_released' | 'agent.task_completed' | 'agent.task_blocked';
  taskId: string;
  agentId: string;
  reason?: string;
}

export interface CubeSystemEvent extends BaseEvent {
  type: 'cube.initialized' | 'cube.index_rebuilt';
  details?: Record<string, unknown>;
}

export interface TriggerFiredEvent extends BaseEvent {
  type: 'trigger.fired';
  triggerId: string;
  triggerName: string;
  sourceEventId: string;
  actions: string[];
}

export interface TriggerErrorEvent extends BaseEvent {
  type: 'trigger.error';
  triggerId: string;
  triggerName: string;
  error: string;
  sourceEventId?: string;
}

// Union type for all events
export type CubeEvent =
  | NodeCreatedEvent
  | NodeUpdatedEvent
  | NodeDeletedEvent
  | NodeStatusChangedEvent
  | NodeValidityChangedEvent
  | EdgeCreatedEvent
  | EdgeDeletedEvent
  | CodeFileChangedEvent
  | AgentTaskEvent
  | CubeSystemEvent
  | TriggerFiredEvent
  | TriggerErrorEvent;

// ============================================================================
// Trigger Definitions
// ============================================================================

export interface TriggerCondition {
  // Match specific event properties
  nodeType?: string | string[];
  status?: NodeStatus | NodeStatus[];
  validity?: NodeValidity | NodeValidity[];
  tags?: string[];           // Node has all these tags
  tagsAny?: string[];        // Node has any of these tags
  hasEdge?: {
    type: EdgeType;
    direction: 'in' | 'out';
  };
  // Custom condition function (serialized as string for config)
  custom?: string;
}

export type TriggerActionType =
  | 'notify'
  | 'create_node'
  | 'update_node'
  | 'invalidate'
  | 'log'
  | 'exec'
  | 'webhook';

export interface TriggerAction {
  type: TriggerActionType;
  config: Record<string, unknown>;
}

export interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  event: EventType | EventType[];  // Events that activate this trigger
  conditions?: TriggerCondition;   // Additional conditions to check
  actions: TriggerAction[];        // Actions to execute when triggered
  priority?: number;               // Higher priority triggers run first
  cooldownMs?: number;             // Minimum time between firings
  lastFiredAt?: string;            // ISO date
}

// ============================================================================
// Event Handler Types
// ============================================================================

export type EventHandler<T extends CubeEvent = CubeEvent> = (event: T) => void | Promise<void>;

export interface EventSubscription {
  id: string;
  eventType: EventType | '*';
  handler: EventHandler;
  once?: boolean;
}

// ============================================================================
// Event Log Entry (for persistence)
// ============================================================================

export interface EventLogEntry {
  event: CubeEvent;
  processedAt: string;
  triggersActivated: string[];
  errors?: string[];
}
