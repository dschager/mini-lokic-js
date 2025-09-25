import axios from 'axios';
import sharp from 'sharp';
import crypto from 'crypto';

// Simple perceptual hash implementation using Sharp
export class PerceptualHash {
  private static HASH_SIZE = 8; // 8x8 grid for dHash
  private static RESIZE_SIZE = 9; // 9x8 for difference hash

  // Download image as buffer with better error handling
  static async downloadImage(url: string): Promise<Buffer> {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache'
        }
      });
      
      console.log(`✅ Downloaded image: ${url} (${response.data.byteLength} bytes)`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`❌ Failed to download image ${url}:`, error);
      throw error;
    }
  }

  // Convert image to grayscale and resize using Sharp
  static async preprocessImage(imageBuffer: Buffer): Promise<number[][]> {
    try {
      // Use Sharp to process the image - supports WebP, AVIF, PNG, JPEG, etc.
      const { data: pixels, info } = await sharp(imageBuffer)
        .resize(this.RESIZE_SIZE, this.HASH_SIZE, {
          fit: 'fill',
          kernel: sharp.kernel.nearest
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      console.log(`✅ Processed image: ${info.width}x${info.height}, ${info.channels} channels`);
      
      // Convert buffer to 2D array
      const grayscale: number[][] = [];
      for (let y = 0; y < this.HASH_SIZE; y++) {
        grayscale[y] = [];
        for (let x = 0; x < this.RESIZE_SIZE; x++) {
          const i = y * this.RESIZE_SIZE + x;
          grayscale[y][x] = pixels[i];
        }
      }
      
      return grayscale;
    } catch (error) {
      console.error('❌ Error preprocessing image with Sharp:', error);
      throw error;
    }
  }

  // Generate difference hash (dHash) - more robust than average hash
  static generateDHash(grayscalePixels: number[][]): string {
    const hash: number[] = [];
    
    // Compare adjacent pixels horizontally
    for (let y = 0; y < this.HASH_SIZE; y++) {
      for (let x = 0; x < this.HASH_SIZE; x++) { // 8 comparisons per row
        const current = grayscalePixels[y][x];
        const next = grayscalePixels[y][x + 1];
        hash.push(current > next ? 1 : 0);
      }
    }
    
    // Convert binary array to hex string
    let hexHash = '';
    for (let i = 0; i < hash.length; i += 4) {
      const nibble = hash[i] * 8 + hash[i + 1] * 4 + hash[i + 2] * 2 + hash[i + 3];
      hexHash += nibble.toString(16);
    }
    
    console.log(`✅ Generated dHash: ${hexHash}`);
    return hexHash;
  }

  // Alternative: Generate average hash (aHash) - sometimes more forgiving
  static generateAHash(grayscalePixels: number[][]): string {
    // Calculate average brightness
    let total = 0;
    let count = 0;
    
    for (let y = 0; y < this.HASH_SIZE; y++) {
      for (let x = 0; x < this.HASH_SIZE; x++) {
        total += grayscalePixels[y][x];
        count++;
      }
    }
    
    const average = total / count;
    
    // Generate hash based on whether each pixel is above/below average
    const hash: number[] = [];
    for (let y = 0; y < this.HASH_SIZE; y++) {
      for (let x = 0; x < this.HASH_SIZE; x++) {
        hash.push(grayscalePixels[y][x] > average ? 1 : 0);
      }
    }
    
    // Convert to hex
    let hexHash = '';
    for (let i = 0; i < hash.length; i += 4) {
      const nibble = hash[i] * 8 + hash[i + 1] * 4 + hash[i + 2] * 2 + hash[i + 3];
      hexHash += nibble.toString(16);
    }
    
    console.log(`✅ Generated aHash: ${hexHash}`);
    return hexHash;
  }

  // Generate perceptual hash from image URL with multiple fallbacks
  static async generatePerceptualHash(imageUrl: string): Promise<{
    dHash: string;
    aHash: string;
    success: boolean;
  }> {
    try {
      console.log(`🔍 Processing image: ${imageUrl}`);
      
      const imageBuffer = await this.downloadImage(imageUrl);
      const grayscalePixels = await this.preprocessImage(imageBuffer);
      
      const dHash = this.generateDHash(grayscalePixels);
      const aHash = this.generateAHash(grayscalePixels);
      
      console.log(`✅ Successfully generated hashes for ${imageUrl}`);
      console.log(`  dHash: ${dHash}`);
      console.log(`  aHash: ${aHash}`);
      
      return { dHash, aHash, success: true };
    } catch (error) {
      console.error(`❌ Failed to generate perceptual hash for ${imageUrl}:`, error);
      
      // Return fallback hash based on URL
      const fallbackHash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 16);
      console.log(`🔄 Using fallback hash for ${imageUrl}: ${fallbackHash}`);
      
      return { 
        dHash: fallbackHash, 
        aHash: fallbackHash, 
        success: false 
      };
    }
  }

  // Calculate Hamming distance between two hashes
  static hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return Infinity;
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      const val1 = parseInt(hash1[i], 16);
      const val2 = parseInt(hash2[i], 16);
      
      // XOR and count set bits
      let xor = val1 ^ val2;
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }
    
    return distance;
  }

  // Calculate similarity percentage (0-100%)
  static calculateSimilarity(hash1: string, hash2: string): number {
    const distance = this.hammingDistance(hash1, hash2);
    const maxDistance = hash1.length * 4; // Each hex char represents 4 bits
    const similarity = ((maxDistance - distance) / maxDistance) * 100;
    
    return Math.max(0, Math.min(100, similarity));
  }

  // Check if two images are similar using both hash types
  static areSimilar(
    hash1: { dHash: string; aHash: string }, 
    hash2: { dHash: string; aHash: string }, 
    threshold: number = 75
  ): { similar: boolean; dHashSimilarity: number; aHashSimilarity: number; maxSimilarity: number } {
    const dHashSimilarity = this.calculateSimilarity(hash1.dHash, hash2.dHash);
    const aHashSimilarity = this.calculateSimilarity(hash1.aHash, hash2.aHash);
    const maxSimilarity = Math.max(dHashSimilarity, aHashSimilarity);
    
    return {
      similar: maxSimilarity >= threshold,
      dHashSimilarity,
      aHashSimilarity,
      maxSimilarity
    };
  }
}

// Interface for image analysis result
export interface ImageAnalysis {
  url: string;
  dHash: string;
  aHash: string;
  headline: string;
  normalizedHeadline: string;
  originalHash?: string;
  processingSuccess: boolean;
}

// Enhanced duplicate detection using perceptual hashing
export async function findPerceptualDuplicates(
  stories: Array<{ headline: string; imageUrl: string; hash: string; [key: string]: any }>
): Promise<{
  duplicateGroups: string[][];
  analysisResults: ImageAnalysis[];
  similarityMatrix: Array<{ 
    hash1: { dHash: string; aHash: string }; 
    hash2: { dHash: string; aHash: string }; 
    dHashSimilarity: number;
    aHashSimilarity: number;
    maxSimilarity: number;
    url1: string; 
    url2: string;
    headline1: string;
    headline2: string;
  }>;
  processingStats: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
}> {
  console.log(`🔍 Starting perceptual hash analysis for ${stories.length} stories...`);
  
  const analysisResults: ImageAnalysis[] = [];
  const similarityMatrix: Array<{ 
    hash1: { dHash: string; aHash: string }; 
    hash2: { dHash: string; aHash: string }; 
    dHashSimilarity: number;
    aHashSimilarity: number;
    maxSimilarity: number;
    url1: string; 
    url2: string;
    headline1: string;
    headline2: string;
  }> = [];
  
  let successful = 0;
  let failed = 0;
  
  // Helper function to normalize headlines
  function normalizeHeadline(headline: string): string {
    return headline
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  // Step 1: Generate perceptual hashes for all images
  const storiesWithImages = stories.filter(story => story.imageUrl && story.imageUrl.length > 0);
  console.log(`📊 Processing ${storiesWithImages.length} stories with images...`);
  
  for (const [index, story] of storiesWithImages.entries()) {
    try {
      console.log(`\n🔄 Processing ${index + 1}/${storiesWithImages.length}: "${story.headline.substring(0, 50)}..."`);
      
      const hashResult = await PerceptualHash.generatePerceptualHash(story.imageUrl);
      
      analysisResults.push({
        url: story.imageUrl,
        dHash: hashResult.dHash,
        aHash: hashResult.aHash,
        headline: story.headline,
        normalizedHeadline: normalizeHeadline(story.headline),
        originalHash: story.hash,
        processingSuccess: hashResult.success
      });
      
      if (hashResult.success) {
        successful++;
      } else {
        failed++;
      }
      
    } catch (error) {
      console.warn(`⚠️ Failed to process image for "${story.headline}": ${error}`);
      failed++;
    }
  }

  console.log(`\n✅ Hash generation complete: ${successful} successful, ${failed} failed`);

  // Step 2: Calculate similarity matrix
  console.log(`🔍 Calculating similarity matrix for ${analysisResults.length} images...`);
  
  for (let i = 0; i < analysisResults.length; i++) {
    for (let j = i + 1; j < analysisResults.length; j++) {
      const result1 = analysisResults[i];
      const result2 = analysisResults[j];
      
      const comparison = PerceptualHash.areSimilar(
        { dHash: result1.dHash, aHash: result1.aHash },
        { dHash: result2.dHash, aHash: result2.aHash },
        75 // threshold
      );
      
      if (comparison.similar) {
        console.log(`🎯 SIMILARITY FOUND (${comparison.maxSimilarity.toFixed(1)}%):`);
        console.log(`  "${result1.headline.substring(0, 40)}..."`);
        console.log(`  "${result2.headline.substring(0, 40)}..."`);
        console.log(`  dHash: ${comparison.dHashSimilarity.toFixed(1)}%, aHash: ${comparison.aHashSimilarity.toFixed(1)}%`);
        console.log(`  URL1: ${result1.url}`);
        console.log(`  URL2: ${result2.url}`);
        
        similarityMatrix.push({
          hash1: { dHash: result1.dHash, aHash: result1.aHash },
          hash2: { dHash: result2.dHash, aHash: result2.aHash },
          dHashSimilarity: comparison.dHashSimilarity,
          aHashSimilarity: comparison.aHashSimilarity,
          maxSimilarity: comparison.maxSimilarity,
          url1: result1.url,
          url2: result2.url,
          headline1: result1.headline,
          headline2: result2.headline
        });
      }
    }
  }

  // Step 3: Group similar images (75% threshold)
  const duplicateGroups: string[][] = [];
  const processedIndices = new Set<number>();

  for (let i = 0; i < analysisResults.length; i++) {
    if (processedIndices.has(i)) continue;

    const group: string[] = [analysisResults[i].headline];
    const groupIndices: number[] = [i];

    // Find all similar images to this one
    for (let j = i + 1; j < analysisResults.length; j++) {
      if (processedIndices.has(j)) continue;

      const comparison = PerceptualHash.areSimilar(
        { dHash: analysisResults[i].dHash, aHash: analysisResults[i].aHash },
        { dHash: analysisResults[j].dHash, aHash: analysisResults[j].aHash },
        85
      );

      if (comparison.similar) {
        // Check if this is actually a different article (not same story repeated)
        const isDifferentArticle = analysisResults[i].normalizedHeadline !== analysisResults[j].normalizedHeadline;
        
        if (isDifferentArticle) {
          group.push(analysisResults[j].headline);
          groupIndices.push(j);
          console.log(`✅ Added to group (${comparison.maxSimilarity.toFixed(1)}% similar): "${analysisResults[j].headline.substring(0, 40)}..."`);
        } else {
          console.log(`🔄 Skipping duplicate article: "${analysisResults[j].headline}" (same story)`);
        }
      }
    }

    // If we found a group with multiple different articles, add it
    if (group.length > 1) {
      duplicateGroups.push(group);
      console.log(`🎯 Created duplicate group ${duplicateGroups.length} with ${group.length} articles`);
    }

    // Mark all indices in this group as processed
    groupIndices.forEach(idx => processedIndices.add(idx));
  }

  const processingStats = {
    total: storiesWithImages.length,
    successful,
    failed,
    successRate: successful / storiesWithImages.length * 100
  };

  console.log(`\n🎯 FINAL RESULTS:`);
  console.log(`📊 Processed ${processingStats.total} images (${processingStats.successRate.toFixed(1)}% success rate)`);
  console.log(`🔍 Found ${similarityMatrix.length} similar image pairs`);
  console.log(`📝 Created ${duplicateGroups.length} duplicate groups`);
  
  duplicateGroups.forEach((group, index) => {
    console.log(`  Group ${index + 1}: ${group.length} articles`);
  });

  return {
    duplicateGroups,
    analysisResults,
    similarityMatrix,
    processingStats
  };
}