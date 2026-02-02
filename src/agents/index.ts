/**
 * Agents Module
 * 
 * Exports all agent system components.
 */

// Types
export * from './types.js';

// Registry
export { 
  AgentRegistry,
  createHumanAgent,
  createCodeAgent,
  createDocAgent,
  createResearchAgent,
} from './registry.js';

// Work Queue
export { WorkQueue } from './work-queue.js';

// Orchestrator
export { Orchestrator } from './orchestrator.js';
export type { OrchestratorOptions } from './orchestrator.js';

// Agents
export { OrphanHunterAgent } from './orphan-hunter.js';
export type { OrphanHunterConfig, ConnectionSuggestion } from './orphan-hunter.js';
