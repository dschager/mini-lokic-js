import { Page } from "playwright";

export async function ensureAllImagesLoaded(page: Page): Promise<void> {
  console.log('🖼️  Starting comprehensive image loading wait...');
  
  await page.evaluate(async () => {
    // Function to check if an image is truly loaded
    const isImageLoaded = (img: HTMLImageElement): boolean => {
      // Must have src, be complete, and have actual dimensions
      return !!(
        img.src && 
        img.src !== '' && 
        img.complete && 
        img.naturalWidth > 0 && 
        img.naturalHeight > 0
      );
    };

    // Function to wait for a single image with Promise
    const waitForSingleImage = (img: HTMLImageElement): Promise<void> => {
      return new Promise((resolve) => {
        if (isImageLoaded(img)) {
          resolve();
          return;
        }

        let timeoutId: NodeJS.Timeout;
        
        const handleLoad = () => {
          clearTimeout(timeoutId);
          img.removeEventListener('load', handleLoad);
          img.removeEventListener('error', handleError);
          resolve();
        };

        const handleError = () => {
          clearTimeout(timeoutId);
          img.removeEventListener('load', handleLoad);
          img.removeEventListener('error', handleError);
          resolve(); // Resolve even on error to not block other images
        };

        img.addEventListener('load', handleLoad, { once: true });
        img.addEventListener('error', handleError, { once: true });
        
        // Force reload the image to trigger loading events
        const originalSrc = img.src;
        img.src = '';
        setTimeout(() => {
          img.src = originalSrc;
        }, 10);

        // Fallback timeout for this specific image (10 seconds)
        timeoutId = setTimeout(() => {
          img.removeEventListener('load', handleLoad);
          img.removeEventListener('error', handleError);
          console.warn(`Image timeout: ${img.src}`);
          resolve();
        }, 10000);
      });
    };

    // Get all images currently in the DOM
    let allImages = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    console.log(`Found ${allImages.length} images to load`);

    if (allImages.length === 0) {
      return; // No images to wait for
    }

    // Wait for all images in parallel
    const imagePromises = allImages.map(waitForSingleImage);
    await Promise.all(imagePromises);

    // Double-check: wait a bit more for any lazy-loaded images that might have appeared
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for any new images that appeared during lazy loading
    const newImages = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    const additionalImages = newImages.filter(img => !allImages.includes(img));
    
    if (additionalImages.length > 0) {
      console.log(`Found ${additionalImages.length} additional lazy-loaded images`);
      const additionalPromises = additionalImages.map(waitForSingleImage);
      await Promise.all(additionalPromises);
    }

    // Final verification
    const finalImages = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    const loadedCount = finalImages.filter(isImageLoaded).length;
    console.log(`Image loading complete: ${loadedCount}/${finalImages.length} images successfully loaded`);
  });

  console.log('✅ Image loading wait completed');
}