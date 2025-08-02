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
    
    // Determine schema type based on content analysis
    const schemaType = this.determineSchemaType(analysis);
    
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
          "url": `${urlObj.origin}/logo.png`
        }
      };
    }

    // Add featured image
    if (config.featuredImage) {
      schema.image = {
        "@type": "ImageObject",
        "url": config.featuredImage
      };
    }

    // Add intelligent keywords (not generic terms)
    if (analysis.keywords.length > 0) {
      schema.keywords = analysis.keywords.join(', ');
    }

    // Add audience based on content analysis
    schema.audience = analysis.targetAudience;

    // Add learning outcomes if educational content
    if (analysis.learningOutcomes.length > 0) {
      schema.teaches = analysis.learningOutcomes;
    }

    // Add about - main concepts with proper entities
    if (analysis.mainConcepts.length > 0) {
      schema.about = this.createAboutEntities(analysis.mainConcepts, analysis.entities);
    }

    // Add mentions - secondary entities
    const secondaryEntities = analysis.entities
      .filter(e => !analysis.mainConcepts.includes(e.name))
      .slice(0, 5);
    
    if (secondaryEntities.length > 0) {
      schema.mentions = this.createMentions(secondaryEntities);
    }

    // Add article body for articles
    if (schemaType === 'Article' || schemaType === 'BlogPosting') {
      schema.articleBody = config.content;
      schema.wordCount = config.content.split(/\s+/).filter(w => w.length > 0).length;
    }

    // Add specific properties based on content type
    if (analysis.contentType === 'HowTo') {
      schema['@type'] = ['Article', 'HowTo'];
      this.addHowToProperties(schema, analysis);
    }

    return schema;
  }

  private determineSchemaType(analysis: any): string {
    // Map content types to schema types
    const typeMapping: Record<string, string> = {
      'HowTo': 'Article', // Will add HowTo as secondary type
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

  private createAboutEntities(mainConcepts: string[], entities: any[]): any[] {
    const aboutEntities: any[] = [];
    
    for (const concept of mainConcepts) {
      const entity = entities.find(e => e.name === concept);
      
      if (entity) {
        const aboutEntity: any = {
          "@type": this.getSchemaType(entity),
          "name": entity.name
        };

        // Add WikiData/Wikipedia if high confidence
        if (entity.confidence > 0.85) {
          // For fitness entities
          if (entity.name === 'VO2 Max') {
            aboutEntity["@id"] = "https://www.wikidata.org/wiki/Q917808";
            aboutEntity.sameAs = [
              "https://en.wikipedia.org/wiki/VO2_max",
              "https://www.wikidata.org/wiki/Q917808"
            ];
            aboutEntity.description = "Maximal oxygen consumption during incremental exercise";
          } else if (entity.name === 'HIIT' || entity.name === 'High-Intensity Interval Training') {
            aboutEntity["@id"] = "https://www.wikidata.org/wiki/Q5758792";
            aboutEntity.sameAs = [
              "https://en.wikipedia.org/wiki/High-intensity_interval_training",
              "https://www.wikidata.org/wiki/Q5758792"
            ];
          } else if (entity.name === 'Heart Rate Training Zones') {
            aboutEntity.sameAs = [
              "https://en.wikipedia.org/wiki/Heart_rate#Training_zones"
            ];
          }
          // For cannabis entities
          else if (entity.name === 'Bong') {
            aboutEntity["@id"] = "https://www.wikidata.org/wiki/Q847027";
            aboutEntity.sameAs = [
              "https://en.wikipedia.org/wiki/Bong",
              "https://www.wikidata.org/wiki/Q847027"
            ];
          }
          // For technology entities
          else if (entity.name === 'Odoo') {
            aboutEntity["@id"] = "https://www.wikidata.org/wiki/Q2629990";
            aboutEntity.sameAs = [
              "https://en.wikipedia.org/wiki/Odoo",
              "https://www.wikidata.org/wiki/Q2629990"
            ];
          }
        }

        aboutEntities.push(aboutEntity);
      }
    }
    
    return aboutEntities;
  }

  private createMentions(entities: any[]): any[] {
    return entities.map(entity => {
      const mention: any = {
        "@type": this.getSchemaType(entity),
        "name": entity.name
      };

      // Add context if available
      if (entity.context) {
        mention.description = entity.context;
      }

      return mention;
    });
  }

  private getSchemaType(entity: any): string {
    const typeMapping: Record<string, string> = {
      'concept': 'Thing',
      'product': 'Product',
      'service': 'Service',
      'organization': 'Organization',
      'person': 'Person',
      'location': 'Place',
      'event': 'Event',
      'medical': 'MedicalEntity',
      'fitness': 'SportsActivityLocation' // or 'Thing' with proper context
    };

    return typeMapping[entity.type] || 'Thing';
  }

  private addHowToProperties(schema: any, analysis: any) {
    // Extract steps if it's a how-to article
    const stepPattern = /(?:step\s*\d+|first|second|third|then|next|finally)[\s:]*([^.]+)/gi;
    const steps = [];
    
    let stepMatches;
    while ((stepMatches = stepPattern.exec(analysis.content)) !== null) {
      if (stepMatches[1]) {
        steps.push({
          "@type": "HowToStep",
          "name": stepMatches[1].trim()
        });
      }
    }

    if (steps.length > 0) {
      schema.step = steps;
    }
  }
}

// Export singleton instance
export const enhancedSchemaGenerator = new EnhancedSchemaGenerator();