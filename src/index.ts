/**
 * Memory Cube
 * 
 * A deterministic parallel orchestration system with graph-based 
 * knowledge synthesis for multi-agent workflows.
 */

// Core
export { Cube, openCube } from './core/cube.js';
export type { CubeOptions } from './core/cube.js';
export {
  createNode,
  updateNode,
  addEdge,
  removeEdge,
  generateId,
  generateSemanticHash,
  nodeToMarkdown,
  markdownToNode,
} from './core/node.js';

// Types
export type {
  Node,
  NodeMeta,
  NodeType,
  NodeStatus,
  NodeValidity,
  Priority,
  Edge,
  EdgeType,
  NodeAction,
  NodeOrdering,
  QueryFilter,
  QuerySort,
  QueryOptions,
  TraversalOptions,
  TraversalResult,
  CubeConfig,
  CreateNodeInput,
  UpdateNodeInput,
  OperationResult,
} from './core/types.js';

// Storage
export { FileStorage } from './storage/file-storage.js';
export { SqliteIndex } from './storage/sqlite-index.js';

// Events
export {
  EventBus,
  getDefaultEventBus,
  resetDefaultEventBus,
  EventLog,
  TriggerManager,
  FileWatcher,
  createCodeChangesTrigger,
  createTaskCompletionTrigger,
  createBrainfartCaptureTrigger,
} from './events/index.js';

export type {
  EventType,
  CubeEvent,
  BaseEvent,
  NodeCreatedEvent,
  NodeUpdatedEvent,
  NodeDeletedEvent,
  NodeStatusChangedEvent,
  NodeValidityChangedEvent,
  EdgeCreatedEvent,
  EdgeDeletedEvent,
  CodeFileChangedEvent,
  AgentTaskEvent,
  CubeSystemEvent,
  TriggerFiredEvent,
  TriggerErrorEvent,
  Trigger,
  TriggerCondition,
  TriggerAction,
  TriggerActionType,
  EventHandler,
  EventSubscription,
  EventLogEntry,
  EventLogOptions,
  FileWatcherOptions,
  TriggerContext,
  ActionExecutor,
} from './events/index.js';
