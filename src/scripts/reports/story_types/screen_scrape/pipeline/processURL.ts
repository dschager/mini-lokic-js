import fs from "fs";
import { Browser } from "playwright";
import { Pool } from "mysql2/promise";
import { CONFIG } from "../config";
import { SlackWebService } from "../../../../../services/Slack.service";
import { grabScreenshot } from "../browser/screenshot";
import { analyzeWithGPT } from "../ai/gptAnalysis";
import { uploadToOpenAI } from "../ai/openAIUpload";
import { saveToDb } from "../db/saveTo";
import { generateSlackMessage } from "../slack/slackMessage";
import { saveImageMetadata } from "../browser/saveImageMetadata";
import { processStoriesWithDates, findOldStories, ParsedDateResult } from "../utils/dateUtils";

// Helper function to normalize headlines for comparison
function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Normalize spaces
}

// Extended StoryData interface to include parsed date info
interface ExtendedStoryData {
  headline: string;
  imageUrl: string;
  hash: string;
  dateText: string;
  storyUrl: string;
  parsedDateInfo: ParsedDateResult;
}

// Process a single URL (extracted for concurrency)
export async function processUrl(
  browser: Browser,
  url: string,
  outdir: string,
  pool: Pool,
  assistantId: string,
  modelId: string
): Promise<void> {
  console.log(`🔄 Processing: ${url}`);

  const { screenshotPath, page, storyData } = await grabScreenshot(browser, url, outdir);
  
  if (!screenshotPath) {
    console.log(`❌ Skipping ${url} - screenshot failed after all retries`);
    return;
  }

  try {
    // 1. Process all stories with date parsing and age calculation
    const storiesWithDates: ExtendedStoryData[] = processStoriesWithDates(storyData);
    
    console.log(`📅 Date parsing results for ${storiesWithDates.length} stories:`);

    // 2. Analyze for reused photos using hashes (ONLY count different articles)
    const imageHashes: Record<string, { headline: string; normalizedHeadline: string }[]> = {};
    
    storiesWithDates.forEach(({ headline, hash }) => {
        if (!hash) return;
        if (!imageHashes[hash]) imageHashes[hash] = [];
        
        const normalizedHeadline = normalizeHeadline(headline);
        
        // Only add if we don't already have this normalized headline for this hash
        const alreadyExists = imageHashes[hash].some(
          item => item.normalizedHeadline === normalizedHeadline
        );
        
        if (!alreadyExists) {
          imageHashes[hash].push({ headline, normalizedHeadline });
        } else {
          console.log(`🔄 Skipping duplicate article: "${headline}" (same image, same story)`);
        }
    });
    
    // Only consider it a "reused photo group" if there are different articles using the same image
    const reusedPhotoGroups = CONFIG.useDuplicatePhotos ? Object.entries(imageHashes)
      .filter(([_, articles]) => articles.length > 1)
      .map(([_, articles]) => articles.map(a => a.headline))
      : [];
    
    console.log(`📊 Found ${reusedPhotoGroups.length} duplicate image sets from ${storiesWithDates.length} stories for ${url} (excluding same articles)`);

    // 3. Find old stories using our manual date calculation (not GPT)
    const oldStories = CONFIG.useOldStories ? findOldStories(storiesWithDates, CONFIG.DAYS_OLD) : [];
    console.log(`📅 Found ${oldStories.length} stories older than ` + CONFIG.DAYS_OLD + ` days using manual date calculation`);

    // 4. Find stories with missing images
    const missingImages = CONFIG.useMissingImages 
      ? storiesWithDates.filter(story => !story.imageUrl || story.imageUrl.length === 0)
      : [];
    console.log(`🖼️ Found ${missingImages.length} stories with missing images`);

    // 5. Filter unique stories for GPT (removing duplicates)
    const uniqueStories = storiesWithDates.filter((story, index, array) => {
      const normalizedHeadline = normalizeHeadline(story.headline);
      const firstIndex = array.findIndex(s => 
        normalizeHeadline(s.headline) === normalizedHeadline && s.hash === story.hash
      );
      return firstIndex === index; // Keep only the first occurrence
    });

    if (CONFIG.useGPTAnalysis) {
      console.log(`📝 Sending ${uniqueStories.length} unique stories to GPT (filtered from ${storiesWithDates.length} total)`);
    } else {
      console.log(`📝 Processing ${uniqueStories.length} unique stories locally (filtered from ${storiesWithDates.length} total)`);
    }

    // 6. Prepare data for GPT analysis (only if enabled)
    let gptResponse = "{}"; // Default empty response
    let fileId = null;

    if (CONFIG.useGPTAnalysis) {
      const promises: Promise<any>[] = [
        analyzeWithGPT(url, modelId, uniqueStories.map(s => ({
          headline: s.headline,
          imageUrl: s.imageUrl,
          hash: s.hash,
          dateText: s.dateText
        })))
      ];

      // Only upload screenshot if vision analysis is enabled
      if (CONFIG.useScreenshotAnalysis) {
        promises.unshift(uploadToOpenAI(screenshotPath));
      }

      const results = await Promise.all(promises);
      fileId = CONFIG.useScreenshotAnalysis ? results[0] : null;
      gptResponse = CONFIG.useScreenshotAnalysis ? results[1] : results[0];
    } else {
      console.log("🔄 Skipping ChatGPT analysis - using local analysis only");
    }

    let finalAnalysis: Record<string, any>;

    // 7. Process GPT analysis for reused people (only if GPT is enabled and person analysis is on)
    let reusedPersonGroups: string[][] = [];

    if (CONFIG.useGPTAnalysis) {
      try {
        const gptAnalysis = JSON.parse(gptResponse);

        if (CONFIG.usePersonAnalysis && gptAnalysis.people_in_stories) {
            const peopleHashes: Record<string, string[]> = {};
            gptAnalysis.people_in_stories.forEach(({ headline, person_hash }: { headline: string; person_hash: string }) => {
              if (!headline || !person_hash) return;
              if (!uniqueStories.some(s => s.headline === headline)) return;

              if (!peopleHashes[person_hash]) peopleHashes[person_hash] = [];
              peopleHashes[person_hash].push(headline);
            });
            reusedPersonGroups = Object.values(peopleHashes).filter(arr => arr.length > 1);
        }
      } catch (parseError) {
        console.error(`JSON Parse Error for ${url}:`, parseError);
        console.log("🔄 Continuing with local analysis only due to GPT parse error");
      }
    }

    // 8. Consolidate all issues using our manual calculations (always use local data)
    const oldStoriesFormatted = oldStories.map(story => ({
      headline: story.headline,
      visible_date: story.parsedDateInfo.originalText,
      age_days: story.parsedDateInfo.ageDays
    }));

    const missingImagesFormatted = missingImages.map(story => ({
      headline: story.headline
    }));

    finalAnalysis = {
        extracted_stories_count: storyData.length,
        unique_stories_count: uniqueStories.length,
        duplicate_articles_filtered: storyData.length - uniqueStories.length,
        valid_dates_parsed: storiesWithDates.filter(s => s.parsedDateInfo.isValid).length,
        invalid_dates_found: storiesWithDates.filter(s => !s.parsedDateInfo.isValid).length,
        ...(CONFIG.useDuplicatePhotos && { reused_photo_groups: reusedPhotoGroups }),
        ...(CONFIG.usePersonAnalysis && { reused_person_groups: reusedPersonGroups }),
        ...(CONFIG.useMissingImages && { missing_images: missingImagesFormatted, }),
        ...(CONFIG.useOldStories && { old_stories: oldStoriesFormatted }),
        analysis_source: CONFIG.useGPTAnalysis ? "hybrid" : "local",
        url
    };

    console.log(`✅ Analysis complete for ${url} (${finalAnalysis.analysis_source} mode):`, finalAnalysis);
    
    // Save to DB (using original storyData for compatibility)
    const analysis = JSON.stringify(finalAnalysis);
    //const imageId = await saveToDb(pool, url, fileId, analysis, assistantId);
    const { imageId, hasChanges } = await saveToDb(pool, url, fileId, analysis, assistantId);
    console.log(`✅ Processed ${url} -> File ID: ${fileId}, Image ID: ${imageId}`);
    await saveImageMetadata(pool, imageId, assistantId, storyData);
    console.log(`✅ Saved ${storyData.length} stories into image_metadata for ${url}`);
    
    
    if (CONFIG.useSlack && hasChanges) {
      const slackMessage = generateSlackMessage(finalAnalysis);

      if (slackMessage) {
        try {
          // 1️⃣ Post main message (summary only)
          const mainMessage = await SlackWebService.chat.postMessage({
            channel: CONFIG.slackChannel,
            text: `*[MediaMonitor]*\n${slackMessage.summary}`
          });

          // 2️⃣ Post detailed information as thread
          if (slackMessage.details) {
            await SlackWebService.chat.postMessage({
              channel: CONFIG.slackChannel,
              text: slackMessage.details,
              thread_ts: mainMessage.ts
            });
          }

          console.log("✅ Slack summary + threaded details sent");

        } catch (err) {
          console.error("❌ Slack upload failed:", err);
        }
      } else {
        console.log("No Slack message needed");
      }
    }

  } catch (err) {
    console.error(`❌ Error processing ${url}:`, err);
    throw err;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(screenshotPath) && !CONFIG.keepScreenshots) {
        fs.unlinkSync(screenshotPath);
      }
    } catch (cleanupErr) {
      console.warn(`Cleanup error for ${screenshotPath}:`, cleanupErr);
    }
    
    if (page) {
      await page.close().catch(() => {});
    }
  }
}