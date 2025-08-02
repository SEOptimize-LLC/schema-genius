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
    
    // Determine schema type based on URL and content analysis
    const schemaType = this.determineSchemaType(analysis, config.url);
    
    const schema: any = {
      "@context": "https://schema.org",
      "@type": schemaType,
      "@id": `${config.url}#${schemaType}`,
      "mainEntityOfPage": config.url,
      "headline": config.title,
      "name": config.title,
      "description": config.description || this.generateDescription(config.content),
      "datePublished": config.publishedDate || new Date().toISOString(),
      "dateModified": config.modifiedDate || config.publishedDate || new Date().toISOString()
    };

    // Add author if available
    if (config.authorName) {
      schema.author = {
        "@type": "Person",
        "name": config.authorName,
        "@id": `${urlObj.origin}/author/${config.authorName.toLowerCase().replace(/\s+/g, '-')}#Person`
      };
    }

    // Add publisher if available
    if (config.organizationName) {
      schema.publisher = {
        "@type": "Organization",
        "name": config.organizationName,
        "@id": urlObj.origin,
        "logo": {
          "@type": "ImageObject",
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
        "url": config.featuredImage,
        "@id": `${config.featuredImage}#image`
      };
    }

    // Add language
    schema.inLanguage = "en-US";

    // Add intelligent keywords (not generic terms)
    if (analysis.keywords.length > 0) {
      schema.keywords = analysis.keywords.join(', ');
    }

    // Add audience based on content analysis
    schema.audience = analysis.targetAudience;

    // Add learning outcomes if educational content - DEDUPLICATED
    const uniqueLearningOutcomes = this.deduplicateLearningOutcomes(analysis.learningOutcomes);
    if (uniqueLearningOutcomes.length > 0 && analysis.contentType === 'HowTo') {
      schema.teaches = uniqueLearningOutcomes;
    }

    // Add about - main concepts with CORRECT entity types
    if (analysis.mainConcepts.length > 0) {
      schema.about = this.createAboutEntities(analysis.mainConcepts, analysis.entities, analysis.industry);
    }

    // Add mentions - secondary entities with CORRECT types
    const secondaryEntities = analysis.entities
      .filter((e: any) => !analysis.mainConcepts.includes(e.name))
      .slice(0, 5);
    
    if (secondaryEntities.length > 0) {
      schema.mentions = this.createMentions(secondaryEntities, analysis.industry);
    }

    // Add article body and word count
    schema.articleBody = config.content;
    schema.wordCount = config.content.split(/\s+/).filter(w => w.length > 0).length;

    // Add specific properties based on URL path (for blog posts)
    if (config.url.includes('/blog') || config.url.includes('/blogs')) {
      const urlParts = urlObj.pathname.split('/').filter(p => p);
      const blogIndex = urlParts.findIndex(p => p.match(/^blogs?$/i));
      if (blogIndex !== -1) {
        const blogPath = urlParts.slice(0, blogIndex + 1).join('/');
        schema.isPartOf = {
          "@type": "Blog",
          "@id": `${urlObj.origin}/${blogPath}/`,
          "name": `${config.organizationName || 'Company'} Blog`,
          "publisher": {
            "@type": "Organization",
            "@id": urlObj.origin
          }
        };
      }
    }

    // Only add HowTo if content is ACTUALLY a how-to guide
    if (analysis.contentType === 'HowTo' && this.isActuallyHowTo(config.content, config.title)) {
      schema['@type'] = ['BlogPosting', 'HowTo'];
      this.addHowToProperties(schema, config.content);
    }

    return schema;
  }

  private determineSchemaType(analysis: any, url: string): string {
    // Check URL patterns first
    if (url.includes('/blog') || url.includes('/blogs') || url.includes('/article')) {
      return 'BlogPosting';
    }
    
    // Then check content type
    const typeMapping: Record<string, string> = {
      'HowTo': 'BlogPosting', // Most how-tos are blog posts
      'Review': 'Review',
      'BlogPosting': 'BlogPosting',
      'ScholarlyArticle': 'ScholarlyArticle',
      'Article': 'Article'
    };

    return typeMapping[analysis.contentType] || 'Article';
  }

  private generateDescription(content: string): string {
    // Get first 2-3 sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    const description = sentences.slice(0, 2).join(' ');
    
    // Limit to 160 characters
    if (description.length > 160) {
      return description.substring(0, 157) + '...';
    }
    
    return description;
  }

  private deduplicateLearningOutcomes(outcomes: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];
    
    for (const outcome of outcomes) {
      const key = outcome.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(outcome);
      }
    }
    
    return unique.slice(0, 5); // Limit to 5 unique outcomes
  }

  private createAboutEntities(mainConcepts: string[], entities: any[], industry: string): any[] {
    const aboutEntities: any[] = [];
    const seen = new Set<string>();
    
    for (const concept of mainConcepts) {
      if (seen.has(concept.toLowerCase())) continue;
      seen.add(concept.toLowerCase());
      
      const entity = entities.find((e: any) => e.name === concept);
      
      if (entity) {
        // Use CORRECT schema types based on what the entity actually is
        const aboutEntity: any = {
          "@type": this.getCorrectSchemaType(entity, industry),
          "name": entity.name
        };

        // Add WikiData/Wikipedia ONLY for well-known entities with CORRECT IDs
        if (entity.confidence > 0.85) {
          const wikiData = this.getCorrectWikiData(entity.name);
          if (wikiData) {
            if (wikiData.id) {
              aboutEntity["@id"] = wikiData.id;
            }
            if (wikiData.sameAs && wikiData.sameAs.length > 0) {
              aboutEntity.sameAs = wikiData.sameAs;
            }
            if (wikiData.description) {
              aboutEntity.description = wikiData.description;
            }
          }
        }

        aboutEntities.push(aboutEntity);
      }
    }
    
    return aboutEntities;
  }

  private createMentions(entities: any[], industry: string): any[] {
    const mentions: any[] = [];
    const seen = new Set<string>();
    
    for (const entity of entities) {
      if (seen.has(entity.name.toLowerCase())) continue;
      seen.add(entity.name.toLowerCase());
      
      const mention: any = {
        "@type": this.getCorrectSchemaType(entity, industry),
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

  private getCorrectSchemaType(entity: any, industry: string): string {
    // Special handling for fitness entities
    if (entity.type === 'fitness' || industry === 'fitness') {
      // These are NOT locations - they are concepts/things
      if (entity.name.includes('VO2') || entity.name.includes('Capacity') || 
          entity.name.includes('Training') || entity.name.includes('Heart Rate')) {
        return 'Thing'; // Generic but correct for fitness concepts
      }
    }
    
    // Standard mapping for other types
    const typeMapping: Record<string, string> = {
      'concept': 'Thing',
      'product': 'Product',
      'service': 'Service',
      'organization': 'Organization',
      'person': 'Person',
      'location': 'Place',
      'event': 'Event',
      'medical': 'MedicalEntity',
      'fitness': 'Thing' // Changed from SportsActivityLocation
    };

    return typeMapping[entity.type] || 'Thing';
  }

  private getCorrectWikiData(entityName: string): { id?: string; sameAs?: string[]; description?: string } | null {
    // Map of entities to their CORRECT Wikidata IDs
    const wikiDataMap: Record<string, { id: string; sameAs: string[]; description?: string }> = {
      'VO2 Max': {
        id: 'https://www.wikidata.org/wiki/Q917808',
        sameAs: [
          'https://en.wikipedia.org/wiki/VO2_max',
          'https://www.wikidata.org/wiki/Q917808'
        ],
        description: 'Maximal oxygen consumption during incremental exercise'
      },
      'High-Intensity Interval Training': {
        id: 'https://www.wikidata.org/wiki/Q5758789',
        sameAs: [
          'https://en.wikipedia.org/wiki/High-intensity_interval_training',
          'https://www.wikidata.org/wiki/Q5758789'
        ]
      },
      'HIIT': {
        id: 'https://www.wikidata.org/wiki/Q5758789',
        sameAs: [
          'https://en.wikipedia.org/wiki/High-intensity_interval_training',
          'https://www.wikidata.org/wiki/Q5758789'
        ]
      },
      'Bong': {
        id: 'https://www.wikidata.org/wiki/Q847027',
        sameAs: [
          'https://en.wikipedia.org/wiki/Bong',
          'https://www.wikidata.org/wiki/Q847027'
        ]
      },
      'Odoo': {
        id: 'https://www.wikidata.org/wiki/Q2629990',
        sameAs: [
          'https://en.wikipedia.org/wiki/Odoo',
          'https://www.wikidata.org/wiki/Q2629990'
        ]
      },
      'ERP': {
        id: 'https://www.wikidata.org/wiki/Q131508',
        sameAs: [
          'https://en.wikipedia.org/wiki/Enterprise_resource_planning',
          'https://www.wikidata.org/wiki/Q131508'
        ]
      }
    };

    return wikiDataMap[entityName] || null;
  }

  private isActuallyHowTo(content: string, title: string): boolean {
    // Check if content actually contains step-by-step instructions
    const howToIndicators = [
      /step\s+\d+/gi,
      /first(?:ly)?[,:\s]/gi,
      /second(?:ly)?[,:\s]/gi,
      /third(?:ly)?[,:\s]/gi,
      /then[,:\s]/gi,
      /next[,:\s]/gi,
      /finally[,:\s]/gi,
      /follow\s+these\s+steps/gi,
      /here's\s+how/gi
    ];
    
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    
    // Must have "how to" in title AND step indicators in content
    const hasHowToTitle = titleLower.includes('how to') || titleLower.includes('guide');
    const hasStepIndicators = howToIndicators.some(pattern => pattern.test(contentLower));
    
    return hasHowToTitle && hasStepIndicators;
  }

  private addHowToProperties(schema: any, content: string) {
    // Extract ACTUAL steps from content
    const steps: any[] = [];
    
    // Look for numbered steps
    const numberedStepPattern = /(?:step\s*)?(\d+)[\s.:)]*([^.!?\n]+[.!?])/gi;
    let matches = Array.from(content.matchAll(numberedStepPattern));
    
    if (matches.length > 0) {
      matches.forEach((match, index) => {
        steps.push({
          "@type": "HowToStep",
          "position": index + 1,
          "name": `Step ${index + 1}`,
          "text": match[2].trim()
        });
      });
    } else {
      // Look for sequential indicators
      const sequentialPattern = /(?:first|second|third|then|next|finally)[\s,:]([^.!?\n]+[.!?])/gi;
      matches = Array.from(content.matchAll(sequentialPattern));
      
      matches.forEach((match, index) => {
        steps.push({
          "@type": "HowToStep",
          "position": index + 1,
          "name": `Step ${index + 1}`,
          "text": match[1].trim()
        });
      });
    }

    if (steps.length > 0) {
      schema.step = steps;
    }
    
    // Add estimated time if mentioned
    const timePattern = /(?:takes?|requires?|needs?)\s*(?:about\s*)?(\d+)\s*(minutes?|hours?)/i;
    const timeMatch = content.match(timePattern);
    if (timeMatch) {
      const duration = `PT${timeMatch[1]}${timeMatch[2].charAt(0).toUpperCase()}`;
      schema.totalTime = duration;
    }
  }
}

// Export singleton instance
export const enhancedSchemaGenerator = new EnhancedSchemaGenerator();