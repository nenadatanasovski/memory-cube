#!/usr/bin/env node

/**
 * Memory Cube CLI
 * 
 * Command-line interface for interacting with the knowledge graph.
 */

import { Command } from 'commander';
import { Cube, openCube } from '../core/cube.js';
import type { NodeType, Priority, EdgeType } from '../core/types.js';

const program = new Command();

program
  .name('cube')
  .description('Memory Cube - Knowledge graph for human-agent collaboration')
  .version('0.1.0');

// ============================================================================
// Init Command
// ============================================================================

program
  .command('init')
  .description('Initialize a new Memory Cube in the current directory')
  .action(async () => {
    try {
      const cube = new Cube();
      await cube.init();
      console.log('✓ Memory Cube initialized in .cube/');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Status Command
// ============================================================================

program
  .command('status')
  .description('Show cube statistics')
  .action(async () => {
    try {
      const cube = await openCube();
      const stats = cube.stats();
      
      console.log('\n📊 Memory Cube Status\n');
      console.log(`Total nodes: ${stats.totalNodes}`);
      
      if (stats.totalNodes > 0) {
        console.log('\nBy type:');
        for (const [type, count] of Object.entries(stats.byType)) {
          if (count > 0) console.log(`  ${type}: ${count}`);
        }
        
        console.log('\nBy status:');
        for (const [status, count] of Object.entries(stats.byStatus)) {
          if (count > 0) console.log(`  ${status}: ${count}`);
        }
      }
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Create Command
// ============================================================================

program
  .command('create <type> <title>')
  .description('Create a new node')
  .option('-p, --priority <priority>', 'Priority (critical, high, normal, low)', 'normal')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-a, --assign <agent>', 'Assign to agent')
  .option('-c, --content <content>', 'Node content')
  .option('-d, --due <date>', 'Due date (ISO format)')
  .action(async (type: string, title: string, options) => {
    try {
      const cube = await openCube();
      
      const result = cube.create({
        type: type as NodeType,
        title,
        content: options.content,
        priority: options.priority as Priority,
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
        assignedTo: options.assign,
        dueAt: options.due,
      });

      if (result.success && result.data) {
        console.log(`✓ Created: ${result.data.id}`);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Show Command
// ============================================================================

program
  .command('show <id>')
  .description('Show a node')
  .action(async (id: string) => {
    try {
      const cube = await openCube();
      const result = cube.get(id);

      if (!result.success || !result.data) {
        console.error('Error:', result.error);
        process.exit(1);
      }

      const node = result.data;
      console.log(`\n# ${node.title}\n`);
      console.log(`ID: ${node.id}`);
      console.log(`Type: ${node.type}`);
      console.log(`Status: ${node.status}`);
      console.log(`Priority: ${node.priority}`);
      console.log(`Validity: ${node.validity}`);
      console.log(`Tags: ${node.tags.join(', ') || '(none)'}`);
      console.log(`Assigned: ${node.assignedTo || '(unassigned)'}`);
      console.log(`Created: ${node.createdAt}`);
      console.log(`Modified: ${node.modifiedAt}`);
      if (node.dueAt) console.log(`Due: ${node.dueAt}`);
      
      if (node.edges.length > 0) {
        console.log('\nEdges:');
        for (const edge of node.edges) {
          console.log(`  → ${edge.type}: ${edge.to}`);
        }
      }

      if (node.content) {
        console.log('\n---\n');
        console.log(node.content);
      }
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Update Command
// ============================================================================

program
  .command('update <id>')
  .description('Update a node')
  .option('-s, --status <status>', 'New status')
  .option('-p, --priority <priority>', 'New priority')
  .option('-t, --tags <tags>', 'New tags (comma-separated)')
  .option('-a, --assign <agent>', 'Assign to agent')
  .option('--title <title>', 'New title')
  .option('-c, --content <content>', 'New content')
  .option('-d, --due <date>', 'Due date (ISO format)')
  .action(async (id: string, options) => {
    try {
      const cube = await openCube();
      
      const updates: Record<string, unknown> = {};
      if (options.status) updates.status = options.status;
      if (options.priority) updates.priority = options.priority;
      if (options.tags) updates.tags = options.tags.split(',').map((t: string) => t.trim());
      if (options.assign) updates.assignedTo = options.assign;
      if (options.title) updates.title = options.title;
      if (options.content) updates.content = options.content;
      if (options.due) updates.dueAt = options.due;

      const result = cube.update(id, updates);

      if (result.success) {
        console.log(`✓ Updated: ${id}`);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Delete Command
// ============================================================================

program
  .command('delete <id>')
  .description('Delete a node')
  .option('-f, --force', 'Skip confirmation')
  .action(async (id: string, options) => {
    try {
      const cube = await openCube();
      
      if (!options.force) {
        const result = cube.get(id);
        if (result.success && result.data) {
          console.log(`About to delete: ${result.data.title} (${result.data.type})`);
        }
      }

      const result = cube.delete(id);

      if (result.success) {
        console.log(`✓ Deleted: ${id}`);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Link Command
// ============================================================================

program
  .command('link <from> <edge-type> <to>')
  .description('Create an edge between nodes')
  .action(async (from: string, edgeType: string, to: string) => {
    try {
      const cube = await openCube();
      const result = cube.link(from, edgeType as EdgeType, to);

      if (result.success) {
        console.log(`✓ Linked: ${from} --${edgeType}--> ${to}`);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Unlink Command
// ============================================================================

program
  .command('unlink <from> <edge-type> <to>')
  .description('Remove an edge between nodes')
  .action(async (from: string, edgeType: string, to: string) => {
    try {
      const cube = await openCube();
      const result = cube.unlink(from, edgeType as EdgeType, to);

      if (result.success) {
        console.log(`✓ Unlinked: ${from} --${edgeType}--> ${to}`);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Query Command
// ============================================================================

program
  .command('query')
  .description('Query nodes')
  .option('--type <type>', 'Filter by type')
  .option('--status <status>', 'Filter by status')
  .option('--priority <priority>', 'Filter by priority')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .option('--assigned <agent>', 'Filter by assignee')
  .option('--search <text>', 'Full-text search')
  .option('--limit <n>', 'Limit results', '20')
  .option('--sort <field>', 'Sort by field (priority, createdAt, modifiedAt, title)')
  .option('--order <order>', 'Sort order (asc, desc)', 'desc')
  .action(async (options) => {
    try {
      const cube = await openCube();
      
      const filter: Record<string, unknown> = {};
      if (options.type) filter.type = options.type;
      if (options.status) filter.status = options.status;
      if (options.priority) filter.priority = options.priority;
      if (options.tags) filter.tags = options.tags.split(',').map((t: string) => t.trim());
      if (options.assigned) filter.assignedTo = options.assigned;
      if (options.search) filter.search = options.search;

      const result = cube.query({
        filter,
        sort: options.sort ? [{ field: options.sort, order: options.order }] : undefined,
        limit: parseInt(options.limit, 10),
      });

      if (!result.success || !result.data) {
        console.error('Error:', result.error);
        process.exit(1);
      }

      const nodes = result.data;
      
      if (nodes.length === 0) {
        console.log('\nNo nodes found.\n');
        return;
      }

      console.log(`\nFound ${nodes.length} node(s):\n`);
      
      for (const node of nodes) {
        const status = node.status.padEnd(8);
        const priority = node.priority.padEnd(8);
        const tags = node.tags.length > 0 ? ` [${node.tags.join(', ')}]` : '';
        console.log(`  [${node.type}] ${node.id}`);
        console.log(`    "${node.title}" (${status} ${priority})${tags}`);
      }
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Traverse Command
// ============================================================================

program
  .command('traverse <id>')
  .description('Traverse the graph from a node')
  .option('--edge <type>', 'Filter by edge type')
  .option('--direction <dir>', 'Direction (out, in, both)', 'out')
  .option('--depth <n>', 'Max depth', '3')
  .action(async (id: string, options) => {
    try {
      const cube = await openCube();
      
      const result = cube.traverse({
        startNode: id,
        edgeTypes: options.edge ? [options.edge as EdgeType] : undefined,
        direction: options.direction,
        maxDepth: parseInt(options.depth, 10),
        includeStart: true,
      });

      if (!result.success || !result.data) {
        console.error('Error:', result.error);
        process.exit(1);
      }

      const results = result.data;
      
      console.log(`\nTraversal from ${id}:\n`);
      
      for (const { node, depth, edge } of results) {
        const indent = '  '.repeat(depth);
        const edgeStr = edge ? ` (via ${edge.type})` : '';
        console.log(`${indent}${depth}. [${node.type}] ${node.title}${edgeStr}`);
      }
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Log Command
// ============================================================================

program
  .command('log <id> <message>')
  .description('Add a log entry to a node')
  .action(async (id: string, message: string) => {
    try {
      const cube = await openCube();
      const result = cube.get(id);

      if (!result.success || !result.data) {
        console.error('Error:', result.error);
        process.exit(1);
      }

      const node = result.data;
      const now = new Date().toISOString();
      const logEntry = `\n\n---\n**${now}**: ${message}`;
      
      const updateResult = cube.update(id, {
        content: node.content + logEntry,
      });

      if (updateResult.success) {
        console.log(`✓ Logged to: ${id}`);
      } else {
        console.error('Error:', updateResult.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Sync Command
// ============================================================================

program
  .command('sync')
  .description('Rebuild the index from files')
  .action(async () => {
    try {
      const cube = await openCube();
      const result = cube.rebuildIndex();
      
      console.log(`\n✓ Indexed ${result.indexed} node(s)`);
      
      if (result.errors.length > 0) {
        console.log(`\n⚠ ${result.errors.length} error(s):`);
        for (const error of result.errors) {
          console.log(`  - ${error}`);
        }
      }
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Events Command
// ============================================================================

program
  .command('events')
  .description('Show recent events')
  .option('-n, --count <n>', 'Number of events to show', '20')
  .option('--type <type>', 'Filter by event type')
  .option('--node <id>', 'Filter by node ID')
  .action(async (options) => {
    try {
      const cube = await openCube();
      const eventLog = cube.getEventLog();
      
      if (!eventLog) {
        console.log('Event system not enabled.');
        return;
      }

      let entries;
      if (options.node) {
        entries = eventLog.readByNode(options.node, parseInt(options.count, 10));
      } else if (options.type) {
        entries = eventLog.readByType(options.type, parseInt(options.count, 10));
      } else {
        entries = eventLog.readRecent(parseInt(options.count, 10));
      }

      if (entries.length === 0) {
        console.log('\nNo events found.\n');
        return;
      }

      console.log(`\n📋 Recent Events (${entries.length}):\n`);
      
      for (const entry of entries) {
        const event = entry.event;
        const time = new Date(event.timestamp).toLocaleTimeString();
        const triggers = entry.triggersActivated.length > 0 
          ? ` → triggered: ${entry.triggersActivated.join(', ')}` 
          : '';
        
        let details = '';
        if ('nodeId' in event) details = ` (${(event as any).nodeId})`;
        else if ('node' in event) details = ` (${(event as any).node?.id || 'unknown'})`;
        
        console.log(`  [${time}] ${event.type}${details}${triggers}`);
      }
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Events Stats Command
// ============================================================================

program
  .command('events-stats')
  .description('Show event log statistics')
  .action(async () => {
    try {
      const cube = await openCube();
      const eventLog = cube.getEventLog();
      
      if (!eventLog) {
        console.log('Event system not enabled.');
        return;
      }

      const stats = eventLog.stats();
      
      console.log('\n📊 Event Log Stats\n');
      console.log(`  Events: ${stats.eventCount}`);
      console.log(`  File size: ${(stats.fileSizeBytes / 1024).toFixed(1)} KB`);
      if (stats.oldestEvent) console.log(`  Oldest: ${stats.oldestEvent}`);
      if (stats.newestEvent) console.log(`  Newest: ${stats.newestEvent}`);
      console.log(`  Path: ${eventLog.getPath()}`);
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Triggers Command
// ============================================================================

program
  .command('triggers')
  .description('List registered triggers')
  .action(async () => {
    try {
      const cube = await openCube();
      const triggerManager = cube.getTriggerManager();
      
      if (!triggerManager) {
        console.log('Event system not enabled.');
        return;
      }

      const triggers = triggerManager.list();

      if (triggers.length === 0) {
        console.log('\nNo triggers registered.\n');
        return;
      }

      console.log(`\n⚡ Registered Triggers (${triggers.length}):\n`);
      
      for (const trigger of triggers) {
        const status = trigger.enabled ? '✓' : '✗';
        const events = Array.isArray(trigger.event) ? trigger.event.join(', ') : trigger.event;
        const actions = trigger.actions.map(a => a.type).join(', ');
        
        console.log(`  [${status}] ${trigger.id}`);
        console.log(`      Name: ${trigger.name}`);
        console.log(`      Events: ${events}`);
        console.log(`      Actions: ${actions}`);
        if (trigger.lastFiredAt) {
          console.log(`      Last fired: ${trigger.lastFiredAt}`);
        }
        console.log();
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Watch Command
// ============================================================================

program
  .command('watch')
  .description('Watch for events in real-time')
  .option('--type <type>', 'Filter by event type')
  .action(async (options) => {
    try {
      const cube = await openCube();
      const eventBus = cube.getEventBus();
      
      if (!eventBus) {
        console.log('Event system not enabled.');
        return;
      }

      console.log('\n👁 Watching for events... (Ctrl+C to stop)\n');

      const eventType = options.type || '*';
      eventBus.on(eventType, (event) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        let details = '';
        if ('nodeId' in event) details = ` → ${(event as any).nodeId}`;
        else if ('node' in event) details = ` → ${(event as any).node?.title || (event as any).node?.id}`;
        
        console.log(`[${time}] ${event.type}${details}`);
      });

      // Keep process running
      await new Promise(() => {});
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Agents Command
// ============================================================================

program
  .command('agents')
  .description('List registered agents')
  .option('--role <role>', 'Filter by role')
  .option('--status <status>', 'Filter by status')
  .action(async (options) => {
    try {
      const cube = new Cube(process.cwd(), { useAgents: true });
      await cube.init();
      
      const orchestrator = cube.getOrchestrator();
      if (!orchestrator) {
        console.log('Agent system not enabled.');
        return;
      }

      const agents = orchestrator.listAgents({
        role: options.role,
        status: options.status,
      });

      if (agents.length === 0) {
        console.log('\nNo agents registered.\n');
        return;
      }

      console.log(`\n🤖 Registered Agents (${agents.length}):\n`);
      
      for (const agent of agents) {
        const statusIcon = {
          idle: '🟢',
          working: '🔵',
          blocked: '🟡',
          offline: '⚫',
        }[agent.state.status] || '⚪';

        console.log(`  ${statusIcon} ${agent.id}`);
        console.log(`      Name: ${agent.name}`);
        console.log(`      Role: ${agent.role}`);
        console.log(`      Status: ${agent.state.status}`);
        console.log(`      Claimed: ${agent.state.claimedTasks.length}/${agent.capabilities.maxConcurrent}`);
        console.log(`      Completed: ${agent.state.stats.tasksCompleted}`);
        if (agent.state.lastHeartbeat) {
          console.log(`      Last heartbeat: ${agent.state.lastHeartbeat}`);
        }
        console.log();
      }

      await cube.shutdown();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Agent Register Command
// ============================================================================

program
  .command('agent-register <id> <name>')
  .description('Register a new agent')
  .option('-r, --role <role>', 'Agent role', 'custom')
  .option('-d, --description <desc>', 'Agent description')
  .option('-c, --concurrent <n>', 'Max concurrent tasks', '1')
  .option('--can-create', 'Allow creating nodes')
  .option('--can-delete', 'Allow deleting nodes')
  .action(async (id: string, name: string, options) => {
    try {
      const cube = new Cube(process.cwd(), { useAgents: true });
      await cube.init();
      
      const orchestrator = cube.getOrchestrator();
      if (!orchestrator) {
        console.log('Agent system not enabled.');
        return;
      }

      const agent = orchestrator.registerAgent({
        id,
        name,
        role: options.role,
        description: options.description,
        capabilities: {
          nodeTypes: ['task'],
          edgeTypes: ['implements', 'blocks', 'depends-on'],
          tags: [],
          maxConcurrent: parseInt(options.concurrent, 10),
          canCreate: options.canCreate || false,
          canDelete: options.canDelete || false,
          priorityBoost: 0,
        },
      });

      console.log(`✓ Registered agent: ${agent.id}`);
      
      await cube.shutdown();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Work Queue Command
// ============================================================================

program
  .command('queue')
  .description('Show work queue status')
  .option('--agent <id>', 'Filter by agent')
  .action(async (options) => {
    try {
      const cube = new Cube(process.cwd(), { useAgents: true });
      await cube.init();
      
      const orchestrator = cube.getOrchestrator();
      if (!orchestrator) {
        console.log('Agent system not enabled.');
        return;
      }

      const state = orchestrator.queueState();
      
      console.log('\n📋 Work Queue\n');
      console.log(`  Queued: ${state.stats.totalQueued}`);
      console.log(`  Claimed: ${state.stats.totalClaimed}`);
      console.log(`  Completed: ${state.stats.totalCompleted}`);
      console.log(`  Failed: ${state.stats.totalFailed}`);
      console.log(`  Avg wait: ${(state.stats.avgWaitTimeMs / 1000).toFixed(1)}s`);

      const queued = orchestrator.getQueued();
      if (queued.length > 0) {
        console.log('\n  Queued items:');
        for (const item of queued.slice(0, 10)) {
          console.log(`    [${item.priority}] ${item.taskId}`);
        }
        if (queued.length > 10) {
          console.log(`    ... and ${queued.length - 10} more`);
        }
      }

      const claimed = orchestrator.getClaimed(options.agent);
      if (claimed.length > 0) {
        console.log('\n  Claimed items:');
        for (const item of claimed) {
          console.log(`    ${item.taskId} → ${item.claimedBy}`);
        }
      }

      console.log();
      await cube.shutdown();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Claim Command
// ============================================================================

program
  .command('claim <agent-id> <task-id>')
  .description('Claim a task for an agent')
  .action(async (agentId: string, taskId: string) => {
    try {
      const cube = new Cube(process.cwd(), { useAgents: true });
      await cube.init();
      
      const orchestrator = cube.getOrchestrator();
      if (!orchestrator) {
        console.log('Agent system not enabled.');
        return;
      }

      // Enqueue if not already
      orchestrator.enqueue(taskId);

      const result = orchestrator.claim({ agentId, taskId });

      if (result.success) {
        console.log(`✓ Claimed: ${taskId} → ${agentId}`);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }

      await cube.shutdown();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Release Command
// ============================================================================

program
  .command('release <agent-id> <task-id>')
  .description('Release a claimed task')
  .option('-c, --complete', 'Mark as completed')
  .option('-e, --error <message>', 'Mark as failed with error')
  .action(async (agentId: string, taskId: string, options) => {
    try {
      const cube = new Cube(process.cwd(), { useAgents: true });
      await cube.init();
      
      const orchestrator = cube.getOrchestrator();
      if (!orchestrator) {
        console.log('Agent system not enabled.');
        return;
      }

      const reason = options.complete ? 'completed' : options.error ? 'error' : 'reassign';
      const newStatus = options.complete ? 'complete' : options.error ? 'blocked' : 'pending';

      const result = orchestrator.release({
        agentId,
        taskId,
        reason,
        newStatus,
        error: options.error,
      });

      if (result) {
        console.log(`✓ Released: ${taskId} (${reason})`);
      } else {
        console.error('Failed to release task');
        process.exit(1);
      }

      await cube.shutdown();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Dispatch Command
// ============================================================================

program
  .command('dispatch')
  .description('Dispatch pending tasks to available agents')
  .option('--dry-run', 'Show what would be dispatched without doing it')
  .option('--max <n>', 'Maximum tasks to dispatch', '10')
  .action(async (options) => {
    try {
      const cube = new Cube(process.cwd(), { useAgents: true });
      await cube.init();
      
      const orchestrator = cube.getOrchestrator();
      if (!orchestrator) {
        console.log('Agent system not enabled.');
        return;
      }

      const result = orchestrator.dispatch({
        dryRun: options.dryRun,
        maxTasks: parseInt(options.max, 10),
      });

      if (options.dryRun) {
        console.log('\n🔍 Dry run - would dispatch:\n');
      } else {
        console.log('\n🚀 Dispatch results:\n');
      }

      if (result.dispatched.length > 0) {
        console.log('  Dispatched:');
        for (const { taskId, agentId } of result.dispatched) {
          console.log(`    ${taskId} → ${agentId}`);
        }
      }

      if (result.skipped.length > 0) {
        console.log('\n  Skipped:');
        for (const { taskId, reason } of result.skipped) {
          console.log(`    ${taskId}: ${reason}`);
        }
      }

      if (result.errors.length > 0) {
        console.log('\n  Errors:');
        for (const error of result.errors) {
          console.log(`    ${error}`);
        }
      }

      console.log();
      await cube.shutdown();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Extract Command
// ============================================================================

program
  .command('extract <source-type> <input>')
  .description('Extract nodes from text or file (conversation, code, markdown)')
  .option('--create', 'Actually create the nodes')
  .option('--min-confidence <n>', 'Minimum confidence threshold', '0.5')
  .action(async (sourceType: string, input: string, options) => {
    try {
      const { SynthesisPipeline } = await import('../synthesis/index.js');
      const { readFileSync, existsSync } = await import('fs');
      
      const cube = await openCube();
      const pipeline = new SynthesisPipeline({
        minConfidence: parseFloat(options.minConfidence),
        autoCreate: options.create,
        requireApproval: !options.create,
      });
      pipeline.setCube(cube);
      
      // Determine if input is a file or text
      let content: string;
      let metadata: any = {};
      
      if (existsSync(input)) {
        content = readFileSync(input, 'utf-8');
        metadata.path = input;
        
        // Auto-detect source type from file extension if not specified
        if (sourceType === 'auto') {
          if (input.endsWith('.ts') || input.endsWith('.js')) {
            sourceType = 'code';
            metadata.language = input.endsWith('.ts') ? 'typescript' : 'javascript';
          } else if (input.endsWith('.md')) {
            sourceType = 'markdown';
          } else {
            sourceType = 'conversation';
          }
        }
      } else {
        content = input;
      }
      
      const result = await pipeline.extract({
        type: sourceType as any,
        content,
        metadata,
      });
      
      console.log(`\n🔍 Extraction Results\n`);
      console.log(`  Source: ${sourceType}`);
      console.log(`  Processing time: ${result.metadata.processingTimeMs}ms`);
      console.log(`  Nodes found: ${result.nodes.length}`);
      console.log(`  Relations found: ${result.relations.length}`);
      
      if (result.nodes.length > 0) {
        console.log('\n  📝 Extracted Nodes:\n');
        for (const node of result.nodes) {
          const conf = (node.confidence * 100).toFixed(0);
          console.log(`    [${node.suggestedType}] ${node.suggestedTitle}`);
          console.log(`      Confidence: ${conf}%`);
          console.log(`      Tags: ${node.suggestedTags.join(', ') || '(none)'}`);
          console.log();
        }
      }
      
      if (result.relations.length > 0) {
        console.log('  🔗 Extracted Relations:\n');
        for (const rel of result.relations) {
          console.log(`    ${rel.from} --${rel.type}--> ${rel.to}`);
        }
        console.log();
      }
      
      // Create nodes if requested
      if (options.create && result.nodes.length > 0) {
        const createResult = await pipeline.createNodes(result, undefined, {
          approved: result.nodes.map(n => n.suggestedTitle),
        });
        
        console.log('  ✓ Creation Results:\n');
        if (createResult.created.length > 0) {
          console.log(`    Created: ${createResult.created.length}`);
          for (const id of createResult.created) {
            console.log(`      - ${id}`);
          }
        }
        if (createResult.skipped.length > 0) {
          console.log(`    Skipped: ${createResult.skipped.length}`);
        }
        if (createResult.errors.length > 0) {
          console.log(`    Errors: ${createResult.errors.length}`);
          for (const err of createResult.errors) {
            console.log(`      - ${err}`);
          }
        }
        console.log();
      }
      
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============================================================================
// Analyze Code Command
// ============================================================================

program
  .command('analyze-code <file>')
  .description('Analyze a source code file')
  .action(async (file: string) => {
    try {
      const { CodeAnalyzer } = await import('../synthesis/index.js');
      const { readFileSync, existsSync } = await import('fs');
      
      if (!existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }
      
      const content = readFileSync(file, 'utf-8');
      const analyzer = new CodeAnalyzer();
      
      const result = analyzer.analyze({
        type: 'code',
        content,
        metadata: { path: file },
      });
      
      const mod = result.module;
      
      console.log(`\n📊 Code Analysis: ${file}\n`);
      console.log(`  Language: ${mod.language}`);
      console.log(`  Imports: ${mod.imports.length}`);
      console.log(`  Exports: ${mod.exports.length}`);
      console.log(`  Functions: ${mod.functions.length}`);
      console.log(`  Classes: ${mod.classes.length}`);
      
      if (mod.functions.length > 0) {
        console.log('\n  📦 Functions:\n');
        for (const func of mod.functions) {
          const exp = func.exports ? ' (exported)' : '';
          console.log(`    ${func.signature}${exp}`);
          console.log(`      Lines: ${func.startLine}-${func.endLine}, Complexity: ${func.complexity}`);
          if (func.dependencies.length > 0) {
            console.log(`      Calls: ${func.dependencies.join(', ')}`);
          }
        }
      }
      
      if (mod.classes.length > 0) {
        console.log('\n  🏗 Classes:\n');
        for (const cls of mod.classes) {
          const ext = cls.extends ? ` extends ${cls.extends}` : '';
          console.log(`    class ${cls.name}${ext}`);
          console.log(`      Lines: ${cls.startLine}-${cls.endLine}`);
          console.log(`      Methods: ${cls.methods.map(m => m.name).join(', ')}`);
        }
      }
      
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
