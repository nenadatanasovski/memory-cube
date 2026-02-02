/**
 * Trigger System
 * 
 * Maps events to actions based on configurable rules.
 * Triggers can create nodes, update nodes, send notifications, etc.
 */

import { randomUUID } from 'crypto';
import type {
  CubeEvent,
  Trigger,
  TriggerAction,
  TriggerFiredEvent,
  TriggerErrorEvent,
  NodeCreatedEvent,
} from './types.js';
import type { Node, NodeValidity } from '../core/types.js';
import { EventBus } from './event-bus.js';
import { EventLog } from './event-log.js';

export interface TriggerContext {
  event: CubeEvent;
  trigger: Trigger;
  cube?: any; // Will be typed properly when integrated with Cube
}

export type ActionExecutor = (
  action: TriggerAction,
  context: TriggerContext
) => Promise<void>;

export class TriggerManager {
  private triggers: Map<string, Trigger> = new Map();
  private eventBus: EventBus;
  private eventLog?: EventLog;
  private actionExecutors: Map<string, ActionExecutor> = new Map();
  private subscriptionId?: string;
  private cube?: any;

  constructor(eventBus: EventBus, eventLog?: EventLog) {
    this.eventBus = eventBus;
    this.eventLog = eventLog;
    this.registerDefaultExecutors();
  }

  /**
   * Set the Cube instance for actions that need it
   */
  setCube(cube: any): void {
    this.cube = cube;
  }

  /**
   * Start listening for events
   */
  start(): void {
    if (this.subscriptionId) return;

    this.subscriptionId = this.eventBus.on('*', async (event) => {
      await this.processEvent(event);
    });
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (this.subscriptionId) {
      this.eventBus.off(this.subscriptionId);
      this.subscriptionId = undefined;
    }
  }

  /**
   * Register a trigger
   */
  register(trigger: Trigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  /**
   * Unregister a trigger
   */
  unregister(triggerId: string): boolean {
    return this.triggers.delete(triggerId);
  }

  /**
   * Get a trigger by ID
   */
  get(triggerId: string): Trigger | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * List all triggers
   */
  list(): Trigger[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Enable/disable a trigger
   */
  setEnabled(triggerId: string, enabled: boolean): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;
    trigger.enabled = enabled;
    return true;
  }

  /**
   * Register a custom action executor
   */
  registerActionExecutor(actionType: string, executor: ActionExecutor): void {
    this.actionExecutors.set(actionType, executor);
  }

  /**
   * Process an event against all triggers
   */
  private async processEvent(event: CubeEvent): Promise<void> {
    // Don't process trigger events (avoid infinite loops)
    if (event.type === 'trigger.fired' || event.type === 'trigger.error') {
      return;
    }

    const triggersActivated: string[] = [];
    const sortedTriggers = this.getSortedTriggers();

    for (const trigger of sortedTriggers) {
      if (!trigger.enabled) continue;
      if (!this.eventMatchesTrigger(event, trigger)) continue;
      if (!this.checkCooldown(trigger)) continue;
      if (!this.checkConditions(event, trigger)) continue;

      try {
        await this.executeTrigger(trigger, event);
        triggersActivated.push(trigger.id);
        trigger.lastFiredAt = new Date().toISOString();
      } catch (error) {
        await this.emitTriggerError(trigger, event, error);
      }
    }

    // Log the event with activated triggers
    if (this.eventLog) {
      this.eventLog.appendEvent(event, triggersActivated);
    }
  }

  /**
   * Get triggers sorted by priority
   */
  private getSortedTriggers(): Trigger[] {
    return Array.from(this.triggers.values())
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Check if event type matches trigger
   */
  private eventMatchesTrigger(event: CubeEvent, trigger: Trigger): boolean {
    const eventTypes = Array.isArray(trigger.event) ? trigger.event : [trigger.event];
    return eventTypes.includes(event.type);
  }

  /**
   * Check trigger cooldown
   */
  private checkCooldown(trigger: Trigger): boolean {
    if (!trigger.cooldownMs || !trigger.lastFiredAt) return true;

    const lastFired = new Date(trigger.lastFiredAt).getTime();
    const now = Date.now();
    return (now - lastFired) >= trigger.cooldownMs;
  }

  /**
   * Check trigger conditions against event
   */
  private checkConditions(event: CubeEvent, trigger: Trigger): boolean {
    if (!trigger.conditions) return true;

    const conditions = trigger.conditions;
    const node = this.getNodeFromEvent(event);

    if (!node) {
      // Some conditions require a node
      if (conditions.nodeType || conditions.status || conditions.validity || 
          conditions.tags || conditions.tagsAny || conditions.hasEdge) {
        return false;
      }
      return true;
    }

    // Check node type
    if (conditions.nodeType) {
      const types = Array.isArray(conditions.nodeType) ? conditions.nodeType : [conditions.nodeType];
      if (!types.includes(node.type)) return false;
    }

    // Check status
    if (conditions.status) {
      const statuses = Array.isArray(conditions.status) ? conditions.status : [conditions.status];
      if (!statuses.includes(node.status)) return false;
    }

    // Check validity
    if (conditions.validity) {
      const validities = Array.isArray(conditions.validity) ? conditions.validity : [conditions.validity];
      if (!validities.includes(node.validity)) return false;
    }

    // Check tags (all)
    if (conditions.tags && conditions.tags.length > 0) {
      if (!conditions.tags.every(tag => node.tags.includes(tag))) return false;
    }

    // Check tags (any)
    if (conditions.tagsAny && conditions.tagsAny.length > 0) {
      if (!conditions.tagsAny.some(tag => node.tags.includes(tag))) return false;
    }

    // Check has edge
    if (conditions.hasEdge) {
      const hasMatchingEdge = node.edges.some(edge => {
        if (edge.type !== conditions.hasEdge!.type) return false;
        if (conditions.hasEdge!.direction === 'out') return edge.from === node.id;
        if (conditions.hasEdge!.direction === 'in') return edge.to === node.id;
        return true;
      });
      if (!hasMatchingEdge) return false;
    }

    return true;
  }

  /**
   * Extract node from event if available
   */
  private getNodeFromEvent(event: CubeEvent): Node | null {
    switch (event.type) {
      case 'node.created':
        return (event as NodeCreatedEvent).node;
      case 'node.deleted':
        return (event as any).node;
      default:
        return null;
    }
  }

  /**
   * Execute a trigger's actions
   */
  private async executeTrigger(trigger: Trigger, event: CubeEvent): Promise<void> {
    const context: TriggerContext = {
      event,
      trigger,
      cube: this.cube,
    };

    const actionNames: string[] = [];

    for (const action of trigger.actions) {
      const executor = this.actionExecutors.get(action.type);
      if (!executor) {
        console.warn(`[TriggerManager] No executor for action type: ${action.type}`);
        continue;
      }

      await executor(action, context);
      actionNames.push(action.type);
    }

    // Emit trigger fired event
    const firedEvent: TriggerFiredEvent = {
      id: randomUUID(),
      type: 'trigger.fired',
      timestamp: new Date().toISOString(),
      triggerId: trigger.id,
      triggerName: trigger.name,
      sourceEventId: event.id,
      actions: actionNames,
    };
    this.eventBus.emitSync(firedEvent);
  }

  /**
   * Emit a trigger error event
   */
  private async emitTriggerError(trigger: Trigger, sourceEvent: CubeEvent, error: unknown): Promise<void> {
    const errorEvent: TriggerErrorEvent = {
      id: randomUUID(),
      type: 'trigger.error',
      timestamp: new Date().toISOString(),
      triggerId: trigger.id,
      triggerName: trigger.name,
      error: error instanceof Error ? error.message : String(error),
      sourceEventId: sourceEvent.id,
    };
    this.eventBus.emitSync(errorEvent);
  }

  /**
   * Register default action executors
   */
  private registerDefaultExecutors(): void {
    // Log action - just logs to console
    this.actionExecutors.set('log', async (action, context) => {
      const message = this.interpolate(action.config.message as string, context);
      console.log(`[Trigger:${context.trigger.name}]`, message);
    });

    // Notify action - could integrate with external systems
    this.actionExecutors.set('notify', async (action, context) => {
      const message = this.interpolate(action.config.message as string, context);
      const target = action.config.target as string;
      console.log(`[Notify:${target}]`, message);
      // TODO: Integrate with actual notification systems
    });

    // Create node action
    this.actionExecutors.set('create_node', async (action, context) => {
      if (!context.cube) {
        throw new Error('Cube not available for create_node action');
      }

      const nodeConfig = action.config.node as any;
      const interpolatedConfig = {
        ...nodeConfig,
        title: this.interpolate(nodeConfig.title, context),
        content: nodeConfig.content ? this.interpolate(nodeConfig.content, context) : undefined,
      };

      context.cube.create(interpolatedConfig);
    });

    // Update node action
    this.actionExecutors.set('update_node', async (action, context) => {
      if (!context.cube) {
        throw new Error('Cube not available for update_node action');
      }

      const targetId = this.interpolate(action.config.targetId as string, context);
      const updates = action.config.updates as any;

      context.cube.update(targetId, updates);
    });

    // Invalidate action - marks linked docs as stale
    this.actionExecutors.set('invalidate', async (action, context) => {
      if (!context.cube) {
        throw new Error('Cube not available for invalidate action');
      }

      const nodeId = this.interpolate(action.config.nodeId as string, context);
      // reason is available for future use in logging/notifications
      const _reason = this.interpolate(action.config.reason as string, context);
      void _reason; // Suppress unused warning

      // Find nodes linked via 'documents' edge
      const result = context.cube.get(nodeId);
      if (!result.success || !result.data) return;

      const node = result.data as Node;
      const docsEdges = node.edges.filter(e => e.type === 'documents' && e.to === node.id);

      for (const edge of docsEdges) {
        context.cube.update(edge.from, {
          validity: 'stale' as NodeValidity,
        });
      }
    });
  }

  /**
   * Simple template interpolation
   */
  private interpolate(template: string, context: TriggerContext): string {
    if (!template) return '';

    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
  }
}

/**
 * Create common triggers
 */
export function createCodeChangesTrigger(): Trigger {
  return {
    id: 'code-changes-invalidate-docs',
    name: 'Code Changes Invalidate Docs',
    enabled: true,
    event: 'node.updated',
    conditions: {
      nodeType: 'code',
    },
    actions: [
      {
        type: 'invalidate',
        config: {
          nodeId: '{{event.nodeId}}',
          reason: 'Source code changed',
        },
      },
      {
        type: 'log',
        config: {
          message: 'Code node {{event.nodeId}} changed, invalidating linked docs',
        },
      },
    ],
    priority: 10,
  };
}

export function createTaskCompletionTrigger(): Trigger {
  return {
    id: 'task-completion-notify',
    name: 'Task Completion Notification',
    enabled: true,
    event: 'node.status_changed',
    conditions: {
      nodeType: 'task',
      status: 'complete',
    },
    actions: [
      {
        type: 'notify',
        config: {
          target: 'human-agent',
          message: 'Task completed: {{event.nodeId}}',
        },
      },
    ],
    priority: 5,
  };
}

export function createBrainfartCaptureTrigger(): Trigger {
  return {
    id: 'brainfart-capture-notify',
    name: 'Brainfart Captured',
    enabled: true,
    event: 'node.created',
    conditions: {
      nodeType: 'brainfart',
    },
    actions: [
      {
        type: 'log',
        config: {
          message: 'New brainfart captured: {{event.node.title}}',
        },
      },
    ],
    priority: 1,
  };
}
