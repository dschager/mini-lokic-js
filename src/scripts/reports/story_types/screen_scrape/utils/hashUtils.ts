import crypto from "crypto";
import axios from "axios";

// Compute SHA256 hash of actual image content from URL with better error handling
export async function hashImageContent(url: string): Promise<string> {
  try {
    const response = await axios.get(url, { 
      responseType: "arraybuffer",
      timeout: 10000, // Reduced timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 5
    });
    const buffer = Buffer.from(response.data);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch (err) {
    console.warn(`Failed to hash image ${url}:`, (err as Error).message);
    return "";
  }
}