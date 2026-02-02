/**
 * Core type definitions for Memory Cube
 */

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  | 'task'
  | 'doc'
  | 'code'
  | 'decision'
  | 'ideation'
  | 'brainfart'
  | 'research'
  | 'conversation'
  | 'concept'
  | 'event'
  | 'agent'
  | 'project';

export type NodeStatus =
  | 'pending'
  | 'claimed'
  | 'active'
  | 'blocked'
  | 'complete'
  | 'archived';

export type NodeValidity =
  | 'current'
  | 'stale'
  | 'superseded'
  | 'archived';

export type Priority = 'critical' | 'high' | 'normal' | 'low';

// ============================================================================
// Edge Types
// ============================================================================

export type EdgeType =
  | 'implements'
  | 'documents'
  | 'sourced-from'
  | 'blocks'
  | 'blocked-by'
  | 'depends-on'
  | 'spawns'
  | 'becomes'
  | 'relates-to'
  | 'part-of'
  | 'supersedes'
  | 'invalidates'
  | 'derived-from'
  | 'assigned-to'
  | 'owned-by'
  | 'locked-by';

// ============================================================================
// Core Interfaces
// ============================================================================

export interface NodeOrdering {
  supersededBy: string | null;
  semanticHash: string;
  sourceFreshness: string; // ISO date
}

export interface NodeAction {
  trigger: 'on-create' | 'on-update' | 'on-status-change' | 'on-complete' | 'on-blocked' | 'on-claim' | 'on-schedule' | 'on-stale';
  type: 'notify' | 'create-node' | 'update-node' | 'exec' | 'webhook' | 'agent-task';
  config: Record<string, unknown>;
}

export interface Edge {
  id: string;
  from: string;      // Node ID
  to: string;        // Node ID
  type: EdgeType;
  metadata?: Record<string, unknown>;
  createdAt: string; // ISO date
}

export interface NodeMeta {
  // Identity
  id: string;
  type: NodeType;
  version: number;

  // Status
  status: NodeStatus;
  validity: NodeValidity;
  confidence: number; // 0-1

  // Classification
  priority: Priority;
  tags: string[];

  // Ownership
  createdBy: string | null;
  assignedTo: string | null;
  lockedBy: string | null;

  // Temporal
  createdAt: string;  // ISO date
  modifiedAt: string; // ISO date
  dueAt: string | null;

  // Ordering
  ordering: NodeOrdering;

  // Actions
  actions: NodeAction[];

  // Edges (denormalized for quick access)
  edges: Edge[];
}

export interface Node extends NodeMeta {
  // The full node includes content
  title: string;
  content: string;        // Markdown body
  contentPreview: string; // First ~200 chars for indexing
  filePath: string;       // Relative path to .md file
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryFilter {
  type?: NodeType | NodeType[];
  status?: NodeStatus | NodeStatus[];
  validity?: NodeValidity | NodeValidity[];
  priority?: Priority | Priority[];
  tags?: string[];          // Has all these tags
  tagsAny?: string[];       // Has any of these tags
  assignedTo?: string | null;
  createdBy?: string;
  hasEdge?: {
    type: EdgeType;
    direction: 'in' | 'out';
  };
  search?: string;          // Full-text search
  createdAfter?: string;    // ISO date
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  dueAfter?: string;
  dueBefore?: string;
}

export interface QuerySort {
  field: 'priority' | 'createdAt' | 'modifiedAt' | 'dueAt' | 'title';
  order: 'asc' | 'desc';
}

export interface QueryOptions {
  filter?: QueryFilter;
  sort?: QuerySort[];
  limit?: number;
  offset?: number;
  includeContent?: boolean;
}

// ============================================================================
// Graph Traversal
// ============================================================================

export interface TraversalOptions {
  startNode: string;        // Node ID
  edgeTypes?: EdgeType[];   // Filter to these edge types
  direction?: 'out' | 'in' | 'both';
  maxDepth?: number;
  includeStart?: boolean;
}

export interface TraversalResult {
  node: Node;
  depth: number;
  path: string[];           // Node IDs from start to this node
  edge: Edge | null;        // Edge that led here (null for start)
}

// ============================================================================
// Events
// ============================================================================

export type EventType =
  | 'node.created'
  | 'node.updated'
  | 'node.deleted'
  | 'node.status_changed'
  | 'node.validity_changed'
  | 'edge.created'
  | 'edge.deleted'
  | 'code.file_changed'
  | 'agent.task_claimed'
  | 'agent.task_completed'
  | 'agent.task_blocked';

export interface CubeEvent {
  id: string;
  type: EventType;
  timestamp: string;        // ISO date
  nodeId?: string;
  edgeId?: string;
  data: Record<string, unknown>;
}

// ============================================================================
// Cube Configuration
// ============================================================================

export interface CubeConfig {
  version: string;
  name: string;
  rootPath: string;         // Path to .cube directory
  
  // Index settings
  index: {
    rebuildOnStart: boolean;
    ftsEnabled: boolean;
  };

  // Event settings
  events: {
    enabled: boolean;
    maxLogSize: number;     // Max events to keep
  };

  // Agent settings
  agents: {
    defaultAgent: string;
    autoAssign: boolean;
  };
}

// ============================================================================
// Operation Results
// ============================================================================

export interface CreateNodeInput {
  type: NodeType;
  title: string;
  content?: string;
  status?: NodeStatus;
  priority?: Priority;
  tags?: string[];
  assignedTo?: string;
  dueAt?: string;
  edges?: Omit<Edge, 'id' | 'from' | 'createdAt'>[];
}

export interface UpdateNodeInput {
  title?: string;
  content?: string;
  status?: NodeStatus;
  validity?: NodeValidity;
  priority?: Priority;
  tags?: string[];
  assignedTo?: string;
  lockedBy?: string;
  dueAt?: string | null;
  confidence?: number;
}

export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
