/**
 * Memory Cube - Main API
 * 
 * The central interface for interacting with the knowledge graph.
 */

import type {
  Node,
  NodeType,
  NodeStatus,
  Edge,
  EdgeType,
  CreateNodeInput,
  UpdateNodeInput,
  QueryOptions,
  QueryFilter,
  TraversalOptions,
  TraversalResult,
  OperationResult,
  CubeConfig,
} from './types.js';
import { createNode, updateNode, addEdge, removeEdge } from './node.js';
import { FileStorage } from '../storage/file-storage.js';
import { SqliteIndex } from '../storage/sqlite-index.js';

export class Cube {
  private storage: FileStorage;
  private index: SqliteIndex | null = null;
  private initialized: boolean = false;
  private useIndex: boolean = true;

  constructor(basePath: string = process.cwd(), options?: { useIndex?: boolean }) {
    this.storage = new FileStorage(basePath);
    this.useIndex = options?.useIndex ?? true;
  }

  /**
   * Initialize a new cube or load existing
   */
  async init(): Promise<void> {
    if (!this.storage.isInitialized()) {
      this.storage.init();
    }
    
    // Initialize SQLite index
    if (this.useIndex) {
      this.index = new SqliteIndex(this.storage.getRootPath());
      
      // Check if index needs rebuilding (empty but files exist)
      const indexCount = this.index.count();
      const fileNodes = this.storage.listAllNodes();
      
      if (indexCount === 0 && fileNodes.length > 0) {
        // Rebuild index from files
        for (const node of fileNodes) {
          this.index.indexNode(node);
        }
      }
    }
    
    this.initialized = true;
  }

  /**
   * Rebuild the index from files
   */
  rebuildIndex(): { indexed: number; errors: string[] } {
    this.ensureInitialized();
    
    if (!this.index) {
      return { indexed: 0, errors: ['Index not enabled'] };
    }

    const errors: string[] = [];
    let indexed = 0;

    // Clear existing index
    this.index.clear();

    // Re-index all files
    const nodes = this.storage.listAllNodes();
    for (const node of nodes) {
      try {
        this.index.indexNode(node);
        indexed++;
      } catch (error) {
        errors.push(`Failed to index ${node.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { indexed, errors };
  }

  /**
   * Ensure cube is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized && !this.storage.isInitialized()) {
      throw new Error('Cube not initialized. Run cube.init() first.');
    }
    this.initialized = true;
  }

  // ============================================================================
  // Node Operations
  // ============================================================================

  /**
   * Create a new node
   */
  create(input: CreateNodeInput): OperationResult<Node> {
    this.ensureInitialized();

    try {
      const node = createNode({
        type: input.type,
        title: input.title,
        content: input.content,
        status: input.status,
        priority: input.priority,
        tags: input.tags,
        assignedTo: input.assignedTo,
        dueAt: input.dueAt,
      });

      // Add edges if provided
      let nodeWithEdges = node;
      if (input.edges) {
        for (const edge of input.edges) {
          nodeWithEdges = addEdge(nodeWithEdges, edge);
        }
      }

      const saved = this.storage.saveNode(nodeWithEdges);
      
      // Update index
      if (this.index) {
        this.index.indexNode(saved);
      }
      
      return { success: true, data: saved };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get a node by ID
   */
  get(id: string): OperationResult<Node> {
    this.ensureInitialized();

    const node = this.storage.loadNode(id);
    if (!node) {
      return { success: false, error: `Node not found: ${id}` };
    }
    return { success: true, data: node };
  }

  /**
   * Update an existing node
   */
  update(id: string, updates: UpdateNodeInput): OperationResult<Node> {
    this.ensureInitialized();

    const existing = this.storage.loadNode(id);
    if (!existing) {
      return { success: false, error: `Node not found: ${id}` };
    }

    const updated = updateNode(existing, updates);
    const saved = this.storage.saveNode(updated);
    
    // Update index
    if (this.index) {
      this.index.indexNode(saved);
    }
    
    return { success: true, data: saved };
  }

  /**
   * Delete a node
   */
  delete(id: string): OperationResult<void> {
    this.ensureInitialized();

    const deleted = this.storage.deleteNode(id);
    if (!deleted) {
      return { success: false, error: `Node not found: ${id}` };
    }
    
    // Remove from index
    if (this.index) {
      this.index.removeNode(id);
    }
    
    return { success: true };
  }

  /**
   * Check if a node exists
   */
  exists(id: string): boolean {
    this.ensureInitialized();
    return this.storage.nodeExists(id);
  }

  // ============================================================================
  // Edge Operations
  // ============================================================================

  /**
   * Link two nodes
   */
  link(fromId: string, type: EdgeType, toId: string, metadata?: Record<string, unknown>): OperationResult<Node> {
    this.ensureInitialized();

    const fromNode = this.storage.loadNode(fromId);
    if (!fromNode) {
      return { success: false, error: `Source node not found: ${fromId}` };
    }

    // Verify target exists
    if (!this.storage.nodeExists(toId)) {
      return { success: false, error: `Target node not found: ${toId}` };
    }

    // Check if edge already exists
    const existingEdge = fromNode.edges.find(e => e.type === type && e.to === toId);
    if (existingEdge) {
      return { success: false, error: `Edge already exists: ${fromId} --${type}--> ${toId}` };
    }

    const updated = addEdge(fromNode, { type, to: toId, metadata });
    const saved = this.storage.saveNode(updated);
    
    // Update index
    if (this.index) {
      this.index.indexNode(saved);
    }
    
    return { success: true, data: saved };
  }

  /**
   * Unlink two nodes
   */
  unlink(fromId: string, type: EdgeType, toId: string): OperationResult<Node> {
    this.ensureInitialized();

    const fromNode = this.storage.loadNode(fromId);
    if (!fromNode) {
      return { success: false, error: `Source node not found: ${fromId}` };
    }

    const edgeId = `${fromId}--${type}-->${toId}`;
    const edge = fromNode.edges.find(e => e.id === edgeId);
    if (!edge) {
      return { success: false, error: `Edge not found: ${edgeId}` };
    }

    const updated = removeEdge(fromNode, edgeId);
    const saved = this.storage.saveNode(updated);
    
    // Update index
    if (this.index) {
      this.index.indexNode(saved);
    }
    
    return { success: true, data: saved };
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Query nodes with filters
   */
  query(options: QueryOptions = {}): OperationResult<Node[]> {
    this.ensureInitialized();

    try {
      let nodes: Node[];

      // Use index if available
      if (this.index) {
        const ids = this.index.query(
          options.filter,
          options.sort,
          options.limit,
          options.offset
        );
        
        // Load full nodes from files
        nodes = ids
          .map(id => this.storage.loadNode(id))
          .filter((n): n is Node => n !== null);
      } else {
        // Fall back to file-based query
        nodes = this.storage.listAllNodes();

        // Apply filters
        if (options.filter) {
          nodes = this.applyFilter(nodes, options.filter);
        }

        // Apply sorting
        if (options.sort && options.sort.length > 0) {
          nodes = this.applySort(nodes, options.sort);
        }

        // Apply pagination
        if (options.offset) {
          nodes = nodes.slice(options.offset);
        }
        if (options.limit) {
          nodes = nodes.slice(0, options.limit);
        }
      }

      // Strip content if not requested
      if (!options.includeContent) {
        nodes = nodes.map(n => ({ ...n, content: '' }));
      }

      return { success: true, data: nodes };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply filters to nodes
   */
  private applyFilter(nodes: Node[], filter: QueryFilter): Node[] {
    return nodes.filter(node => {
      // Type filter
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(node.type)) return false;
      }

      // Status filter
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(node.status)) return false;
      }

      // Validity filter
      if (filter.validity) {
        const validities = Array.isArray(filter.validity) ? filter.validity : [filter.validity];
        if (!validities.includes(node.validity)) return false;
      }

      // Priority filter
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        if (!priorities.includes(node.priority)) return false;
      }

      // Tags filter (all)
      if (filter.tags && filter.tags.length > 0) {
        if (!filter.tags.every(tag => node.tags.includes(tag))) return false;
      }

      // Tags filter (any)
      if (filter.tagsAny && filter.tagsAny.length > 0) {
        if (!filter.tagsAny.some(tag => node.tags.includes(tag))) return false;
      }

      // Assigned to filter
      if (filter.assignedTo !== undefined) {
        if (node.assignedTo !== filter.assignedTo) return false;
      }

      // Created by filter
      if (filter.createdBy !== undefined) {
        if (node.createdBy !== filter.createdBy) return false;
      }

      // Has edge filter
      if (filter.hasEdge) {
        const hasMatchingEdge = node.edges.some(edge => {
          if (edge.type !== filter.hasEdge!.type) return false;
          if (filter.hasEdge!.direction === 'out') return edge.from === node.id;
          if (filter.hasEdge!.direction === 'in') return edge.to === node.id;
          return true;
        });
        if (!hasMatchingEdge) return false;
      }

      // Full-text search
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const searchable = `${node.title} ${node.content} ${node.tags.join(' ')}`.toLowerCase();
        if (!searchable.includes(searchLower)) return false;
      }

      // Date filters
      if (filter.createdAfter && node.createdAt < filter.createdAfter) return false;
      if (filter.createdBefore && node.createdAt > filter.createdBefore) return false;
      if (filter.modifiedAfter && node.modifiedAt < filter.modifiedAfter) return false;
      if (filter.modifiedBefore && node.modifiedAt > filter.modifiedBefore) return false;
      if (filter.dueAfter && (!node.dueAt || node.dueAt < filter.dueAfter)) return false;
      if (filter.dueBefore && (!node.dueAt || node.dueAt > filter.dueBefore)) return false;

      return true;
    });
  }

  /**
   * Apply sorting to nodes
   */
  private applySort(nodes: Node[], sort: { field: string; order: 'asc' | 'desc' }[]): Node[] {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };

    return [...nodes].sort((a, b) => {
      for (const { field, order } of sort) {
        let comparison = 0;

        if (field === 'priority') {
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
        } else if (field === 'title') {
          comparison = a.title.localeCompare(b.title);
        } else {
          const aVal = a[field as keyof Node] as string | null;
          const bVal = b[field as keyof Node] as string | null;
          if (aVal === null && bVal === null) comparison = 0;
          else if (aVal === null) comparison = 1;
          else if (bVal === null) comparison = -1;
          else comparison = aVal.localeCompare(bVal);
        }

        if (comparison !== 0) {
          return order === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  // ============================================================================
  // Traversal Operations
  // ============================================================================

  /**
   * Traverse the graph from a starting node
   */
  traverse(options: TraversalOptions): OperationResult<TraversalResult[]> {
    this.ensureInitialized();

    const startNode = this.storage.loadNode(options.startNode);
    if (!startNode) {
      return { success: false, error: `Start node not found: ${options.startNode}` };
    }

    const results: TraversalResult[] = [];
    const visited = new Set<string>();
    const maxDepth = options.maxDepth ?? 10;

    const visit = (node: Node, depth: number, path: string[], incomingEdge: Edge | null) => {
      if (depth > maxDepth || visited.has(node.id)) return;
      visited.add(node.id);

      if (depth > 0 || options.includeStart) {
        results.push({ node, depth, path, edge: incomingEdge });
      }

      // Find edges to follow
      const edgesToFollow: { edge: Edge; targetId: string }[] = [];

      // Outgoing edges
      if (options.direction !== 'in') {
        for (const edge of node.edges) {
          if (!options.edgeTypes || options.edgeTypes.includes(edge.type)) {
            edgesToFollow.push({ edge, targetId: edge.to });
          }
        }
      }

      // Incoming edges (need to scan all nodes)
      if (options.direction === 'in' || options.direction === 'both') {
        const allNodes = this.storage.listAllNodes();
        for (const otherNode of allNodes) {
          for (const edge of otherNode.edges) {
            if (edge.to === node.id) {
              if (!options.edgeTypes || options.edgeTypes.includes(edge.type)) {
                edgesToFollow.push({ edge, targetId: otherNode.id });
              }
            }
          }
        }
      }

      // Follow edges
      for (const { edge, targetId } of edgesToFollow) {
        const targetNode = this.storage.loadNode(targetId);
        if (targetNode && !visited.has(targetId)) {
          visit(targetNode, depth + 1, [...path, node.id], edge);
        }
      }
    };

    visit(startNode, 0, [], null);
    return { success: true, data: results };
  }

  // ============================================================================
  // Utility Operations
  // ============================================================================

  /**
   * Get cube statistics
   */
  stats(): {
    totalNodes: number;
    byType: Record<NodeType, number>;
    byStatus: Record<string, number>;
  } {
    this.ensureInitialized();
    return this.storage.getStats();
  }

  /**
   * Get cube configuration
   */
  config(): CubeConfig {
    return this.storage.getConfig();
  }

  /**
   * Get the root path of the cube
   */
  rootPath(): string {
    return this.storage.getRootPath();
  }

  /**
   * List all nodes of a type
   */
  listByType(type: NodeType): Node[] {
    this.ensureInitialized();
    return this.storage.listNodesByType(type);
  }
}

/**
 * Open an existing cube or create a new one
 */
export async function openCube(basePath: string = process.cwd()): Promise<Cube> {
  const cube = new Cube(basePath);
  await cube.init();
  return cube;
}
