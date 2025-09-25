import fs from "fs";
import { OpenAI } from "../../../../../services/OpenAI.service";
import { sleep } from "../utils/fileUtils";

// Upload screenshot to OpenAI with retry logic
export async function uploadToOpenAI(filePath: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const stream = fs.createReadStream(filePath);
      const fileObj = await OpenAI.files.create({ file: stream as any, purpose: "vision" });
      return fileObj.id;
    } catch (err) {
      console.warn(`Upload attempt ${i + 1} failed:`, (err as Error).message);
      if (i === retries) throw err;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
  throw new Error("Upload failed after all retries");
}