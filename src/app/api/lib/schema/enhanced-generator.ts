/* eslint-disable @typescript-eslint/no-explicit-any */
// app/lib/schema/enhanced-generator.ts
import { nlpEngine } from '../intelligence/nlp-engine';

interface SchemaGenerationConfig {
  url: string;
  title: string;
  description: string;
  content: string;
  organizationName?: string;
  authorName?: string;
  featuredImage?: string;
  publishedDate?: string;
  modifiedDate?: string;
}

export class EnhancedSchemaGenerator {
  async generateSchema(config: SchemaGenerationConfig) {
    // Analyze content with NLP engine
    const analysis = await nlpEngine.analyzeContent(
      config.content,
      config.title,
      config.url
    );
    
    // Build schema based on analysis
    const schema = this.buildSchema(config, analysis);
    
    return schema;
  }

  private buildSchema(config: SchemaGenerationConfig, analysis: any) {
    const urlObj = new URL(config.url);
    
    // Always use BlogPosting for blog URLs
    let schemaType = 'Article';
    if (config.url.includes('/blog') || config.url.includes('/blogs')) {
      schemaType = 'BlogPosting';
    } else if (analysis.contentType === 'Review') {
      schemaType = 'Review';
    } else if (analysis.contentType === 'ScholarlyArticle') {
      schemaType = 'ScholarlyArticle';
    }
    
    const schema: any = {
      "@context": "https://schema.org",
      "@type": schemaType,
      "@id": `${config.url}#${schemaType}`,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": config.url
      },
      "headline": config.title,
      "name": config.title,
      "description": config.description || this.generateDescription(config.content),
      "articleBody": config.content,
      "wordCount": config.content.split(/\s+/).filter(w => w.length > 0).length,
      "datePublished": config.publishedDate || new Date().toISOString(),
      "dateModified": config.modifiedDate || config.publishedDate || new Date().toISOString(),
      "inLanguage": "en-US"
    };

    // Add abstract for longer content
    if (config.content.length > 500) {
      const sentences = config.content.match(/[^.!?]+[.!?]+/g) || [];
      schema.abstract = sentences.slice(0, 3).join(' ').substring(0, 300) + '...';
    }

    // Add author if available
    if (config.authorName) {
      schema.author = {
        "@type": "Person",
        "@id": `${urlObj.origin}/author/${config.authorName.toLowerCase().replace(/\s+/g, '-')}#Person`,
        "name": config.authorName,
        "url": `${urlObj.origin}/author/${config.authorName.toLowerCase().replace(/\s+/g, '-')}`
      };
    }

    // Add publisher if available
    if (config.organizationName) {
      schema.publisher = {
        "@type": "Organization",
        "@id": `${urlObj.origin}#Organization`,
        "name": config.organizationName,
        "url": urlObj.origin,
        "logo": {
          "@type": "ImageObject",
          "@id": `${urlObj.origin}/logo.png#logo`,
          "url": `${urlObj.origin}/logo.png`,
          "width": "600",
          "height": "60"
        }
      };
    }

    // Add featured image
    if (config.featuredImage) {
      schema.image = {
        "@type": "ImageObject",
        "@id": `${config.featuredImage}#primaryimage`,
        "url": config.featuredImage
      };
    }

    // Add intelligent keywords (not generic terms)
    if (analysis.keywords && analysis.keywords.length > 0) {
      schema.keywords = analysis.keywords.join(', ');
    }

    // Add audience based on content analysis
    if (analysis.targetAudience) {
      schema.audience = analysis.targetAudience;
    }

    // Add isPartOf for blog posts
    if (schemaType === 'BlogPosting' && config.organizationName) {
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      const blogIndex = pathParts.findIndex(p => p.match(/^blogs?$/i));
      if (blogIndex !== -1) {
        const blogPath = pathParts.slice(0, blogIndex + 1).join('/');
        schema.isPartOf = {
          "@type": "Blog",
          "@id": `${urlObj.origin}/${blogPath}/#Blog`,
          "name": `${config.organizationName} Blog`,
          "description": `The official blog of ${config.organizationName}`,
          "publisher": {
            "@type": "Organization",
            "@id": `${urlObj.origin}#Organization`
          }
        };
      }
    }

    // Add about - main concepts WITHOUT Wikidata
    if (analysis.mainConcepts && analysis.mainConcepts.length > 0) {
      schema.about = this.createAboutEntities(analysis.mainConcepts, analysis.entities);
    }

    // Add mentions - secondary entities
    const secondaryEntities = analysis.entities
      .filter((e: any) => !analysis.mainConcepts.includes(e.name))
      .slice(0, 10);
    
    if (secondaryEntities.length > 0) {
      schema.mentions = this.createMentions(secondaryEntities);
    }

    // Only add teaches if content is educational
    if (analysis.learningOutcomes && analysis.learningOutcomes.length > 0 && 
        (config.title.toLowerCase().includes('how to') || 
         config.title.toLowerCase().includes('guide') ||
         config.content.toLowerCase().includes('learn'))) {
      // Deduplicate learning outcomes
      const uniqueOutcomes = this.deduplicateLearningOutcomes(analysis.learningOutcomes);
      if (uniqueOutcomes.length > 0) {
        schema.teaches = uniqueOutcomes;
      }
    }

    // Add topics if available
    if (analysis.topics && analysis.topics.length > 0) {
      // Add topics to about if not already there
      const aboutNames = schema.about ? schema.about.map((a: any) => a.name.toLowerCase()) : [];
      const additionalTopics = analysis.topics.filter((t: string) => 
        !aboutNames.includes(t.toLowerCase())
      );
      
      if (additionalTopics.length > 0) {
        if (!schema.about) schema.about = [];
        additionalTopics.forEach((topic: string) => {
          schema.about.push({
            "@type": "Thing",
            "name": topic
          });
        });
      }
    }

    // Only add HowTo steps if this is TRULY a how-to guide
    if (this.isRealHowToContent(config.title, config.content)) {
      const steps = this.extractRealSteps(config.content);
      if (steps.length > 2 && steps.length < 20) { // Reasonable number of steps
        schema['@type'] = [schemaType, 'HowTo'];
        schema.step = steps;
        
        // Add time estimate if found
        const timeEstimate = this.extractTimeEstimate(config.content);
        if (timeEstimate) {
          schema.totalTime = timeEstimate;
        }
      }
    }

    return schema;
  }

  private generateDescription(content: string): string {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    const description = sentences.slice(0, 2).join(' ');
    
    if (description.length > 160) {
      return description.substring(0, 157) + '...';
    }
    
    return description;
  }

  private deduplicateLearningOutcomes(outcomes: any[]): any[] {
    const seen = new Map<string, any>();
    
    for (const outcome of outcomes) {
      const key = outcome.name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, outcome);
      }
    }
    
    return Array.from(seen.values()).slice(0, 5);
  }

  private createAboutEntities(mainConcepts: string[], entities: any[]): any[] {
    const aboutEntities: any[] = [];
    const seen = new Set<string>();
    
    for (const concept of mainConcepts) {
      if (seen.has(concept.toLowerCase())) continue;
      seen.add(concept.toLowerCase());
      
      const entity = entities.find((e: any) => e.name === concept);
      
      if (entity) {
        const aboutEntity: any = {
          "@type": this.getProperSchemaType(entity),
          "name": entity.name
        };

        // Only add Wikipedia links (no Wikidata)
        if (entity.confidence > 0.85) {
          const wikipediaUrl = this.getWikipediaUrl(entity.name);
          if (wikipediaUrl) {
            aboutEntity.sameAs = [wikipediaUrl];
          }
        }

        // Add description if available
        if (entity.context) {
          aboutEntity.description = entity.context;
        }

        aboutEntities.push(aboutEntity);
      }
    }
    
    return aboutEntities;
  }

  private createMentions(entities: any[]): any[] {
    const mentions: any[] = [];
    const seen = new Set<string>();
    
    for (const entity of entities) {
      if (seen.has(entity.name.toLowerCase())) continue;
      seen.add(entity.name.toLowerCase());
      
      const mention: any = {
        "@type": this.getProperSchemaType(entity),
        "name": entity.name
      };

      // Add context if available
      if (entity.context) {
        mention.description = entity.context;
      }

      mentions.push(mention);
    }
    
    return mentions;
  }

  private getProperSchemaType(entity: any): string {
    // Map entity types to proper Schema.org types
    const typeMapping: Record<string, string> = {
      'concept': 'Thing',
      'product': 'Product',
      'service': 'Service',
      'organization': 'Organization',
      'person': 'Person',
      'location': 'Place',
      'event': 'Event',
      'medical': 'MedicalEntity',
      'fitness': 'Thing', // Generic Thing for fitness concepts
      'material': 'Product' // Materials are products
    };

    return typeMapping[entity.type] || 'Thing';
  }

  private getWikipediaUrl(entityName: string): string | null {
    // Map of known entities to their Wikipedia URLs
    const wikipediaMap: Record<string, string> = {
      'VO2 Max': 'https://en.wikipedia.org/wiki/VO2_max',
      'High-Intensity Interval Training': 'https://en.wikipedia.org/wiki/High-intensity_interval_training',
      'HIIT': 'https://en.wikipedia.org/wiki/High-intensity_interval_training',
      'Bong': 'https://en.wikipedia.org/wiki/Bong',
      'Odoo': 'https://en.wikipedia.org/wiki/Odoo',
      'ERP': 'https://en.wikipedia.org/wiki/Enterprise_resource_planning',
      'Borosilicate Glass': 'https://en.wikipedia.org/wiki/Borosilicate_glass',
      'Cannabis': 'https://en.wikipedia.org/wiki/Cannabis',
      'Hydroxyapatite': 'https://en.wikipedia.org/wiki/Hydroxyapatite'
    };

    return wikipediaMap[entityName] || null;
  }

  private isRealHowToContent(title: string, content: string): boolean {
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // Must have "how to" in title
    if (!titleLower.includes('how to') && !titleLower.includes('step-by-step')) {
      return false;
    }
    
    // Must have step indicators in content
    const stepIndicators = [
      /step\s+\d+/gi,
      /\d+\.\s+[A-Z]/g, // Numbered lists
      /first(?:ly)?[,:\s]+[A-Z]/gi,
      /second(?:ly)?[,:\s]+[A-Z]/gi,
      /then[,:\s]+[A-Z]/gi,
      /next[,:\s]+[A-Z]/gi,
      /finally[,:\s]+[A-Z]/gi
    ];
    
    let indicatorCount = 0;
    for (const pattern of stepIndicators) {
      if (pattern.test(content)) {
        indicatorCount++;
      }
    }
    
    // Need at least 2 different step indicators
    return indicatorCount >= 2;
  }

  private extractRealSteps(content: string): any[] {
    const steps: any[] = [];
    const seenSteps = new Set<string>();
    
    // First try numbered steps
    const numberedPattern = /(?:step\s*)?(\d+)[\s.:)]+([A-Z][^.!?\n]+[.!?])/gi;
    const numberedMatches = Array.from(content.matchAll(numberedPattern));
    
    if (numberedMatches.length > 0) {
      numberedMatches.forEach((match, index) => {
        const stepText = match[2].trim();
        if (!seenSteps.has(stepText.toLowerCase()) && stepText.length > 20) {
          seenSteps.add(stepText.toLowerCase());
          steps.push({
            "@type": "HowToStep",
            "position": parseInt(match[1]) || (index + 1),
            "name": `Step ${match[1]}`,
            "text": stepText
          });
        }
      });
    }
    
    // If no numbered steps, try sequential words
    if (steps.length === 0) {
      const sequentialPattern = /(first|second|third|fourth|fifth|then|next|after that|finally)[\s,:]([A-Z][^.!?\n]+[.!?])/gi;
      const sequentialMatches = Array.from(content.matchAll(sequentialPattern));
      
      sequentialMatches.forEach((match, index) => {
        const stepText = match[2].trim();
        if (!seenSteps.has(stepText.toLowerCase()) && stepText.length > 20) {
          seenSteps.add(stepText.toLowerCase());
          steps.push({
            "@type": "HowToStep",
            "position": index + 1,
            "name": `Step ${index + 1}`,
            "text": stepText
          });
        }
      });
    }
    
    // Sort by position and limit to reasonable number
    return steps
      .sort((a, b) => a.position - b.position)
      .slice(0, 15); // Max 15 steps
  }

  private extractTimeEstimate(content: string): string | null {
    const timePatterns = [
      /(?:takes?|requires?|needs?)\s*(?:about\s*)?(\d+)\s*(minutes?|hours?|days?)/i,
      /(?:completed?\s+in|done\s+in)\s*(?:about\s*)?(\d+)\s*(minutes?|hours?|days?)/i,
      /(\d+)\s*(minutes?|hours?|days?)\s+(?:to\s+complete|total)/i
    ];
    
    for (const pattern of timePatterns) {
      const match = content.match(pattern);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        // Convert to ISO 8601 duration
        if (unit.startsWith('minute')) {
          return `PT${value}M`;
        } else if (unit.startsWith('hour')) {
          return `PT${value}H`;
        } else if (unit.startsWith('day')) {
          return `P${value}D`;
        }
      }
    }
    
    return null;
  }
}

// Export singleton instance
export const enhancedSchemaGenerator = new EnhancedSchemaGenerator();