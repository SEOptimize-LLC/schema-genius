/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/lib/intelligence/advanced-nlp-features.ts

interface SentimentAnalysis {
  overall: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number; // -1 to 1
  confidence: number;
  aspects: {
    aspect: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
  }[];
}

interface NamedEntity {
  text: string;
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'PRODUCT' | 'EVENT' | 'TECHNOLOGY';
  startIndex: number;
  endIndex: number;
  confidence: number;
  metadata?: {
    subtype?: string;
    normalizedValue?: string;
    linkedEntity?: string;
  };
}

interface EntityRelation {
  subject: NamedEntity;
  predicate: string;
  object: NamedEntity;
  confidence: number;
  context: string;
}

interface Topic {
  name: string;
  keywords: string[];
  weight: number;
  coherence: number;
}

interface SemanticSimilarityResult {
  similarity: number;
  alignedPhrases: Array<{
    phrase1: string;
    phrase2: string;
    similarity: number;
  }>;
}

export class AdvancedNLPFeatures {
  private sentimentLexicon!: Map<string, number>;
  private entityPatterns!: Map<string, RegExp[]>;
  private relationPatterns!: Map<string, RegExp[]>;
  
  constructor() {
    this.initializeSentimentLexicon();
    this.initializeEntityPatterns();
    this.initializeRelationPatterns();
  }

  private initializeSentimentLexicon() {
    this.sentimentLexicon = new Map([
      // Positive words
      ['excellent', 0.9], ['amazing', 0.9], ['wonderful', 0.8], ['fantastic', 0.8],
      ['great', 0.7], ['good', 0.6], ['nice', 0.5], ['positive', 0.5],
      ['love', 0.8], ['perfect', 0.9], ['best', 0.8], ['happy', 0.7],
      ['recommend', 0.6], ['enjoy', 0.6], ['satisfied', 0.7], ['impressed', 0.7],
      
      // Negative words
      ['terrible', -0.9], ['awful', -0.9], ['horrible', -0.8], ['bad', -0.7],
      ['poor', -0.6], ['disappointed', -0.7], ['hate', -0.8], ['worst', -0.9],
      ['useless', -0.8], ['broken', -0.7], ['failed', -0.7], ['disappointing', -0.7],
      
      // Neutral/modifier words
      ['okay', 0.1], ['average', 0], ['mediocre', -0.2], ['fine', 0.2],
      
      // Intensifiers
      ['very', 1.5], ['extremely', 2], ['really', 1.5], ['absolutely', 2],
      ['completely', 1.8], ['totally', 1.8], ['quite', 1.3], ['somewhat', 0.8],
      
      // Negations
      ['not', -1], ['never', -1], ['no', -1], ['nothing', -1],
      ['neither', -1], ['nor', -1], ['cannot', -1], ['none', -1]
    ]);
  }

  private initializeEntityPatterns() {
    this.entityPatterns = new Map([
      ['PERSON', [
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g,
        /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
        /\b([A-Z][a-z]+)\s+(?:said|says|stated|announced|explained)\b/g
      ]],
      ['ORGANIZATION', [
        /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Inc\.|LLC|Ltd\.|Corp\.|Corporation|Company)\b/g,
        /\b(?:The\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Institute|University|College|Foundation|Association)\b/g,
        /\b([A-Z]{2,})\b/g // Acronyms
      ]],
      ['LOCATION', [
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+)\b/g, // City, State
        /\b(?:in|at|from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Street|Avenue|Road|Boulevard|Drive|Lane|Way)\b/g
      ]],
      ['DATE', [
        /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
        /\b(today|tomorrow|yesterday|next\s+week|last\s+week|next\s+month|last\s+month)\b/gi,
        /\b(\d{4})\b/g // Years
      ]],
      ['MONEY', [
        /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\b/g,
        /\b(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars?|USD|EUR|GBP)\b/gi,
        /\b(?:costs?|prices?|fees?)\s+(?:of\s+)?(\$?\d+(?:,\d{3})*(?:\.\d{2})?)\b/gi
      ]],
      ['PRODUCT', [
        /\b([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+)*)\s+(?:model|version|edition)\b/g,
        /\b(?:buy|purchase|order)\s+(?:the\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+)*)\b/g,
        /\b([A-Z][a-zA-Z]+\s+\d+[a-zA-Z]*)\b/g // Product with model number
      ]],
      ['EVENT', [
        /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Conference|Summit|Meeting|Symposium|Workshop|Seminar)\b/g,
        /\b(?:attend|join|register\s+for)\s+(?:the\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+)*)\b/g
      ]],
      ['TECHNOLOGY', [
        /\b(AI|ML|IoT|API|SDK|SaaS|PaaS|IaaS)\b/g,
        /\b([A-Z][a-zA-Z]+(?:JS|DB|SQL|XML|JSON|API|SDK))\b/g,
        /\b(?:using|with|powered\s+by)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+)*)\b/g
      ]]
    ]);
  }

  private initializeRelationPatterns() {
    this.relationPatterns = new Map([
      ['works_for', [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:works?\s+(?:for|at)|employed\s+by)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+(?:CEO|CTO|CFO|founder|director|manager)\s+(?:of|at)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g
      ]],
      ['located_in', [
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:is\s+)?(?:located|based|headquartered)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
      ]],
      ['acquired_by', [
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:acquired|bought|purchased)\s+(?:by\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g,
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:acquires?|buys?|purchases?)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g
      ]],
      ['founded_by', [
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:was\s+)?founded\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+founded\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g
      ]],
      ['produces', [
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:produces?|manufactures?|makes?|creates?)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+)*)/g
      ]]
    ]);
  }

  // Sentiment Analysis
  async analyzeSentiment(text: string): Promise<SentimentAnalysis> {
    const sentences = this.splitIntoSentences(text);
    const aspects: any[] = [];
    let totalScore = 0;
    let sentenceCount = 0;
    
    for (const sentence of sentences) {
      const sentenceScore = this.calculateSentenceSentiment(sentence);
      totalScore += sentenceScore;
      sentenceCount++;
      
      // Extract aspect-based sentiment
      const aspectSentiment = this.extractAspectSentiment(sentence);
      aspects.push(...aspectSentiment);
    }
    
    const averageScore = sentenceCount > 0 ? totalScore / sentenceCount : 0;
    const overall = this.classifySentiment(averageScore);
    
    // Check if mixed sentiment
    const hasMixed = aspects.some(a => a.sentiment === 'positive') && 
                     aspects.some(a => a.sentiment === 'negative');
    
    return {
      overall: hasMixed ? 'mixed' : overall,
      score: averageScore,
      confidence: this.calculateSentimentConfidence(text, averageScore),
      aspects: aspects.slice(0, 10) // Top 10 aspects
    };
  }

  private calculateSentenceSentiment(sentence: string): number {
    const tokens = this.tokenize(sentence.toLowerCase());
    let score = 0;
    let modifierStack: number[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const sentiment = this.sentimentLexicon.get(token);
      
      if (sentiment !== undefined) {
        if (sentiment > 1 || sentiment < -1) {
          // It's a modifier
          modifierStack.push(sentiment);
        } else {
          // It's a sentiment word
          let finalScore = sentiment;
          
          // Apply modifiers
          for (const modifier of modifierStack) {
            if (modifier === -1) {
              // Negation
              finalScore *= -1;
            } else {
              // Intensifier
              finalScore *= modifier;
            }
          }
          
          score += finalScore;
          modifierStack = []; // Clear modifiers after use
        }
      }
    }
    
    // Normalize score
    return Math.max(-1, Math.min(1, score / tokens.length));
  }

  private extractAspectSentiment(sentence: string): any[] {
    const aspects: any[] = [];
    const aspectKeywords = [
      'quality', 'price', 'service', 'delivery', 'support',
      'performance', 'design', 'features', 'usability', 'value'
    ];
    
    const sentenceLower = sentence.toLowerCase();
    for (const aspect of aspectKeywords) {
      if (sentenceLower.includes(aspect)) {
        // Find sentiment words near the aspect
        const nearbyScore = this.calculateNearbysentiment(sentence, aspect);
        if (nearbyScore !== 0) {
          aspects.push({
            aspect,
            sentiment: this.classifySentiment(nearbyScore),
            score: nearbyScore
          });
        }
      }
    }
    
    return aspects;
  }

  private calculateNearbysentiment(sentence: string, aspect: string): number {
    const tokens = this.tokenize(sentence.toLowerCase());
    const aspectIndex = tokens.indexOf(aspect);
    if (aspectIndex === -1) return 0;
    
    let score = 0;
    const windowSize = 5; // Look at 5 words before and after
    
    for (let i = Math.max(0, aspectIndex - windowSize); 
         i < Math.min(tokens.length, aspectIndex + windowSize + 1); i++) {
      if (i !== aspectIndex) {
        const sentiment = this.sentimentLexicon.get(tokens[i]);
        if (sentiment && sentiment <= 1 && sentiment >= -1) {
          // Distance decay
          const distance = Math.abs(i - aspectIndex);
          score += sentiment / distance;
        }
      }
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  private classifySentiment(score: number): 'positive' | 'negative' | 'neutral' {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  private calculateSentimentConfidence(text: string, score: number): number {
    // Confidence based on text length and score magnitude
    const lengthFactor = Math.min(1, text.length / 500);
    const scoreFactor = Math.abs(score);
    return (lengthFactor + scoreFactor) / 2;
  }

  // Named Entity Recognition
  async recognizeEntities(text: string): Promise<NamedEntity[]> {
    const entities: NamedEntity[] = [];
    const foundEntities = new Set<string>();
    
    for (const [entityType, patterns] of this.entityPatterns) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern);
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          const entityText = match[1] || match[0];
          const entityKey = `${entityText}-${entityType}`;
          
          if (!foundEntities.has(entityKey) && this.isValidEntity(entityText, entityType)) {
            foundEntities.add(entityKey);
            
            const entity: NamedEntity = {
              text: entityText,
              type: entityType as any,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
              confidence: this.calculateEntityConfidence(entityText, entityType, text),
              metadata: this.extractEntityMetadata(entityText, entityType)
            };
            
            entities.push(entity);
          }
        }
      }
    }
    
    // Post-process and merge overlapping entities
    return this.postProcessEntities(entities);
  }

  private isValidEntity(text: string, type: string): boolean {
    // Filter out common false positives
    const invalidPatterns: Record<string, RegExp[]> = {
      'PERSON': [/^(The|This|That|These|Those|A|An)$/i],
      'ORGANIZATION': [/^[A-Z]{1}$/], // Single letter
      'LOCATION': [/^(In|At|From|To)$/i]
    };
    
    const patterns = invalidPatterns[type];
    if (patterns) {
      return !patterns.some(pattern => pattern.test(text));
    }
    
    return text.length > 1;
  }

  private calculateEntityConfidence(text: string, type: string, context: string): number {
    let confidence = 0.7; // Base confidence
    
    // Adjust based on entity type and characteristics
    switch (type) {
      case 'PERSON':
        if (text.split(' ').length >= 2) confidence += 0.1;
        if (/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)/.test(context)) confidence += 0.15;
        break;
      case 'ORGANIZATION':
        if (text.includes('Inc.') || text.includes('LLC')) confidence += 0.2;
        if (text.length > 20) confidence -= 0.1; // Very long names less likely
        break;
      case 'DATE':
        if (/\d{4}/.test(text)) confidence += 0.1;
        break;
      case 'MONEY':
        if (text.includes('$')) confidence += 0.15;
        break;
    }
    
    return Math.min(0.95, confidence);
  }

  private extractEntityMetadata(text: string, type: string): any {
    const metadata: any = {};
    
    switch (type) {
      case 'DATE':
        // Try to parse and normalize date
        const date = new Date(text);
        if (!isNaN(date.getTime())) {
          metadata.normalizedValue = date.toISOString();
        }
        break;
      case 'MONEY':
        // Extract numeric value
        const amount = text.replace(/[$,]/g, '');
        const numericValue = parseFloat(amount);
        if (!isNaN(numericValue)) {
          metadata.normalizedValue = numericValue;
        }
        break;
      case 'ORGANIZATION':
        // Extract org type
        if (text.includes('University')) metadata.subtype = 'educational';
        else if (text.includes('Inc.') || text.includes('LLC')) metadata.subtype = 'company';
        else if (text.includes('Foundation')) metadata.subtype = 'nonprofit';
        break;
    }
    
    return metadata;
  }

  private postProcessEntities(entities: NamedEntity[]): NamedEntity[] {
    // Sort by start index
    entities.sort((a, b) => a.startIndex - b.startIndex);
    
    // Merge overlapping entities, keeping the one with higher confidence
    const merged: NamedEntity[] = [];
    let lastEntity: NamedEntity | null = null;
    
    for (const entity of entities) {
      if (!lastEntity || entity.startIndex >= lastEntity.endIndex) {
        merged.push(entity);
        lastEntity = entity;
      } else if (entity.confidence > lastEntity.confidence) {
        // Replace with higher confidence entity
        merged[merged.length - 1] = entity;
        lastEntity = entity;
      }
    }
    
    return merged;
  }

  // Relationship Extraction
  async extractRelationships(text: string, entities: NamedEntity[]): Promise<EntityRelation[]> {
    const relations: EntityRelation[] = [];
    const entityMap = new Map<string, NamedEntity>();
    
    // Create entity map for quick lookup
    for (const entity of entities) {
      entityMap.set(entity.text.toLowerCase(), entity);
    }
    
    // Pattern-based extraction
    for (const [relationType, patterns] of this.relationPatterns) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern);
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          const subject = this.findEntity(match[1], entityMap);
          const object = this.findEntity(match[2], entityMap);
          
          if (subject && object) {
            relations.push({
              subject,
              predicate: relationType,
              object,
              confidence: 0.8,
              context: match[0]
            });
          }
        }
      }
    }
    
    // Dependency-based extraction (simplified)
    const dependencyRelations = this.extractDependencyRelations(text, entities);
    relations.push(...dependencyRelations);
    
    return this.deduplicateRelations(relations);
  }

  private findEntity(text: string, entityMap: Map<string, NamedEntity>): NamedEntity | null {
    const normalized = text.toLowerCase();
    
    // Exact match
    if (entityMap.has(normalized)) {
      return entityMap.get(normalized)!;
    }
    
    // Partial match
    for (const [key, entity] of entityMap) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return entity;
      }
    }
    
    return null;
  }

  private extractDependencyRelations(text: string, entities: NamedEntity[]): EntityRelation[] {
    const relations: EntityRelation[] = [];
    const sentences = this.splitIntoSentences(text);
    
    for (const sentence of sentences) {
      // Find entities in sentence
      const sentenceEntities = entities.filter(e => 
        e.startIndex >= text.indexOf(sentence) && 
        e.endIndex <= text.indexOf(sentence) + sentence.length
      );
      
      if (sentenceEntities.length >= 2) {
        // Simple verb-based relation extraction
        const verbs = this.extractVerbs(sentence);
        
        for (let i = 0; i < sentenceEntities.length - 1; i++) {
          for (let j = i + 1; j < sentenceEntities.length; j++) {
            const verb = this.findVerbBetween(
              sentence,
              sentenceEntities[i].text,
              sentenceEntities[j].text,
              verbs
            );
            
            if (verb) {
              relations.push({
                subject: sentenceEntities[i],
                predicate: verb,
                object: sentenceEntities[j],
                confidence: 0.6,
                context: sentence
              });
            }
          }
        }
      }
    }
    
    return relations;
  }

  private extractVerbs(sentence: string): string[] {
    // Simple verb extraction - in production, use POS tagging
    const verbPatterns = [
      /\b(is|are|was|were|has|have|had)\b/gi,
      /\b(\w+(?:s|ed|ing))\b/gi
    ];
    
    const verbs: string[] = [];
    for (const pattern of verbPatterns) {
      const matches = sentence.match(pattern) || [];
      verbs.push(...matches);
    }
    
    return verbs;
  }

  private findVerbBetween(
    sentence: string,
    entity1: string,
    entity2: string,
    verbs: string[]
  ): string | null {
    const index1 = sentence.indexOf(entity1);
    const index2 = sentence.indexOf(entity2);
    
    if (index1 === -1 || index2 === -1) return null;
    
    const start = Math.min(index1, index2);
    const end = Math.max(index1, index2);
    const between = sentence.substring(start, end);
    
    for (const verb of verbs) {
      if (between.includes(verb)) {
        return verb;
      }
    }
    
    return null;
  }

  private deduplicateRelations(relations: EntityRelation[]): EntityRelation[] {
    const unique = new Map<string, EntityRelation>();
    
    for (const relation of relations) {
      const key = `${relation.subject.text}-${relation.predicate}-${relation.object.text}`;
      if (!unique.has(key) || relation.confidence > unique.get(key)!.confidence) {
        unique.set(key, relation);
      }
    }
    
    return Array.from(unique.values());
  }

  // Topic Modeling
  async extractTopics(
    documents: string[],
    numTopics: number = 5
  ): Promise<Topic[]> {
    // Simple LDA-like topic modeling
    const vocabulary = this.buildVocabulary(documents);
    const docTermMatrix = this.createDocumentTermMatrix(documents, vocabulary);
    const topics = this.performTopicModeling(docTermMatrix, vocabulary, numTopics);
    
    return topics;
  }

  private buildVocabulary(documents: string[]): string[] {
    const termFreq = new Map<string, number>();
    const docFreq = new Map<string, number>();
    
    for (const doc of documents) {
      const tokens = this.tokenize(doc.toLowerCase());
      const uniqueTokens = new Set<string>();
      
      for (const token of tokens) {
        if (this.isValidTerm(token)) {
          termFreq.set(token, (termFreq.get(token) || 0) + 1);
          uniqueTokens.add(token);
        }
      }
      
      // Document frequency
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }
    
    // Filter vocabulary based on frequency
    const minDf = Math.max(2, documents.length * 0.1);
    const maxDf = documents.length * 0.9;
    
    return Array.from(termFreq.keys())
      .filter(term => {
        const df = docFreq.get(term) || 0;
        return df >= minDf && df <= maxDf;
      })
      .sort((a, b) => (termFreq.get(b) || 0) - (termFreq.get(a) || 0))
      .slice(0, 1000); // Top 1000 terms
  }

  private createDocumentTermMatrix(
    documents: string[],
    vocabulary: string[]
  ): number[][] {
    const vocabIndex = new Map<string, number>();
    vocabulary.forEach((term, i) => vocabIndex.set(term, i));
    
    const matrix: number[][] = [];
    
    for (const doc of documents) {
      const vector = new Array(vocabulary.length).fill(0);
      const tokens = this.tokenize(doc.toLowerCase());
      
      for (const token of tokens) {
        const index = vocabIndex.get(token);
        if (index !== undefined) {
          vector[index]++;
        }
      }
      
      matrix.push(vector);
    }
    
    return matrix;
  }

  private performTopicModeling(
    docTermMatrix: number[][],
    vocabulary: string[],
    numTopics: number
  ): Topic[] {
    // Simplified NMF (Non-negative Matrix Factorization)
    const topics: Topic[] = [];
    const numDocs = docTermMatrix.length;
    const numTerms = vocabulary.length;
    
    // Initialize topic-term matrix randomly
    const topicTermMatrix: number[][] = [];
    for (let t = 0; t < numTopics; t++) {
      const topicVector = [];
      for (let v = 0; v < numTerms; v++) {
        topicVector.push(Math.random());
      }
      topicTermMatrix.push(this.normalizeVector(topicVector));
    }
    
    // Simple iteration to refine topics
    for (let iter = 0; iter < 20; iter++) {
      // Update topics based on document assignments
      for (let t = 0; t < numTopics; t++) {
        const newTopicVector = new Array(numTerms).fill(0);
        
        for (let d = 0; d < numDocs; d++) {
          const docSimilarity = this.cosineSimilarity(
            docTermMatrix[d],
            topicTermMatrix[t]
          );
          
          for (let v = 0; v < numTerms; v++) {
            newTopicVector[v] += docTermMatrix[d][v] * docSimilarity;
          }
        }
        
        topicTermMatrix[t] = this.normalizeVector(newTopicVector);
      }
    }
    
    // Extract topics
    for (let t = 0; t < numTopics; t++) {
      const topTermIndices = this.getTopIndices(topicTermMatrix[t], 10);
      const keywords = topTermIndices.map(i => vocabulary[i]);
      
      topics.push({
        name: this.generateTopicName(keywords),
        keywords,
        weight: 1 / numTopics,
        coherence: this.calculateTopicCoherence(keywords, docTermMatrix, vocabulary)
      });
    }
    
    return topics;
  }

  private generateTopicName(keywords: string[]): string {
    // Use first few keywords as topic name
    return keywords.slice(0, 3).join(', ');
  }

  private calculateTopicCoherence(
    keywords: string[],
    docTermMatrix: number[][],
    vocabulary: string[]
  ): number {
    // Simple coherence: average co-occurrence of keyword pairs
    const vocabIndex = new Map<string, number>();
    vocabulary.forEach((term, i) => vocabIndex.set(term, i));
    
    let totalCoherence = 0;
    let pairCount = 0;
    
    for (let i = 0; i < keywords.length - 1; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const index1 = vocabIndex.get(keywords[i]);
        const index2 = vocabIndex.get(keywords[j]);
        
        if (index1 !== undefined && index2 !== undefined) {
          let coOccurrence = 0;
          
          for (const doc of docTermMatrix) {
            if (doc[index1] > 0 && doc[index2] > 0) {
              coOccurrence++;
            }
          }
          
          totalCoherence += coOccurrence / docTermMatrix.length;
          pairCount++;
        }
      }
    }
    
    return pairCount > 0 ? totalCoherence / pairCount : 0;
  }

  // Semantic Similarity Scoring
  async computeSemanticSimilarity(
    text1: string,
    text2: string
  ): Promise<SemanticSimilarityResult> {
    // Tokenize and extract key phrases
    const phrases1 = this.extractKeyPhrases(text1);
    const phrases2 = this.extractKeyPhrases(text2);
    
    // Compute overall similarity
    const overallSimilarity = this.computeTextSimilarity(text1, text2);
    
    // Find aligned phrases
    const alignedPhrases: any[] = [];
    for (const phrase1 of phrases1) {
      let bestMatch = { phrase: '', similarity: 0 };
      
      for (const phrase2 of phrases2) {
        const similarity = this.computePhraseSimilarity(phrase1, phrase2);
        if (similarity > bestMatch.similarity) {
          bestMatch = { phrase: phrase2, similarity };
        }
      }
      
      if (bestMatch.similarity > 0.5) {
        alignedPhrases.push({
          phrase1,
          phrase2: bestMatch.phrase,
          similarity: bestMatch.similarity
        });
      }
    }
    
    return {
      similarity: overallSimilarity,
      alignedPhrases: alignedPhrases.slice(0, 10)
    };
  }

  private extractKeyPhrases(text: string): string[] {
    const phrases: string[] = [];
    const sentences = this.splitIntoSentences(text);
    
    for (const sentence of sentences) {
      // Extract noun phrases (simplified)
      const nounPhrasePattern = /\b([A-Z]?[a-z]+(?:\s+[A-Z]?[a-z]+){0,3})\b/g;
      const matches = sentence.match(nounPhrasePattern) || [];
      
      for (const match of matches) {
        if (this.isKeyPhrase(match)) {
          phrases.push(match);
        }
      }
    }
    
    // Rank phrases by TF-IDF
    return this.rankPhrases(phrases, text).slice(0, 20);
  }

  private isKeyPhrase(phrase: string): boolean {
    const words = phrase.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    
    // Filter out phrases with too many stop words
    const stopwordCount = words.filter(w => this.isStopword(w)).length;
    return stopwordCount < words.length / 2;
  }

  private rankPhrases(phrases: string[], text: string): string[] {
    const phraseScores = new Map<string, number>();
    
    for (const phrase of phrases) {
      const tf = (text.match(new RegExp(phrase, 'gi')) || []).length;
      const idf = Math.log(1000 / (tf + 1)); // Simplified IDF
      phraseScores.set(phrase, tf * idf);
    }
    
    return Array.from(new Set(phrases))
      .sort((a, b) => (phraseScores.get(b) || 0) - (phraseScores.get(a) || 0));
  }

  private computeTextSimilarity(text1: string, text2: string): number {
    const tokens1 = this.tokenize(text1.toLowerCase());
    const tokens2 = this.tokenize(text2.toLowerCase());
    
    // Jaccard similarity
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    const jaccard = intersection.size / union.size;
    
    // Cosine similarity
    const freq1 = this.getTermFrequencies(tokens1);
    const freq2 = this.getTermFrequencies(tokens2);
    const cosine = this.computeCosineSimilarity(freq1, freq2);
    
    // Combine similarities
    return (jaccard + cosine) / 2;
  }

  private computePhraseSimilarity(phrase1: string, phrase2: string): number {
    const words1 = phrase1.toLowerCase().split(/\s+/);
    const words2 = phrase2.toLowerCase().split(/\s+/);
    
    // Word overlap
    const overlap = words1.filter(w => words2.includes(w)).length;
    const avgLength = (words1.length + words2.length) / 2;
    
    return overlap / avgLength;
  }

  private getTermFrequencies(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    return freq;
  }

  private computeCosineSimilarity(
    freq1: Map<string, number>,
    freq2: Map<string, number>
  ): number {
    const terms = new Set([...freq1.keys(), ...freq2.keys()]);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (const term of terms) {
      const f1 = freq1.get(term) || 0;
      const f2 = freq2.get(term) || 0;
      dotProduct += f1 * f2;
      norm1 += f1 * f1;
      norm2 += f2 * f2;
    }
    
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // Helper methods
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  private isStopword(word: string): boolean {
    const stopwords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are',
      'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'shall', 'can', 'need', 'ought', 'to', 'of', 'in', 'for', 'with'
    ]);
    return stopwords.has(word.toLowerCase());
  }

  private isValidTerm(term: string): boolean {
    return term.length > 2 && 
           term.length < 20 && 
           !this.isStopword(term) &&
           !/^\d+$/.test(term);
  }

  private normalizeVector(vector: number[]): number[] {
    const sum = vector.reduce((a, b) => a + b, 0);
    if (sum === 0) return vector;
    return vector.map(v => v / sum);
  }

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

  private getTopIndices(vector: number[], k: number): number[] {
    const indexed = vector.map((value, index) => ({ value, index }));
    indexed.sort((a, b) => b.value - a.value);
    return indexed.slice(0, k).map(item => item.index);
  }
}

// Export singleton instance
export const advancedNLPFeatures = new AdvancedNLPFeatures();