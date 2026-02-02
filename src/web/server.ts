/**
 * Web Server
 * 
 * Simple HTTP server for the Memory Cube visualization.
 * Serves static files and provides API endpoints for graph data.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import type { Cube } from '../core/cube.js';
import type { QueryFilter } from '../core/types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface ServerOptions {
  port?: number;
  host?: string;
  publicDir?: string;
}

export class WebServer {
  private cube: Cube;
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;
  private host: string;
  private publicDir: string;

  constructor(cube: Cube, options?: ServerOptions) {
    this.cube = cube;
    this.port = options?.port ?? 8080;
    this.host = options?.host ?? 'localhost';
    this.publicDir = options?.publicDir ?? join(__dirname, 'public');
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      
      this.server.on('error', reject);
      
      this.server.listen(this.port, this.host, () => {
        console.log(`🌐 Memory Cube visualization running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // API routes
      if (path.startsWith('/api/')) {
        await this.handleApi(path, url, req, res);
        return;
      }

      // Static files
      await this.handleStatic(path, res);
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle API requests
   */
  private async handleApi(path: string, url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    switch (path) {
      case '/api/graph':
        await this.handleGraphData(url, res);
        break;

      case '/api/nodes':
        await this.handleNodes(url, res);
        break;

      case '/api/node':
        if (req.method === 'POST') {
          await this.handleCreateNode(req, res);
        } else if (req.method === 'PUT') {
          await this.handleUpdateNode(req, res);
        } else if (req.method === 'DELETE') {
          await this.handleDeleteNode(url, res);
        } else {
          await this.handleNode(url, res);
        }
        break;

      case '/api/stats':
        await this.handleStats(res);
        break;

      case '/api/types':
        await this.handleTypes(res);
        break;

      case '/api/edge':
        if (req.method === 'POST') {
          await this.handleCreateEdge(req, res);
        } else if (req.method === 'DELETE') {
          await this.handleDeleteEdge(req, res);
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/github/import':
        if (req.method === 'POST') {
          await this.handleGitHubImport(req, res);
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/github/export':
        if (req.method === 'POST') {
          await this.handleGitHubExport(req, res);
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/similar':
        await this.handleSimilarSearch(url, res);
        break;

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Handle similarity search
   */
  private async handleSimilarSearch(url: URL, res: ServerResponse): Promise<void> {
    const query = url.searchParams.get('q');
    const nodeId = url.searchParams.get('id');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    try {
      let results;
      
      if (nodeId) {
        // Find similar to a specific node
        results = await this.cube.findSimilarTo(nodeId, limit);
      } else if (query) {
        // Search by query text
        results = await this.cube.searchSimilar(query, limit);
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Either q or id parameter required' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        results: results.map(r => ({
          id: r.node.id,
          title: r.node.title,
          type: r.node.type,
          score: Math.round(r.score * 1000) / 1000, // Round to 3 decimals
          tags: r.node.tags,
        })),
      }));
    } catch (error) {
      console.error('Similarity search error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Search failed' }));
    }
  }

  /**
   * Parse JSON body from request
   */
  private parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Create a new node
   */
  private async handleCreateNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const data = await this.parseBody(req);
      
      if (!data.type || !data.title) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required fields: type, title' }));
        return;
      }

      const result = this.cube.create({
        type: data.type,
        title: data.title,
        content: data.content || '',
        status: data.status || 'pending',
        priority: data.priority || 'normal',
        tags: data.tags || [],
      });

      if (!result.success) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.writeHead(201);
      res.end(JSON.stringify({ node: result.data }));
    } catch (error: any) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Update an existing node
   */
  private async handleUpdateNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const data = await this.parseBody(req);
      
      if (!data.id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required field: id' }));
        return;
      }

      const result = this.cube.update(data.id, data);

      if (!result.success) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ node: result.data }));
    } catch (error: any) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Delete a node
   */
  private async handleDeleteNode(url: URL, res: ServerResponse): Promise<void> {
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing id parameter' }));
      return;
    }

    const result = this.cube.delete(id);

    if (!result.success) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
  }

  /**
   * Create an edge between nodes
   */
  private async handleCreateEdge(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const data = await this.parseBody(req);
      
      if (!data.from || !data.type || !data.to) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required fields: from, type, to' }));
        return;
      }

      const result = this.cube.link(data.from, data.type, data.to, data.metadata);

      if (!result.success) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.writeHead(201);
      res.end(JSON.stringify({ node: result.data }));
    } catch (error: any) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Delete an edge between nodes
   */
  private async handleDeleteEdge(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const data = await this.parseBody(req);
      
      if (!data.from || !data.type || !data.to) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required fields: from, type, to' }));
        return;
      }

      const result = this.cube.unlink(data.from, data.type, data.to);

      if (!result.success) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ node: result.data }));
    } catch (error: any) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Import GitHub issues
   */
  private async handleGitHubImport(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const data = await this.parseBody(req);
      
      if (!data.repo) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required field: repo' }));
        return;
      }

      const { GitHubIntegration } = await import('../integrations/github.js');
      const github = new GitHubIntegration(this.cube, { repo: data.repo });
      
      const authCheck = await github.checkAuth();
      if (!authCheck.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: authCheck.error }));
        return;
      }

      const result = await github.importIssues({
        state: data.state || 'all',
        labels: data.labels,
        limit: data.limit || 100,
      });

      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Export node to GitHub issue
   */
  private async handleGitHubExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const data = await this.parseBody(req);
      
      if (!data.repo || !data.nodeId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required fields: repo, nodeId' }));
        return;
      }

      const { GitHubIntegration } = await import('../integrations/github.js');
      const github = new GitHubIntegration(this.cube, { repo: data.repo });
      
      const authCheck = await github.checkAuth();
      if (!authCheck.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: authCheck.error }));
        return;
      }

      const result = await github.exportToIssue(data.nodeId);

      if (result.ok) {
        res.writeHead(201);
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result.error }));
      }
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Get graph data for Cytoscape
   */
  private async handleGraphData(url: URL, res: ServerResponse): Promise<void> {
    const filter = this.parseFilter(url);
    const result = this.cube.query({ filter, includeContent: false });

    if (!result.success || !result.data) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    const nodes = result.data;
    const cyNodes: any[] = [];
    const cyEdges: any[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    // Convert to Cytoscape format
    for (const node of nodes) {
      cyNodes.push({
        data: {
          id: node.id,
          label: node.title,
          type: node.type,
          status: node.status,
          validity: node.validity,
          priority: node.priority,
          tags: node.tags,
          created_at: node.createdAt,
        },
        classes: [node.type, node.status, node.validity, node.priority],
      });

      // Add edges (only to nodes in the result set)
      for (const edge of node.edges) {
        if (nodeIds.has(edge.to)) {
          cyEdges.push({
            data: {
              id: edge.id,
              source: node.id,
              target: edge.to,
              type: edge.type,
            },
            classes: [edge.type],
          });
        }
      }
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      nodes: cyNodes,
      edges: cyEdges,
    }));
  }

  /**
   * Get node list
   */
  private async handleNodes(url: URL, res: ServerResponse): Promise<void> {
    const filter = this.parseFilter(url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const result = this.cube.query({ filter, limit, offset, includeContent: false });

    if (!result.success) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ nodes: result.data }));
  }

  /**
   * Get single node with full content
   */
  private async handleNode(url: URL, res: ServerResponse): Promise<void> {
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing id parameter' }));
      return;
    }

    const result = this.cube.get(id);

    if (!result.success) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ node: result.data }));
  }

  /**
   * Get cube statistics
   */
  private async handleStats(res: ServerResponse): Promise<void> {
    const stats = this.cube.stats();
    res.writeHead(200);
    res.end(JSON.stringify(stats));
  }

  /**
   * Get available types and statuses
   */
  private async handleTypes(res: ServerResponse): Promise<void> {
    const types = ['task', 'doc', 'code', 'decision', 'ideation', 'brainfart', 'research', 'conversation', 'concept', 'event', 'agent', 'project'];
    const statuses = ['pending', 'claimed', 'active', 'blocked', 'complete', 'archived'];
    const validities = ['current', 'stale', 'superseded', 'archived'];
    const priorities = ['critical', 'high', 'normal', 'low'];
    const edgeTypes = ['implements', 'documents', 'sourced-from', 'blocks', 'blocked-by', 'depends-on', 'spawns', 'becomes', 'relates-to', 'part-of', 'supersedes', 'invalidates', 'derived-from'];

    res.writeHead(200);
    res.end(JSON.stringify({ types, statuses, validities, priorities, edgeTypes }));
  }

  /**
   * Parse filter parameters from URL
   */
  private parseFilter(url: URL): QueryFilter {
    const filter: QueryFilter = {};

    const type = url.searchParams.get('type');
    if (type) filter.type = type.split(',') as any;

    const status = url.searchParams.get('status');
    if (status) filter.status = status.split(',') as any;

    const validity = url.searchParams.get('validity');
    if (validity) filter.validity = validity.split(',') as any;

    const priority = url.searchParams.get('priority');
    if (priority) filter.priority = priority.split(',') as any;

    const tags = url.searchParams.get('tags');
    if (tags) filter.tagsAny = tags.split(',');

    const search = url.searchParams.get('search');
    if (search) filter.search = search;

    return filter;
  }

  /**
   * Handle static file requests
   */
  private async handleStatic(path: string, res: ServerResponse): Promise<void> {
    // Default to index.html
    if (path === '/') {
      path = '/index.html';
    }

    const filePath = join(this.publicDir, path);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(this.publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end('Error reading file');
    }
  }

  /**
   * Get the server URL
   */
  getUrl(): string {
    return `http://${this.host}:${this.port}`;
  }
}
