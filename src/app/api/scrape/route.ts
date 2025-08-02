/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/scrape/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Use ScrapingBee API
    const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
    
    console.log('ScrapingBee API Key exists:', !!SCRAPINGBEE_API_KEY);
    console.log('API Key length:', SCRAPINGBEE_API_KEY?.length);
    
    if (!SCRAPINGBEE_API_KEY) {
      return NextResponse.json({ 
        error: 'ScrapingBee API key not configured',
        message: 'Please add SCRAPINGBEE_API_KEY to your environment variables',
        debug: {
          keyExists: !!process.env.SCRAPINGBEE_API_KEY,
          envKeys: Object.keys(process.env).filter(k => k.includes('SCRAPING'))
        }
      }, { status: 500 });
    }
    
    // ScrapingBee API endpoint
    const scrapingBeeUrl = new URL('https://app.scrapingbee.com/api/v1/');
    scrapingBeeUrl.searchParams.append('api_key', SCRAPINGBEE_API_KEY);
    scrapingBeeUrl.searchParams.append('url', url);
    scrapingBeeUrl.searchParams.append('render_js', 'false'); // Set to true if you need JavaScript rendering
    scrapingBeeUrl.searchParams.append('block_ads', 'true');
    scrapingBeeUrl.searchParams.append('block_resources', 'false');
    
    const response = await fetch(scrapingBeeUrl.toString());
    
    if (!response.ok) {
      console.error('ScrapingBee error:', response.status, response.statusText);
      return NextResponse.json({ 
        error: 'Failed to scrape URL',
        status: response.status,
        message: response.statusText
      }, { status: 500 });
    }

    const html = await response.text();
    
    // Process the HTML
    const result = extractDataFromHTML(html, url);
    
    return NextResponse.json(result);

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape URL', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}

function extractDataFromHTML(html: string, url: string) {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const description = descMatch ? descMatch[1] : '';
  
  // Extract Open Graph data
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const ogType = html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  
  // Extract structured data if present
  const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const existingSchemas = [];
  
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match
          .replace(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/i, '')
          .replace(/<\/script>/i, '')
          .trim();
        const parsed = JSON.parse(jsonContent);
        existingSchemas.push(parsed);
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }
  
  // Extract organization name
  let organizationName = ogSiteName || '';
  
  if (!organizationName) {
    // Try to extract from domain
    const domain = new URL(url).hostname.replace('www.', '');
    const domainParts = domain.split('.');
    if (domainParts[0] && domainParts[0] !== 'www') {
      organizationName = domainParts[0]
        .replace(/^(try|get|buy|shop)/, '')
        .replace(/-/g, ' ');
      // Capitalize each word
      organizationName = organizationName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  // Try to extract from title (look for patterns like "| SNOW® Oral Care")
  if (!organizationName) {
    const titleOrgMatch = title.match(/\|\s*([^|]+?)(?:®|™|©)?(?:\s+(?:Oral Care|Inc|LLC|Corp|Company|Co\.))?$/i);
    if (titleOrgMatch) {
      organizationName = titleOrgMatch[1].trim();
    }
  }
  
  // Extract author/writer
  let authorName = '';
  
  // First check existing schemas
  if (existingSchemas.length > 0) {
    for (const schema of existingSchemas) {
      if (schema.author?.name) {
        authorName = schema.author.name;
        break;
      } else if (schema['@graph']) {
        // Check graph arrays
        for (const item of schema['@graph']) {
          if (item.author?.name) {
            authorName = item.author.name;
            break;
          }
        }
      }
    }
  }
  
  // Try meta tags
  if (!authorName) {
    const authorMeta = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
    if (authorMeta) {
      authorName = authorMeta[1];
    }
  }
  
  // Look for common author patterns in the HTML
  if (!authorName) {
    const authorPatterns = [
      /(?:Written by|Author:|By:?)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /(?:Written by|Author:|By:?)\s*<[^>]*>([^<]+)</i,
      /<span[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /<div[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /<a[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /class=["']author-name["'][^>]*>([^<]+)</i,
      /Written by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /By\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:<|$|\n)/
    ];
    
    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const potentialAuthor = match[1].trim().replace(/^by\s+/i, '');
        // Filter out common false positives
        if (potentialAuthor && 
            potentialAuthor.length > 2 && 
            potentialAuthor.length < 50 &&
            !potentialAuthor.toLowerCase().includes('posted') &&
            !potentialAuthor.toLowerCase().includes('category') &&
            !potentialAuthor.toLowerCase().includes('tag') &&
            /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(potentialAuthor)) {
          authorName = potentialAuthor;
          break;
        }
      }
    }
  }
  
  // Extract main content
  let textContent = '';
  
  // Remove scripts, styles, and other non-content elements
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  
  // Try to find main content area
  const contentPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class=["'][^"']*post[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ];
  
  for (const pattern of contentPatterns) {
    const match = cleanHtml.match(pattern);
    if (match && match[1]) {
      textContent = match[1];
      break;
    }
  }
  
  // Fallback to all text
  if (!textContent) {
    textContent = cleanHtml;
  }
  
  // Clean up the text content
  textContent = textContent
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 10000); // Limit to 10k chars
  
  // Extract published date
  let publishedDate = '';
  let modifiedDate = '';
  
  // Try meta tags first
  const datePublishedMeta = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  if (datePublishedMeta) {
    publishedDate = datePublishedMeta[1];
  }
  
  const dateModifiedMeta = html.match(/<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']+)["']/i);
  if (dateModifiedMeta) {
    modifiedDate = dateModifiedMeta[1];
  }
  
  // Look for date patterns in HTML
  if (!publishedDate) {
    const datePatterns = [
      /<span[^>]+class=["'][^"']*date["'][^>]*>([^<]+)</i,
      /<time[^>]+datetime=["']([^"']+)["']/i,
      /(?:Published|Posted|Date)[\s:]*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(?:Published|Posted|Date)[\s:]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/,
      /<meta[^>]+name=["']publish_date["'][^>]+content=["']([^"']+)["']/i
    ];
    
    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // Parse the date
        const dateStr = match[1].trim();
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          publishedDate = parsedDate.toISOString();
          break;
        }
      }
    }
  }
  
  // Extract logo URL
  let logoUrl = '';
  
  // Try Open Graph image first
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage) {
    logoUrl = ogImage[1];
  }
  
  // Try to find logo in common patterns
  if (!logoUrl) {
    const logoPatterns = [
      /<img[^>]+class=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+id=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+alt=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /src=["']([^"']+logo[^"']+)["']/i
    ];
    
    for (const pattern of logoPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        logoUrl = match[1];
        // Make absolute URL if relative
        if (logoUrl.startsWith('/')) {
          const urlObj = new URL(url);
          logoUrl = `${urlObj.origin}${logoUrl}`;
        }
        break;
      }
    }
  }
  
  return {
    url,
    title: title || ogTitle || '',
    description: description || ogDescription || '',
    content: textContent,
    pageType: ogType || 'WebPage',
    organizationName,
    authorName,
    publishedDate,
    modifiedDate,
    logoUrl,
    existingSchemas,
    metadata: {
      ogTitle,
      ogDescription,
      ogType,
      ogSiteName,
      hasExistingSchema: existingSchemas.length > 0,
      schemaCount: existingSchemas.length
    }
  };
}