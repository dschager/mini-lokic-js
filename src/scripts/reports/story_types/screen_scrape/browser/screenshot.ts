import path from "path";
import { Browser, Page } from "playwright";
import { CONFIG } from "../config";
import { safeName, sleep } from "../utils/fileUtils";
import { hashImageContent } from "../utils/hashUtils";
import { ensureAllImagesLoaded } from "./ensureImages";
import { extractStories } from "./extractStories";

export interface StoryData {
  headline: string;
  imageUrl: string;
  hash: string;
  dateText: string;
  storyUrl: string;
}

// Optimized screenshot function with multiple strategies and retries
export async function grabScreenshot(
  browser: Browser,
  url: string,
  outdir: string,
  retryCount = 0
): Promise<{
  screenshotPath: string | null;
  page: Page | null;
  storyData: StoryData[];
}> {
  const fname = safeName(url);
  const fpath = path.join(outdir, fname);
  let page: Page | null = null;

  try {
    page = await browser.newPage();

    // Configure page for better loading
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    });

    // Do NOT block images - we need them to load!
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["font", "other"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Load page
    try {
      await page.goto(url, {
        waitUntil: "load",
        timeout: 45000,
      });
    } catch (err) {
      console.warn(
        `Load strategy failed, trying networkidle: ${(err as Error).message}`
      );
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
    }

    // Wait for images to load
    await ensureAllImagesLoaded(page);

    // Scroll to trigger lazy loading
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 200;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            setTimeout(resolve, 1000);
          }
        }, 100);
      });
    });

    await ensureAllImagesLoaded(page);

    console.log(`🔍 Extracting story data with improved headline detection...`);

    // Use improved story extraction (now includes dateText if found)
    const extractedStoryData = await extractStories(page);

    console.log(
      `📊 Found ${extractedStoryData.length} stories with improved headline extraction`
    );

    // Hash images (empty if no image)
    const storyDataPromises = extractedStoryData.map(async (story) => {
      const hash =
        story.imageUrl && story.imageUrl.length > 0
          ? await hashImageContent(story.imageUrl)
          : "";
      return {
        headline: story.headline,
        imageUrl: story.imageUrl,
        hash,
        dateText: (story as any).dateText || "",
        storyUrl: story.storyUrl || "",
      } as StoryData;
    });

    const storyData = (await Promise.all(storyDataPromises)).filter(
      (story) => story.headline
    );

    console.log(`📸 Taking screenshot for ${url}...`);

    // Take screenshot
    await page.screenshot({
      path: fpath,
      fullPage: true,
      timeout: 20000,
    });

    console.log(
      `✅ Screenshot completed for ${url} with ${storyData.length} valid stories`
    );
    return { screenshotPath: fpath, page, storyData };
  } catch (err) {
    const error = err as Error;
    console.error(
      `[Attempt ${retryCount + 1}] Error processing ${url}: ${error.message}`
    );

    if (page) {
      await page.close().catch(() => {});
    }

    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(
        `Retrying ${url} in ${CONFIG.RETRY_DELAY}ms... (${
          retryCount + 1
        }/${CONFIG.MAX_RETRIES})`
      );
      await sleep(CONFIG.RETRY_DELAY);
      return grabScreenshot(browser, url, outdir, retryCount + 1);
    }

    console.error(
      `⚠️  Final failure for ${url} after ${CONFIG.MAX_RETRIES + 1} attempts`
    );
    return { screenshotPath: null, page: null, storyData: [] };
  }
}
