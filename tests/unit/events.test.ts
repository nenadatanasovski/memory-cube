/**
 * Event System Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus.js';
import { EventLog } from '../../src/events/event-log.js';
import { TriggerManager } from '../../src/events/triggers.js';
import type { NodeCreatedEvent, CubeEvent } from '../../src/events/types.js';
import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should subscribe and receive events', async () => {
    const received: CubeEvent[] = [];
    
    bus.on('node.created', (event) => {
      received.push(event);
    });

    const event: NodeCreatedEvent = {
      id: 'test-event-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {
        id: 'test-node-1',
        type: 'task',
        version: 1,
        status: 'pending',
        validity: 'current',
        confidence: 1,
        priority: 'normal',
        tags: [],
        createdBy: null,
        assignedTo: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        dueAt: null,
        ordering: {
          supersededBy: null,
          semanticHash: 'abc123',
          sourceFreshness: '2025-06-25',
        },
        actions: [],
        edges: [],
        title: 'Test Task',
        content: '',
        contentPreview: '',
        filePath: 'task/test-node-1.md',
      },
    };

    await bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('test-event-1');
  });

  it('should support wildcard subscriptions', async () => {
    const received: CubeEvent[] = [];
    
    bus.on('*', (event) => {
      received.push(event);
    });

    const event1: CubeEvent = {
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    };

    const event2: CubeEvent = {
      id: 'test-2',
      type: 'node.deleted',
      timestamp: new Date().toISOString(),
      nodeId: 'deleted-node',
      node: {} as any,
    };

    await bus.emit(event1);
    await bus.emit(event2);

    expect(received).toHaveLength(2);
  });

  it('should unsubscribe correctly', async () => {
    const received: CubeEvent[] = [];
    
    const subId = bus.on('node.created', (event) => {
      received.push(event);
    });

    const event: CubeEvent = {
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    };

    await bus.emit(event);
    expect(received).toHaveLength(1);

    bus.off(subId);
    await bus.emit(event);
    expect(received).toHaveLength(1); // Should not receive second event
  });

  it('should support once subscriptions', async () => {
    const received: CubeEvent[] = [];
    
    bus.once('node.created', (event) => {
      received.push(event);
    });

    const event: CubeEvent = {
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    };

    await bus.emit(event);
    await bus.emit(event);

    expect(received).toHaveLength(1); // Only receives first event
  });

  it('should pause and resume event delivery', async () => {
    const received: CubeEvent[] = [];
    
    bus.on('node.created', (event) => {
      received.push(event);
    });

    bus.pause();

    const event: CubeEvent = {
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    };

    await bus.emit(event);
    expect(received).toHaveLength(0); // Queued, not delivered

    await bus.resume();
    expect(received).toHaveLength(1); // Now delivered
  });
});

describe('EventLog', () => {
  let tempDir: string;
  let log: EventLog;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cube-test-'));
    mkdirSync(join(tempDir, '.cube'), { recursive: true });
    log = new EventLog(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should append and read events', () => {
    const event: CubeEvent = {
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    };

    log.appendEvent(event, ['trigger-1']);

    const entries = log.readRecent(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].event.id).toBe('test-1');
    expect(entries[0].triggersActivated).toEqual(['trigger-1']);
  });

  it('should filter by event type', () => {
    log.appendEvent({
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    });

    log.appendEvent({
      id: 'test-2',
      type: 'node.deleted',
      timestamp: new Date().toISOString(),
      nodeId: 'deleted',
      node: {} as any,
    });

    const created = log.readByType('node.created', 10);
    expect(created).toHaveLength(1);
    expect(created[0].event.id).toBe('test-1');
  });

  it('should return stats', () => {
    log.appendEvent({
      id: 'test-1',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {} as any,
    });

    const stats = log.stats();
    expect(stats.eventCount).toBe(1);
    expect(stats.fileSizeBytes).toBeGreaterThan(0);
  });
});

describe('TriggerManager', () => {
  let bus: EventBus;
  let manager: TriggerManager;

  beforeEach(() => {
    bus = new EventBus();
    manager = new TriggerManager(bus);
  });

  afterEach(() => {
    manager.stop();
  });

  it('should register and list triggers', () => {
    manager.register({
      id: 'test-trigger',
      name: 'Test Trigger',
      enabled: true,
      event: 'node.created',
      actions: [{ type: 'log', config: { message: 'Test' } }],
    });

    const triggers = manager.list();
    expect(triggers).toHaveLength(1);
    expect(triggers[0].id).toBe('test-trigger');
  });

  it('should execute trigger actions on matching events', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    manager.register({
      id: 'test-trigger',
      name: 'Test Trigger',
      enabled: true,
      event: 'node.created',
      actions: [{ type: 'log', config: { message: 'Node created!' } }],
    });

    manager.start();

    const event: NodeCreatedEvent = {
      id: 'test-event',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {
        id: 'test-node',
        type: 'task',
        version: 1,
        status: 'pending',
        validity: 'current',
        confidence: 1,
        priority: 'normal',
        tags: [],
        createdBy: null,
        assignedTo: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        dueAt: null,
        ordering: {
          supersededBy: null,
          semanticHash: 'abc123',
          sourceFreshness: '2025-06-25',
        },
        actions: [],
        edges: [],
        title: 'Test Task',
        content: '',
        contentPreview: '',
        filePath: 'task/test-node.md',
      },
    };

    await bus.emit(event);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Trigger:Test Trigger]'),
      expect.stringContaining('Node created!')
    );

    logSpy.mockRestore();
  });

  it('should respect trigger conditions', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    manager.register({
      id: 'task-only-trigger',
      name: 'Task Only',
      enabled: true,
      event: 'node.created',
      conditions: {
        nodeType: 'task',
      },
      actions: [{ type: 'log', config: { message: 'Task created!' } }],
    });

    manager.start();

    // Create a doc node (should not trigger)
    const docEvent: NodeCreatedEvent = {
      id: 'doc-event',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {
        id: 'test-doc',
        type: 'doc',
        version: 1,
        status: 'pending',
        validity: 'current',
        confidence: 1,
        priority: 'normal',
        tags: [],
        createdBy: null,
        assignedTo: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        dueAt: null,
        ordering: {
          supersededBy: null,
          semanticHash: 'abc123',
          sourceFreshness: '2025-06-25',
        },
        actions: [],
        edges: [],
        title: 'Test Doc',
        content: '',
        contentPreview: '',
        filePath: 'doc/test-doc.md',
      },
    };

    await bus.emit(docEvent);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not have logged
    expect(logSpy).not.toHaveBeenCalled();

    // Create a task node (should trigger)
    const taskEvent: NodeCreatedEvent = {
      id: 'task-event',
      type: 'node.created',
      timestamp: new Date().toISOString(),
      node: {
        id: 'test-task',
        type: 'task',
        version: 1,
        status: 'pending',
        validity: 'current',
        confidence: 1,
        priority: 'normal',
        tags: [],
        createdBy: null,
        assignedTo: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        dueAt: null,
        ordering: {
          supersededBy: null,
          semanticHash: 'abc123',
          sourceFreshness: '2025-06-25',
        },
        actions: [],
        edges: [],
        title: 'Test Task',
        content: '',
        contentPreview: '',
        filePath: 'task/test-task.md',
      },
    };

    await bus.emit(taskEvent);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should enable/disable triggers', () => {
    manager.register({
      id: 'test-trigger',
      name: 'Test',
      enabled: true,
      event: 'node.created',
      actions: [],
    });

    expect(manager.get('test-trigger')?.enabled).toBe(true);

    manager.setEnabled('test-trigger', false);
    expect(manager.get('test-trigger')?.enabled).toBe(false);

    manager.setEnabled('test-trigger', true);
    expect(manager.get('test-trigger')?.enabled).toBe(true);
  });
});
