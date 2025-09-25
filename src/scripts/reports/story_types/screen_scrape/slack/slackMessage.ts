import { CONFIG } from "../config";

export function generateSlackMessage(analysisObj: any): { summary: string; details: string } | null {
  const { url, reused_photo_groups, reused_person_groups, missing_images, old_stories } = analysisObj;
  
  const totalReusedPhotoStories = reused_photo_groups?.reduce((sum: number, group: string[]) => sum + group.length, 0) || 0;
  const totalReusedPersonStories = reused_person_groups?.reduce((sum: number, group: string[]) => sum + group.length, 0) || 0;
  const totalMissingImages = (missing_images || []).length;
  const totalOldStories = (old_stories || []).length;

  if (totalReusedPhotoStories === 0
    && totalReusedPersonStories === 0
    && totalMissingImages === 0
    && totalOldStories === 0) {
    return null; // Nothing to report
  }

  const publicationName = new URL(url).hostname;
  
  let summary = `${publicationName} contains:`;
  if (totalReusedPhotoStories > 0) {
    summary += `\n• ${totalReusedPhotoStories} stories with duplicate photos`;
  }
  if (totalReusedPersonStories > 0) {
    summary += `\n• ${totalReusedPersonStories} stories showing the same person`;
  }
  if (totalMissingImages > 0) {
    summary += `\n• ${totalMissingImages} stories missing images`;
  }
  if (totalOldStories > 0) {
    summary += `\n• ${totalOldStories} stories older than ${CONFIG.DAYS_OLD} days`;
  }

  let details = "";

  // Option 1: Numbered Articles with Dividers
  if (reused_photo_groups?.length) {
    details += `\n:camera: *Duplicate Photo Groups:*\n`;
    reused_photo_groups.forEach((group: string[], idx: number) => {
      details += `\nGroup ${idx + 1} (${group.length} articles):\n`;
      group.forEach((headline, articleIdx) => {
        details += `${articleIdx + 1}. \`${headline}\`\n`;
      });
      details += `\n`;
    });
  }

  if (reused_person_groups?.length) {
    details += `\n:bust_in_silhouette: *Reused Person Groups:*\n`;
    reused_person_groups.forEach((group: string[], idx: number) => {
      details += `\nGroup ${idx + 1} (${group.length} articles):\n`;
      group.forEach((headline, articleIdx) => {
        details += `${articleIdx + 1}. \`${headline}\`\n`;
      });
      details += `\n`;
    });
  }

  if (totalMissingImages > 0) {
    details += `\n:frame_with_picture: *Articles Missing Images:*\n`;
    missing_images.forEach((story: { headline: string }, idx: number) => {
      details += `${idx + 1}. \`${story.headline}\`\n`;
    });
    details += `\n`;
  }

  if (totalOldStories > 0) {
    details += `\n:date: *Articles Older than ${CONFIG.DAYS_OLD} Days:*\n`;
    old_stories.forEach((story: { headline: string; age_days: number }, idx: number) => {
      details += `${idx + 1}. \`${story.headline}\` _(${story.age_days} days old)_\n`;
    });
  }

  return { summary: summary.trim(), details: details.trim() };
}