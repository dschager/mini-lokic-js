import { Pool } from "mysql2/promise";
import { generateUUID } from "../utils/fileUtils";

// Save both the file metadata + GPT output into DB using a passed connection
export async function saveToDb(pool: Pool, url: string, fileId: string, analysis: string, assistantId: string): Promise<{imageId: string, hasChanges: boolean}> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT images.id, analysis_results FROM images 
       JOIN image_analysis ON images.id = image_analysis.image_id 
       WHERE url = ? ORDER BY images.created_at DESC LIMIT 1`,
      [url]
    );

    const existingImage = (existingRows as any[])[0];
    
    if (existingImage) {
      // Check if analysis_results is already an object or a string
      let existingAnalysis;
      if (typeof existingImage.analysis_results === 'string') {
        existingAnalysis = JSON.parse(existingImage.analysis_results);
      } else {
        existingAnalysis = existingImage.analysis_results; // Already an object
      }
      
      const newAnalysis = JSON.parse(analysis);
      
      const hasChanges = JSON.stringify(existingAnalysis) !== JSON.stringify(newAnalysis);
      
      if (!hasChanges) {
        console.log(`No changes detected for ${url}, skipping insert`);
        await connection.rollback();
        return { imageId: existingImage.id, hasChanges: false };
      }
    }

    // Continue with insert...
    const imageId = generateUUID();
    
    await connection.query(
      `INSERT INTO images(id, url, assistant_id, openai_file_id, created_at)
       VALUES (?, ?, ?, ?, UNIX_TIMESTAMP())`,
      [imageId, url, assistantId, fileId]
    );

    const analysisId = generateUUID();
    await connection.query(
      `INSERT INTO image_analysis(id, image_id, assistant_id, analysis_results, created_at)
       VALUES (?, ?, ?, CAST(? AS JSON), UNIX_TIMESTAMP())`,
      [analysisId, imageId, assistantId, analysis]
    );

    await connection.commit();
    return { imageId, hasChanges: true };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}