/**
 * Agent System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRegistry, createHumanAgent, createCodeAgent } from '../../src/agents/registry.js';
import { WorkQueue } from '../../src/agents/work-queue.js';
import { Orchestrator } from '../../src/agents/orchestrator.js';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AgentRegistry', () => {
  let tempDir: string;
  let registry: AgentRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cube-test-'));
    mkdirSync(join(tempDir, '.cube'), { recursive: true });
    registry = new AgentRegistry(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should register an agent', () => {
    const config = createHumanAgent('kai');
    const agent = registry.register(config);

    expect(agent.id).toBe('kai');
    expect(agent.name).toBe('Kai');
    expect(agent.role).toBe('human-agent');
    expect(agent.state.status).toBe('idle');
  });

  it('should prevent duplicate registration', () => {
    registry.register(createHumanAgent('kai'));
    
    expect(() => registry.register(createHumanAgent('kai'))).toThrow();
  });

  it('should list agents by role', () => {
    registry.register(createHumanAgent('kai'));
    registry.register(createCodeAgent('coder'));

    const humanAgents = registry.list({ role: 'human-agent' });
    expect(humanAgents).toHaveLength(1);
    expect(humanAgents[0].id).toBe('kai');

    const codeAgents = registry.list({ role: 'code-agent' });
    expect(codeAgents).toHaveLength(1);
    expect(codeAgents[0].id).toBe('coder');
  });

  it('should track claimed tasks', () => {
    registry.register(createCodeAgent('coder'));

    registry.addClaimedTask('coder', 'task-1');
    registry.addClaimedTask('coder', 'task-2');

    const agent = registry.get('coder');
    expect(agent?.state.claimedTasks).toHaveLength(2);
    expect(agent?.state.status).toBe('working');
  });

  it('should release tasks and update status', () => {
    registry.register(createCodeAgent('coder'));
    registry.addClaimedTask('coder', 'task-1');

    registry.removeClaimedTask('coder', 'task-1', true);

    const agent = registry.get('coder');
    expect(agent?.state.claimedTasks).toHaveLength(0);
    expect(agent?.state.status).toBe('idle');
    expect(agent?.state.stats.tasksCompleted).toBe(1);
  });

  it('should find capable agents', () => {
    registry.register(createHumanAgent('kai'));
    registry.register(createCodeAgent('coder'));

    // Code agent should match code tag
    const codeCapable = registry.findCapable({ tags: ['code'] });
    expect(codeCapable).toHaveLength(1);
    expect(codeCapable[0].id).toBe('coder');

    // Both should match task type
    const taskCapable = registry.findCapable({ nodeType: 'task' });
    expect(taskCapable.length).toBeGreaterThanOrEqual(1);
  });

  it('should record heartbeats', () => {
    registry.register(createCodeAgent('coder'));

    registry.heartbeat('coder');

    const agent = registry.get('coder');
    expect(agent?.state.lastHeartbeat).not.toBeNull();
  });

  it('should detect stale agents', async () => {
    registry.register(createCodeAgent('coder'));
    registry.heartbeat('coder');
    
    // Wait a tiny bit so the heartbeat is in the past
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // With a 1ms threshold, it should be stale after waiting
    const stale = registry.checkStale(1);
    expect(stale).toContain('coder');

    const agent = registry.get('coder');
    expect(agent?.state.status).toBe('offline');
  });
});

describe('WorkQueue', () => {
  let tempDir: string;
  let registry: AgentRegistry;
  let queue: WorkQueue;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cube-test-'));
    mkdirSync(join(tempDir, '.cube'), { recursive: true });
    registry = new AgentRegistry(tempDir);
    queue = new WorkQueue(registry);

    // Register an agent
    registry.register(createCodeAgent('coder'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should enqueue tasks', () => {
    const item = queue.enqueue('task-1');

    expect(item.taskId).toBe('task-1');
    expect(item.status).toBe('queued');
  });

  it('should claim tasks', () => {
    queue.enqueue('task-1');

    const result = queue.claim({ agentId: 'coder', taskId: 'task-1' });

    expect(result.success).toBe(true);
    expect(result.claimedBy).toBe('coder');

    const agent = registry.get('coder');
    expect(agent?.state.claimedTasks).toContain('task-1');
  });

  it('should prevent double claiming', () => {
    registry.register(createCodeAgent('coder2'));
    queue.enqueue('task-1');

    queue.claim({ agentId: 'coder', taskId: 'task-1' });
    const result = queue.claim({ agentId: 'coder2', taskId: 'task-1' });

    expect(result.success).toBe(false);
    expect(result.claimedBy).toBe('coder');
  });

  it('should release tasks', () => {
    queue.enqueue('task-1');
    queue.claim({ agentId: 'coder', taskId: 'task-1' });

    const released = queue.release({
      agentId: 'coder',
      taskId: 'task-1',
      reason: 'completed',
    });

    expect(released).toBe(true);

    const agent = registry.get('coder');
    expect(agent?.state.claimedTasks).not.toContain('task-1');
    expect(agent?.state.stats.tasksCompleted).toBe(1);
  });

  it('should get next work for agent', () => {
    queue.enqueue('task-1');
    queue.enqueue('task-2');

    const next = queue.getNextFor('coder');

    expect(next).not.toBeNull();
    expect(next?.taskId).toBe('task-1');
  });

  it('should respect concurrent limits', () => {
    // Code agent has maxConcurrent: 3
    queue.enqueue('task-1');
    queue.enqueue('task-2');
    queue.enqueue('task-3');
    queue.enqueue('task-4');

    queue.claim({ agentId: 'coder', taskId: 'task-1' });
    queue.claim({ agentId: 'coder', taskId: 'task-2' });
    queue.claim({ agentId: 'coder', taskId: 'task-3' });

    // Should fail - at max
    const result = queue.claim({ agentId: 'coder', taskId: 'task-4' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('max concurrent');
  });

  it('should track queue stats', () => {
    queue.enqueue('task-1');
    queue.claim({ agentId: 'coder', taskId: 'task-1' });
    queue.release({ agentId: 'coder', taskId: 'task-1', reason: 'completed' });

    const state = queue.getState();
    expect(state.stats.totalQueued).toBe(1);
    expect(state.stats.totalClaimed).toBe(1);
    expect(state.stats.totalCompleted).toBe(1);
  });
});

describe('Orchestrator', () => {
  let tempDir: string;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cube-test-'));
    mkdirSync(join(tempDir, '.cube'), { recursive: true });
    orchestrator = new Orchestrator(tempDir);
  });

  afterEach(() => {
    orchestrator.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should register and list agents', () => {
    orchestrator.registerAgent(createCodeAgent('coder'));

    const agents = orchestrator.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('coder');
  });

  it('should manage work queue', () => {
    orchestrator.registerAgent(createCodeAgent('coder'));
    orchestrator.enqueue('task-1');

    const result = orchestrator.claim({ agentId: 'coder', taskId: 'task-1' });
    expect(result.success).toBe(true);

    const claimed = orchestrator.getClaimed('coder');
    expect(claimed).toHaveLength(1);
  });

  it('should track agent heartbeats', () => {
    orchestrator.registerAgent(createCodeAgent('coder'));
    orchestrator.agentHeartbeat('coder');

    const agent = orchestrator.getAgent('coder');
    expect(agent?.state.lastHeartbeat).not.toBeNull();
  });

  it('should report stats', () => {
    orchestrator.registerAgent(createHumanAgent('kai'));
    orchestrator.registerAgent(createCodeAgent('coder'));

    const stats = orchestrator.agentStats();
    expect(stats.total).toBe(2);
    expect(stats.byStatus.idle).toBe(2);
  });
});
