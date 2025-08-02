/* eslint-disable @typescript-eslint/no-explicit-any */
// app/lib/intelligence/ml-recommendation-engine.ts

interface SchemaRecommendation {
  schemaType: string;
  confidence: number;
  reasoning: string;
  suggestedProperties: string[];
  relatedTypes: string[];
}

interface ContentFeatures {
  hasSteps: boolean;
  hasRatings: boolean;
  hasPrice: boolean;
  hasIngredients: boolean;
  hasInstructions: boolean;
  hasAuthor: boolean;
  hasDate: boolean;
  hasLocation: boolean;
  hasEvent: boolean;
  hasProduct: boolean;
  hasService: boolean;
  hasFAQ: boolean;
  hasHowTo: boolean;
  hasRecipe: boolean;
  hasReview: boolean;
  hasJob: boolean;
  hasCourse: boolean;
  hasVideo: boolean;
  contentLength: number;
  imageCount: number;
  linkDensity: number;
  questionCount: number;
  listCount: number;
}

export class MLRecommendationEngine {
  private schemaTypePatterns!: Map<string, RegExp[]>;
  private schemaTypeFeatures!: Map<string, (features: ContentFeatures) => number>;
  
  constructor() {
    this.initializePatterns();
    this.initializeFeatureScorers();
  }

  private initializePatterns() {
    this.schemaTypePatterns = new Map([
      ['Recipe', [
        /\b(ingredients?|recipe|cooking|baking|preparation)\b/gi,
        /\b(\d+\s*(cups?|tablespoons?|teaspoons?|ounces?|pounds?|grams?))\b/gi,
        /\b(preheat|mix|stir|bake|cook|simmer|boil)\b/gi,
        /\b(serves?|servings?|yield|prep\s*time|cook\s*time)\b/gi
      ]],
      ['HowTo', [
        /\b(how\s+to|tutorial|guide|steps?\s+\d+|instructions?)\b/gi,
        /\b(first|second|third|then|next|finally)\s*[,:]/gi,
        /\b(tools?\s+needed|materials?\s+needed|requirements?)\b/gi
      ]],
      ['Product', [
        /\b(price|cost|buy|purchase|shop|cart|checkout)\b/gi,
        /\b(features?|specifications?|dimensions?|weight|size)\b/gi,
        /\b(in\s+stock|out\s+of\s+stock|availability|shipping)\b/gi,
        /\b(warranty|guarantee|return\s+policy)\b/gi
      ]],
      ['Review', [
        /\b(review|rating|stars?|pros?\s+and\s+cons?|verdict)\b/gi,
        /\b(recommend|would\s+not?\s+recommend|worth|value)\b/gi,
        /\b(comparison|versus|vs\.?|better\s+than|worse\s+than)\b/gi,
        /\b(\d+\s*(?:out\s+of\s+)?\d+\s*stars?)\b/gi
      ]],
      ['Event', [
        /\b(event|conference|meeting|workshop|seminar|webinar)\b/gi,
        /\b(date|time|location|venue|address|tickets?)\b/gi,
        /\b(register|registration|RSVP|attend|join)\b/gi,
        /\b(schedule|agenda|speakers?|presenter)\b/gi
      ]],
      ['FAQ', [
        /\b(frequently\s+asked\s+questions?|FAQ|Q\s*&\s*A)\b/gi,
        /\b(question|answer|ask|respond|reply)\b/gi,
        /^Q:|^A:/gim,
        /\?[\s\S]{1,200}[\.\!]/g
      ]],
      ['JobPosting', [
        /\b(job|position|career|employment|hiring|vacancy)\b/gi,
        /\b(salary|compensation|benefits?|pay|wage)\b/gi,
        /\b(requirements?|qualifications?|experience|skills?)\b/gi,
        /\b(apply|application|resume|CV)\b/gi
      ]],
      ['Course', [
        /\b(course|class|lesson|curriculum|syllabus|module)\b/gi,
        /\b(learn|teach|instructor|student|education)\b/gi,
        /\b(duration|weeks?|hours?|credits?|certificate)\b/gi,
        /\b(enroll|enrollment|register|tuition)\b/gi
      ]],
      ['LocalBusiness', [
        /\b(hours?|open|closed|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
        /\b(address|location|directions?|map|near)\b/gi,
        /\b(contact|phone|email|website)\b/gi,
        /\b(services?|menu|offerings?)\b/gi
      ]],
      ['VideoObject', [
        /\b(video|watch|play|duration|minutes?|seconds?)\b/gi,
        /\b(youtube|vimeo|embed|player|streaming)\b/gi,
        /\b(transcript|captions?|subtitles?)\b/gi,
        /\b(views?|likes?|comments?|share)\b/gi
      ]]
    ]);
  }

  private initializeFeatureScorers() {
    this.schemaTypeFeatures = new Map([
      ['Recipe', (features) => {
        let score = 0;
        if (features.hasIngredients) score += 0.3;
        if (features.hasInstructions) score += 0.3;
        if (features.hasSteps) score += 0.2;
        if (features.imageCount > 0) score += 0.1;
        if (features.listCount > 1) score += 0.1;
        return score;
      }],
      ['HowTo', (features) => {
        let score = 0;
        if (features.hasHowTo) score += 0.3;
        if (features.hasSteps) score += 0.3;
        if (features.hasInstructions) score += 0.2;
        if (features.listCount > 0) score += 0.1;
        if (features.imageCount > 1) score += 0.1;
        return score;
      }],
      ['Product', (features) => {
        let score = 0;
        if (features.hasProduct) score += 0.3;
        if (features.hasPrice) score += 0.3;
        if (features.hasRatings) score += 0.2;
        if (features.imageCount > 0) score += 0.2;
        return score;
      }],
      ['Review', (features) => {
        let score = 0;
        if (features.hasReview) score += 0.3;
        if (features.hasRatings) score += 0.3;
        if (features.hasProduct) score += 0.2;
        if (features.contentLength > 500) score += 0.2;
        return score;
      }],
      ['FAQ', (features) => {
        let score = 0;
        if (features.hasFAQ) score += 0.4;
        if (features.questionCount > 3) score += 0.3;
        if (features.listCount > 0) score += 0.2;
        if (features.contentLength > 300) score += 0.1;
        return score;
      }],
      ['Event', (features) => {
        let score = 0;
        if (features.hasEvent) score += 0.3;
        if (features.hasDate) score += 0.3;
        if (features.hasLocation) score += 0.2;
        if (features.hasPrice) score += 0.2;
        return score;
      }],
      ['JobPosting', (features) => {
        let score = 0;
        if (features.hasJob) score += 0.4;
        if (features.hasLocation) score += 0.2;
        if (features.listCount > 1) score += 0.2;
        if (features.contentLength > 400) score += 0.2;
        return score;
      }],
      ['Course', (features) => {
        let score = 0;
        if (features.hasCourse) score += 0.4;
        if (features.hasPrice) score += 0.2;
        if (features.listCount > 0) score += 0.2;
        if (features.contentLength > 500) score += 0.2;
        return score;
      }],
      ['VideoObject', (features) => {
        let score = 0;
        if (features.hasVideo) score += 0.5;
        if (features.imageCount > 0) score += 0.3;
        if (features.contentLength < 500) score += 0.2;
        return score;
      }]
    ]);
  }

  async recommendSchema(
    content: string, 
    title: string, 
    url: string,
    existingEntities?: any[]
  ): Promise<SchemaRecommendation[]> {
    // Extract features from content
    const features = this.extractFeatures(content, title);
    
    // Score each schema type
    const scores = new Map<string, number>();
    
    // Pattern-based scoring
    for (const [schemaType, patterns] of this.schemaTypePatterns) {
      let patternScore = 0;
      for (const pattern of patterns) {
        const matches = content.match(pattern) || [];
        patternScore += Math.min(matches.length * 0.1, 0.3);
      }
      scores.set(schemaType, patternScore);
    }
    
    // Feature-based scoring
    for (const [schemaType, scorer] of this.schemaTypeFeatures) {
      const featureScore = scorer(features);
      const currentScore = scores.get(schemaType) || 0;
      scores.set(schemaType, currentScore + featureScore);
    }
    
    // URL-based adjustments
    this.adjustScoresBasedOnURL(url, scores);
    
    // Entity-based adjustments
    if (existingEntities && existingEntities.length > 0) {
      this.adjustScoresBasedOnEntities(existingEntities, scores);
    }
    
    // Convert to recommendations
    const recommendations: SchemaRecommendation[] = [];
    
    for (const [schemaType, score] of scores) {
      if (score > 0.3) { // Threshold for recommendation
        recommendations.push({
          schemaType,
          confidence: Math.min(score, 1.0),
          reasoning: this.generateReasoning(schemaType, features, score),
          suggestedProperties: this.getSuggestedProperties(schemaType),
          relatedTypes: this.getRelatedTypes(schemaType)
        });
      }
    }
    
    // Sort by confidence
    recommendations.sort((a, b) => b.confidence - a.confidence);
    
    // Always include Article/BlogPosting as fallback
    if (recommendations.length === 0 || recommendations[0].confidence < 0.5) {
      const fallbackType = url.includes('/blog') ? 'BlogPosting' : 'Article';
      recommendations.unshift({
        schemaType: fallbackType,
        confidence: 0.5,
        reasoning: `Default ${fallbackType} schema based on content structure`,
        suggestedProperties: this.getSuggestedProperties(fallbackType),
        relatedTypes: ['WebPage', 'CreativeWork']
      });
    }
    
    return recommendations.slice(0, 3); // Top 3 recommendations
  }

  private extractFeatures(content: string, title: string): ContentFeatures {
    const text = `${title} ${content}`.toLowerCase();
    
    return {
      hasSteps: /\b(step\s+\d+|first|second|third|then|next|finally)\b/i.test(text),
      hasRatings: /\b(\d+\s*(?:out\s+of\s+)?\d+\s*stars?|rating|review)/i.test(text),
      hasPrice: /\b(\$\d+|price|cost|fee|payment)/i.test(text),
      hasIngredients: /\b(ingredients?|cups?|tablespoons?|teaspoons?)\b/i.test(text),
      hasInstructions: /\b(instructions?|directions?|method|steps?)\b/i.test(text),
      hasAuthor: /\b(author|writer|by\s+[A-Z][a-z]+)\b/i.test(text),
      hasDate: /\b(\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text),
      hasLocation: /\b(address|location|venue|city|state|country|zip)\b/i.test(text),
      hasEvent: /\b(event|conference|meeting|seminar|workshop)\b/i.test(text),
      hasProduct: /\b(product|item|model|brand|manufacturer)\b/i.test(text),
      hasService: /\b(service|offering|solution|consultation)\b/i.test(text),
      hasFAQ: /\b(faq|frequently\s+asked|questions?\s+and\s+answers?)\b/i.test(text),
      hasHowTo: /\b(how\s+to|guide|tutorial|learn)\b/i.test(text),
      hasRecipe: /\b(recipe|cooking|baking|ingredients?)\b/i.test(text),
      hasReview: /\b(review|pros?\s+and\s+cons?|verdict|rating)\b/i.test(text),
      hasJob: /\b(job|position|career|hiring|employment)\b/i.test(text),
      hasCourse: /\b(course|class|lesson|learn|teach)\b/i.test(text),
      hasVideo: /\b(video|watch|play|youtube|vimeo)\b/i.test(text),
      contentLength: content.length,
      imageCount: (content.match(/<img/gi) || []).length,
      linkDensity: ((content.match(/<a/gi) || []).length / (content.split(/\s+/).length || 1)),
      questionCount: (content.match(/\?/g) || []).length,
      listCount: (content.match(/<[uo]l/gi) || []).length
    };
  }

  private adjustScoresBasedOnURL(url: string, scores: Map<string, number>) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('/recipe') || urlLower.includes('/cooking')) {
      this.adjustScore(scores, 'Recipe', 0.3);
    }
    if (urlLower.includes('/review')) {
      this.adjustScore(scores, 'Review', 0.3);
    }
    if (urlLower.includes('/how-to') || urlLower.includes('/guide')) {
      this.adjustScore(scores, 'HowTo', 0.3);
    }
    if (urlLower.includes('/product') || urlLower.includes('/shop')) {
      this.adjustScore(scores, 'Product', 0.3);
    }
    if (urlLower.includes('/event')) {
      this.adjustScore(scores, 'Event', 0.3);
    }
    if (urlLower.includes('/faq') || urlLower.includes('/help')) {
      this.adjustScore(scores, 'FAQ', 0.3);
    }
    if (urlLower.includes('/job') || urlLower.includes('/career')) {
      this.adjustScore(scores, 'JobPosting', 0.3);
    }
    if (urlLower.includes('/course') || urlLower.includes('/learn')) {
      this.adjustScore(scores, 'Course', 0.3);
    }
  }

  private adjustScoresBasedOnEntities(entities: any[], scores: Map<string, number>) {
    const entityTypes = entities.map(e => e.type);
    
    if (entityTypes.includes('product')) {
      this.adjustScore(scores, 'Product', 0.2);
      this.adjustScore(scores, 'Review', 0.1);
    }
    if (entityTypes.includes('event')) {
      this.adjustScore(scores, 'Event', 0.3);
    }
    if (entityTypes.includes('person') && entityTypes.includes('organization')) {
      this.adjustScore(scores, 'JobPosting', 0.2);
    }
    if (entityTypes.includes('location')) {
      this.adjustScore(scores, 'LocalBusiness', 0.2);
      this.adjustScore(scores, 'Event', 0.1);
    }
  }

  private adjustScore(scores: Map<string, number>, schemaType: string, adjustment: number) {
    const currentScore = scores.get(schemaType) || 0;
    scores.set(schemaType, Math.min(currentScore + adjustment, 1.0));
  }

  private generateReasoning(schemaType: string, features: ContentFeatures, score: number): string {
    const reasons: string[] = [];
    
    switch (schemaType) {
      case 'Recipe':
        if (features.hasIngredients) reasons.push('contains ingredients list');
        if (features.hasInstructions) reasons.push('has cooking instructions');
        if (features.listCount > 1) reasons.push('multiple structured lists');
        break;
      case 'HowTo':
        if (features.hasHowTo) reasons.push('contains how-to keywords');
        if (features.hasSteps) reasons.push('has step-by-step instructions');
        if (features.hasInstructions) reasons.push('includes detailed instructions');
        break;
      case 'Product':
        if (features.hasProduct) reasons.push('mentions product details');
        if (features.hasPrice) reasons.push('includes pricing information');
        if (features.imageCount > 0) reasons.push('contains product images');
        break;
      case 'Review':
        if (features.hasReview) reasons.push('contains review keywords');
        if (features.hasRatings) reasons.push('includes ratings');
        if (features.hasProduct) reasons.push('discusses specific products');
        break;
      case 'FAQ':
        if (features.hasFAQ) reasons.push('FAQ section detected');
        if (features.questionCount > 3) reasons.push(`${features.questionCount} questions found`);
        break;
      case 'Event':
        if (features.hasEvent) reasons.push('event-related content');
        if (features.hasDate) reasons.push('includes dates');
        if (features.hasLocation) reasons.push('mentions location');
        break;
      case 'JobPosting':
        if (features.hasJob) reasons.push('job-related keywords');
        if (features.listCount > 1) reasons.push('requirements/qualifications lists');
        break;
      case 'Course':
        if (features.hasCourse) reasons.push('educational content');
        if (features.listCount > 0) reasons.push('structured curriculum');
        break;
      case 'VideoObject':
        if (features.hasVideo) reasons.push('video content detected');
        break;
    }
    
    return `Recommended based on: ${reasons.join(', ')} (confidence: ${(score * 100).toFixed(0)}%)`;
  }

  private getSuggestedProperties(schemaType: string): string[] {
    const propertyMap: Record<string, string[]> = {
      'Recipe': ['name', 'image', 'recipeIngredient', 'recipeInstructions', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'nutrition', 'recipeCategory', 'recipeCuisine'],
      'HowTo': ['name', 'description', 'step', 'totalTime', 'supply', 'tool', 'image', 'video'],
      'Product': ['name', 'description', 'image', 'brand', 'offers', 'aggregateRating', 'review', 'sku', 'mpn', 'category'],
      'Review': ['itemReviewed', 'reviewRating', 'name', 'author', 'datePublished', 'reviewBody', 'publisher'],
      'Event': ['name', 'startDate', 'endDate', 'location', 'image', 'description', 'offers', 'performer', 'organizer'],
      'FAQ': ['mainEntity', 'name', 'acceptedAnswer', 'text'],
      'JobPosting': ['title', 'description', 'datePosted', 'validThrough', 'employmentType', 'hiringOrganization', 'jobLocation', 'baseSalary', 'qualifications', 'responsibilities'],
      'Course': ['name', 'description', 'provider', 'courseCode', 'coursePrerequisites', 'educationalCredentialAwarded', 'hasCourseInstance'],
      'LocalBusiness': ['name', 'address', 'telephone', 'openingHours', 'image', 'priceRange', 'servesCuisine', 'hasMenu'],
      'VideoObject': ['name', 'description', 'thumbnailUrl', 'uploadDate', 'duration', 'embedUrl', 'contentUrl', 'transcript'],
      'Article': ['headline', 'description', 'author', 'datePublished', 'dateModified', 'publisher', 'image', 'articleBody'],
      'BlogPosting': ['headline', 'description', 'author', 'datePublished', 'dateModified', 'publisher', 'image', 'articleBody', 'keywords']
    };
    
    return propertyMap[schemaType] || propertyMap['Article'];
  }

  private getRelatedTypes(schemaType: string): string[] {
    const relatedMap: Record<string, string[]> = {
      'Recipe': ['Article', 'CreativeWork'],
      'HowTo': ['Article', 'CreativeWork'],
      'Product': ['Thing', 'Offer'],
      'Review': ['Article', 'CreativeWork', 'Rating'],
      'Event': ['Thing', 'Place'],
      'FAQ': ['WebPage', 'QAPage'],
      'JobPosting': ['Intangible', 'Organization'],
      'Course': ['CreativeWork', 'EducationalOrganization'],
      'LocalBusiness': ['Organization', 'Place'],
      'VideoObject': ['MediaObject', 'CreativeWork'],
      'Article': ['CreativeWork', 'WebPage'],
      'BlogPosting': ['Article', 'CreativeWork']
    };
    
    return relatedMap[schemaType] || ['Thing'];
  }

  // Method to validate if a schema type is appropriate for content
  async validateSchemaType(
    schemaType: string, 
    content: string, 
    title: string
  ): Promise<{ valid: boolean; confidence: number; issues: string[] }> {
    const features = this.extractFeatures(content, title);
    const scorer = this.schemaTypeFeatures.get(schemaType);
    
    if (!scorer) {
      return { valid: false, confidence: 0, issues: ['Unknown schema type'] };
    }
    
    const score = scorer(features);
    const issues: string[] = [];
    
    // Schema-specific validation
    switch (schemaType) {
      case 'Recipe':
        if (!features.hasIngredients) issues.push('Missing ingredients');
        if (!features.hasInstructions) issues.push('Missing cooking instructions');
        break;
      case 'HowTo':
        if (!features.hasSteps) issues.push('Missing step-by-step instructions');
        break;
      case 'Product':
        if (!features.hasProduct) issues.push('No clear product information');
        break;
      case 'Review':
        if (!features.hasRatings && !features.hasReview) issues.push('Missing review content or ratings');
        break;
      case 'Event':
        if (!features.hasDate) issues.push('Missing event date');
        if (!features.hasLocation) issues.push('Missing event location');
        break;
      case 'FAQ':
        if (features.questionCount < 2) issues.push('Insufficient Q&A pairs');
        break;
    }
    
    return {
      valid: issues.length === 0 && score > 0.3,
      confidence: score,
      issues
    };
  }
}

// Export singleton instance
export const mlRecommendationEngine = new MLRecommendationEngine();