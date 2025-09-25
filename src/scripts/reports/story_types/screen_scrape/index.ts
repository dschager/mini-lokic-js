import fs from "fs";
import path from "path";
import { chromium, Browser } from "playwright";
import { Pool } from "mysql2/promise";
import { CONFIG } from "./config";
import { DB02 } from "../../../../config/constants";
import { MysqlService } from "../../../../services/Mysql.service";
import { SlackWebService } from "../../../../services/Slack.service";
import { chunk } from "./pipeline/chunk";
import { processUrl } from "./pipeline/processURL";

// Main pipeline with concurrency
export async function ScreenshotAnalyze(inputFile: string) {
  console.log(`[${new Date().toISOString()}] 🚀 Starting Web Page Analyzer...`);

  let browser: Browser | undefined;
  let pool: Pool | undefined;

  try {
    // Read URLs
    const urls = fs.readFileSync(inputFile, "utf-8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));

    console.log(`📋 Found ${urls.length} URLs to process`);

    const outdir = path.resolve("shots");
    if (!fs.existsSync(outdir)) fs.mkdirSync(outdir);

    browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-extensions', '--no-sandbox'] 
    });

    // Get assistant info and create single pool instance
    pool = MysqlService(DB02, "AI_staff");
    let assistantId: string;
    let modelId: string;

    {
      const connection = await pool.getConnection();
      try {
        const [assistants] = await connection.query(
          `SELECT id, model FROM assistants WHERE name = 'ScreenshotAnalyzer' LIMIT 1`
        );
        if (!assistants || (assistants as any[]).length === 0) throw new Error("No assistant found in DB");

        const assistant = (assistants as any[])[0] as { id: string; model: string };
        assistantId = assistant.id;
        modelId = assistant.model;
      } finally {
        connection.release();
      }
    }

    // Process URLs in concurrent batches
    const urlChunks = chunk(urls, CONFIG.CONCURRENT_LIMIT);
    let processedCount = 0;
    let successCount = 0;

    for (const urlChunk of urlChunks) {
      console.log(`\n🔄 Processing batch ${Math.ceil((processedCount + 1) / CONFIG.CONCURRENT_LIMIT)} of ${urlChunks.length} (${urlChunk.length} URLs)`);
      
      const batchPromises = urlChunk.map(url => 
        processUrl(browser!, url, outdir, pool!, assistantId, modelId)
          .then(() => {
            successCount++;
            return { url, success: true };
          })
          .catch(err => {
            console.error(`❌ Batch error for ${url}:`, err);
            return { url, success: false, error: err };
          })
      );

      await Promise.allSettled(batchPromises);
      processedCount += urlChunk.length;
      
      console.log(`📊 Batch complete: ${processedCount}/${urls.length} URLs processed`);
    }

    console.log(`\n📈 Final Results: ${successCount}/${urls.length} URLs successfully processed`);
    
    // Close database pool
    await pool.end();

    console.log(`[${new Date().toISOString()}] ✅ Analysis complete!`);
    
  } catch (err) {
    console.error("💥 Fatal error:", err);
    
    // Clean up database pool
    if (pool) {
      try {
        await pool.end();
      } catch (poolError) {
        console.error("Error closing database pool:", poolError);
      }
    }
    
    if (CONFIG.useSlack) {
      await SlackWebService.chat.postMessage({
        channel: CONFIG.slackChannel,
        text: `*[MediaMonitor]::[ERROR]*\n>${(err as Error).message}`
      });
      const response = await SlackWebService.chat;
    console.log(response); // check if ok === true
    }
  } finally {
    if (browser) await browser.close();
  }
}

// Allow running directly
if (require.main === module) {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: ts-node <script_name>.ts <path_to_urls_file>");
    process.exit(1);
  }
  const resolvedPath = path.resolve(__dirname, inputFile);
  ScreenshotAnalyze(resolvedPath);
}