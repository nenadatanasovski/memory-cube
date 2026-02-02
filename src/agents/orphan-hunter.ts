/**
 * Orphan Hunter Agent
 * 
 * Finds disconnected nodes and suggests connections based on similarity.
 * This is the first real agent to prove the orchestrator works.
 */

import type { Cube } from '../core/cube.js';
import type { Node, EdgeType } from '../core/types.js';

export interface OrphanHunterConfig {
  minSimilarityScore: number;  // Minimum similarity to suggest connection
  maxSuggestionsPerNode: number;
  excludeTypes?: string[];  // Node types to exclude from analysis
}

export interface ConnectionSuggestion {
  from: Node;
  to: Node;
  edgeType: EdgeType;
  score: number;
  reason: string;
}

export class OrphanHunterAgent {
  private config: OrphanHunterConfig;

  constructor(config?: Partial<OrphanHunterConfig>) {
    this.config = {
      minSimilarityScore: 0.3,
      maxSuggestionsPerNode: 3,
      excludeTypes: [],
      ...config,
    };
  }

  /**
   * Find orphan nodes (nodes with no edges)
   */
  async findOrphans(cube: Cube): Promise<Node[]> {
    const allNodes = cube.query({}).data || [];
    const orphans: Node[] = [];

    for (const node of allNodes) {
      // Skip excluded types
      if (this.config.excludeTypes?.includes(node.type)) {
        continue;
      }

      // Check if node has any edges
      if (!node.edges || node.edges.length === 0) {
        orphans.push(node);
      }
    }

    return orphans;
  }

  /**
   * Suggest connections for orphan nodes
   */
  async suggestConnections(cube: Cube): Promise<ConnectionSuggestion[]> {
    const orphans = await this.findOrphans(cube);
    const suggestions: ConnectionSuggestion[] = [];

    for (const orphan of orphans) {
      // Find similar nodes
      const similar = await cube.findSimilarTo(orphan.id, this.config.maxSuggestionsPerNode + 1);
      
      for (const match of similar) {
        // Skip self and low-similarity matches
        if (match.node.id === orphan.id) continue;
        if (match.score < this.config.minSimilarityScore) continue;

        // Determine appropriate edge type based on node types
        const edgeType = this.inferEdgeType(orphan, match.node);
        
        suggestions.push({
          from: orphan,
          to: match.node,
          edgeType,
          score: match.score,
          reason: this.generateReason(orphan, match.node, match.score),
        });
      }
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions;
  }

  /**
   * Infer the appropriate edge type based on node types
   */
  private inferEdgeType(from: Node, to: Node): EdgeType {
    const fromType = from.type;
    const toType = to.type;

    // Task → Code = implements
    if (fromType === 'task' && toType === 'code') return 'implements';
    if (fromType === 'code' && toType === 'task') return 'implements';

    // Doc → anything = documents
    if (fromType === 'doc') return 'documents';
    if (toType === 'doc') return 'documents';

    // Decision → Task = depends-on
    if (fromType === 'decision' && toType === 'task') return 'depends-on';

    // Ideation → Task = spawns
    if (fromType === 'ideation' && toType === 'task') return 'spawns';

    // Research → Decision = relates-to
    if (fromType === 'research' && toType === 'decision') return 'relates-to';

    // Default
    return 'relates-to';
  }

  /**
   * Generate a human-readable reason for the suggestion
   */
  private generateReason(from: Node, to: Node, score: number): string {
    const pct = Math.round(score * 100);
    return `"${from.title}" is ${pct}% similar to "${to.title}" based on content analysis`;
  }

  /**
   * Apply suggestions (create the edges)
   */
  async applySuggestions(cube: Cube, suggestions: ConnectionSuggestion[]): Promise<number> {
    let applied = 0;

    for (const suggestion of suggestions) {
      const result = cube.link(
        suggestion.from.id,
        suggestion.edgeType,
        suggestion.to.id
      );

      if (result.success) {
        applied++;
      }
    }

    return applied;
  }

  /**
   * Run the agent: find orphans, generate suggestions, return report
   */
  async run(cube: Cube): Promise<{
    orphans: Node[];
    suggestions: ConnectionSuggestion[];
    report: string;
  }> {
    const orphans = await this.findOrphans(cube);
    const suggestions = await this.suggestConnections(cube);

    const report = this.generateReport(orphans, suggestions);

    return { orphans, suggestions, report };
  }

  /**
   * Generate a human-readable report
   */
  private generateReport(orphans: Node[], suggestions: ConnectionSuggestion[]): string {
    const lines: string[] = [
      '# Orphan Hunter Report',
      '',
      `## Summary`,
      `- Orphan nodes found: ${orphans.length}`,
      `- Connection suggestions: ${suggestions.length}`,
      '',
    ];

    if (orphans.length > 0) {
      lines.push('## Orphan Nodes');
      for (const orphan of orphans) {
        lines.push(`- [${orphan.type}] ${orphan.title}`);
      }
      lines.push('');
    }

    if (suggestions.length > 0) {
      lines.push('## Suggested Connections');
      for (const s of suggestions) {
        lines.push(`- ${s.from.title} --${s.edgeType}--> ${s.to.title} (${Math.round(s.score * 100)}%)`);
      }
    }

    return lines.join('\n');
  }
}
