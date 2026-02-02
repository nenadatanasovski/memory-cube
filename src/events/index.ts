/**
 * Events Module
 * 
 * Exports all event system components.
 */

// Types
export * from './types.js';

// Event Bus
export { EventBus, getDefaultEventBus, resetDefaultEventBus } from './event-bus.js';

// Event Log
export { EventLog } from './event-log.js';
export type { EventLogOptions } from './event-log.js';

// Triggers
export { 
  TriggerManager,
  createCodeChangesTrigger,
  createTaskCompletionTrigger,
  createBrainfartCaptureTrigger,
} from './triggers.js';
export type { TriggerContext, ActionExecutor } from './triggers.js';

// File Watcher
export { FileWatcher } from './file-watcher.js';
export type { FileWatcherOptions } from './file-watcher.js';
