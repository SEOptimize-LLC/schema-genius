/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/scrape/route.ts
import { NextResponse } from 'next/server';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function scrapeWithRetry(url: string, apiKey: string, attempt = 1): Promise<string> {
  try {
    // Try with JavaScript rendering first
    const renderJs = attempt <= 2 ? 'true' : 'false'; // Fall back to non-JS on last attempt
    
    const scrapingBeeUrl = new URL('https://app.scrapingbee.com/api/v1/');
    scrapingBeeUrl.searchParams.append('api_key', apiKey);
    scrapingBeeUrl.searchParams.append('url', url);
    scrapingBeeUrl.searchParams.append('render_js', renderJs);
    scrapingBeeUrl.searchParams.append('block_ads', 'true');
    scrapingBeeUrl.searchParams.append('block_resources', 'false');
    
    // Add wait time for JavaScript rendering
    if (renderJs === 'true') {
      scrapingBeeUrl.searchParams.append('wait', '3000'); // Wait 3 seconds for JS
    }
    
    console.log(`Scraping attempt ${attempt} with JS rendering: ${renderJs}`);
    
    const response = await fetch(scrapingBeeUrl.toString());
    
    if (!response.ok) {
      throw new Error(`ScrapingBee error: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Validate that we got meaningful content
    if (html.length < 1000) {
      throw new Error('Response too short, likely an error page');
    }
    
    return html;
    
  } catch (error) {
    console.error(`Scraping attempt ${attempt} failed:`, error);
    
    if (attempt < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return scrapeWithRetry(url, apiKey, attempt + 1);
    }
    
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Use ScrapingBee API
    const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
    
    console.log('ScrapingBee API Key exists:', !!SCRAPINGBEE_API_KEY);
    
    if (!SCRAPINGBEE_API_KEY) {
      return NextResponse.json({ 
        error: 'ScrapingBee API key not configured',
        message: 'Please add SCRAPINGBEE_API_KEY to your environment variables'
      }, { status: 500 });
    }
    
    // Scrape with retry logic
    const html = await scrapeWithRetry(url, SCRAPINGBEE_API_KEY);
    
    // Process the HTML
    const result = extractDataFromHTML(html, url);
    
    // Validate extraction results
    if (!result.content || result.content.length < 100) {
      console.warn('Content extraction resulted in minimal content');
      result.metadata.warning = 'Minimal content extracted. Manual input may be required.';
    }
    
    return NextResponse.json(result);

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to scrape URL', 
        details: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'Try using manual mode if the website blocks automated scraping'
      }, 
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
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  
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
        console.warn('Failed to parse JSON-LD:', e);
      }
    }
  }
  
  // Extract organization name
  let organizationName = ogSiteName || '';
  
  // Enhanced organization extraction from existing schema
  if (!organizationName && existingSchemas.length > 0) {
    for (const schema of existingSchemas) {
      if (schema.publisher?.name) {
        organizationName = schema.publisher.name;
        break;
      }
      if (schema['@graph']) {
        for (const item of schema['@graph']) {
          if (item['@type'] === 'Organization' && item.name) {
            organizationName = item.name;
            break;
          }
          if (item.publisher?.name) {
            organizationName = item.publisher.name;
            break;
          }
        }
      }
    }
  }
  
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
      // Common patterns
      /(?:Written by|Author:|By:?)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /(?:Written by|Author:|By:?)\s*<[^>]*>([^<]+)</i,
      /<span[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /<div[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /<a[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)</i,
      /class=["']author-name["'][^>]*>([^<]+)</i,
      /Written by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /By\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:<|$|\n)/,
      // New patterns based on client sites
      /Posted by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /<[^>]+class=["'][^"']*post-author[^"']*["'][^>]*>([^<]+)</i,
      /<[^>]+itemprop=["']author["'][^>]*>([^<]+)</i
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
            !potentialAuthor.toLowerCase().includes('admin') && // Filter out generic admin
            /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(potentialAuthor)) {
          authorName = potentialAuthor;
          break;
        }
      }
    }
  }
  
  // Extract main content - ENHANCED VERSION WITH UNIVERSAL PATTERNS
  let textContent = '';
  
  // Remove scripts, styles, and other non-content elements
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
  
  // Try to find main content area with UNIVERSAL patterns
  const contentPatterns = [
    // Standard semantic HTML
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    
    // Shopify/E-commerce patterns (Mary Go Round)
    /<div[^>]+class=["'][^"']*\brte\b[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*(?:footer|sidebar|comments|related|share))/i,
    /<div[^>]+class=["'][^"']*article__content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    
    // WordPress patterns (Education Walkthrough)
    /<div[^>]+class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)(?=<\/div|<footer|<aside)/i,
    /<div[^>]+class=["'][^"']*\bpost-content\b[^"']*["'][^>]*>([\s\S]*?)(?=<\/div|<footer|<aside)/i,
    /<div[^>]+class=["'][^"']*\bwp-block-post-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    
    // Odoo/Custom CMS patterns (Cudio)
    /<section[^>]+class=["'][^"']*\bo_wblog_post_content\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]+class=["'][^"']*\bblog-content\b[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*(?:footer|sidebar|comments))/i,
    
    // Generic content patterns - more specific
    /<div[^>]+class=["'][^"']*\b(?:entry-content|post-content|article-content|content-area|main-content|page-content|body-content)\b[^"']*["'][^>]*>([\s\S]*?)(?=<(?:div|footer|aside|section)[^>]*(?:class=["'][^"']*(?:footer|sidebar|comments|related)|id=["'][^"']*(?:footer|sidebar|comments)))/i,
    
    // ID-based patterns
    /<div[^>]+id=["'][^"']*(?:content|main-content|article-content|post-content)[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+(?:class|id)=["'][^"']*(?:sidebar|footer|comments))/i,
    
    // Blog post patterns
    /<div[^>]+class=["'][^"']*\b(?:blog-post|blog-content|post-body|article-body)\b[^"']*["'][^>]*>([\s\S]*?)(?=<\/div|<footer|<aside)/i,
    
    // Look for content with multiple paragraphs
    /(<p[^>]*>[\s\S]*?<\/p>\s*){3,}/gi,
    
    // Fallback: Look for div with most text content
    /<div[^>]*>(?:\s*<(?:p|h[1-6]|ul|ol|blockquote)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|ul|ol|blockquote)>\s*){2,}<\/div>/gi
  ];
  
  let maxContentLength = 0;
  let bestContent = '';
  let extractionMethod = 'None';
  
  // Try each pattern and keep the longest result
  for (let i = 0; i < contentPatterns.length; i++) {
    const pattern = contentPatterns[i];
    const matches = cleanHtml.match(new RegExp(pattern, 'gi'));
    if (matches) {
      for (const match of matches) {
        // Extract just the text to measure content length
        const textOnly = match.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Skip if it's navigation or contains too many links relative to text
        const linkCount = (match.match(/<a[^>]*>/gi) || []).length;
        const wordCount = textOnly.split(/\s+/).length;
        if (linkCount > wordCount / 10) continue; // Skip if more than 1 link per 10 words
        
        if (textOnly.length > maxContentLength) {
          maxContentLength = textOnly.length;
          bestContent = match;
          extractionMethod = `Pattern ${i + 1}`;
        }
      }
    }
  }
  
  // If we found good content, use it
  if (bestContent && maxContentLength > 500) {
    textContent = bestContent;
  } else {
    extractionMethod = 'Fallback';
    // Enhanced fallback: look for the body content more carefully
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      // Remove known non-content areas
      const bodyContent = bodyMatch[1]
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<div[^>]+class=["'][^"']*\b(?:sidebar|widget|advertisement|ads|promo|social-share|newsletter|popup|modal|overlay)\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
      
      // Look for the main content container
      const containerPatterns = [
        /<div[^>]+class=["'][^"']*\b(?:container|wrapper|main|content)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+id=["'][^"']*\b(?:container|wrapper|main|content)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      ];
      
      for (const pattern of containerPatterns) {
        const match = bodyContent.match(pattern);
        if (match && match[1]) {
          const containerText = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (containerText.length > 500) {
            textContent = match[1];
            extractionMethod = 'Fallback Container';
            break;
          }
        }
      }
      
      // If still no content, use cleaned body
      if (!textContent) {
        textContent = bodyContent;
        extractionMethod = 'Fallback Body';
      }
    } else {
      textContent = cleanHtml;
      extractionMethod = 'Fallback Full HTML';
    }
  }
  
  // Extract text content more carefully, preserving structure
  const fullTextContent = textContent
    .replace(/<(p|h[1-6]|li)[^>]*>/gi, '\n\n') // Add double newlines for paragraphs and headers
    .replace(/<br[^>]*>/gi, '\n') // Single newline for breaks
    .replace(/<[^>]+>/g, ' ') // Replace other tags with spaces
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Reduce multiple newlines
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
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
  
  // Enhanced date patterns
  if (!publishedDate) {
    const datePatterns = [
      /<span[^>]+class=["'][^"']*date["'][^>]*>([^<]+)</i,
      /<time[^>]+datetime=["']([^"']+)["']/i,
      /(?:Published|Posted|Date)[\s:]*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(?:Published|Posted|Date)[\s:]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/,
      /<meta[^>]+name=["']publish_date["'][^>]+content=["']([^"']+)["']/i,
      // New patterns for client sites
      /Posted on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
      /<[^>]+class=["'][^"']*post-date[^"']*["'][^>]*>([^<]+)</i,
      /<[^>]+class=["'][^"']*entry-date[^"']*["'][^>]*>([^<]+)</i,
      /<[^>]+itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i
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
  
  // Extract featured image
  let featuredImage = ogImage || '';
  
  if (!featuredImage) {
    // Look for common featured image patterns
    const imagePatterns = [
      /<img[^>]+class=["'][^"']*featured[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      // Shopify patterns
      /<img[^>]+class=["'][^"']*article__image[^"']*["'][^>]+src=["']([^"']+)["']/i,
      // First image in content area
      new RegExp(`${bestContent ? bestContent.substring(0, 200) : '<article'}[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>`, 'i')
    ];
    
    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        featuredImage = match[1];
        // Handle Shopify responsive images
        if (featuredImage.includes('{width}')) {
          featuredImage = featuredImage.replace(/{width}/g, '1200');
        }
        break;
      }
    }
  }
  
  // Make image URLs absolute
  if (featuredImage) {
    if (featuredImage.startsWith('//')) {
      featuredImage = `https:${featuredImage}`;
    } else if (featuredImage.startsWith('/')) {
      const urlObj = new URL(url);
      featuredImage = `${urlObj.origin}${featuredImage}`;
    }
  }
  
  // Extract logo URL
  let logoUrl = '';
  
  // Try to find logo in common patterns
  const logoPatterns = [
    /<img[^>]+class=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+id=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+alt=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<a[^>]+class=["'][^"']*logo[^"']*["'][^>]*>\s*<img[^>]+src=["']([^"']+)["']/i,
    /class=["'](?:site-logo|brand|navbar-brand|header__logo)["'][^>]*>\s*<img[^>]+src=["']([^"']+)["']/i,
    // Shopify patterns
    /<img[^>]+class=["'][^"']*header__logo-image[^"']*["'][^>]+src=["']([^"']+)["']/i
  ];
  
  for (const pattern of logoPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      logoUrl = match[1];
      // Handle protocol-relative URLs
      if (logoUrl.startsWith('//')) {
        logoUrl = `https:${logoUrl}`;
      } else if (logoUrl.startsWith('/')) {
        // Make absolute URL if relative
        const urlObj = new URL(url);
        logoUrl = `${urlObj.origin}${logoUrl}`;
      }
      break;
    }
  }
  
  // Extract language
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  const language = langMatch ? langMatch[1] : 'en-US';
  
  // Extract additional contributors/editors
  let editorName = '';
  let reviewerName = '';
  const contributors: string[] = [];
  
  // Look for editor patterns
  const editorPatterns = [
    /(?:Edited by|Editor:|Reviewed by:?)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /<span[^>]+class=["'][^"']*editor[^"']*["'][^>]*>([^<]+)</i
  ];
  
  for (const pattern of editorPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name && name.length > 2 && name.length < 50) {
        if (pattern.toString().includes('Reviewed')) {
          reviewerName = name;
        } else {
          editorName = name;
        }
      }
    }
  }
  
  console.log(`Extracted content length: ${fullTextContent.length} characters`);
  console.log(`Content extraction method: ${extractionMethod}`);
  
  return {
    url,
    title: title || ogTitle || '',
    description: description || ogDescription || '',
    content: fullTextContent,
    pageType: ogType || 'WebPage',
    organizationName,
    authorName,
    editorName,
    reviewerName,
    contributors,
    publishedDate,
    modifiedDate,
    logoUrl,
    featuredImage,
    language,
    existingSchemas,
    metadata: {
      ogTitle,
      ogDescription,
      ogType,
      ogSiteName,
      hasExistingSchema: existingSchemas.length > 0,
      schemaCount: existingSchemas.length,
      contentLength: fullTextContent.length,
      extractionMethod: extractionMethod
    }
  };
}