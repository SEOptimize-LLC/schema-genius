/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/page.tsx
'use client';

import { useState } from 'react';

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

  // Simple entity extraction
  const extractEntities = (text: string): Entity[] => {
    const entities: Entity[] = [];
    
    // Common mortgage/real estate entities
    const domainEntities = {
      mortgage: ['mortgage', 'loan', 'refinance', 'home loan', 'mortgage rate'],
      financial: ['credit score', 'interest rate', 'down payment', 'closing costs', 'apr', 'annual percentage rate'],
      realEstate: ['real estate', 'property', 'home', 'house', 'condo', 'townhouse'],
      process: ['pre-approval', 'underwriting', 'appraisal', 'closing', 'escrow'],
      types: ['fha', 'va loan', 'conventional loan', 'jumbo loan', 'fixed-rate', 'adjustable-rate', 'arm']
    };

    // Check for entities
    Object.entries(domainEntities).forEach(([category, terms]) => {
      terms.forEach(term => {
        if (text.toLowerCase().includes(term)) {
          entities.push({
            name: term.charAt(0).toUpperCase() + term.slice(1),
            type: category,
            confidence: 0.8
          });
        }
      });
    });

    // Extract potential company/organization names (simple heuristic)
    const capitalizedWords = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
    if (capitalizedWords) {
      capitalizedWords.forEach(word => {
        if (word.length > 3 && !entities.find(e => e.name === word)) {
          entities.push({
            name: word,
            type: 'organization',
            confidence: 0.6
          });
        }
      });
    }

    return entities;
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
    const { url, title, description, content, pageType, existingSchemas, organizationName: extractedOrg, authorName: extractedAuthor } = urlData;
    
    // Use extracted values if user hasn't provided their own
    const finalOrgName = organizationName || extractedOrg;
    const finalAuthorName = authorName || extractedAuthor;
    
    // Extract entities from content
    const entities = extractEntities(content);
    
    // Build schema based on detected page type
    let generatedSchema: SchemaType;
    
    if (pageType === 'article' || content.toLowerCase().includes('article') || content.toLowerCase().includes('blog')) {
      generatedSchema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "url": url,
        "description": description || content.substring(0, 160),
        "articleBody": content,
        "datePublished": new Date().toISOString(),
        "dateModified": new Date().toISOString(),
        "author": finalAuthorName ? {
          "@type": "Person",
          "name": finalAuthorName
        } : undefined,
        "publisher": finalOrgName ? {
          "@type": "Organization",
          "name": finalOrgName,
          "logo": {
            "@type": "ImageObject",
            "url": `${new URL(url).origin}/logo.png`
          }
        } : undefined,
        "keywords": entities.map(e => e.name).join(', '),
        "about": entities.filter(e => e.confidence > 0.7).map(entity => ({
          "@type": "Thing",
          "name": entity.name
        }))
      };
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
    
    // Clean up undefined values
    const cleanSchema = JSON.parse(JSON.stringify(generatedSchema));
    
    return { schema: cleanSchema, entities };
  };

  const processSingleUrl = async () => {
    if (!singleUrl) return;
    
    setLoading(true);
    try {
      // Scrape the URL
      const scrapedData = await scrapeUrl(singleUrl);
      setScrapedContent(scrapedData);
      
      // Auto-fill organization and author if found
      if (scrapedData.organizationName && !organizationName) {
        setOrganizationName(scrapedData.organizationName);
      }
      if (scrapedData.authorName && !authorName) {
        setAuthorName(scrapedData.authorName);
      }
      
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
      setProcessedUrls([{
        url: singleUrl,
        status: 'error',
        error: 'Failed to process URL'
      }]);
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
              These fields will be auto-populated from the scraped content. You can override them if needed.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Organization Name</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Auto-detected from URL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Author Name</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Auto-detected from content"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <button
            onClick={mode === 'single' ? processSingleUrl : processBulkUrls}
            disabled={loading || (mode === 'single' ? !singleUrl : !bulkUrls)}
            className="w-full bg-blue-500 text-white p-3 rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Processing...' : `Generate Schema${mode === 'bulk' ? 's' : ''}`}
          </button>

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
                {scrapedContent.metadata.hasExistingSchema && (
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