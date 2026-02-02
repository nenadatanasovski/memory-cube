/**
 * Synthesis Pipeline Types
 * 
 * Types for extracting structured nodes from unstructured input.
 */

import type { NodeType, EdgeType, Priority } from '../core/types.js';

// ============================================================================
// Source Types
// ============================================================================

export type SourceType =
  | 'conversation'    // Chat/dialogue
  | 'markdown'        // Markdown files
  | 'code'            // Source code files
  | 'web'             // Web search results
  | 'manual';         // Direct user input

export interface Source {
  type: SourceType;
  content: string;
  metadata?: {
    path?: string;          // File path if applicable
    url?: string;           // URL if from web
    timestamp?: string;     // When captured
    author?: string;        // Who created it
    language?: string;      // Programming language for code
  };
}

// ============================================================================
// Extraction Results
// ============================================================================

export interface ExtractedEntity {
  text: string;              // The extracted text
  type: 'task' | 'decision' | 'idea' | 'question' | 'fact' | 'person' | 'concept' | 'code_ref';
  confidence: number;        // 0-1
  startOffset: number;       // Position in source
  endOffset: number;
  context?: string;          // Surrounding text for context
}

export interface ExtractedRelation {
  from: string;              // Entity text or ID
  to: string;                // Entity text or ID
  type: EdgeType;
  confidence: number;
  evidence?: string;         // Text that suggests this relation
}

export interface ExtractedNode {
  suggestedType: NodeType;
  suggestedTitle: string;
  suggestedContent: string;
  suggestedTags: string[];
  suggestedPriority: Priority;
  confidence: number;
  source: {
    type: SourceType;
    excerpt: string;         // The source text this came from
    offset?: number;
  };
  relations?: ExtractedRelation[];
}

export interface ExtractionResult {
  source: Source;
  entities: ExtractedEntity[];
  nodes: ExtractedNode[];
  relations: ExtractedRelation[];
  metadata: {
    extractedAt: string;
    processingTimeMs: number;
    extractorVersion: string;
  };
}

// ============================================================================
// Code Analysis Types
// ============================================================================

export interface CodeFunction {
  name: string;
  signature: string;         // Full function signature
  docstring?: string;        // Documentation comment
  startLine: number;
  endLine: number;
  complexity?: number;       // Cyclomatic complexity estimate
  dependencies: string[];    // Functions/modules it calls
  exports: boolean;          // Is it exported?
}

export interface CodeClass {
  name: string;
  docstring?: string;
  startLine: number;
  endLine: number;
  methods: CodeFunction[];
  properties: string[];
  extends?: string;
  implements?: string[];
}

export interface CodeModule {
  path: string;
  language: string;
  imports: Array<{
    module: string;
    items: string[];
    isDefault: boolean;
  }>;
  exports: string[];
  functions: CodeFunction[];
  classes: CodeClass[];
  constants: Array<{
    name: string;
    type?: string;
    value?: string;
  }>;
}

export interface CodeAnalysisResult {
  module: CodeModule;
  suggestedNodes: ExtractedNode[];
  suggestedRelations: ExtractedRelation[];
}

// ============================================================================
// Conversation Analysis Types
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ConversationIntent {
  type: 'task_request' | 'question' | 'decision' | 'brainstorm' | 'feedback' | 'info_share' | 'other';
  confidence: number;
  evidence: string;
}

export interface ConversationAnalysisResult {
  messages: ConversationMessage[];
  intents: ConversationIntent[];
  suggestedNodes: ExtractedNode[];
  suggestedRelations: ExtractedRelation[];
  summary?: string;
}

// ============================================================================
// Deduplication Types
// ============================================================================

export interface SimilarityMatch {
  existingNodeId: string;
  existingTitle: string;
  similarity: number;        // 0-1
  matchType: 'exact' | 'semantic' | 'partial';
}

export interface DeduplicationResult {
  extractedNode: ExtractedNode;
  matches: SimilarityMatch[];
  recommendation: 'create' | 'merge' | 'link' | 'skip';
  mergeTargetId?: string;
}

// ============================================================================
// Pipeline Configuration
// ============================================================================

export interface SynthesisConfig {
  // Extraction thresholds
  minConfidence: number;           // Minimum confidence to include (default: 0.5)
  
  // Deduplication
  deduplicationThreshold: number;  // Similarity threshold for dedup (default: 0.8)
  
  // Auto-creation
  autoCreate: boolean;             // Automatically create nodes (default: false)
  requireApproval: boolean;        // Require human approval (default: true)
  
  // Code analysis
  codeLanguages: string[];         // Languages to analyze (default: ['typescript', 'javascript'])
  
  // LLM settings (for advanced extraction)
  useLLM: boolean;                 // Use LLM for extraction (default: false)
  llmModel?: string;               // Model to use
}

export const DEFAULT_SYNTHESIS_CONFIG: SynthesisConfig = {
  minConfidence: 0.5,
  deduplicationThreshold: 0.8,
  autoCreate: false,
  requireApproval: true,
  codeLanguages: ['typescript', 'javascript'],
  useLLM: false,
};
