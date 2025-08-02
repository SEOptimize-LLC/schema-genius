// app/lib/intelligence/nlp-engine.ts
import { removeStopwords, eng } from 'stopword';

interface ExtractedEntity {
  name: string;
  type: 'concept' | 'product' | 'service' | 'organization' | 'person' | 'location' | 'event' | 'medical' | 'fitness';
  confidence: number;
  context: string;
  synonyms?: string[];
  category?: string;
  wikidata_id?: string;
  wikipedia_url?: string;
}

interface ContentAnalysis {
  entities: ExtractedEntity[];
  topics: string[];
  keywords: string[];
  contentType: string;
  industry: string;
  targetAudience: any;
  learningOutcomes: any[];
  mainConcepts: string[];
}

export class NLPEngine {
  private industryPatterns: Map<string, RegExp[]>;
  private conceptPatterns: Map<string, RegExp[]>;
  
  constructor() {
    this.initializePatterns();
  }

  private initializePatterns() {
    // Industry-specific patterns
    this.industryPatterns = new Map([
      ['fitness', [
        /\b(vo2\s*max|aerobic\s*capacity|cardiovascular\s*fitness)\b/gi,
        /\b(hiit|high[\s-]intensity\s*interval\s*training)\b/gi,
        /\b(strength\s*training|resistance\s*training|weight\s*training)\b/gi,
        /\b(endurance|stamina|conditioning)\b/gi,
        /\b(workout|exercise|training\s*program)\b/gi,
        /\b(fitness\s*goals?|performance|athletic)\b/gi,
        /\b(heart\s*rate|zones?|threshold)\b/gi,
        /\b(recovery|rest\s*days?|adaptation)\b/gi
      ]],
      ['cannabis', [
        /\b(bong|water\s*pipe|bubbler|dab\s*rig)\b/gi,
        /\b(cannabis|marijuana|hemp|thc|cbd)\b/gi,
        /\b(smoking|vaping|consumption)\b/gi,
        /\b(strain|indica|sativa|hybrid)\b/gi
      ]],
      ['technology', [
        /\b(software|application|platform|system)\b/gi,
        /\b(api|integration|automation)\b/gi,
        /\b(data|analytics|metrics)\b/gi,
        /\b(cloud|saas|infrastructure)\b/gi
      ]],
      ['education', [
        /\b(learning|education|training|course)\b/gi,
        /\b(student|teacher|instructor|educator)\b/gi,
        /\b(curriculum|lesson|module)\b/gi,
        /\b(assessment|evaluation|feedback)\b/gi
      ]]
    ]);

    // Concept extraction patterns
    this.conceptPatterns = new Map([
      ['fitness_concepts', [
        /\b(aerobic\s*threshold|lactate\s*threshold|anaerobic\s*threshold)\b/gi,
        /\b(max(?:imum)?\s*heart\s*rate|heart\s*rate\s*zones?)\b/gi,
        /\b(interval\s*training|steady[\s-]state\s*cardio)\b/gi,
        /\b(progressive\s*overload|periodization)\b/gi
      ]],
      ['measurement_concepts', [
        /\b(vo2\s*max|maximal\s*oxygen\s*(?:consumption|uptake))\b/gi,
        /\b(metabolic\s*rate|metabolism)\b/gi,
        /\b(body\s*composition|muscle\s*mass|body\s*fat)\b/gi
      ]]
    ]);
  }

  async analyzeContent(content: string, title: string, url?: string): Promise<ContentAnalysis> {
    const industry = this.detectIndustry(content, title);
    const contentType = this.detectContentType(content, title, url);
    
    // Extract entities with context
    const entities = await this.extractEntities(content, industry);
    
    // Extract meaningful keywords (not generic words)
    const keywords = this.extractKeywords(content, entities);
    
    // Determine topics based on content
    const topics = this.extractTopics(content, industry);
    
    // Analyze target audience
    const targetAudience = this.analyzeAudience(content, industry, entities);
    
    // Extract learning outcomes
    const learningOutcomes = this.extractLearningOutcomes(content, entities);
    
    // Identify main concepts
    const mainConcepts = this.identifyMainConcepts(entities, content);
    
    return {
      entities,
      topics,
      keywords,
      contentType,
      industry,
      targetAudience,
      learningOutcomes,
      mainConcepts
    };
  }

  private detectIndustry(content: string, title: string): string {
    const text = `${title} ${content}`.toLowerCase();
    const industryCounts = new Map<string, number>();
    
    for (const [industry, patterns] of this.industryPatterns) {
      let count = 0;
      for (const pattern of patterns) {
        const matches = text.match(pattern) || [];
        count += matches.length;
      }
      industryCounts.set(industry, count);
    }
    
    // Return industry with highest match count
    let maxCount = 0;
    let detectedIndustry = 'general';
    
    for (const [industry, count] of industryCounts) {
      if (count > maxCount) {
        maxCount = count;
        detectedIndustry = industry;
      }
    }
    
    return detectedIndustry;
  }

  private detectContentType(content: string, title: string, url?: string): string {
    const text = `${title} ${content}`.toLowerCase();
    
    if (text.includes('how to') || text.includes('guide') || text.includes('tutorial')) {
      return 'HowTo';
    } else if (text.includes('review') || text.includes('comparison')) {
      return 'Review';
    } else if (url?.includes('/blog') || url?.includes('/news')) {
      return 'BlogPosting';
    } else if (text.includes('research') || text.includes('study')) {
      return 'ScholarlyArticle';
    }
    
    return 'Article';
  }

  private async extractEntities(content: string, industry: string): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];
    const foundEntities = new Set<string>();
    
    // Extract fitness-specific entities
    if (industry === 'fitness') {
      // VO2 Max and related concepts
      const vo2Patterns = [
        { pattern: /\bvo2\s*max\b/gi, name: 'VO2 Max', type: 'fitness' as const },
        { pattern: /\bmaximal\s*oxygen\s*(?:consumption|uptake)\b/gi, name: 'VO2 Max', type: 'fitness' as const },
        { pattern: /\baerobic\s*capacity\b/gi, name: 'Aerobic Capacity', type: 'fitness' as const }
      ];
      
      for (const { pattern, name, type } of vo2Patterns) {
        const matches = content.match(pattern);
        if (matches && !foundEntities.has(name.toLowerCase())) {
          foundEntities.add(name.toLowerCase());
          entities.push({
            name,
            type,
            confidence: 0.95,
            context: 'cardiovascular fitness measurement',
            synonyms: ['maximal oxygen consumption', 'aerobic capacity'],
            category: 'fitness_metric'
          });
        }
      }
      
      // Training methods
      const trainingPatterns = [
        { pattern: /\bhigh[\s-]intensity\s*interval\s*training\b/gi, name: 'HIIT', full: 'High-Intensity Interval Training' },
        { pattern: /\bhiit\b/gi, name: 'HIIT', full: 'High-Intensity Interval Training' },
        { pattern: /\bsteady[\s-]state\s*cardio\b/gi, name: 'Steady-State Cardio', full: 'Steady-State Cardiovascular Training' },
        { pattern: /\binterval\s*training\b/gi, name: 'Interval Training', full: 'Interval Training' },
        { pattern: /\bendurance\s*training\b/gi, name: 'Endurance Training', full: 'Endurance Training' }
      ];
      
      for (const { pattern, name, full } of trainingPatterns) {
        const matches = content.match(pattern);
        if (matches && !foundEntities.has(name.toLowerCase())) {
          foundEntities.add(name.toLowerCase());
          entities.push({
            name: full,
            type: 'fitness',
            confidence: 0.9,
            context: 'training methodology',
            category: 'training_method'
          });
        }
      }
      
      // Heart rate zones
      const zonePattern = /\b(?:heart\s*rate\s*)?zones?\s*(\d+|one|two|three|four|five)\b/gi;
      const zoneMatches = content.match(zonePattern);
      if (zoneMatches && !foundEntities.has('heart rate zones')) {
        foundEntities.add('heart rate zones');
        entities.push({
          name: 'Heart Rate Training Zones',
          type: 'fitness',
          confidence: 0.85,
          context: 'training intensity measurement',
          category: 'training_concept'
        });
      }
    }
    
    // Extract cannabis-specific entities
    if (industry === 'cannabis') {
      const cannabisPatterns = [
        { pattern: /\bbongs?\b/gi, name: 'Bong', type: 'product' as const },
        { pattern: /\bwater\s*pipes?\b/gi, name: 'Water Pipe', type: 'product' as const },
        { pattern: /\bbubblers?\b/gi, name: 'Bubbler', type: 'product' as const },
        { pattern: /\bpercolators?\b/gi, name: 'Percolator', type: 'product' as const },
        { pattern: /\bborosilicate\s*glass\b/gi, name: 'Borosilicate Glass', type: 'product' as const },
        { pattern: /\bsilicone\s*(?:pipes?|bongs?)\b/gi, name: 'Silicone', type: 'product' as const }
      ];
      
      for (const { pattern, name, type } of cannabisPatterns) {
        const matches = content.match(pattern);
        if (matches && !foundEntities.has(name.toLowerCase())) {
          foundEntities.add(name.toLowerCase());
          entities.push({
            name,
            type,
            confidence: 0.9,
            context: 'cannabis consumption device',
            category: 'smoking_device'
          });
        }
      }
    }
    
    // Technology entities
    if (industry === 'technology') {
      const techPatterns = [
        { pattern: /\bodoo\b/gi, name: 'Odoo', type: 'product' as const },
        { pattern: /\berp\b/gi, name: 'ERP', type: 'concept' as const },
        { pattern: /\bcustomization\b/gi, name: 'Software Customization', type: 'service' as const }
      ];
      
      for (const { pattern, name, type } of techPatterns) {
        const matches = content.match(pattern);
        if (matches && !foundEntities.has(name.toLowerCase())) {
          foundEntities.add(name.toLowerCase());
          entities.push({
            name,
            type,
            confidence: 0.85,
            context: 'enterprise software',
            category: 'technology'
          });
        }
      }
    }
    
    return entities.sort((a, b) => b.confidence - a.confidence);
  }

  private extractKeywords(content: string, entities: ExtractedEntity[]): string[] {
    // Start with entity names
    const keywords = new Set<string>();
    
    // Add high-confidence entity names
    entities
      .filter(e => e.confidence > 0.8)
      .forEach(e => {
        keywords.add(e.name);
        // Add category as keyword if meaningful
        if (e.category && !e.category.includes('_')) {
          keywords.add(e.category.replace(/_/g, ' '));
        }
      });
    
    // Extract noun phrases that aren't already entities
    const nounPhrasePattern = /\b([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,2})\b/g;
    const nounPhrases = content.match(nounPhrasePattern) || [];
    
    const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
    
    for (const phrase of nounPhrases) {
      if (phrase.length > 3 && 
          !entityNames.has(phrase.toLowerCase()) &&
          !this.isGenericPhrase(phrase)) {
        keywords.add(phrase);
      }
    }
    
    // Convert to array and limit
    return Array.from(keywords).slice(0, 10);
  }

  private isGenericPhrase(phrase: string): boolean {
    const genericWords = [
      'the', 'this', 'that', 'these', 'those', 'very', 'much', 'many',
      'some', 'from', 'with', 'high', 'low', 'good', 'bad', 'best',
      'improve', 'effective', 'zone', 'for', 'work', 'recovery'
    ];
    
    const words = phrase.toLowerCase().split(/\s+/);
    return words.every(word => genericWords.includes(word));
  }

  private extractTopics(content: string, industry: string): string[] {
    const topics: string[] = [];
    
    if (industry === 'fitness') {
      const fitnessTopics = [
        { pattern: /cardiovascular\s*fitness/gi, topic: 'Cardiovascular Fitness' },
        { pattern: /endurance\s*training/gi, topic: 'Endurance Training' },
        { pattern: /performance\s*improvement/gi, topic: 'Athletic Performance' },
        { pattern: /fitness\s*assessment/gi, topic: 'Fitness Testing' },
        { pattern: /training\s*zones?/gi, topic: 'Training Intensity' }
      ];
      
      for (const { pattern, topic } of fitnessTopics) {
        if (pattern.test(content) && !topics.includes(topic)) {
          topics.push(topic);
        }
      }
    }
    
    return topics;
  }

  private analyzeAudience(content: string, industry: string, entities: ExtractedEntity[]): any {
    const contentLower = content.toLowerCase();
    
    if (industry === 'fitness') {
      // Look for fitness-specific audience indicators
      if (contentLower.includes('athlete') || contentLower.includes('performance')) {
        return {
          "@type": "Audience",
          "audienceType": "athletes and fitness enthusiasts",
          "suggestedMinAge": 16,
          "suggestedGender": "unisex"
        };
      } else if (contentLower.includes('beginner') || contentLower.includes('start')) {
        return {
          "@type": "Audience",
          "audienceType": "fitness beginners"
        };
      } else {
        return {
          "@type": "Audience",
          "audienceType": "fitness enthusiasts",
          "suggestedMinAge": 18
        };
      }
    }
    
    if (industry === 'cannabis') {
      return {
        "@type": "Audience",
        "audienceType": "cannabis consumers",
        "suggestedMinAge": 21,
        "geographicArea": {
          "@type": "AdministrativeArea",
          "name": "Areas where cannabis is legal"
        }
      };
    }
    
    if (industry === 'technology') {
      return {
        "@type": "BusinessAudience",
        "audienceType": "business decision makers"
      };
    }
    
    return {
      "@type": "Audience",
      "audienceType": "general audience"
    };
  }

  private extractLearningOutcomes(content: string, entities: ExtractedEntity[]): any[] {
    const outcomes: any[] = [];
    
    // Look for specific learning patterns
    const learningPatterns = [
      /how to ([^.!?]+)/gi,
      /you(?:'ll| will) learn (?:about |to )?([^.!?]+)/gi,
      /understand(?:ing)? ([^.!?]+)/gi,
      /improve(?:ing)? (?:your )?([^.!?]+)/gi,
      /master(?:ing)? ([^.!?]+)/gi
    ];
    
    const foundOutcomes = new Set<string>();
    
    for (const pattern of learningPatterns) {
      const matches = Array.from(content.matchAll(pattern));
      for (const match of matches) {
        if (match[1]) {
          const outcome = this.cleanLearningOutcome(match[1]);
          if (outcome && !foundOutcomes.has(outcome.toLowerCase())) {
            foundOutcomes.add(outcome.toLowerCase());
            
            // Create proper learning outcome
            outcomes.push({
              "@type": "DefinedTerm",
              "name": this.createOutcomeName(outcome, entities),
              "description": this.createOutcomeDescription(outcome, entities)
            });
          }
        }
      }
    }
    
    // Add entity-based learning outcomes
    for (const entity of entities.filter(e => e.confidence > 0.85)) {
      if (entity.type === 'fitness' || entity.type === 'concept') {
        outcomes.push({
          "@type": "DefinedTerm",
          "name": entity.name,
          "description": `Understanding and application of ${entity.name.toLowerCase()} in ${entity.context || 'practice'}`
        });
      }
    }
    
    return outcomes.slice(0, 5);
  }

  private cleanLearningOutcome(outcome: string): string {
    // Remove stop words and clean up
    const cleaned = outcome
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|up|about|into|through|during|before|after|above|below|between|under|over)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Skip if too short or too long
    if (cleaned.length < 10 || cleaned.length > 100) {
      return '';
    }
    
    return cleaned;
  }

  private createOutcomeName(outcome: string, entities: ExtractedEntity[]): string {
    // Try to match with entities
    for (const entity of entities) {
      if (outcome.toLowerCase().includes(entity.name.toLowerCase())) {
        return entity.name;
      }
    }
    
    // Otherwise, create a concise name
    const words = outcome.split(' ').filter(w => w.length > 2);
    return words.slice(0, 4).map(w => 
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
  }

  private createOutcomeDescription(outcome: string, entities: ExtractedEntity[]): string {
    // Find relevant entity context
    for (const entity of entities) {
      if (outcome.toLowerCase().includes(entity.name.toLowerCase())) {
        return `Practical knowledge and application of ${entity.name} for ${entity.context || 'improved performance'}`;
      }
    }
    
    return `Practical understanding and application of ${outcome.toLowerCase()}`;
  }

  private identifyMainConcepts(entities: ExtractedEntity[], content: string): string[] {
    // Count entity mentions
    const entityMentions = new Map<string, number>();
    
    for (const entity of entities) {
      const pattern = new RegExp(`\\b${entity.name}\\b`, 'gi');
      const matches = content.match(pattern) || [];
      entityMentions.set(entity.name, matches.length);
    }
    
    // Sort by frequency and confidence
    return entities
      .filter(e => (entityMentions.get(e.name) || 0) > 2 && e.confidence > 0.8)
      .sort((a, b) => {
        const freqA = entityMentions.get(a.name) || 0;
        const freqB = entityMentions.get(b.name) || 0;
        return (freqB * b.confidence) - (freqA * a.confidence);
      })
      .map(e => e.name)
      .slice(0, 5);
  }
}

// Export singleton instance
export const nlpEngine = new NLPEngine();