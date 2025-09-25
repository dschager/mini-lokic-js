import { Page } from "playwright";

export async function extractStories(
page: Page
): Promise<{ headline: string; imageUrl: string; dateText: string, storyUrl: string }[]> {
const originalUrl = page.url();
console.log(`Starting story extraction from: ${originalUrl}`);

const stories = await page.evaluate(() => {
const stories: { headline: string; imageUrl: string; dateText: string, storyUrl: string}[] = [];

const hostname = window.location.hostname.toLowerCase();

// Removes some titles found that are not articles
function isLikelyHeadline(text: string): boolean {
if (!text || typeof text !== 'string') return false;

const trimmedText = text.trim().replace(/\s+/g, " ");
const words = trimmedText.split(/\s+/);

// 1. Filter out articles with fewer than 4 words (names, etc)
if (words.length < 4) return false;

// 2. Filter out ALL-CAPS section headers
const lettersOnly = trimmedText.replace(/[^a-zA-Z]/g, "");
if (lettersOnly && lettersOnly === lettersOnly.toUpperCase()) return false;

// 3. Filter out promotional/subscription text
const lowerText = trimmedText.toLowerCase();
const promotionalPhrases = [
'get updates straight to your inbox',
'subscribe to our newsletter',
'sign up for updates',
'follow us on',
'join our newsletter',
'get the latest news',
'stay up to date',
'never miss a story',
'breaking news alerts',
'daily briefing',
'morning newsletter',
'evening update'
];
if (promotionalPhrases.some(phrase => lowerText.includes(phrase))) {
return false;
}

return true;
}

// Basic date extraction - very lenient
function findDateNearby(startElement: Element | null): string {
if (!startElement) return "";

// Try to find any text that might be a date
let currentElement: Element | null = startElement;
let levels = 0;

while (currentElement && levels < 3) {
// Look for any element that might contain date info
const allElements = Array.from(currentElement.querySelectorAll("*"));

for (const el of allElements) {
const htmlEl = el as HTMLElement;
const texts = [
el.getAttribute("datetime"),
el.getAttribute("data-date"),
el.getAttribute("data-timestamp"),
el.getAttribute("data-time"),
el.getAttribute("title"),
htmlEl.innerText?.trim(),
el.textContent?.trim()
].filter(Boolean);

for (const text of texts) {
if (text && text.length > 2 && text.length < 100) {
// Very basic check - contains digits
if (/\d/.test(text)) {
return text.trim();
}
}
}
}

currentElement = currentElement.parentElement;
levels++;
}

return "";
}

// Site-specific selectors for better accuracy
const siteSpecificSelectors: Record<
string,
{ containers: string[]; headlines: string[]; images: string[] }
> = {
"cnn.com": {
containers: [".card", ".cd__wrapper", ".container__item"],
headlines: [".cd__headline", ".cd__headline-text", "h3 a", ".container__headline"],
images: [".media__image", ".image__picture img", "img"],
},
"bbc.com": {
containers: [".media", ".gs-c-promo", ".gel-layout__item"],
headlines: [".media__title", ".gs-c-promo-heading__title", ".gel-trafalgar"],
images: [".media__image img", ".gs-c-promo-image img", "img"],
},
"reuters.com": {
containers: [".story-card", ".media-story-card", ".article-wrap"],
headlines: [".story-title", ".media-story-card__headline__eqhp9", "h2 a", "h3 a"],
images: [".story-photo img", ".media-story-card__photo__lhp2s img", "img"],
},
"apnews.com": {
containers: [".CardHeadline", ".Component-root", ".card"],
headlines: [".CardHeadline-headline", ".Component-headline", "h1", "h2", "h3"],
images: [".Image", ".Component-image img", "img"],
},
"foxnews.com": {
containers: [".article", ".content", ".story"],
headlines: [".title a", ".headline a", "h2 a", "h3 a", ".article-title"],
images: [".m img", ".image img", "img"],
},
};

// Generic fallback selectors
const genericSelectors = {
containers: [
"article", ".article", ".story", ".card", ".post", ".item", ".entry",
".news-item", ".content-item", ".tile", ".teaser", ".snippet", 
".stream-item", ".post-block", "[data-story]", ".feed-item", 
".list-item", ".grid-item", ".carousel-item"
],
headlines: [
"h1", "h2", "h3", "h4", "h5", ".headline", ".title", ".heading", 
".header", ".story-title", ".article-title", ".post-title", 
".entry-title", ".news-title", ".card-title", ".item-title",
"a[data-ga-headline]", "[data-headline]", ".link-title", 
".teaser-headline", ".summary-title", ".content-title"
],
images: [
"img", ".image img", ".photo img", ".picture img", ".media img",
".thumbnail img", ".featured-image img", ".story-image img", 
".article-image img", ".post-image img"
],
};

// Pick site-specific selectors if applicable
let selectors = genericSelectors;
for (const site in siteSpecificSelectors) {
if (hostname.includes(site)) {
selectors = siteSpecificSelectors[site];
console.log(`Using site-specific selectors for ${site}`);
break;
}
}

// Find containers
let containers: Element[] = [];
for (const containerSelector of selectors.containers) {
const found = Array.from(document.querySelectorAll(containerSelector));
if (found.length > 0) {
containers = found;
console.log(`Found ${found.length} containers using selector: ${containerSelector}`);
break;
}
}

// Fallback: detect by headline parent
if (containers.length === 0) {
console.log("No containers found, trying individual story detection...");
const allHeadlines = document.querySelectorAll(selectors.headlines.join(", "));
const containerSet = new Set<Element>();
allHeadlines.forEach((headline) => {
let parent = headline.parentElement;
let attempts = 0;
while (parent && attempts < 5) {
const hasImage = parent.querySelector("img");
if (hasImage) {
containerSet.add(parent);
break;
}
parent = parent.parentElement;
attempts++;
}
});
containers = Array.from(containerSet);
console.log(`Found ${containers.length} containers by headline-parent detection`);
}

console.log(`Processing ${containers.length} total containers...`);

// Process each container
containers.forEach((container, index) => {
try {
let headline = "";
let headlineElement: Element | null = null;

// Extract headline
for (const headlineSelector of selectors.headlines) {
headlineElement = container.querySelector(headlineSelector);
if (headlineElement) {
headline =
headlineElement.textContent?.trim() ||
headlineElement.getAttribute("title")?.trim() ||
headlineElement.getAttribute("aria-label")?.trim() ||
"";
if (!headline && headlineElement.tagName === "A") {
headline = (headlineElement as HTMLAnchorElement).innerText?.trim() || "";
}
if (headline && headline.length > 5) {
break;
}
}
}

//Extract story URL
let storyUrl = "";
if (headlineElement && headlineElement.tagName === "A") {
storyUrl = (headlineElement as HTMLAnchorElement).href || "";
} else {
const linkEl = container.querySelector("a[href]");
if (linkEl) {
storyUrl = (linkEl as HTMLAnchorElement).href || "";
}
}

// Extract image
let imageUrl = "";
for (const imageSelector of selectors.images) {
const imgElement = container.querySelector(imageSelector) as HTMLImageElement;
if (
imgElement &&
imgElement.src &&
imgElement.complete &&
imgElement.naturalWidth > 0 &&
imgElement.naturalHeight > 0
) {
imageUrl = imgElement.src;
break;
}
}

// Try to find date on main page
let dateText = findDateNearby(headlineElement || container);

// Headline checks
if (headline && isLikelyHeadline(headline)) {
stories.push({
headline: headline.replace(/\s+/g, " ").trim(),
imageUrl: imageUrl ? new URL(imageUrl, window.location.href).href : "",
dateText,
storyUrl,
});
console.log(
`✓ Story ${index + 1}: "${headline.substring(0, 60)}..." (image: ${
imageUrl ? "yes" : "missing"
}, date: ${dateText || "MISSING"}, url: ${storyUrl ? "yes" : "missing"})`
);
}
} catch (err) {
console.warn(`Error processing container ${index + 1}:`, err);
}
});

console.log(`Extracted ${stories.length} valid stories from main page`);
return stories;
});

// Check for stories with missing dates
const storiesWithMissingDates = stories.filter(story => 
!story.dateText || 
story.dateText.trim() === "" || 
story.dateText.toLowerCase().includes("missing")
);

console.log(`🔍 Found ${storiesWithMissingDates.length} stories with missing dates`);

if (storiesWithMissingDates.length > 0) {
// Limit to prevent timeout issues
const storiesToCheck = storiesWithMissingDates.slice(0, 8);
console.log(`📰 Will visit ${storiesToCheck.length} story URLs to extract dates...`);

for (let i = 0; i < storiesToCheck.length; i++) {
const story = storiesToCheck[i];

if (!story.storyUrl) {
console.log(`⚠️  Story ${i + 1}: No URL available`);
continue;
}

console.log(`🌐 Visiting story ${i + 1}/${storiesToCheck.length}: ${story.storyUrl.substring(0, 80)}...`);

try {
// Navigate to story URL with shorter timeout
await page.goto(story.storyUrl, { 
waitUntil: 'domcontentloaded', 
timeout: 12000 
});

// Wait a bit for content to load
await page.waitForTimeout(1000);

// Multiple extraction methods
const extractedDate = await page.evaluate(() => {
console.log("Starting date extraction on article page...");

// Method 1: Structured data (JSON-LD)
try {
const scripts = document.querySelectorAll('script[type="application/ld+json"]');
for (const script of Array.from(scripts)) {
const data = JSON.parse(script.textContent || "{}");
if (data.datePublished || data.dateCreated) {
console.log("Found date in JSON-LD:", data.datePublished || data.dateCreated);
return data.datePublished || data.dateCreated;
}
}
} catch (e) {
console.log("JSON-LD extraction failed:", e);
}

// Method 2: Meta tags
const metaSelectors = [
'meta[property="article:published_time"]',
'meta[property="datePublished"]', 
'meta[name="publishdate"]',
'meta[name="date"]',
'meta[name="DC.date"]',
'meta[property="article:published"]'
];

for (const selector of metaSelectors) {
const meta = document.querySelector(selector);
if (meta) {
const content = meta.getAttribute("content");
if (content) {
console.log(`Found date in meta tag ${selector}:`, content);
return content;
}
}
}

// Method 3: Time elements with datetime
const timeElements = document.querySelectorAll('time[datetime]');
for (const time of Array.from(timeElements)) {
const datetime = time.getAttribute("datetime");
if (datetime) {
console.log("Found datetime in time element:", datetime);
return datetime;
}
}

// Method 4: Common article date classes
const articleDateSelectors = [
'.published-date', '.publish-date', '.article-date', '.story-date',
'.date-published', '.publication-date', '.post-date', '.entry-date',
'.byline-date', '.timestamp', '.article-time', '.publish-time',
'[class*="publish"]', '[class*="date"]', '[class*="time"]'
];

for (const selector of articleDateSelectors) {
const elements = document.querySelectorAll(selector);
for (const el of Array.from(elements)) {
const htmlEl = el as HTMLElement;
const text = htmlEl.innerText?.trim() || el.textContent?.trim();
if (text && text.length > 2 && text.length < 100 && /\d/.test(text)) {
console.log(`Found date in ${selector}:`, text);
return text;
}
}
}

// Method 5: Search in byline or author information
const bylineSelectors = ['.byline', '.author', '.article-meta', '.story-meta'];
for (const selector of bylineSelectors) {
const elements = document.querySelectorAll(selector);
for (const el of Array.from(elements)) {
const text = el.textContent?.trim() || "";
// Look for date patterns in byline text
const dateMatch = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{2,4}\b/i) ||
text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
text.match(/\d{4}-\d{1,2}-\d{1,2}/) ||
text.match(/\d+\s+(?:hour|day|week|month)s?\s+ago/i);
if (dateMatch) {
console.log(`Found date in byline ${selector}:`, dateMatch[0]);
return dateMatch[0];
}
}
}

// Method 6: Fallback - search entire page for date patterns (last resort)
const bodyText = document.body.textContent || "";
const patterns = [
/published[\s:]+([^.!?\n]{1,50}(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^.!?\n]{1,20})/i,
/updated[\s:]+([^.!?\n]{1,50}(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^.!?\n]{1,20})/i,
/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4}\b/i,
/\b\d{4}-\d{2}-\d{2}\b/,
/\b\d{1,2}\/\d{1,2}\/\d{4}\b/
];

for (const pattern of patterns) {
const match = bodyText.match(pattern);
if (match) {
const found = match[1] || match[0];
if (found.length < 50) {
console.log("Found date in body text:", found);
return found.trim();
}
}
}

console.log("No date found on article page");
return "";
});

if (extractedDate && extractedDate.trim()) {
story.dateText = extractedDate.trim();
console.log(`✅ Extracted date: "${extractedDate}"`);
} else {
console.log(`❌ No date found on article page`);
story.dateText = ""; // Explicitly set to empty
}

} catch (error) {
console.warn(`⚠️  Failed to visit ${story.storyUrl}:`, (error as Error).message);
story.dateText = ""; // Set to empty if failed to visit
}

// Small delay between requests
await page.waitForTimeout(500);
}

// Return to original URL
try {
console.log(`🔙 Returning to original page: ${originalUrl}`);
await page.goto(originalUrl, { 
waitUntil: 'domcontentloaded', 
timeout: 15000 
});
} catch (error) {
console.warn(`⚠️  Failed to return to original page:`, (error as Error).message);
}
}

const finalStats = {
total: stories.length,
withDates: stories.filter(s => s.dateText && s.dateText.trim() !== "").length,
withUrls: stories.filter(s => s.storyUrl && s.storyUrl.trim() !== "").length
};

console.log(`📊 Final extraction results: ${finalStats.withDates}/${finalStats.total} stories have dates, ${finalStats.withUrls}/${finalStats.total} have URLs`);

return stories;
}