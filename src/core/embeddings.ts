/**
 * Embeddings module for semantic search
 * 
 * Phase 1: Simple TF-IDF based similarity (no external dependencies)
 * Phase 2: OpenAI embeddings integration
 * Phase 3: Local model (e.g., sentence-transformers)
 */

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
  dimensions: number;
}

/**
 * Simple TF-IDF based embedding (placeholder)
 * Uses word frequency hashing for fast, dependency-free similarity
 */
export class SimpleEmbedding implements EmbeddingProvider {
  readonly dimensions = 256;

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimensions).fill(0);
    const words = this.tokenize(text);
    const wordCounts = new Map<string, number>();

    // Count word frequencies
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Hash words into vector dimensions
    for (const [word, count] of wordCounts) {
      const hash = this.hashString(word);
      const index = Math.abs(hash) % this.dimensions;
      const sign = hash > 0 ? 1 : -1;
      vector[index] += sign * Math.log(1 + count);
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  similarity(a: number[], b: number[]): number {
    // Cosine similarity
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

/**
 * OpenAI embeddings provider
 */
export class OpenAIEmbedding implements EmbeddingProvider {
  readonly dimensions = 1536; // text-embedding-ada-002
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000), // Truncate to max tokens
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  similarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
}

/**
 * Vector index for fast similarity search
 */
export class VectorIndex {
  private vectors: Map<string, number[]> = new Map();
  private provider: EmbeddingProvider;

  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
  }

  async add(id: string, text: string): Promise<void> {
    const vector = await this.provider.embed(text);
    this.vectors.set(id, vector);
  }

  remove(id: string): void {
    this.vectors.delete(id);
  }

  async search(query: string, limit = 10): Promise<Array<{ id: string; score: number }>> {
    const queryVector = await this.provider.embed(query);
    const results: Array<{ id: string; score: number }> = [];

    for (const [id, vector] of this.vectors) {
      const score = this.provider.similarity(queryVector, vector);
      results.push({ id, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async findSimilar(id: string, limit = 10): Promise<Array<{ id: string; score: number }>> {
    const vector = this.vectors.get(id);
    if (!vector) return [];

    const results: Array<{ id: string; score: number }> = [];

    for (const [otherId, otherVector] of this.vectors) {
      if (otherId === id) continue;
      const score = this.provider.similarity(vector, otherVector);
      results.push({ id: otherId, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  get size(): number {
    return this.vectors.size;
  }

  // Serialize for persistence
  toJSON(): { vectors: Array<[string, number[]]>; dimensions: number } {
    return {
      vectors: Array.from(this.vectors.entries()),
      dimensions: this.provider.dimensions,
    };
  }

  // Deserialize
  fromJSON(data: { vectors: Array<[string, number[]]> }): void {
    this.vectors = new Map(data.vectors);
  }
}
