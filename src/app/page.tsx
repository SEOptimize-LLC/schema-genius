/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/page.tsx
'use client';

import { useState, useEffect } from 'react';

interface SchemaType {
  "@context": string;
  "@type"?: string | string[];
  "@graph"?: any[];
  url?: string;
  name?: string;
  description?: string;
  keywords?: string;
  author?: any;
  publisher?: any;
  mainEntity?: any;
  mentions?: any[];
  about?: any[];
  [key: string]: any;
}

interface Entity {
  name: string;
  type: string;
  confidence: number;
  sameAs?: string[];
}

interface ProcessedURL {
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  title?: string;
  schema?: SchemaType;
  entities?: Entity[];
  error?: string;
}

export default function Home() {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [singleUrl, setSingleUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [processedUrls, setProcessedUrls] = useState<ProcessedURL[]>([]);
  const [currentSchema, setCurrentSchema] = useState<SchemaType | null>(null);
  const [scrapedContent, setScrapedContent] = useState<any>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualContent, setManualContent] = useState({
    title: '',
    description: '',
    content: ''
  });

  // Clear cache when switching between URLs
  useEffect(() => {
    // Clear scraped content when URL changes
    setScrapedContent(null);
    setCurrentSchema(null);
    setManualMode(false);
    setManualContent({ title: '', description: '', content: '' });
  }, [singleUrl]);

  // Helper function to clean and filter schema properties
  const cleanSchemaProperty = (value: any): any => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    if (Array.isArray(value) && value.length === 0) return undefined;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleaned: any = {};
      let hasValidProperty = false;
      
      for (const key in value) {
        const cleanedValue = cleanSchemaProperty(value[key]);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
          hasValidProperty = true;
        }
      }
      
      return hasValidProperty ? cleaned : undefined;
    }
    return value;
  };

  // Helper function to determine audience - universal approach
  const determineAudience = (content: string, entities: Entity[]): any => {
    const contentLower = content.toLowerCase();
    
    // Check for audience indicators
    if (contentLower.includes('parent') || contentLower.includes('child') || contentLower.includes('kids')) {
      return {
        "@type": "ParentAudience",
        "audienceType": "parents"
      };
    } else if (contentLower.includes('patient') || contentLower.includes('medical') || contentLower.includes('health')) {
      return {
        "@type": "PeopleAudience", 
        "audienceType": "patients"
      };
    } else if (contentLower.includes('business') || contentLower.includes('professional') || contentLower.includes('enterprise')) {
      return {
        "@type": "BusinessAudience",
        "audienceType": "business professionals"
      };
    } else if (contentLower.includes('student') || contentLower.includes('education') || contentLower.includes('learning')) {
      return {
        "@type": "EducationalAudience",
        "audienceType": "students"
      };
    } else if (contentLower.includes('developer') || contentLower.includes('programmer') || contentLower.includes('coding')) {
      return {
        "@type": "Audience",
        "audienceType": "developers"
      };
    } else if (contentLower.includes('researcher') || contentLower.includes('academic') || contentLower.includes('scientific')) {
      return {
        "@type": "Researcher",
        "audienceType": "researchers"
      };
    }
    
    // Default to general audience
    return {
      "@type": "Audience",
      "audienceType": "general public"
    };
  };
  
  // Helper function to determine what the article teaches
  const determineTeaches = (content: string, entities: Entity[]): any[] => {
    const teaches: any[] = [];
    const contentLower = content.toLowerCase();
    
    // Look for specific learning patterns in the content
    const learningPatterns = [
      /how to ([^.!?]+)/gi,
      /learn(?:ing)? (?:about |to )?([^.!?]+)/gi,
      /understand(?:ing)? ([^.!?]+)/gi,
      /guide to ([^.!?]+)/gi,
      /benefits of ([^.!?]+)/gi,
      /why ([^.!?]+) (?:is|are) important/gi,
      /choosing the (?:best |right )?([^.!?]+)/gi,
      /(?:tips|advice) (?:for |on )?([^.!?]+)/gi
    ];
    
    learningPatterns.forEach(pattern => {
      const matches = Array.from(contentLower.matchAll(pattern));
      matches.forEach(match => {
        if (match[1] && match[1].length < 100) {
          teaches.push({
            "@type": "DefinedTerm",
            "name": match[1].trim().split(' ').map(w => 
              w.charAt(0).toUpperCase() + w.slice(1)
            ).join(' '),
            "description": `Understanding ${match[1].trim()}`
          });
        }
      });
    });
    
    // Add main topic entities as learning outcomes (only the most relevant ones)
    const mainTopics = entities
      .filter(e => e.confidence > 0.85 && e.type !== 'brand' && e.type !== 'person')
      .slice(0, 3);
    
    mainTopics.forEach(entity => {
      // Check if this entity is actually discussed in detail
      const entityMentions = (content.toLowerCase().match(new RegExp(`\\b${entity.name.toLowerCase()}\\b`, 'g')) || []).length;
      if (entityMentions > 2) {
        teaches.push({
          "@type": "DefinedTerm",
          "name": entity.name,
          "description": `Comprehensive understanding of ${entity.name.toLowerCase()} and its applications`
        });
      }
    });
    
    // Remove duplicates
    const uniqueTeaches = teaches.filter((item, index, self) =>
      index === self.findIndex((t) => t.name === item.name)
    );
    
    return uniqueTeaches.slice(0, 5); // Limit to 5 most relevant
  };

  // Enhanced entity extraction with better keyword detection
  const extractEntities = (text: string): Entity[] => {
    const entities: Entity[] = [];
    const foundEntities = new Map<string, Entity>();
    
    // Ensure we have sufficient text content
    if (!text || text.length < 100) {
      console.warn('Insufficient content for entity extraction');
      return [];
    }
    
    // Extract important multi-word concepts and phrases
    const importantPhrases = [
      // Extract noun phrases (simplified pattern)
      ...Array.from(text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,2})\b/g), m => m[1]),
      // Extract compound terms with hyphens
      ...Array.from(text.matchAll(/\b([a-z]+-[a-z]+(?:-[a-z]+)?)\b/gi), m => m[1]),
      // Extract terms in quotes
      ...Array.from(text.matchAll(/"([^"]+)"/g), m => m[1]),
      ...Array.from(text.matchAll(/'([^']+)'/g), m => m[1])
    ];
    
    // Process each phrase
    importantPhrases.forEach(phrase => {
      const normalized = phrase.trim().toLowerCase();
      
      // Skip common words and already found entities
      if (normalized.length < 3 || foundEntities.has(normalized)) return;
      
      // Skip if it's just a common word
      const commonWords = ['the', 'this', 'that', 'these', 'those', 'what', 'when', 'where', 'who', 'why', 'how', 'very', 'much', 'many', 'some', 'from', 'with'];
      if (commonWords.includes(normalized)) return;
      
      // Determine entity type and confidence based on context
      let entityType = 'concept';
      let confidence = 0.7;
      
      // Check context around the phrase
      const startIndex = text.toLowerCase().indexOf(normalized);
      if (startIndex !== -1) {
        const contextBefore = text.substring(Math.max(0, startIndex - 100), startIndex).toLowerCase();
        const contextAfter = text.substring(startIndex + phrase.length, Math.min(text.length, startIndex + phrase.length + 100)).toLowerCase();
        const fullContext = contextBefore + ' ' + normalized + ' ' + contextAfter;
        
        // Increase confidence for frequently mentioned terms
        const occurrences = (text.toLowerCase().match(new RegExp(`\\b${normalized}\\b`, 'g')) || []).length;
        if (occurrences > 2) confidence += 0.1;
        if (occurrences > 5) confidence += 0.1;
        
        // Detect entity types
        if (fullContext.match(/\b(company|corporation|inc\.|llc|ltd|gmbh|brand)\b/)) {
          entityType = 'organization';
          confidence += 0.1;
        } else if (fullContext.match(/\b(product|solution|software|tool|device|equipment)\b/)) {
          entityType = 'product';
          confidence += 0.05;
        } else if (fullContext.match(/\b(dr\.|doctor|md|phd|professor)\b/) || phrase.split(' ').length === 2) {
          entityType = 'person';
        } else if (fullContext.match(/\b(method|technique|process|procedure|treatment|therapy)\b/)) {
          entityType = 'medicalProcedure';
          confidence += 0.1;
        } else if (fullContext.match(/\b(condition|disease|syndrome|disorder|symptom)\b/)) {
          entityType = 'medicalCondition';
          confidence += 0.1;
        } else if (fullContext.match(/\b(ingredient|compound|chemical|substance|mineral|vitamin)\b/)) {
          entityType = 'substance';
          confidence += 0.1;
        }
      }
      
      // Create the entity
      const entity: Entity = {
        name: phrase.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' '),
        type: entityType,
        confidence: Math.min(confidence, 0.95)
      };
      
      // Attempt to create Wikipedia/Wikidata URLs for high-confidence entities
      if (confidence > 0.75) {
        const wikiName = entity.name.replace(/ /g, '_');
        entity.sameAs = [
          `https://en.wikipedia.org/wiki/${wikiName}`
          // Note: In a real implementation, you'd verify these URLs exist
          // or use an API to search for the correct Wikipedia/Wikidata entries
        ];
      }
      
      foundEntities.set(normalized, entity);
    });
    
    // Extract brand names (with ® ™ © symbols)
    const brandMatches = text.match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)(?:[®™©])/g);
    if (brandMatches) {
      brandMatches.forEach(match => {
        const brand = match.replace(/[®™©]/g, '').trim();
        const normalized = brand.toLowerCase();
        if (!foundEntities.has(normalized) && brand.length > 2) {
          foundEntities.set(normalized, {
            name: brand,
            type: 'brand',
            confidence: 0.95
          });
        }
      });
    }
    
    // Look for key repeated terms (likely important concepts)
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordFreq = new Map<string, number>();
    
    words.forEach(word => {
      if (!foundEntities.has(word) && word.length > 5) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });
    
    // Add high-frequency terms as concepts
    Array.from(wordFreq.entries())
      .filter(([word, freq]) => freq >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([word, freq]) => {
        if (!foundEntities.has(word)) {
          foundEntities.set(word, {
            name: word.charAt(0).toUpperCase() + word.slice(1),
            type: 'concept',
            confidence: Math.min(0.6 + (freq * 0.05), 0.85)
          });
        }
      });
    
    // Convert to array and sort by confidence
    return Array.from(foundEntities.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 30); // Allow more entities for better about/mentions distinction
  };

  const scrapeUrl = async (url: string) => {
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        throw new Error('Failed to scrape URL');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Scraping error:', error);
      throw error;
    }
  };

  const generateSchemaForUrl = async (urlData: any) => {
    const { 
      url, title, description, content, pageType, existingSchemas, 
      organizationName: extractedOrg, authorName: extractedAuthor,
      editorName, reviewerName, contributors,
      publishedDate, modifiedDate, logoUrl, enrichedAuthor, featuredImage, language 
    } = urlData;
    
    // Use user-provided values over extracted values
    const finalOrgName = organizationName || extractedOrg;
    const finalAuthorName = authorName || extractedAuthor;
    
    // Ensure we have content to work with
    if (!content || content.length < 50) {
      console.error('Insufficient content for schema generation');
      throw new Error('Insufficient content extracted from the page. Please try manual mode or check if JavaScript rendering is needed.');
    }
    
    // Extract entities from content
    const entities = extractEntities(content);
    
    // Build schema based on detected page type
    let generatedSchema: SchemaType;
    
    if (pageType === 'article' || content.toLowerCase().includes('article') || content.toLowerCase().includes('blog')) {
      // Calculate word count correctly
      const wordCount = content.split(/\s+/).filter((word: string) => word.length > 0).length;
      
      // Generate abstract (first 2-3 sentences or ~150 words)
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
      const abstract = sentences.slice(0, 3).join(' ').substring(0, 300) + '...';
      
      // Determine audience based on content
      const audience = determineAudience(content, entities);
      
      // Determine what the article teaches
      const teaches = determineTeaches(content, entities);
      
      // Parse URL for use throughout
      const urlObj = new URL(url);
      
      // Extract blog path from URL
      const pathParts = urlObj.pathname.split('/').filter(part => part);
      let blogPath = '';
      for (const part of pathParts) {
        if (part.match(/^(blog|blogs|news|articles?)$/i)) {
          blogPath = pathParts.slice(0, pathParts.indexOf(part) + 1).join('/');
          break;
        }
      }
      
      // Build the schema object
      const schemaObject: any = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": `${url}#BlogPosting`,
        "mainEntityOfPage": url,
        "headline": title,
        "name": title,
        "description": description || content.substring(0, 160),
        "abstract": abstract,
        "articleBody": content, // Include full content
        "wordCount": wordCount,
        "datePublished": publishedDate || new Date().toISOString(),
        "dateModified": modifiedDate || publishedDate || new Date().toISOString(),
        "inLanguage": language || "en-US"
      };
      
      // Add author only if available
      if (finalAuthorName) {
        schemaObject.author = enrichedAuthor ? {
          "@type": "Person",
          "@id": `${urlObj.origin}/author/${finalAuthorName.toLowerCase().replace(/\s+/g, '-')}#Person`,
          "name": finalAuthorName,
          "url": `${urlObj.origin}/author/${finalAuthorName.toLowerCase().replace(/\s+/g, '-')}`,
          "jobTitle": cleanSchemaProperty(enrichedAuthor.jobTitle),
          "description": cleanSchemaProperty(enrichedAuthor.description),
          "image": enrichedAuthor.image ? {
            "@type": "ImageObject",
            "@id": enrichedAuthor.image,
            "url": enrichedAuthor.image
          } : undefined,
          "sameAs": enrichedAuthor.sameAs?.length > 0 ? enrichedAuthor.sameAs : undefined,
          "knowsAbout": enrichedAuthor.knowsAbout?.length > 0 ? enrichedAuthor.knowsAbout : undefined,
          "worksFor": (enrichedAuthor.worksFor || finalOrgName) ? {
            "@type": "Organization",
            "@id": urlObj.origin,
            "name": enrichedAuthor.worksFor || finalOrgName
          } : undefined,
          "alumniOf": cleanSchemaProperty(enrichedAuthor.alumniOf)
        } : {
          "@type": "Person",
          "name": finalAuthorName
        };
      }
      
      // Add editor if present
      if (editorName) {
        schemaObject.editor = {
          "@type": "Person",
          "@id": `${urlObj.origin}/team/${editorName.toLowerCase().replace(/\s+/g, '-')}#Person`,
          "name": editorName,
          "url": `${urlObj.origin}/team/${editorName.toLowerCase().replace(/\s+/g, '-')}`
        };
      }
      
      // Add reviewer if present
      if (reviewerName) {
        schemaObject.reviewedBy = {
          "@type": "Person",
          "@id": `${urlObj.origin}/team/${reviewerName.toLowerCase().replace(/\s+/g, '-')}#Person`,
          "name": reviewerName,
          "url": `${urlObj.origin}/team/${reviewerName.toLowerCase().replace(/\s+/g, '-')}`,
          "jobTitle": reviewerName.includes('Dr.') ? "Medical Professional" : "Expert Reviewer"
        };
      }
      
      // Add contributors if present
      if (contributors?.length > 0) {
        schemaObject.contributor = contributors.map((name: string) => ({
          "@type": "Person",
          "name": name
        }));
      }
      
      // Add publisher if organization name is available
      if (finalOrgName) {
        schemaObject.publisher = {
          "@type": "Organization",
          "@id": urlObj.origin,
          "name": finalOrgName,
          "logo": {
            "@type": "ImageObject",
            "@id": logoUrl || `${urlObj.origin}/assets/logo.png`,
            "url": logoUrl || `${urlObj.origin}/assets/logo.png`,
            "width": "600",
            "height": "60"
          }
        };
      }
      
      // Add image if available
      if (featuredImage) {
        schemaObject.image = {
          "@type": "ImageObject",
          "@id": featuredImage,
          "url": featuredImage
        };
      }
      
      // Add isPartOf if blog path is detected
      if (blogPath && finalOrgName) {
        schemaObject.isPartOf = {
          "@type": "Blog",
          "@id": `${urlObj.origin}/${blogPath}/`,
          "name": `${finalOrgName} Blog`,
          "publisher": {
            "@type": "Organization",
            "@id": urlObj.origin,
            "name": finalOrgName
          }
        };
      }
      
      // Add audience
      schemaObject.audience = audience;
      
      // Add teaches only if relevant content found
      if (teaches.length > 0) {
        schemaObject.teaches = teaches;
      }
      
      // Add keywords only if entities were found
      if (entities.length > 0) {
        schemaObject.keywords = entities
          .filter(e => e.confidence > 0.8)
          .map(e => e.name)
          .slice(0, 10)
          .join(', ');
      }
      
      // Add about for main topics
      const aboutEntities = entities
        .filter(e => {
          const occurrences = (content.toLowerCase().match(new RegExp(`\\b${e.name.toLowerCase()}\\b`, 'g')) || []).length;
          return e.confidence > 0.85 && occurrences > 3 && e.type !== 'person';
        })
        .slice(0, 5);
      
      if (aboutEntities.length > 0) {
        schemaObject.about = aboutEntities.map(entity => ({
          "@type": "Thing",
          "@id": `https://example.com/kb/${entity.name.toLowerCase().replace(/\s+/g, '-')}`,
          "name": entity.name,
          "sameAs": cleanSchemaProperty(entity.sameAs)
        }));
      }
      
      // Add mentions for secondary topics
      const mentionEntities = entities
        .filter(e => {
          const occurrences = (content.toLowerCase().match(new RegExp(`\\b${e.name.toLowerCase()}\\b`, 'g')) || []).length;
          return e.confidence > 0.7 && e.confidence <= 0.85 && occurrences <= 3;
        })
        .slice(0, 10);
      
      if (mentionEntities.length > 0) {
        schemaObject.mentions = mentionEntities.map(entity => ({
          "@type": "Thing",
          "name": entity.name,
          "sameAs": cleanSchemaProperty(entity.sameAs)
        }));
      }
      
      generatedSchema = schemaObject;
    } else {
      // Enhanced WebPage with @graph
      generatedSchema = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "@id": `${url}#webpage`,
            "url": url,
            "name": title,
            "description": description || content.substring(0, 160),
            "keywords": entities.map(e => e.name).join(', '),
            "about": entities.filter(e => e.confidence > 0.7).map(entity => ({
              "@type": "Thing",
              "name": entity.name
            })),
            "mentions": entities.map(entity => ({
              "@type": "Thing",
              "name": entity.name
            }))
          }
        ]
      };
      
      // Add Organization if provided
      if (finalOrgName && generatedSchema["@graph"]) {
        generatedSchema["@graph"].push({
          "@type": "Organization",
          "@id": `${new URL(url).origin}#organization`,
          "name": finalOrgName,
          "url": new URL(url).origin
        });
      }
    }
    
    // Clean up undefined values and empty properties
    const cleanSchema = JSON.parse(JSON.stringify(generatedSchema, (key, value) => {
      const cleaned = cleanSchemaProperty(value);
      return cleaned;
    }));
    
    return { schema: cleanSchema, entities };
  };

  const processSingleUrl = async () => {
    if (!singleUrl) return;
    
    setLoading(true);
    // Clear previous data to prevent mixing
    setCurrentSchema(null);
    setProcessedUrls([]);
    
    try {
      // Try to scrape the URL
      const scrapedData = await scrapeUrl(singleUrl);
      
      // Check if we need to use manual mode
      if (scrapedData.error || scrapedData.useClientSide || !scrapedData.content || scrapedData.content.length < 100) {
        setManualMode(true);
        // Pre-fill URL in manual content
        setManualContent(prev => ({ ...prev, url: singleUrl }));
        setLoading(false);
        return;
      }
      
      setScrapedContent(scrapedData);
      
      // DO NOT auto-fill organization and author - let user decide
      // Only show what was detected without filling the fields
      
      // Generate schema
      const { schema, entities } = await generateSchemaForUrl(scrapedData);
      setCurrentSchema(schema);
      
      // Add to processed URLs
      setProcessedUrls([{
        url: singleUrl,
        status: 'completed',
        title: scrapedData.title,
        schema,
        entities
      }]);
    } catch (error) {
      console.error('Error processing URL:', error);
      setManualMode(true);
      setManualContent(prev => ({ ...prev, url: singleUrl }));
    } finally {
      setLoading(false);
    }
  };

  const processManualContent = async () => {
    if (!manualContent.title || !manualContent.content) return;
    
    setLoading(true);
    try {
      const manualData = {
        url: singleUrl,
        title: manualContent.title,
        description: manualContent.description,
        content: manualContent.content,
        pageType: 'WebPage',
        organizationName: organizationName,
        authorName: authorName,
        existingSchemas: []
      };
      
      // Generate schema
      const { schema, entities } = await generateSchemaForUrl(manualData);
      setCurrentSchema(schema);
      
      // Add to processed URLs
      setProcessedUrls([{
        url: singleUrl,
        status: 'completed',
        title: manualData.title,
        schema,
        entities
      }]);
      
      setManualMode(false);
    } catch (error) {
      console.error('Error processing manual content:', error);
      alert('Error generating schema. Please ensure you have provided sufficient content.');
    } finally {
      setLoading(false);
    }
  };

  const processBulkUrls = async () => {
    const urls = bulkUrls.split('\n').filter(url => url.trim());
    if (urls.length === 0) return;
    
    setLoading(true);
    setProcessedUrls(urls.map(url => ({ url: url.trim(), status: 'pending' })));
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      
      setProcessedUrls(prev => prev.map((u, idx) => 
        idx === i ? { ...u, status: 'processing' } : u
      ));
      
      try {
        const scrapedData = await scrapeUrl(url);
        
        // Skip if insufficient content
        if (!scrapedData.content || scrapedData.content.length < 100) {
          throw new Error('Insufficient content extracted');
        }
        
        const { schema, entities } = await generateSchemaForUrl(scrapedData);
        
        setProcessedUrls(prev => prev.map((u, idx) => 
          idx === i ? { 
            ...u, 
            status: 'completed',
            title: scrapedData.title,
            schema,
            entities
          } : u
        ));
        
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        setProcessedUrls(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: 'error', error: 'Failed to process' } : u
        ));
      }
    }
    
    setLoading(false);
  };

  const downloadAllSchemas = () => {
    const schemas = processedUrls
      .filter(u => u.status === 'completed' && u.schema)
      .map(u => ({
        url: u.url,
        schema: u.schema
      }));
    
    const blob = new Blob([JSON.stringify(schemas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schemas-bulk.json';
    a.click();
  };

  return (
    <main className="container mx-auto p-8 max-w-7xl">
      <h1 className="text-4xl font-bold mb-8">Advanced Schema Markup Generator</h1>
      <p className="text-gray-600 mb-8">
        Automatically scrape content from URLs and generate advanced Schema.org markup with entity detection and relationships.
      </p>
      
      {/* Mode Selection */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setMode('single')}
          className={`px-6 py-2 rounded ${
            mode === 'single' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Single URL
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`px-6 py-2 rounded ${
            mode === 'bulk' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Bulk URLs
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          {/* URL Input */}
          {mode === 'single' ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Enter URL to Scrape</label>
                <input
                  type="url"
                  className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500"
                  value={singleUrl}
                  onChange={(e) => setSingleUrl(e.target.value)}
                  placeholder="https://example.com/page"
                />
                <p className="text-sm text-gray-500 mt-1">
                  The content will be automatically scraped from this URL
                </p>
              </div>

              {/* Manual Content Input (shown if scraping fails) */}
              {manualMode && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-800 mb-3">
                    ⚠️ Automatic scraping failed or returned insufficient content. Please enter the content manually:
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Page Title</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={manualContent.title}
                        onChange={(e) => setManualContent({...manualContent, title: e.target.value})}
                        placeholder="Enter page title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Meta Description (Optional)</label>
                      <input
                        type="text"
                        className="w-full p-2 border rounded"
                        value={manualContent.description}
                        onChange={(e) => setManualContent({...manualContent, description: e.target.value})}
                        placeholder="Enter meta description"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Page Content</label>
                      <textarea
                        className="w-full p-2 border rounded h-32"
                        value={manualContent.content}
                        onChange={(e) => setManualContent({...manualContent, content: e.target.value})}
                        placeholder="Paste the main content of the page here..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">Enter URLs (one per line)</label>
              <textarea
                className="w-full p-3 border rounded h-32 focus:ring-2 focus:ring-blue-500"
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder="https://example.com/page1&#10;https://example.com/page2&#10;https://example.com/page3"
              />
              <p className="text-sm text-gray-500 mt-1">
                Enter multiple URLs to process in bulk
              </p>
            </div>
          )}

          {/* Organization Settings */}
          <div className="p-4 bg-gray-50 rounded">
            <h3 className="font-semibold mb-3">Organization Settings</h3>
            <p className="text-sm text-gray-600 mb-3">
              Enter your organization and author information. These will override any auto-detected values.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Organization Name</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Enter your organization name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Author Name</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Enter author name"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <button
            onClick={manualMode ? processManualContent : (mode === 'single' ? processSingleUrl : processBulkUrls)}
            disabled={loading || (mode === 'single' ? (!singleUrl || (manualMode && (!manualContent.title || !manualContent.content))) : !bulkUrls)}
            className="w-full bg-blue-500 text-white p-3 rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Processing...' : `Generate Schema${mode === 'bulk' ? 's' : ''}`}
          </button>

          {manualMode && (
            <button
              onClick={() => {
                setManualMode(false);
                setManualContent({ title: '', description: '', content: '' });
              }}
              className="w-full bg-gray-500 text-white p-2 rounded hover:bg-gray-600 transition-colors"
            >
              Cancel Manual Mode
            </button>
          )}

          {/* Scraped Content Info */}
          {scrapedContent && mode === 'single' && (
            <div className="p-4 bg-green-50 rounded">
              <h3 className="font-semibold mb-2 text-green-800">Content Scraped Successfully!</h3>
              <div className="text-sm space-y-1">
                <p><strong>Title:</strong> {scrapedContent.title}</p>
                <p><strong>Description:</strong> {scrapedContent.description?.substring(0, 100)}...</p>
                <p><strong>Content Length:</strong> {scrapedContent.content.length} characters</p>
                {scrapedContent.organizationName && (
                  <p><strong>Organization Detected:</strong> {scrapedContent.organizationName}</p>
                )}
                {scrapedContent.authorName && (
                  <p><strong>Author Detected:</strong> {scrapedContent.authorName}</p>
                )}
                {scrapedContent.metadata?.hasExistingSchema && (
                  <p className="text-yellow-600">⚠️ This page already has schema markup</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div>
          {mode === 'single' && currentSchema && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Generated Schema</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(currentSchema, null, 2))}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(currentSchema, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'schema.json';
                      a.click();
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm transition-colors"
                  >
                    Download JSON
                  </button>
                </div>
              </div>
              <pre className="bg-gray-100 p-4 rounded overflow-auto h-[500px] text-sm">
                {JSON.stringify(currentSchema, null, 2)}
              </pre>
            </>
          )}

          {mode === 'bulk' && processedUrls.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Processing Results</h2>
                {processedUrls.some(u => u.status === 'completed') && (
                  <button
                    onClick={downloadAllSchemas}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm transition-colors"
                  >
                    Download All Schemas
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[500px] overflow-auto">
                {processedUrls.map((url, idx) => (
                  <div key={idx} className="p-3 border rounded flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm truncate">{url.url}</p>
                      {url.title && <p className="text-xs text-gray-600">{url.title}</p>}
                      {url.entities && (
                        <p className="text-xs text-gray-500">
                          {url.entities.length} entities detected
                        </p>
                      )}
                    </div>
                    <div className="ml-4">
                      {url.status === 'pending' && <span className="text-gray-500">Waiting...</span>}
                      {url.status === 'processing' && <span className="text-blue-500">Processing...</span>}
                      {url.status === 'completed' && (
                        <span className="text-green-500">✓ Complete</span>
                      )}
                      {url.status === 'error' && <span className="text-red-500">✗ Error</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}