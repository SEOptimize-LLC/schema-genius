/* eslint-disable @typescript-eslint/no-explicit-any */
// app/lib/intelligence/vector-embeddings-engine.ts

interface VectorEmbedding {
  id: string;
  vector: number[];
  metadata: {
    text: string;
    type: string;
    source?: string;
    timestamp?: string;
  };
}

interface SimilarityResult {
  id: string;
  similarity: number;
  metadata: any;
}

interface EmbeddingModel {
  dimension: number;
  vocabulary: Map<string, number>;
  idf: Map<string, number>;
}

export class VectorEmbeddingsEngine {
  private embeddings: Map<string, VectorEmbedding>;
  private model: EmbeddingModel;
  private stopwords!: Set<string>;
  
  constructor() {
    this.embeddings = new Map();
    this.model = {
      dimension: 768, // Standard BERT-like dimension
      vocabulary: new Map(),
      idf: new Map()
    };
    this.initializeStopwords();
    this.initializeVocabulary();
  }

  private initializeStopwords() {
    this.stopwords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are',
      'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'shall', 'can', 'need', 'ought', 'to', 'of', 'in', 'for', 'with',
      'by', 'from', 'about', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'it', 'its', 'itself', 'they', 'them', 'their',
      'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this',
      'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our',
      'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves',
      'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself'
    ]);
  }

  private initializeVocabulary() {
    // Initialize with common schema.org related terms
    const commonTerms = [
      // Schema types
      'article', 'blogposting', 'product', 'review', 'recipe', 'howto',
      'event', 'organization', 'person', 'place', 'service', 'offer',
      
      // Common properties
      'name', 'description', 'author', 'publisher', 'date', 'image',
      'price', 'rating', 'location', 'address', 'phone', 'email',
      
      // Industries
      'technology', 'business', 'health', 'education', 'fitness',
      'food', 'travel', 'entertainment', 'sports', 'fashion',
      
      // Actions
      'buy', 'sell', 'learn', 'teach', 'create', 'make', 'build',
      'develop', 'design', 'improve', 'optimize', 'analyze'
    ];
    
    commonTerms.forEach((term, index) => {
      this.model.vocabulary.set(term, index);
    });
  }

  // Create embedding from text using TF-IDF and semantic features
  async createEmbedding(text: string, id?: string): Promise<VectorEmbedding> {
    const embeddingId = id || this.generateId();
    const tokens = this.tokenize(text);
    const vector = this.generateVector(tokens, text);
    
    const embedding: VectorEmbedding = {
      id: embeddingId,
      vector,
      metadata: {
        text: text.substring(0, 500), // Store first 500 chars
        type: 'text',
        timestamp: new Date().toISOString()
      }
    };
    
    this.embeddings.set(embeddingId, embedding);
    return embedding;
  }

  // Create embeddings for entities
  async createEntityEmbedding(
    entity: any,
    context: string
  ): Promise<VectorEmbedding> {
    const text = `${entity.name} ${entity.type} ${entity.context || ''} ${context}`;
    const embedding = await this.createEmbedding(text, `entity-${entity.name}`);
    
    embedding.metadata.type = 'entity';
    embedding.metadata.source = entity.name;
    
    return embedding;
  }

  // Create embeddings for schema types
  async createSchemaEmbedding(
    schemaType: string,
    properties: string[]
  ): Promise<VectorEmbedding> {
    const text = `${schemaType} ${properties.join(' ')}`;
    const embedding = await this.createEmbedding(text, `schema-${schemaType}`);
    
    embedding.metadata.type = 'schema';
    embedding.metadata.source = schemaType;
    
    return embedding;
  }

  private tokenize(text: string): string[] {
    // Simple tokenization - in production, use a proper tokenizer
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0 && !this.stopwords.has(token));
  }

  private generateVector(tokens: string[], originalText: string): number[] {
    const vector = new Array(this.model.dimension).fill(0);
    
    // TF-IDF features (first 300 dimensions)
    const tfIdfVector = this.calculateTfIdf(tokens);
    for (let i = 0; i < Math.min(300, tfIdfVector.length); i++) {
      vector[i] = tfIdfVector[i];
    }
    
    // Semantic features (next 200 dimensions)
    const semanticFeatures = this.extractSemanticFeatures(originalText);
    for (let i = 0; i < semanticFeatures.length; i++) {
      vector[300 + i] = semanticFeatures[i];
    }
    
    // N-gram features (next 200 dimensions)
    const ngramFeatures = this.extractNgramFeatures(tokens);
    for (let i = 0; i < ngramFeatures.length; i++) {
      vector[500 + i] = ngramFeatures[i];
    }
    
    // Contextual features (remaining dimensions)
    const contextFeatures = this.extractContextualFeatures(originalText);
    for (let i = 0; i < contextFeatures.length; i++) {
      vector[700 + i] = contextFeatures[i];
    }
    
    // Normalize vector
    return this.normalizeVector(vector);
  }

  private calculateTfIdf(tokens: string[]): number[] {
    const vector: number[] = [];
    const tokenFreq = new Map<string, number>();
    
    // Calculate term frequency
    for (const token of tokens) {
      tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
    }
    
    // Calculate TF-IDF for vocabulary terms
    for (const [term, index] of this.model.vocabulary) {
      const tf = (tokenFreq.get(term) || 0) / tokens.length;
      const idf = this.model.idf.get(term) || Math.log(100); // Default IDF
      vector[index] = tf * idf;
    }
    
    return vector;
  }

  private extractSemanticFeatures(text: string): number[] {
    const features: number[] = [];
    const textLower = text.toLowerCase();
    
    // Schema.org type indicators
    const schemaTypes = [
      'article', 'blog', 'product', 'review', 'recipe', 'howto',
      'event', 'job', 'course', 'faq', 'video', 'local'
    ];
    
    for (const type of schemaTypes) {
      features.push(textLower.includes(type) ? 1 : 0);
    }
    
    // Content characteristics
    features.push(text.length / 1000); // Length feature
    features.push((text.match(/\?/g) || []).length / 10); // Questions
    features.push((text.match(/\d+/g) || []).length / 10); // Numbers
    features.push((text.match(/[A-Z]/g) || []).length / text.length); // Capitalization
    features.push((text.match(/\n/g) || []).length / 10); // Structure
    
    // Industry indicators
    const industries = [
      { name: 'tech', keywords: ['software', 'app', 'digital', 'tech'] },
      { name: 'health', keywords: ['health', 'medical', 'doctor', 'patient'] },
      { name: 'finance', keywords: ['money', 'invest', 'finance', 'bank'] },
      { name: 'education', keywords: ['learn', 'course', 'student', 'teach'] },
      { name: 'ecommerce', keywords: ['buy', 'shop', 'product', 'price'] }
    ];
    
    for (const industry of industries) {
      const score = industry.keywords.reduce((sum, keyword) => 
        sum + (textLower.includes(keyword) ? 1 : 0), 0
      ) / industry.keywords.length;
      features.push(score);
    }
    
    // Pad or truncate to 200 dimensions
    while (features.length < 200) features.push(0);
    return features.slice(0, 200);
  }

  private extractNgramFeatures(tokens: string[]): number[] {
    const features: number[] = [];
    const bigrams = new Map<string, number>();
    const trigrams = new Map<string, number>();
    
    // Extract bigrams
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    
    // Extract trigrams
    for (let i = 0; i < tokens.length - 2; i++) {
      const trigram = `${tokens[i]}_${tokens[i + 1]}_${tokens[i + 2]}`;
      trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1);
    }
    
    // Common schema-related n-grams
    const importantBigrams = [
      'how_to', 'step_by', 'by_step', 'product_review', 'best_practices',
      'getting_started', 'complete_guide', 'ultimate_guide', 'for_beginners'
    ];
    
    for (const bigram of importantBigrams) {
      features.push(bigrams.get(bigram) || 0);
    }
    
    // Add general n-gram statistics
    features.push(bigrams.size / tokens.length); // Bigram diversity
    features.push(trigrams.size / tokens.length); // Trigram diversity
    
    // Pad to 200 dimensions
    while (features.length < 200) features.push(0);
    return features.slice(0, 200);
  }

  private extractContextualFeatures(text: string): number[] {
    const features: number[] = [];
    
    // Sentiment indicators
    const positiveWords = ['good', 'great', 'excellent', 'best', 'amazing', 'love'];
    const negativeWords = ['bad', 'poor', 'worst', 'terrible', 'hate', 'awful'];
    
    const textLower = text.toLowerCase();
    const positiveScore = positiveWords.reduce((sum, word) => 
      sum + (textLower.includes(word) ? 1 : 0), 0
    ) / positiveWords.length;
    const negativeScore = negativeWords.reduce((sum, word) => 
      sum + (textLower.includes(word) ? 1 : 0), 0
    ) / negativeWords.length;
    
    features.push(positiveScore);
    features.push(negativeScore);
    
    // Action words (important for HowTo detection)
    const actionWords = ['create', 'make', 'build', 'develop', 'design', 'implement'];
    const actionScore = actionWords.reduce((sum, word) => 
      sum + (textLower.includes(word) ? 1 : 0), 0
    ) / actionWords.length;
    features.push(actionScore);
    
    // Temporal indicators
    const temporalWords = ['today', 'tomorrow', 'yesterday', 'now', 'soon', 'recent'];
    const temporalScore = temporalWords.reduce((sum, word) => 
      sum + (textLower.includes(word) ? 1 : 0), 0
    ) / temporalWords.length;
    features.push(temporalScore);
    
    // Pad to 68 dimensions (to reach 768 total)
    while (features.length < 68) features.push(0);
    return features.slice(0, 68);
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }

  // Calculate cosine similarity between two vectors
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // Find similar embeddings
  async findSimilar(
    queryVector: number[] | string,
    k: number = 5,
    threshold: number = 0.5
  ): Promise<SimilarityResult[]> {
    let vector: number[];
    
    if (typeof queryVector === 'string') {
      // Create embedding from text
      const embedding = await this.createEmbedding(queryVector);
      vector = embedding.vector;
    } else {
      vector = queryVector;
    }
    
    const results: SimilarityResult[] = [];
    
    for (const [id, embedding] of this.embeddings) {
      const similarity = this.cosineSimilarity(vector, embedding.vector);
      
      if (similarity > threshold) {
        results.push({
          id,
          similarity,
          metadata: embedding.metadata
        });
      }
    }
    
    // Sort by similarity and return top k
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  // Semantic search
  async semanticSearch(
    query: string,
    filters?: {
      type?: string;
      source?: string;
      minSimilarity?: number;
    }
  ): Promise<SimilarityResult[]> {
    const queryEmbedding = await this.createEmbedding(query);
    let results = await this.findSimilar(queryEmbedding.vector, 20, filters?.minSimilarity || 0.3);
    
    // Apply filters
    if (filters?.type) {
      results = results.filter(r => r.metadata.type === filters.type);
    }
    if (filters?.source) {
      results = results.filter(r => r.metadata.source === filters.source);
    }
    
    return results;
  }

  // Cluster embeddings
  async clusterEmbeddings(
    numClusters: number = 5
  ): Promise<Map<number, string[]>> {
    const embeddings = Array.from(this.embeddings.entries());
    if (embeddings.length < numClusters) {
      numClusters = embeddings.length;
    }
    
    // K-means clustering
    const centroids = this.initializeCentroids(embeddings, numClusters);
    const clusters = new Map<number, string[]>();
    
    // Iterate until convergence
    for (let iteration = 0; iteration < 50; iteration++) {
      // Clear clusters
      for (let i = 0; i < numClusters; i++) {
        clusters.set(i, []);
      }
      
      // Assign points to clusters
      for (const [id, embedding] of embeddings) {
        let minDistance = Infinity;
        let closestCluster = 0;
        
        for (let i = 0; i < numClusters; i++) {
          const distance = 1 - this.cosineSimilarity(embedding.vector, centroids[i]);
          if (distance < minDistance) {
            minDistance = distance;
            closestCluster = i;
          }
        }
        
        clusters.get(closestCluster)!.push(id);
      }
      
      // Update centroids
      const newCentroids = this.updateCentroids(clusters, embeddings);
      
      // Check convergence
      let converged = true;
      for (let i = 0; i < numClusters; i++) {
        const similarity = this.cosineSimilarity(centroids[i], newCentroids[i]);
        if (similarity < 0.99) {
          converged = false;
          break;
        }
      }
      
      centroids.splice(0, centroids.length, ...newCentroids);
      
      if (converged) break;
    }
    
    return clusters;
  }

  private initializeCentroids(
    embeddings: [string, VectorEmbedding][],
    k: number
  ): number[][] {
    // K-means++ initialization
    const centroids: number[][] = [];
    const indices = new Set<number>();
    
    // Choose first centroid randomly
    const firstIndex = Math.floor(Math.random() * embeddings.length);
    centroids.push([...embeddings[firstIndex][1].vector]);
    indices.add(firstIndex);
    
    // Choose remaining centroids
    for (let i = 1; i < k; i++) {
      const distances: number[] = [];
      let totalDistance = 0;
      
      for (let j = 0; j < embeddings.length; j++) {
        if (indices.has(j)) {
          distances.push(0);
          continue;
        }
        
        let minDistance = Infinity;
        for (const centroid of centroids) {
          const distance = 1 - this.cosineSimilarity(embeddings[j][1].vector, centroid);
          minDistance = Math.min(minDistance, distance);
        }
        
        distances.push(minDistance);
        totalDistance += minDistance;
      }
      
      // Choose next centroid with probability proportional to distance
      let random = Math.random() * totalDistance;
      for (let j = 0; j < embeddings.length; j++) {
        random -= distances[j];
        if (random <= 0 && !indices.has(j)) {
          centroids.push([...embeddings[j][1].vector]);
          indices.add(j);
          break;
        }
      }
    }
    
    return centroids;
  }

  private updateCentroids(
    clusters: Map<number, string[]>,
    embeddings: [string, VectorEmbedding][]
  ): number[][] {
    const newCentroids: number[][] = [];
    const embeddingMap = new Map(embeddings);
    
    for (let i = 0; i < clusters.size; i++) {
      const clusterIds = clusters.get(i) || [];
      if (clusterIds.length === 0) {
        // Keep old centroid if cluster is empty
        newCentroids.push(new Array(this.model.dimension).fill(0));
        continue;
      }
      
      const centroid = new Array(this.model.dimension).fill(0);
      
      for (const id of clusterIds) {
        const embedding = embeddingMap.get(id);
        if (embedding) {
          for (let j = 0; j < this.model.dimension; j++) {
            centroid[j] += embedding.vector[j];
          }
        }
      }
      
      // Average
      for (let j = 0; j < this.model.dimension; j++) {
        centroid[j] /= clusterIds.length;
      }
      
      newCentroids.push(this.normalizeVector(centroid));
    }
    
    return newCentroids;
  }

  // Get embedding by ID
  getEmbedding(id: string): VectorEmbedding | undefined {
    return this.embeddings.get(id);
  }

  // Remove embedding
  removeEmbedding(id: string): boolean {
    return this.embeddings.delete(id);
  }

  // Clear all embeddings
  clearEmbeddings(): void {
    this.embeddings.clear();
  }

  // Export embeddings for storage
  exportEmbeddings(): Array<{
    id: string;
    vector: number[];
    metadata: any;
  }> {
    return Array.from(this.embeddings.entries()).map(([id, embedding]) => ({
      id,
      vector: embedding.vector,
      metadata: embedding.metadata
    }));
  }

  // Import embeddings from storage
  importEmbeddings(data: Array<{
    id: string;
    vector: number[];
    metadata: any;
  }>): void {
    this.embeddings.clear();
    
    for (const item of data) {
      this.embeddings.set(item.id, {
        id: item.id,
        vector: item.vector,
        metadata: item.metadata
      });
    }
  }

  // Compute similarity between two texts
  async computeTextSimilarity(text1: string, text2: string): Promise<number> {
    const embedding1 = await this.createEmbedding(text1, 'temp1');
    const embedding2 = await this.createEmbedding(text2, 'temp2');
    
    const similarity = this.cosineSimilarity(embedding1.vector, embedding2.vector);
    
    // Clean up temporary embeddings
    this.removeEmbedding('temp1');
    this.removeEmbedding('temp2');
    
    return similarity;
  }

  // Find most similar schema type for content
  async recommendSchemaType(content: string): Promise<{
    schemaType: string;
    confidence: number;
  }> {
    // Create embeddings for common schema types if not exists
    const schemaTypes = [
      { type: 'Article', keywords: 'article blog post content writing publication news' },
      { type: 'Product', keywords: 'product item merchandise goods price buy shop cart' },
      { type: 'Recipe', keywords: 'recipe cooking ingredients instructions prep cook time' },
      { type: 'HowTo', keywords: 'how to guide tutorial steps instructions process' },
      { type: 'Review', keywords: 'review rating stars opinion feedback pros cons' },
      { type: 'Event', keywords: 'event conference meeting date time location venue' },
      { type: 'FAQ', keywords: 'faq frequently asked questions answers help support' },
      { type: 'Course', keywords: 'course class lesson education learning curriculum' },
      { type: 'JobPosting', keywords: 'job career position employment hiring salary' },
      { type: 'LocalBusiness', keywords: 'business location hours service contact address' }
    ];
    
    // Ensure schema embeddings exist
    for (const schema of schemaTypes) {
      const id = `schema-type-${schema.type}`;
      if (!this.embeddings.has(id)) {
        await this.createEmbedding(schema.keywords, id);
      }
    }
    
    // Find most similar schema type
    const contentEmbedding = await this.createEmbedding(content);
    const results = await this.findSimilar(
      contentEmbedding.vector,
      schemaTypes.length,
      0
    );
    
    // Filter for schema type embeddings
    const schemaResults = results.filter(r => r.id.startsWith('schema-type-'));
    
    if (schemaResults.length === 0) {
      return { schemaType: 'Article', confidence: 0.5 };
    }
    
    const best = schemaResults[0];
    const schemaType = best.id.replace('schema-type-', '');
    
    return {
      schemaType,
      confidence: best.similarity
    };
  }

  private generateId(): string {
    return `embed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const vectorEmbeddingsEngine = new VectorEmbeddingsEngine();