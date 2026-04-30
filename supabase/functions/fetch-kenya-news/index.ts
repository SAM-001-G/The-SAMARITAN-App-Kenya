import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Kenyan news RSS feeds — civic, corruption, infrastructure, environment
const RSS_FEEDS: { url: string; source: string; category: string }[] = [
  { url: "https://www.nation.africa/kenya/rss", source: "Nation Africa", category: "public" },
  { url: "https://www.standardmedia.co.ke/rss/headlines", source: "Standard Media", category: "public" },
  { url: "https://www.the-star.co.ke/rss", source: "The Star Kenya", category: "public" },
  { url: "https://www.kbc.co.ke/feed/", source: "KBC", category: "public" },
  { url: "https://citizen.digital/feed", source: "Citizen Digital", category: "public" },
];

// Category classification based on keywords in title/description
function classifyArticle(title: string, desc: string): string {
  const text = (title + " " + desc).toLowerCase();
  if (/corrupt|brib|theft|stolen|fraud|embezzl|scandal|graft|nyumba|ghost|phantom|kickback/i.test(text)) return "corruption";
  if (/stall|abandon|incomplete|unfinish|contrator|project halt|pause|tender/i.test(text)) return "abandoned";
  if (/pollut|dump|environ|waste|forest|river|plastic|climate|flood|drought/i.test(text)) return "environment";
  if (/accident|injur|danger|unsafe|collapse|fire|flood|road|pothole|bridge/i.test(text)) return "safety";
  if (/hospital|school|water|electric|nairob|county|government|ministry|service|huduma/i.test(text)) return "public";
  return "public";
}

// Parse RSS XML manually (no external XML parser)
function parseRSS(xml: string): { title: string; description: string; url: string; imageUrl: string; publishedAt: string }[] {
  const items: { title: string; description: string; url: string; imageUrl: string; publishedAt: string }[] = [];

  // Extract <item> blocks
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const getTag = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<\\!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };

    const title = getTag("title").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    const description = getTag("description").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim().slice(0, 300);
    const link = getTag("link") || getTag("guid");
    const pubDate = getTag("pubDate");

    // Try to get image from media:content or enclosure
    let imageUrl = "";
    const mediaMatch = block.match(/media:content[^>]+url=["']([^"']+)["']/i) || block.match(/enclosure[^>]+url=["']([^"']+)["']/i);
    if (mediaMatch) imageUrl = mediaMatch[1];

    if (title && link) {
      items.push({ title, description, url: link, imageUrl, publishedAt: pubDate });
    }
  }

  return items;
}

async function fetchFeed(feed: { url: string; source: string; category: string }): Promise<
  { source: string; title: string; description: string; url: string; image_url: string; category: string; published_at: string | null }[]
> {
  try {
    const resp = await fetch(feed.url, {
      headers: { "User-Agent": "Samaritan-NewsBot/1.0 (Kenya Civic Platform)" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return [];

    const xml = await resp.text();
    const parsed = parseRSS(xml);

    return parsed.slice(0, 15).map((item) => ({
      source: feed.source,
      title: item.title,
      description: item.description || "No description available.",
      url: item.url,
      image_url: item.imageUrl,
      category: classifyArticle(item.title, item.description),
      published_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all feeds in parallel
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));

    const articles: {
      source: string;
      title: string;
      description: string;
      url: string;
      image_url: string;
      category: string;
      published_at: string | null;
    }[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        articles.push(...result.value);
      }
    }

    // Filter Kenyan/civic relevant articles
    const civicKeywords = /kenya|nairobi|mombasa|kisumu|nakuru|county|cabinet|parliament|uhuru|ruto|odinga|kra|kplc|ntsa|kebs|nema|nhif|nssf|wajir|mandera|garissa|turkana/i;
    const relevant = articles.filter(
      (a) =>
        civicKeywords.test(a.title + " " + a.description) ||
        a.category !== "public"
    );

    if (relevant.length > 0) {
      const { error } = await supabase
        .from("news_articles")
        .upsert(relevant, { onConflict: "url", ignoreDuplicates: true });

      if (error) {
        console.error("Upsert error:", error.message);
      }
    }

    // Clean up old articles (keep latest 200)
    await supabase.rpc("cleanup_old_news").catch(() => {});

    return new Response(
      JSON.stringify({ fetched: articles.length, saved: relevant.length, sources: RSS_FEEDS.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
