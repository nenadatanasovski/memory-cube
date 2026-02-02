/**
 * Agent Registry
 * 
 * Manages agent registration, status tracking, and lookup.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type {
  Agent,
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentRole,
  AgentCapabilities,
} from './types.js';

const DEFAULT_CAPABILITIES: AgentCapabilities = {
  nodeTypes: ['task'],
  edgeTypes: ['implements', 'blocks', 'depends-on'],
  tags: [],
  maxConcurrent: 1,
  canCreate: false,
  canDelete: false,
  priorityBoost: 0,
};

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private configPath: string;
  private stateDir: string;

  constructor(cubePath: string) {
    this.configPath = join(cubePath, '.cube', 'agents.json');
    this.stateDir = join(cubePath, '.cube', 'agent-state');
    this.load();
  }

  /**
   * Load agents from config file
   */
  private load(): void {
    if (!existsSync(this.configPath)) {
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      const configs: AgentConfig[] = data.agents || [];

      for (const config of configs) {
        const state = this.loadState(config.id);
        this.agents.set(config.id, {
          ...config,
          state,
          registeredAt: state.stats.lastActiveAt || new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[AgentRegistry] Failed to load config:', error);
    }
  }

  /**
   * Load agent state from file
   */
  private loadState(agentId: string): AgentState {
    const statePath = join(this.stateDir, `${agentId}.json`);
    
    if (existsSync(statePath)) {
      try {
        return JSON.parse(readFileSync(statePath, 'utf-8'));
      } catch {
        // Return default state on error
      }
    }

    return {
      id: agentId,
      status: 'idle',
      claimedTasks: [],
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        avgCompletionTimeMs: 0,
        lastActiveAt: null,
      },
      lastHeartbeat: null,
      heartbeatIntervalMs: 60000, // 1 minute default
    };
  }

  /**
   * Save agent state to file
   */
  private saveState(agent: Agent): void {
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }

    const statePath = join(this.stateDir, `${agent.id}.json`);
    writeFileSync(statePath, JSON.stringify(agent.state, null, 2), 'utf-8');
  }

  /**
   * Save all agent configs
   */
  private saveConfig(): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const configs = Array.from(this.agents.values()).map(agent => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { state, registeredAt, ...config } = agent;
      return config;
    });

    writeFileSync(
      this.configPath,
      JSON.stringify({ agents: configs }, null, 2),
      'utf-8'
    );
  }

  /**
   * Register a new agent
   */
  register(config: AgentConfig): Agent {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent already registered: ${config.id}`);
    }

    const agent: Agent = {
      ...config,
      capabilities: { ...DEFAULT_CAPABILITIES, ...config.capabilities },
      state: this.loadState(config.id),
      registeredAt: new Date().toISOString(),
    };

    this.agents.set(config.id, agent);
    this.saveConfig();
    this.saveState(agent);

    return agent;
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Check for claimed tasks
    if (agent.state.claimedTasks.length > 0) {
      throw new Error(`Agent has claimed tasks: ${agent.state.claimedTasks.join(', ')}`);
    }

    this.agents.delete(agentId);
    this.saveConfig();
    return true;
  }

  /**
   * Get an agent by ID
   */
  get(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all agents
   */
  list(filter?: { role?: AgentRole; status?: AgentStatus }): Agent[] {
    let agents = Array.from(this.agents.values());

    if (filter?.role) {
      agents = agents.filter(a => a.role === filter.role);
    }

    if (filter?.status) {
      agents = agents.filter(a => a.state.status === filter.status);
    }

    return agents;
  }

  /**
   * Update agent status
   */
  setStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.state.status = status;
    agent.state.stats.lastActiveAt = new Date().toISOString();
    this.saveState(agent);
    return true;
  }

  /**
   * Record agent heartbeat
   */
  heartbeat(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.state.lastHeartbeat = new Date().toISOString();
    agent.state.stats.lastActiveAt = new Date().toISOString();
    
    // If agent was offline, set to idle
    if (agent.state.status === 'offline') {
      agent.state.status = 'idle';
    }
    
    this.saveState(agent);
    return true;
  }

  /**
   * Check for stale agents (missed heartbeats)
   */
  checkStale(thresholdMs: number = 300000): string[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const agent of this.agents.values()) {
      if (agent.state.lastHeartbeat) {
        const lastBeat = new Date(agent.state.lastHeartbeat).getTime();
        if (now - lastBeat > thresholdMs && agent.state.status !== 'offline') {
          agent.state.status = 'offline';
          this.saveState(agent);
          stale.push(agent.id);
        }
      }
    }

    return stale;
  }

  /**
   * Add a claimed task to agent
   */
  addClaimedTask(agentId: string, taskId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (!agent.state.claimedTasks.includes(taskId)) {
      agent.state.claimedTasks.push(taskId);
      agent.state.status = 'working';
      this.saveState(agent);
    }
    return true;
  }

  /**
   * Remove a claimed task from agent
   */
  removeClaimedTask(agentId: string, taskId: string, completed: boolean = true): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    const index = agent.state.claimedTasks.indexOf(taskId);
    if (index === -1) return false;

    agent.state.claimedTasks.splice(index, 1);
    
    // Update stats
    if (completed) {
      agent.state.stats.tasksCompleted++;
    } else {
      agent.state.stats.tasksFailed++;
    }
    
    // Update status
    if (agent.state.claimedTasks.length === 0) {
      agent.state.status = 'idle';
    }
    
    this.saveState(agent);
    return true;
  }

  /**
   * Find agents capable of handling a task
   */
  findCapable(requirements: {
    nodeType?: string;
    tags?: string[];
    role?: AgentRole;
  }): Agent[] {
    return this.list()
      .filter(agent => {
        // Must be available
        if (agent.state.status === 'offline') return false;
        
        // Check concurrent limit
        if (agent.state.claimedTasks.length >= agent.capabilities.maxConcurrent) {
          return false;
        }

        // Check role
        if (requirements.role && agent.role !== requirements.role) {
          return false;
        }

        // Check node type capability
        if (requirements.nodeType && 
            !agent.capabilities.nodeTypes.includes(requirements.nodeType as any)) {
          return false;
        }

        // Check tag requirements
        if (requirements.tags && requirements.tags.length > 0) {
          const hasRequiredTags = requirements.tags.some(tag => 
            agent.capabilities.tags.includes(tag)
          );
          if (!hasRequiredTags) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by: priority boost (desc), then claimed count (asc)
        if (b.capabilities.priorityBoost !== a.capabilities.priorityBoost) {
          return b.capabilities.priorityBoost - a.capabilities.priorityBoost;
        }
        return a.state.claimedTasks.length - b.state.claimedTasks.length;
      });
  }

  /**
   * Get agent statistics
   */
  stats(): {
    total: number;
    byStatus: Record<AgentStatus, number>;
    byRole: Record<string, number>;
    totalClaimedTasks: number;
  } {
    const byStatus: Record<AgentStatus, number> = {
      idle: 0,
      working: 0,
      blocked: 0,
      offline: 0,
    };

    const byRole: Record<string, number> = {};
    let totalClaimedTasks = 0;

    for (const agent of this.agents.values()) {
      byStatus[agent.state.status]++;
      byRole[agent.role] = (byRole[agent.role] || 0) + 1;
      totalClaimedTasks += agent.state.claimedTasks.length;
    }

    return {
      total: this.agents.size,
      byStatus,
      byRole,
      totalClaimedTasks,
    };
  }
}

/**
 * Create predefined agent configs
 */
export function createHumanAgent(id: string = 'kai'): AgentConfig {
  return {
    id,
    name: 'Kai',
    role: 'human-agent',
    description: 'Primary interface with human user, orchestrates other agents',
    capabilities: {
      nodeTypes: ['task', 'doc', 'ideation', 'brainfart', 'decision', 'conversation'],
      edgeTypes: ['implements', 'blocks', 'depends-on', 'spawns', 'becomes', 'relates-to'],
      tags: [],
      maxConcurrent: 10,
      canCreate: true,
      canDelete: true,
      priorityBoost: 100,
    },
  };
}

export function createCodeAgent(id: string = 'code-agent'): AgentConfig {
  return {
    id,
    name: 'Code Agent',
    role: 'code-agent',
    description: 'Implements code, refactors, handles technical tasks',
    capabilities: {
      nodeTypes: ['task', 'code'],
      edgeTypes: ['implements', 'blocks', 'depends-on', 'part-of'],
      tags: ['code', 'backend', 'frontend', 'api', 'refactor'],
      maxConcurrent: 3,
      canCreate: true,
      canDelete: false,
      priorityBoost: 50,
    },
  };
}

export function createDocAgent(id: string = 'doc-agent'): AgentConfig {
  return {
    id,
    name: 'Doc Agent',
    role: 'doc-agent',
    description: 'Maintains documentation, keeps docs in sync with code',
    capabilities: {
      nodeTypes: ['task', 'doc'],
      edgeTypes: ['documents', 'sourced-from', 'relates-to'],
      tags: ['docs', 'documentation', 'readme', 'api-docs'],
      maxConcurrent: 5,
      canCreate: true,
      canDelete: false,
      priorityBoost: 30,
    },
  };
}

export function createResearchAgent(id: string = 'research-agent'): AgentConfig {
  return {
    id,
    name: 'Research Agent',
    role: 'research-agent',
    description: 'Gathers external information, researches topics',
    capabilities: {
      nodeTypes: ['task', 'research', 'brainfart', 'ideation'],
      edgeTypes: ['sourced-from', 'relates-to', 'spawns'],
      tags: ['research', 'analysis', 'web-search'],
      maxConcurrent: 3,
      canCreate: true,
      canDelete: false,
      priorityBoost: 20,
    },
  };
}
