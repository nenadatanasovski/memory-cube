import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleEmbedding, VectorIndex } from '../../src/core/embeddings';

describe('SimpleEmbedding', () => {
  let embedding: SimpleEmbedding;

  beforeEach(() => {
    embedding = new SimpleEmbedding();
  });

  it('should generate vectors of correct dimension', async () => {
    const vector = await embedding.embed('hello world');
    expect(vector.length).toBe(256);
  });

  it('should generate normalized vectors', async () => {
    const vector = await embedding.embed('the quick brown fox');
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it('should compute similarity between similar texts', async () => {
    const v1 = await embedding.embed('machine learning artificial intelligence');
    const v2 = await embedding.embed('AI and machine learning algorithms');
    const v3 = await embedding.embed('cooking recipes and kitchen tips');

    const sim12 = embedding.similarity(v1, v2);
    const sim13 = embedding.similarity(v1, v3);

    expect(sim12).toBeGreaterThan(sim13);
  });

  it('should return 0 for empty text', async () => {
    const vector = await embedding.embed('');
    const allZero = vector.every(v => v === 0);
    expect(allZero).toBe(true);
  });
});

describe('VectorIndex', () => {
  let index: VectorIndex;

  beforeEach(() => {
    index = new VectorIndex(new SimpleEmbedding());
  });

  it('should add and count vectors', async () => {
    await index.add('doc1', 'hello world');
    await index.add('doc2', 'goodbye world');
    expect(index.size).toBe(2);
  });

  it('should remove vectors', async () => {
    await index.add('doc1', 'hello world');
    index.remove('doc1');
    expect(index.size).toBe(0);
  });

  it('should search for similar documents', async () => {
    await index.add('doc1', 'machine learning neural networks');
    await index.add('doc2', 'deep learning AI models');
    await index.add('doc3', 'cooking recipes food');

    const results = await index.search('artificial intelligence', 3);
    
    expect(results.length).toBe(3);
    // ML docs should rank higher than cooking
    const mlIndices = results.slice(0, 2).map(r => r.id);
    expect(mlIndices).toContain('doc1');
    expect(mlIndices).toContain('doc2');
  });

  it('should find similar documents by ID', async () => {
    await index.add('doc1', 'javascript typescript programming');
    await index.add('doc2', 'nodejs npm packages');
    await index.add('doc3', 'python django framework');
    await index.add('doc4', 'react frontend components');

    const similar = await index.findSimilar('doc1', 2);
    
    expect(similar.length).toBe(2);
    expect(similar[0].id).not.toBe('doc1'); // Should not include self
  });

  it('should serialize and deserialize', async () => {
    await index.add('doc1', 'test content');
    await index.add('doc2', 'more content');

    const json = index.toJSON();
    
    const newIndex = new VectorIndex(new SimpleEmbedding());
    newIndex.fromJSON(json);
    
    expect(newIndex.size).toBe(2);
  });
});
