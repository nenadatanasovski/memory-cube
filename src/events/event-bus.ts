/**
 * Event Bus
 * 
 * Pub/sub system for Memory Cube events.
 * Handles event emission, subscription, and delivery.
 */

import { randomUUID } from 'crypto';
import type {
  CubeEvent,
  EventType,
  EventHandler,
  EventSubscription,
} from './types.js';

export class EventBus {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventTypeIndex: Map<EventType | '*', Set<string>> = new Map();
  private paused: boolean = false;
  private eventQueue: CubeEvent[] = [];

  /**
   * Subscribe to events
   */
  on<T extends CubeEvent = CubeEvent>(
    eventType: EventType | '*',
    handler: EventHandler<T>,
    options?: { once?: boolean }
  ): string {
    const id = randomUUID();
    const subscription: EventSubscription = {
      id,
      eventType,
      handler: handler as EventHandler,
      once: options?.once,
    };

    this.subscriptions.set(id, subscription);

    // Index by event type
    if (!this.eventTypeIndex.has(eventType)) {
      this.eventTypeIndex.set(eventType, new Set());
    }
    this.eventTypeIndex.get(eventType)!.add(id);

    return id;
  }

  /**
   * Subscribe to a single event occurrence
   */
  once<T extends CubeEvent = CubeEvent>(
    eventType: EventType | '*',
    handler: EventHandler<T>
  ): string {
    return this.on(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe from events
   */
  off(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);
    this.eventTypeIndex.get(subscription.eventType)?.delete(subscriptionId);

    return true;
  }

  /**
   * Emit an event to all subscribers
   */
  async emit(event: CubeEvent): Promise<void> {
    if (this.paused) {
      this.eventQueue.push(event);
      return;
    }

    const handlers = this.getHandlers(event.type);
    const errors: Error[] = [];

    for (const subscription of handlers) {
      try {
        await subscription.handler(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }

      // Remove one-time handlers
      if (subscription.once) {
        this.off(subscription.id);
      }
    }

    if (errors.length > 0) {
      // Log errors but don't throw - events should be fire-and-forget
      console.error(`[EventBus] ${errors.length} handler(s) failed for ${event.type}:`, errors);
    }
  }

  /**
   * Emit an event synchronously (blocking)
   */
  emitSync(event: CubeEvent): void {
    if (this.paused) {
      this.eventQueue.push(event);
      return;
    }

    const handlers = this.getHandlers(event.type);

    for (const subscription of handlers) {
      try {
        const result = subscription.handler(event);
        // If handler returns a promise, we ignore it in sync mode
        if (result instanceof Promise) {
          result.catch(err => {
            console.error(`[EventBus] Async handler error for ${event.type}:`, err);
          });
        }
      } catch (error) {
        console.error(`[EventBus] Handler error for ${event.type}:`, error);
      }

      if (subscription.once) {
        this.off(subscription.id);
      }
    }
  }

  /**
   * Get all handlers for an event type
   */
  private getHandlers(eventType: EventType): EventSubscription[] {
    const handlers: EventSubscription[] = [];

    // Get specific type handlers
    const typeSubscriptions = this.eventTypeIndex.get(eventType);
    if (typeSubscriptions) {
      for (const id of typeSubscriptions) {
        const sub = this.subscriptions.get(id);
        if (sub) handlers.push(sub);
      }
    }

    // Get wildcard handlers
    const wildcardSubscriptions = this.eventTypeIndex.get('*');
    if (wildcardSubscriptions) {
      for (const id of wildcardSubscriptions) {
        const sub = this.subscriptions.get(id);
        if (sub) handlers.push(sub);
      }
    }

    return handlers;
  }

  /**
   * Pause event delivery (queue events instead)
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume event delivery and flush queue
   */
  async resume(): Promise<void> {
    this.paused = false;
    const queue = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of queue) {
      await this.emit(event);
    }
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    this.eventTypeIndex.clear();
  }

  /**
   * Get subscription count
   */
  subscriptionCount(eventType?: EventType | '*'): number {
    if (eventType) {
      return this.eventTypeIndex.get(eventType)?.size ?? 0;
    }
    return this.subscriptions.size;
  }

  /**
   * Check if there are any subscribers
   */
  hasSubscribers(eventType?: EventType | '*'): boolean {
    return this.subscriptionCount(eventType) > 0;
  }
}

// Singleton instance for the default bus
let defaultBus: EventBus | null = null;

export function getDefaultEventBus(): EventBus {
  if (!defaultBus) {
    defaultBus = new EventBus();
  }
  return defaultBus;
}

export function resetDefaultEventBus(): void {
  defaultBus?.clear();
  defaultBus = null;
}
