/**
 * Synthesis Pipeline
 * 
 * Main entry point for extracting nodes from various sources.
 * Coordinates extractors, handles deduplication, and manages creation.
 */

import type {
  Source,
  ExtractedNode,
  ExtractedRelation,
  ExtractionResult,
  SynthesisConfig,
  SimilarityMatch,
  DeduplicationResult,
} from './types.js';
import { ConversationExtractor } from './conversation-extractor.js';
import { CodeAnalyzer } from './code-analyzer.js';
import type { Node, CreateNodeInput } from '../core/types.js';

export class SynthesisPipeline {
  private config: SynthesisConfig;
  private conversationExtractor: ConversationExtractor;
  private codeAnalyzer: CodeAnalyzer;
  private cube: any; // Will be typed properly when integrated
  
  constructor(config?: Partial<SynthesisConfig>) {
    this.config = {
      minConfidence: 0.5,
      deduplicationThreshold: 0.8,
      autoCreate: false,
      requireApproval: true,
      codeLanguages: ['typescript', 'javascript'],
      useLLM: false,
      ...config,
    };
    
    this.conversationExtractor = new ConversationExtractor();
    this.codeAnalyzer = new CodeAnalyzer();
  }
  
  /**
   * Set the Cube instance for deduplication and node creation
   */
  setCube(cube: any): void {
    this.cube = cube;
  }
  
  /**
   * Process a source and extract nodes
   */
  async extract(source: Source): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    let nodes: ExtractedNode[] = [];
    let relations: ExtractedRelation[] = [];
    const entities: any[] = [];
    
    // Route to appropriate extractor
    switch (source.type) {
      case 'conversation':
        const convResult = this.conversationExtractor.analyze(source);
        nodes = convResult.suggestedNodes;
        relations = convResult.suggestedRelations;
        break;
        
      case 'code':
        const codeResult = this.codeAnalyzer.analyze(source);
        nodes = codeResult.suggestedNodes;
        relations = codeResult.suggestedRelations;
        break;
        
      case 'markdown':
        // Treat markdown as conversation for now
        const mdResult = this.conversationExtractor.analyze(source);
        nodes = mdResult.suggestedNodes;
        relations = mdResult.suggestedRelations;
        break;
        
      default:
        // Unknown source type - try conversation extraction
        const defaultResult = this.conversationExtractor.analyze(source);
        nodes = defaultResult.suggestedNodes;
        relations = defaultResult.suggestedRelations;
    }
    
    // Filter by confidence
    nodes = nodes.filter(n => n.confidence >= this.config.minConfidence);
    relations = relations.filter(r => r.confidence >= this.config.minConfidence);
    
    const processingTimeMs = Date.now() - startTime;
    
    return {
      source,
      entities,
      nodes,
      relations,
      metadata: {
        extractedAt: new Date().toISOString(),
        processingTimeMs,
        extractorVersion: '1.0.0',
      },
    };
  }
  
  /**
   * Extract and deduplicate against existing nodes
   */
  async extractWithDedup(source: Source): Promise<{
    result: ExtractionResult;
    dedup: DeduplicationResult[];
  }> {
    const result = await this.extract(source);
    
    if (!this.cube) {
      return {
        result,
        dedup: result.nodes.map(n => ({
          extractedNode: n,
          matches: [],
          recommendation: 'create' as const,
        })),
      };
    }
    
    // Check each node for duplicates
    const dedup: DeduplicationResult[] = [];
    
    for (const node of result.nodes) {
      const matches = await this.findSimilar(node);
      const recommendation = this.getRecommendation(matches);
      
      dedup.push({
        extractedNode: node,
        matches,
        recommendation,
        mergeTargetId: recommendation === 'merge' ? matches[0]?.existingNodeId : undefined,
      });
    }
    
    return { result, dedup };
  }
  
  /**
   * Find similar existing nodes
   */
  private async findSimilar(extracted: ExtractedNode): Promise<SimilarityMatch[]> {
    if (!this.cube) return [];
    
    const matches: SimilarityMatch[] = [];
    
    // Query for nodes of same type
    const queryResult = this.cube.query({
      filter: { type: extracted.suggestedType },
      includeContent: true,
    });
    
    if (!queryResult.success || !queryResult.data) {
      return matches;
    }
    
    const existingNodes = queryResult.data as Node[];
    
    for (const existing of existingNodes) {
      const similarity = this.calculateSimilarity(extracted, existing);
      
      if (similarity > 0.3) { // Minimum threshold for consideration
        matches.push({
          existingNodeId: existing.id,
          existingTitle: existing.title,
          similarity,
          matchType: similarity > 0.95 ? 'exact' : similarity > 0.7 ? 'semantic' : 'partial',
        });
      }
    }
    
    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);
    
    return matches.slice(0, 5); // Top 5 matches
  }
  
  /**
   * Calculate similarity between extracted and existing node
   */
  private calculateSimilarity(extracted: ExtractedNode, existing: Node): number {
    // Simple similarity based on title and content
    const titleSim = this.stringSimilarity(
      extracted.suggestedTitle.toLowerCase(),
      existing.title.toLowerCase()
    );
    
    const contentSim = this.stringSimilarity(
      extracted.suggestedContent.toLowerCase(),
      existing.content.toLowerCase()
    );
    
    // Tag overlap
    const extractedTags = new Set(extracted.suggestedTags);
    const existingTags = new Set(existing.tags);
    const tagOverlap = [...extractedTags].filter(t => existingTags.has(t)).length;
    const tagSim = tagOverlap / Math.max(extractedTags.size, existingTags.size, 1);
    
    // Weighted average
    return titleSim * 0.5 + contentSim * 0.3 + tagSim * 0.2;
  }
  
  /**
   * Simple string similarity (Jaccard on words)
   */
  private stringSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
    
    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    
    return intersection / union;
  }
  
  /**
   * Get recommendation based on matches
   */
  private getRecommendation(matches: SimilarityMatch[]): 'create' | 'merge' | 'link' | 'skip' {
    if (matches.length === 0) {
      return 'create';
    }
    
    const topMatch = matches[0];
    
    if (topMatch.similarity >= this.config.deduplicationThreshold) {
      return topMatch.matchType === 'exact' ? 'skip' : 'merge';
    }
    
    if (topMatch.similarity >= 0.5) {
      return 'link';
    }
    
    return 'create';
  }
  
  /**
   * Create nodes from extraction result
   */
  async createNodes(
    result: ExtractionResult,
    dedup?: DeduplicationResult[],
    options?: { approved?: string[]; rejected?: string[] }
  ): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
    if (!this.cube) {
      return { created: [], skipped: [], errors: ['Cube not connected'] };
    }
    
    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    
    const nodesToProcess = dedup || result.nodes.map(n => ({
      extractedNode: n,
      matches: [],
      recommendation: 'create' as const,
    }));
    
    for (const item of nodesToProcess) {
      const node = item.extractedNode;
      
      // Check approval if required
      if (this.config.requireApproval) {
        if (options?.rejected?.includes(node.suggestedTitle)) {
          skipped.push(node.suggestedTitle);
          continue;
        }
        if (!options?.approved?.includes(node.suggestedTitle) && !this.config.autoCreate) {
          skipped.push(node.suggestedTitle);
          continue;
        }
      }
      
      // Handle based on recommendation
      switch (item.recommendation) {
        case 'skip':
          skipped.push(node.suggestedTitle);
          continue;
          
        case 'merge':
          // Update existing node instead of creating
          if (item.mergeTargetId) {
            const updateResult = this.cube.update(item.mergeTargetId, {
              content: node.suggestedContent,
              tags: node.suggestedTags,
            });
            if (updateResult.success) {
              created.push(`merged:${item.mergeTargetId}`);
            } else {
              errors.push(`Failed to merge into ${item.mergeTargetId}: ${updateResult.error}`);
            }
          }
          continue;
          
        case 'link':
        case 'create':
          // Create new node
          const input: CreateNodeInput = {
            type: node.suggestedType,
            title: node.suggestedTitle,
            content: node.suggestedContent,
            tags: node.suggestedTags,
            priority: node.suggestedPriority,
          };
          
          const createResult = this.cube.create(input);
          if (createResult.success && createResult.data) {
            created.push(createResult.data.id);
            
            // If link recommendation, create edge to similar node
            if (item.recommendation === 'link' && item.matches[0]) {
              this.cube.link(
                createResult.data.id,
                'relates-to',
                item.matches[0].existingNodeId
              );
            }
          } else {
            errors.push(`Failed to create ${node.suggestedTitle}: ${createResult.error}`);
          }
          break;
      }
    }
    
    return { created, skipped, errors };
  }
  
  /**
   * Quick extraction from text - returns tasks only
   */
  extractTasks(text: string): ExtractedNode[] {
    return this.conversationExtractor.extractTasks(text);
  }
  
  /**
   * Quick extraction from text - returns ideas only
   */
  extractIdeas(text: string): ExtractedNode[] {
    return this.conversationExtractor.extractIdeas(text);
  }
  
  /**
   * Quick extraction from code - returns functions only
   */
  extractFunctions(code: string, language?: string) {
    return this.codeAnalyzer.getFunctions(code, language);
  }
  
  /**
   * Quick extraction from code - returns classes only
   */
  extractClasses(code: string, language?: string) {
    return this.codeAnalyzer.getClasses(code, language);
  }
  
  /**
   * Get current config
   */
  getConfig(): SynthesisConfig {
    return { ...this.config };
  }
  
  /**
   * Update config
   */
  updateConfig(config: Partial<SynthesisConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
