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
  private stopwords: Set<string>;
  
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
    const neg

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