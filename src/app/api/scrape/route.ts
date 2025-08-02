/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/enrich-author/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { authorName, siteUrl } = await request.json();
    
    if (!authorName || !siteUrl) {
      return NextResponse.json({ error: 'Author name and site URL are required' }, { status: 400 });
    }

    const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
    
    if (!SCRAPINGBEE_API_KEY) {
      return NextResponse.json({ 
        error: 'ScrapingBee API key not configured'
      }, { status: 500 });
    }

    // Prepare author data object
    const authorData = {
      name: authorName,
      jobTitle: '',
      description: '',
      image: '',
      sameAs: [],
      knowsAbout: [],
      worksFor: '',
      alumniOf: ''
    };

    // Common about/team page patterns
    const aboutPagePatterns = [
      '/about-us',
      '/about',
      '/team',
      '/our-team',
      '/people',
      '/staff'
    ];

    // Try to find author info on about/team pages
    for (const pattern of aboutPagePatterns) {
      const aboutUrl = `${siteUrl}${pattern}`;
      
      try {
        const html = await fetchPage(aboutUrl, SCRAPINGBEE_API_KEY);
        if (html) {
          const extracted = extractAuthorFromAboutPage(html, authorName);
          if (extracted.found) {
            Object.assign(authorData, extracted);
            break;
          }
        }
      } catch (e) {
        // Continue to next pattern
        console.log(`Skipping ${aboutUrl}:`, e);
      }
    }

    // Try author-specific page patterns
    const authorSlugVariations = generateAuthorSlugs(authorName);
    const authorPagePatterns = [
      '/author/',
      '/authors/',
      '/team/',
      '/staff/',
      '/writer/',
      '/contributor/'
    ];

    for (const prefix of authorPagePatterns) {
      for (const slug of authorSlugVariations) {
        const authorUrl = `${siteUrl}${prefix}${slug}`;
        
        try {
          const html = await fetchPage(authorUrl, SCRAPINGBEE_API_KEY);
          if (html) {
            const extracted = extractAuthorFromProfilePage(html, authorName);
            if (extracted.found) {
              Object.assign(authorData, extracted);
              // Author profile pages are usually more detailed, so we prioritize them
              return NextResponse.json({ enriched: true, authorData });
            }
          }
        } catch (e) {
          // Continue to next pattern
          console.log(`Skipping ${authorUrl}:`, e);
        }
      }
    }

    // Return whatever data we found
    return NextResponse.json({ 
      enriched: authorData.jobTitle || authorData.description ? true : false,
      authorData 
    });

  } catch (error) {
    console.error('Author enrichment error:', error);
    return NextResponse.json(
      { error: 'Failed to enrich author data', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}

async function fetchPage(url: string, apiKey: string): Promise<string | null> {
  try {
    const scrapingBeeUrl = new URL('https://app.scrapingbee.com/api/v1/');
    scrapingBeeUrl.searchParams.append('api_key', apiKey);
    scrapingBeeUrl.searchParams.append('url', url);
    scrapingBeeUrl.searchParams.append('render_js', 'false');
    
    const response = await fetch(scrapingBeeUrl.toString());
    
    if (!response.ok) {
      return null;
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error fetching page:', error);
    return null;
  }
}

function generateAuthorSlugs(authorName: string): string[] {
  const parts = authorName.toLowerCase().split(' ');
  const slugs = [];
  
  // Full name variations
  slugs.push(parts.join('-')); // nathan-smith
  slugs.push(parts.join('')); // nathansmith
  slugs.push(parts.join('_')); // nathan_smith
  slugs.push(parts.join('.')); // nathan.smith
  
  // First name only
  if (parts[0]) {
    slugs.push(parts[0]); // nathan
  }
  
  // Last name only
  if (parts[1]) {
    slugs.push(parts[1]); // smith
  }
  
  // First initial + last name
  if (parts[0] && parts[1]) {
    slugs.push(parts[0][0] + parts[1]); // nsmith
    slugs.push(parts[0][0] + '-' + parts[1]); // n-smith
  }
  
  return slugs;
}

function extractAuthorFromAboutPage(html: string, authorName: string): any {
  const result = {
    found: false,
    jobTitle: '',
    description: '',
    image: '',
    sameAs: [],
    knowsAbout: []
  };

  // Create a case-insensitive search pattern for the author
  const authorPattern = new RegExp(authorName.replace(/\s+/g, '\\s*'), 'i');
  
  // Look for author section
  const authorSectionPattern = new RegExp(
    `<[^>]+>([^<]*${authorName}[^<]*)<\\/[^>]+>([\\s\\S]*?)(?=<[^>]+>[^<]*(?:${authorName}|team|staff|about)[^<]*<\\/|$)`,
    'i'
  );
  
  const sectionMatch = html.match(authorSectionPattern);
  if (sectionMatch) {
    result.found = true;
    const sectionContent = sectionMatch[2];
    
    // Extract job title (usually follows name closely)
    const titlePatterns = [
      /<(?:h3|h4|p|span|div)[^>]*>([^<]+(?:writer|author|editor|journalist|contributor|specialist|expert|manager|director|founder|ceo|cto)[^<]*)</i,
      /(?:title|position|role)[:"\s]+([^<"]+)/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = sectionContent.match(pattern);
      if (match) {
        result.jobTitle = match[1].trim();
        break;
      }
    }
    
    // Extract bio/description
    const bioPattern = /<p[^>]*>([^<]{50,})</;
    const bioMatch = sectionContent.match(bioPattern);
    if (bioMatch) {
      result.description = bioMatch[1].trim();
    }
    
    // Extract social links
    const socialPatterns = [
      /href=["']([^"']*(?:linkedin|twitter|facebook|instagram)[^"']*)/gi,
      /href=["']([^"']*\/in\/[^"']*)/gi // LinkedIn specific
    ];
    
    for (const pattern of socialPatterns) {
      let match;
      while ((match = pattern.exec(sectionContent)) !== null) {
        if (!result.sameAs.includes(match[1])) {
          result.sameAs.push(match[1]);
        }
      }
    }
  }
  
  return result;
}

function extractAuthorFromProfilePage(html: string, authorName: string): any {
  const result = {
    found: false,
    jobTitle: '',
    description: '',
    image: '',
    sameAs: [],
    knowsAbout: [],
    worksFor: '',
    alumniOf: ''
  };

  // Check if this is actually the author's page
  if (!html.toLowerCase().includes(authorName.toLowerCase())) {
    return result;
  }

  result.found = true;

  // Extract job title
  const titlePatterns = [
    /<(?:h2|h3|p|span)[^>]*class=["'][^"']*(?:title|role|position|job)[^"']*["'][^>]*>([^<]+)</i,
    /(?:Job Title|Position|Role)[\s:]*<[^>]*>([^<]+)</i,
    /<meta[^>]+property=["']profile:job_title["'][^>]+content=["']([^"']+)["']/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      result.jobTitle = match[1].trim();
      break;
    }
  }

  // Extract bio
  const bioPatterns = [
    /<(?:div|p)[^>]*class=["'][^"']*(?:bio|about|description|summary)[^"']*["'][^>]*>([^<]+(?:<[^>]+>[^<]+)*)</i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  ];
  
  for (const pattern of bioPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.description = match[1].replace(/<[^>]+>/g, '').trim();
      break;
    }
  }

  // Extract expertise/knowledge areas
  const expertisePatterns = [
    /(?:expertise|specializes|knows about|expert in)[\s:]*([^<.]+)/i,
    /<(?:ul|div)[^>]*class=["'][^"']*(?:skills|expertise|specialties)[^"']*["'][^>]*>([\s\S]*?)<\/(?:ul|div)>/i
  ];
  
  for (const pattern of expertisePatterns) {
    const match = html.match(pattern);
    if (match) {
      // Extract individual items
      const items = match[1].match(/>([^<]+)</g);
      if (items) {
        result.knowsAbout = items.map(item => item.replace(/[><]/g, '').trim());
      }
      break;
    }
  }

  // Extract social profiles
  const socialUrls = html.match(/href=["']([^"']*(?:linkedin|twitter|facebook|instagram|youtube)[^"']*)/gi);
  if (socialUrls) {
    result.sameAs = socialUrls.map(url => url.replace(/href=["']/i, '').replace(/["']$/, ''));
  }

  // Extract organization
  const orgPatterns = [
    /(?:works? (?:at|for)|employed by)[\s:]*<[^>]*>([^<]+)</i,
    /(?:company|organization)[\s:]*<[^>]*>([^<]+)</i
  ];
  
  for (const pattern of orgPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.worksFor = match[1].trim();
      break;
    }
  }

  // Extract education
  const eduPatterns = [
    /(?:graduated from|alumni of|studied at)[\s:]*<[^>]*>([^<]+)</i,
    /(?:education|university|college)[\s:]*<[^>]*>([^<]+)</i
  ];
  
  for (const pattern of eduPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.alumniOf = match[1].trim();
      break;
    }
  }

  // Extract profile image
  const imgPatterns = [
    /<img[^>]+class=["'][^"']*(?:author|profile|avatar)[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+alt=["'][^"']*${authorName}[^"']*["'][^>]+src=["']([^"']+)["']/i
  ];
  
  for (const pattern of imgPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.image = match[1];
      if (result.image.startsWith('//')) {
        result.image = `https:${result.image}`;
      } else if (result.image.startsWith('/')) {
        // We'll need to make this absolute later with the base URL
        result.image = result.image;
      }
      break;
    }
  }

  return result;
}