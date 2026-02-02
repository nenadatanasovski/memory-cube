/**
 * File-based storage for Memory Cube nodes
 * 
 * Nodes are stored as markdown files with YAML frontmatter.
 * Directory structure: .cube/nodes/{type}/{id}.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import type { Node, NodeType, CubeConfig } from '../core/types.js';
import { nodeToMarkdown, markdownToNode, createNode } from '../core/node.js';

const DEFAULT_CONFIG: CubeConfig = {
  version: '1.0',
  name: 'memory-cube',
  rootPath: '.cube',
  index: {
    rebuildOnStart: false,
    ftsEnabled: true,
  },
  events: {
    enabled: true,
    maxLogSize: 10000,
  },
  agents: {
    defaultAgent: 'default',
    autoAssign: false,
  },
};

export class FileStorage {
  private rootPath: string;
  private config: CubeConfig;

  constructor(basePath: string, config?: Partial<CubeConfig>) {
    this.rootPath = join(basePath, '.cube');
    this.config = { ...DEFAULT_CONFIG, ...config, rootPath: this.rootPath };
  }

  /**
   * Initialize the .cube directory structure
   */
  init(): void {
    const dirs = [
      this.rootPath,
      join(this.rootPath, 'nodes'),
      join(this.rootPath, 'views'),
      join(this.rootPath, 'agents'),
      join(this.rootPath, 'schemas'),
    ];

    // Create node type directories
    const nodeTypes: NodeType[] = [
      'task', 'doc', 'code', 'decision', 'ideation',
      'brainfart', 'research', 'conversation', 'concept',
      'event', 'agent', 'project'
    ];
    for (const type of nodeTypes) {
      dirs.push(join(this.rootPath, 'nodes', type));
    }

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Write config file
    const configPath = join(this.rootPath, 'cube.json');
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    }
  }

  /**
   * Check if cube is initialized
   */
  isInitialized(): boolean {
    return existsSync(this.rootPath) && existsSync(join(this.rootPath, 'cube.json'));
  }

  /**
   * Get path for a node file
   */
  private getNodePath(id: string): string {
    // ID format: {type}/{slug}-{hash}
    const [type, ...rest] = id.split('/');
    const filename = rest.join('/') + '.md';
    return join(this.rootPath, 'nodes', type, filename);
  }

  /**
   * Get relative path from cube root
   */
  private getRelativePath(absolutePath: string): string {
    return relative(this.rootPath, absolutePath);
  }

  /**
   * Save a node to disk
   */
  saveNode(node: Node): Node {
    const filePath = this.getNodePath(node.id);
    const dir = dirname(filePath);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const nodeWithPath: Node = {
      ...node,
      filePath: this.getRelativePath(filePath),
    };

    const markdown = nodeToMarkdown(nodeWithPath);
    writeFileSync(filePath, markdown, 'utf-8');

    return nodeWithPath;
  }

  /**
   * Load a node from disk
   */
  loadNode(id: string): Node | null {
    const filePath = this.getNodePath(id);
    
    if (!existsSync(filePath)) {
      return null;
    }

    const markdown = readFileSync(filePath, 'utf-8');
    return markdownToNode(markdown, this.getRelativePath(filePath));
  }

  /**
   * Delete a node from disk
   */
  deleteNode(id: string): boolean {
    const filePath = this.getNodePath(id);
    
    if (!existsSync(filePath)) {
      return false;
    }

    unlinkSync(filePath);
    return true;
  }

  /**
   * Check if a node exists
   */
  nodeExists(id: string): boolean {
    return existsSync(this.getNodePath(id));
  }

  /**
   * List all nodes of a specific type
   */
  listNodesByType(type: NodeType): Node[] {
    const typeDir = join(this.rootPath, 'nodes', type);
    
    if (!existsSync(typeDir)) {
      return [];
    }

    const files = readdirSync(typeDir).filter(f => f.endsWith('.md'));
    const nodes: Node[] = [];

    for (const file of files) {
      const filePath = join(typeDir, file);
      try {
        const markdown = readFileSync(filePath, 'utf-8');
        nodes.push(markdownToNode(markdown, this.getRelativePath(filePath)));
      } catch (error) {
        console.error(`Error loading node ${filePath}:`, error);
      }
    }

    return nodes;
  }

  /**
   * List all nodes
   */
  listAllNodes(): Node[] {
    const nodeTypes: NodeType[] = [
      'task', 'doc', 'code', 'decision', 'ideation',
      'brainfart', 'research', 'conversation', 'concept',
      'event', 'agent', 'project'
    ];

    const allNodes: Node[] = [];
    for (const type of nodeTypes) {
      allNodes.push(...this.listNodesByType(type));
    }

    return allNodes;
  }

  /**
   * Get cube statistics
   */
  getStats(): {
    totalNodes: number;
    byType: Record<NodeType, number>;
    byStatus: Record<string, number>;
  } {
    const nodes = this.listAllNodes();
    
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const node of nodes) {
      byType[node.type] = (byType[node.type] || 0) + 1;
      byStatus[node.status] = (byStatus[node.status] || 0) + 1;
    }

    return {
      totalNodes: nodes.length,
      byType: byType as Record<NodeType, number>,
      byStatus,
    };
  }

  /**
   * Get the cube configuration
   */
  getConfig(): CubeConfig {
    const configPath = join(this.rootPath, 'cube.json');
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
    return this.config;
  }

  /**
   * Update cube configuration
   */
  updateConfig(updates: Partial<CubeConfig>): CubeConfig {
    this.config = { ...this.config, ...updates };
    const configPath = join(this.rootPath, 'cube.json');
    writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    return this.config;
  }

  /**
   * Get root path
   */
  getRootPath(): string {
    return this.rootPath;
  }
}
