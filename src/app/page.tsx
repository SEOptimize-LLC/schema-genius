// app/page.tsx
'use client';

import { useState } from 'react';

// Add this interface here
interface SchemaType {
  "@context": string;
  "@type": string;
  url: string;
  name: string;
  description: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [pageType, setPageType] = useState('WebPage');
  const [content, setContent] = useState('');
  const [schema, setSchema] = useState<SchemaType | null>(null);  // Change this line
  const [loading, setLoading] = useState(false);

  const generateSchema = async () => {
    setLoading(true);
    
    // Simple schema generation
    const generatedSchema = {
      "@context": "https://schema.org",
      "@type": pageType,
      "url": url,
      "name": title,
      "description": content.substring(0, 160)
    };
    
    setSchema(generatedSchema);
    setLoading(false);
  };

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Schema Generator</h1>
      
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Page URL</label>
            <input
              type="url"
              className="w-full p-2 border rounded"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Page Title</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Page Title"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Page Type</label>
            <select
              className="w-full p-2 border rounded"
              value={pageType}
              onChange={(e) => setPageType(e.target.value)}
            >
              <option value="WebPage">Web Page</option>
              <option value="Article">Article</option>
              <option value="Product">Product</option>
              <option value="BlogPosting">Blog Post</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Content</label>
            <textarea
              className="w-full p-2 border rounded h-32"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your content here..."
            />
          </div>
          
          <button
            onClick={generateSchema}
            disabled={loading}
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {loading ? 'Generating...' : 'Generate Schema'}
          </button>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4">Generated Schema</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto h-96">
            {schema ? JSON.stringify(schema, null, 2) : 'Your schema will appear here...'}
          </pre>
          
          {schema && (
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(schema, null, 2))}
              className="mt-4 w-full bg-green-500 text-white p-2 rounded hover:bg-green-600"
            >
              Copy to Clipboard
            </button>
          )}
        </div>
      </div>
    </main>
  );
}