import { Pool } from "mysql2/promise";
import { generateUUID } from "../utils/fileUtils";

export async function saveImageMetadata(
  pool: Pool,
  imageId: string,
  assistantId: string,
  stories: {
    headline: string;
    imageUrl: string;
    hash: string;
    dateText: string;
    storyUrl: string;
  }[]
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const sql = `
      INSERT INTO image_metadata
      (id, image_id, headline, image_hash, image_url, date_text, story_url, assistant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (const story of stories) {
      await conn.execute(sql, [
        generateUUID(),
        String(imageId),
        String(story.headline),
        String(story.hash || ""),
        String(story.imageUrl || ""),
        story.dateText ? String(story.dateText) : null,
        story.storyUrl ? String(story.storyUrl) : null,
        String(assistantId),
      ]);
    }
    
  } finally {
    conn.release();
  }
}
