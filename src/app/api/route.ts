// app/api/scrape/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch the HTML content with better headers to avoid blocking
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      
      // If direct fetching fails, return a message to use client-side fetching
      return NextResponse.json({ 
        error: 'Direct fetching blocked', 
        useClientSide: true,
        url,
        status: response.status 
      }, { status: 200 });
    }

    const html = await response.text();
    
    // Check if we got a blocking page instead of real content
    if (html.includes('cf-browser-verification') || html.includes('challenge-platform') || html.length < 1000) {
      return NextResponse.json({ 
        error: 'Site requires browser verification', 
        useClientSide: true,
        url 
      }, { status: 200 });
    }
    
    // Extract content from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1] : '';
    
    // Extract all text content (remove scripts and styles)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // Limit to 5000 chars for now

    // Extract Open Graph data
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const ogType = html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)?.[1];
    
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
    let organizationName = '';
    
    // Try to extract from domain
    const domain = new URL(url).hostname.replace('www.', '');
    const domainParts = domain.split('.');
    if (domainParts[0] && domainParts[0] !== 'www') {
      // Clean up common patterns like "trysnow" -> "Snow"
      organizationName = domainParts[0]
        .replace(/^try/, '')
        .replace(/^get/, '')
        .replace(/^buy/, '')
        .replace(/^shop/, '');
      organizationName = organizationName.charAt(0).toUpperCase() + organizationName.slice(1);
    }
    
    // Try to extract from title (look for patterns like "| SNOW® Oral Care")
    const titleOrgMatch = title.match(/\|\s*([^|]+?)(?:®|™|©)?(?:\s+(?:Oral Care|Inc|LLC|Corp|Company|Co\.))?$/i);
    if (titleOrgMatch) {
      organizationName = titleOrgMatch[1].trim();
    }
    
    // Try from meta tags
    const siteNameMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (siteNameMatch) {
      organizationName = siteNameMatch[1];
    }
    
    // Extract author/writer
    let authorName = '';
    
    // Common patterns for author detection
    const authorPatterns = [
      /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
      /(?:Written by|Author|By|Posted by)[\s:]*<[^>]*>([^<]+)</i,
      /(?:Written by|Author|By|Posted by)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /<span[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /<div[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /"author":\s*{\s*"@type":\s*"Person",\s*"name":\s*"([^"]+)"/
    ];
    
    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        authorName = match[1].trim();
        // Clean up author name
        authorName = authorName.replace(/^by\s+/i, '').trim();
        break;
      }
    }
    
    // Try to extract from JSON-LD
    if (!authorName && existingSchemas.length > 0) {
      for (const schema of existingSchemas) {
        if (schema.author?.name) {
          authorName = schema.author.name;
          break;
        }
      }
    }

    return NextResponse.json({
      url,
      title: title || ogTitle || '',
      description: description || ogDescription || '',
      content: textContent,
      pageType: ogType || 'WebPage',
      organizationName,
      authorName,
      existingSchemas,
      metadata: {
        ogTitle,
        ogDescription,
        ogType,
        hasExistingSchema: existingSchemas.length > 0
      }
    });

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape URL' }, 
      { status: 500 }
    );
  }
}