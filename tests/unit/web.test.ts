/**
 * Web Server Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebServer } from '../../src/web/server.js';
import { Cube } from '../../src/core/cube.js';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('WebServer', () => {
  let tempDir: string;
  let cube: Cube;
  let server: WebServer;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cube-test-'));
    cube = new Cube(tempDir, { useEvents: false, useAgents: false });
    await cube.init();
    
    // Create some test data
    cube.create({ type: 'task', title: 'Test Task 1', tags: ['test'] });
    cube.create({ type: 'task', title: 'Test Task 2', tags: ['test'] });
    cube.create({ type: 'doc', title: 'Test Doc', tags: ['docs'] });
    
    // Use a random port to avoid conflicts
    const port = 18000 + Math.floor(Math.random() * 1000);
    server = new WebServer(cube, { port, host: 'localhost' });
  });

  afterEach(async () => {
    await server.stop();
    await cube.shutdown();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should start and stop correctly', async () => {
    await server.start();
    const url = server.getUrl();
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    await server.stop();
  });

  it('should serve graph API', async () => {
    await server.start();
    const url = server.getUrl();
    
    const res = await fetch(`${url}/api/graph`);
    expect(res.ok).toBe(true);
    
    const data = await res.json();
    expect(data.nodes).toBeDefined();
    expect(data.edges).toBeDefined();
    expect(data.nodes.length).toBeGreaterThan(0);
  });

  it('should serve stats API', async () => {
    await server.start();
    const url = server.getUrl();
    
    const res = await fetch(`${url}/api/stats`);
    expect(res.ok).toBe(true);
    
    const data = await res.json();
    expect(data.totalNodes).toBeGreaterThan(0);
  });

  it('should serve node API', async () => {
    await server.start();
    const url = server.getUrl();
    
    // Get nodes first
    const graphRes = await fetch(`${url}/api/graph`);
    const graphData = await graphRes.json();
    const nodeId = graphData.nodes[0].data.id;
    
    // Get single node
    const res = await fetch(`${url}/api/node?id=${encodeURIComponent(nodeId)}`);
    expect(res.ok).toBe(true);
    
    const data = await res.json();
    expect(data.node).toBeDefined();
    expect(data.node.id).toBe(nodeId);
  });

  it('should filter by type', async () => {
    await server.start();
    const url = server.getUrl();
    
    const res = await fetch(`${url}/api/graph?type=task`);
    const data = await res.json();
    
    expect(data.nodes.length).toBe(2);
    expect(data.nodes.every((n: any) => n.data.type === 'task')).toBe(true);
  });

  it('should serve types API', async () => {
    await server.start();
    const url = server.getUrl();
    
    const res = await fetch(`${url}/api/types`);
    expect(res.ok).toBe(true);
    
    const data = await res.json();
    expect(data.types).toContain('task');
    expect(data.statuses).toContain('pending');
    expect(data.priorities).toContain('high');
  });
});
