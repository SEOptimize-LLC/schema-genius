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

export default function Home() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [pageType, setPageType] = useState('WebPage');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [schema, setSchema] = useState<SchemaType | null>(null);
  const [loading, setLoading] = useState(false);
  const [detectedEntities, setDetectedEntities] = useState<Entity[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);

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

  const generateSchema = async () => {
    setLoading(true);
    
    // Extract entities from content
    const entities = extractEntities(content);
    setDetectedEntities(entities);
    
    // Build schema based on page type
    let generatedSchema: SchemaType;
    
    if (pageType === 'Article' || pageType === 'BlogPosting') {
      generatedSchema = {
        "@context": "https://schema.org",
        "@type": pageType,
        "headline": title,
        "url": url,
        "description": content.substring(0, 160),
        "articleBody": content,
        "datePublished": new Date().toISOString(),
        "dateModified": new Date().toISOString(),
        "author": authorName ? {
          "@type": "Person",
          "name": authorName
        } : undefined,
        "publisher": organizationName ? {
          "@type": "Organization",
          "name": organizationName,
          "logo": {
            "@type": "ImageObject",
            "url": `${url}/logo.png`
          }
        } : undefined,
        "keywords": entities.map(e => e.name).join(', '),
        "about": entities.filter(e => e.confidence > 0.7).map(entity => ({
          "@type": "Thing",
          "name": entity.name
        }))
      };
    } else if (pageType === 'Product') {
      generatedSchema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": title,
        "description": content.substring(0, 160),
        "url": url,
        "brand": organizationName ? {
          "@type": "Brand",
          "name": organizationName
        } : undefined,
        "offers": {
          "@type": "Offer",
          "url": url,
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        }
      };
    } else {
      // WebPage with enhanced structure
      generatedSchema = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": pageType,
            "@id": `${url}#webpage`,
            "url": url,
            "name": title,
            "description": content.substring(0, 160),
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
      if (organizationName && generatedSchema["@graph"]) {
        generatedSchema["@graph"].push({
          "@type": "Organization",
          "@id": `${url}#organization`,
          "name": organizationName,
          "url": url
        });
      }
    }
    
    // Clean up undefined values
    const cleanSchema = JSON.parse(JSON.stringify(generatedSchema));
    
    setSchema(cleanSchema);
    setLoading(false);
  };

  const toggleEntity = (entityName: string) => {
    setSelectedEntities(prev => 
      prev.includes(entityName) 
        ? prev.filter(e => e !== entityName)
        : [...prev, entityName]
    );
  };

  return (
    <main className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Advanced Schema Generator</h1>
      
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Page URL</label>
            <input
              type="url"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Page Title</label>
            <input
              type="text"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Page Title"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Page Type</label>
            <select
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              value={pageType}
              onChange={(e) => setPageType(e.target.value)}
            >
              <option value="WebPage">Web Page</option>
              <option value="Article">Article</option>
              <option value="BlogPosting">Blog Post</option>
              <option value="Product">Product</option>
              <option value="FAQPage">FAQ Page</option>
              <option value="AboutPage">About Page</option>
              <option value="ContactPage">Contact Page</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Author Name (Optional)</label>
              <input
                type="text"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Organization (Optional)</label>
              <input
                type="text"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Your Company"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Content</label>
            <textarea
              className="w-full p-2 border rounded h-40 focus:ring-2 focus:ring-blue-500"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your content here..."
            />
          </div>
          
          <button
            onClick={generateSchema}
            disabled={loading || !url || !title || !content}
            className="w-full bg-blue-500 text-white p-3 rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Generating...' : 'Generate Schema'}
          </button>
          
          {detectedEntities.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <h3 className="font-semibold mb-2">Detected Entities:</h3>
              <div className="flex flex-wrap gap-2">
                {detectedEntities.map((entity, idx) => (
                  <span
                    key={idx}
                    className={`px-3 py-1 rounded text-sm ${
                      entity.confidence > 0.7 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {entity.name} ({entity.type})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Generated Schema</h2>
            {schema && (
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(schema, null, 2))}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm transition-colors"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
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
            )}
          </div>
          
          <pre className="bg-gray-100 p-4 rounded overflow-auto h-[500px] text-sm">
            {schema ? JSON.stringify(schema, null, 2) : 'Your schema will appear here...'}
          </pre>
          
          {schema && (
            <div className="mt-4 p-4 bg-blue-50 rounded">
              <h3 className="font-semibold mb-2">Quick Validation:</h3>
              <ul className="text-sm space-y-1">
                <li className="flex items-center">
                  <span className="text-green-500 mr-2">✓</span>
                  Valid JSON-LD structure
                </li>
                <li className="flex items-center">
                  <span className="text-green-500 mr-2">✓</span>
                  Schema.org context included
                </li>
                <li className="flex items-center">
                  <span className={detectedEntities.length > 0 ? "text-green-500" : "text-yellow-500"}>
                    {detectedEntities.length > 0 ? "✓" : "!"}
                  </span>
                  <span className="ml-2">
                    {detectedEntities.length > 0 
                      ? `${detectedEntities.length} entities detected` 
                      : "No entities detected"}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
