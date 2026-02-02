/**
 * SQLite Index for Memory Cube
 * 
 * Provides fast queries over the file-based node storage.
 * This is a cache/index - files are the source of truth.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import type { Node, NodeType, QueryFilter, QuerySort } from '../core/types.js';

const SCHEMA = `
-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    validity TEXT NOT NULL,
    priority TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_by TEXT,
    assigned_to TEXT,
    locked_by TEXT,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    due_at TEXT,
    title TEXT NOT NULL,
    content_preview TEXT,
    semantic_hash TEXT,
    file_path TEXT NOT NULL,
    version INTEGER NOT NULL
);

-- Edges table  
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (from_node) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Tags table (many-to-many)
CREATE TABLE IF NOT EXISTS node_tags (
    node_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (node_id, tag),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Note: FTS5 removed for MVP simplicity. Text search uses LIKE queries.
-- Can add FTS5 back later for better performance at scale.

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_validity ON nodes(validity);
CREATE INDEX IF NOT EXISTS idx_nodes_priority ON nodes(priority);
CREATE INDEX IF NOT EXISTS idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_modified ON nodes(modified_at);
CREATE INDEX IF NOT EXISTS idx_nodes_due ON nodes(due_at);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON node_tags(tag);
`;

export class SqliteIndex {
  private db: Database.Database;
  private insertNode: Database.Statement;
  private updateNode: Database.Statement;
  private deleteNode: Database.Statement;
  private insertEdge: Database.Statement;
  private deleteEdgesForNode: Database.Statement;
  private insertTag: Database.Statement;
  private deleteTagsForNode: Database.Statement;
  constructor(cubePath: string) {
    const dbPath = join(cubePath, 'index.db');
    this.db = new Database(dbPath);
    
    // Enable foreign keys and WAL mode for better performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    
    // Create schema
    this.db.exec(SCHEMA);

    // Prepare statements
    this.insertNode = this.db.prepare(`
      INSERT OR REPLACE INTO nodes 
      (id, type, status, validity, priority, confidence, created_by, assigned_to, 
       locked_by, created_at, modified_at, due_at, title, content_preview, 
       semantic_hash, file_path, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.updateNode = this.db.prepare(`
      UPDATE nodes SET 
        type = ?, status = ?, validity = ?, priority = ?, confidence = ?,
        created_by = ?, assigned_to = ?, locked_by = ?, created_at = ?,
        modified_at = ?, due_at = ?, title = ?, content_preview = ?,
        semantic_hash = ?, file_path = ?, version = ?
      WHERE id = ?
    `);

    this.deleteNode = this.db.prepare('DELETE FROM nodes WHERE id = ?');

    this.insertEdge = this.db.prepare(`
      INSERT OR REPLACE INTO edges (id, from_node, to_node, type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.deleteEdgesForNode = this.db.prepare('DELETE FROM edges WHERE from_node = ?');

    this.insertTag = this.db.prepare(`
      INSERT OR IGNORE INTO node_tags (node_id, tag) VALUES (?, ?)
    `);

    this.deleteTagsForNode = this.db.prepare('DELETE FROM node_tags WHERE node_id = ?');
  }

  /**
   * Index a node (insert or update)
   */
  indexNode(node: Node): void {
    const txn = this.db.transaction(() => {
      // Upsert node
      this.insertNode.run(
        node.id,
        node.type,
        node.status,
        node.validity,
        node.priority,
        node.confidence,
        node.createdBy,
        node.assignedTo,
        node.lockedBy,
        node.createdAt,
        node.modifiedAt,
        node.dueAt,
        node.title,
        node.contentPreview,
        node.ordering.semanticHash,
        node.filePath,
        node.version
      );

      // Update edges
      this.deleteEdgesForNode.run(node.id);
      for (const edge of node.edges) {
        this.insertEdge.run(edge.id, edge.from, edge.to, edge.type, edge.createdAt);
      }

      // Update tags
      this.deleteTagsForNode.run(node.id);
      for (const tag of node.tags) {
        this.insertTag.run(node.id, tag);
      }
    });

    txn();
  }

  /**
   * Remove a node from the index
   */
  removeNode(id: string): void {
    const txn = this.db.transaction(() => {
      this.deleteTagsForNode.run(id);
      this.deleteEdgesForNode.run(id);
      this.deleteNode.run(id);
    });

    txn();
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.db.exec(`
      DELETE FROM node_tags;
      DELETE FROM edges;
      DELETE FROM nodes;
    `);
  }

  /**
   * Query nodes with filters
   */
  query(filter?: QueryFilter, sort?: QuerySort[], limit?: number, offset?: number): string[] {
    let sql = 'SELECT DISTINCT n.id FROM nodes n';
    const params: unknown[] = [];
    const conditions: string[] = [];
    const joins: string[] = [];

    // Handle tag filters with joins
    if (filter?.tags && filter.tags.length > 0) {
      for (let i = 0; i < filter.tags.length; i++) {
        const alias = `t${i}`;
        joins.push(`JOIN node_tags ${alias} ON n.id = ${alias}.node_id AND ${alias}.tag = ?`);
        params.push(filter.tags[i]);
      }
    }

    if (filter?.tagsAny && filter.tagsAny.length > 0) {
      joins.push('JOIN node_tags ta ON n.id = ta.node_id');
      conditions.push(`ta.tag IN (${filter.tagsAny.map(() => '?').join(', ')})`);
      params.push(...filter.tagsAny);
    }

    // Handle edge filters
    if (filter?.hasEdge) {
      if (filter.hasEdge.direction === 'out') {
        joins.push('JOIN edges e ON n.id = e.from_node');
      } else {
        joins.push('JOIN edges e ON n.id = e.to_node');
      }
      conditions.push('e.type = ?');
      params.push(filter.hasEdge.type);
    }

    // Build WHERE clause
    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      conditions.push(`n.type IN (${types.map(() => '?').join(', ')})`);
      params.push(...types);
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      conditions.push(`n.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }

    if (filter?.validity) {
      const validities = Array.isArray(filter.validity) ? filter.validity : [filter.validity];
      conditions.push(`n.validity IN (${validities.map(() => '?').join(', ')})`);
      params.push(...validities);
    }

    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      conditions.push(`n.priority IN (${priorities.map(() => '?').join(', ')})`);
      params.push(...priorities);
    }

    if (filter?.assignedTo !== undefined) {
      if (filter.assignedTo === null) {
        conditions.push('n.assigned_to IS NULL');
      } else {
        conditions.push('n.assigned_to = ?');
        params.push(filter.assignedTo);
      }
    }

    if (filter?.createdBy) {
      conditions.push('n.created_by = ?');
      params.push(filter.createdBy);
    }

    if (filter?.createdAfter) {
      conditions.push('n.created_at >= ?');
      params.push(filter.createdAfter);
    }

    if (filter?.createdBefore) {
      conditions.push('n.created_at <= ?');
      params.push(filter.createdBefore);
    }

    if (filter?.modifiedAfter) {
      conditions.push('n.modified_at >= ?');
      params.push(filter.modifiedAfter);
    }

    if (filter?.modifiedBefore) {
      conditions.push('n.modified_at <= ?');
      params.push(filter.modifiedBefore);
    }

    if (filter?.dueAfter) {
      conditions.push('n.due_at >= ?');
      params.push(filter.dueAfter);
    }

    if (filter?.dueBefore) {
      conditions.push('n.due_at <= ?');
      params.push(filter.dueBefore);
    }

    // Text search (simple LIKE - can upgrade to FTS5 later)
    if (filter?.search) {
      conditions.push('(n.title LIKE ? OR n.content_preview LIKE ?)');
      const searchPattern = `%${filter.search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Build query
    if (joins.length > 0) {
      sql += ' ' + joins.join(' ');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Sorting
    if (sort && sort.length > 0) {
      const orderClauses = sort.map(s => {
        const col = s.field === 'title' ? 'n.title' :
                    s.field === 'priority' ? "CASE n.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END" :
                    `n.${s.field.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
        return `${col} ${s.order.toUpperCase()}`;
      });
      sql += ' ORDER BY ' + orderClauses.join(', ');
    }

    // Pagination
    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    if (offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { id: string }[];
    return rows.map(r => r.id);
  }

  /**
   * Get statistics
   */
  stats(): {
    totalNodes: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
    
    const byType = this.db.prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type').all() as { type: string; count: number }[];
    const byStatus = this.db.prepare('SELECT status, COUNT(*) as count FROM nodes GROUP BY status').all() as { status: string; count: number }[];

    return {
      totalNodes: total.count,
      byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
    };
  }

  /**
   * Find edges by type
   */
  findEdges(nodeId: string, edgeType?: string, direction: 'in' | 'out' | 'both' = 'out'): { from: string; to: string; type: string }[] {
    let sql: string;
    const params: unknown[] = [];

    if (direction === 'out') {
      sql = 'SELECT from_node, to_node, type FROM edges WHERE from_node = ?';
      params.push(nodeId);
    } else if (direction === 'in') {
      sql = 'SELECT from_node, to_node, type FROM edges WHERE to_node = ?';
      params.push(nodeId);
    } else {
      sql = 'SELECT from_node, to_node, type FROM edges WHERE from_node = ? OR to_node = ?';
      params.push(nodeId, nodeId);
    }

    if (edgeType) {
      sql += ' AND type = ?';
      params.push(edgeType);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { from_node: string; to_node: string; type: string }[];
    return rows.map(r => ({ from: r.from_node, to: r.to_node, type: r.type }));
  }

  /**
   * Check if node exists in index
   */
  exists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id);
    return row !== undefined;
  }

  /**
   * Get node count
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
    return row.count;
  }

  /**
   * Close the database
   */
  close(): void {
    this.db.close();
  }
}
