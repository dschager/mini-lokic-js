import { CONFIG } from "../config";

export function createImprovedGPTPrompt(
  url: string,
  extractedStories: { headline: string; imageUrl: string; hash: string; dateText?: string }[]
): string {
  const hostname = new URL(url).hostname;
  const storiesContext = extractedStories.length > 0
    ? `\n\nHere are the unique story headlines, their image hashes, and visible dates:\n${extractedStories.map((s, i) =>
        `${i + 1}. "${s.headline}" | hash: ${s.hash || "MISSING"} | date: ${s.dateText || "N/A"}`
      ).join("\n")}`
    : "";
    let fullPrompt = `You are analyzing a screenshot of ${hostname}'s homepage.

**IMPORTANT RULES**
1. Use ONLY the exact headlines and hashes provided below.
2. NEVER annotate individual headlines.
3. When "Task - Duplicate Photos" is shown: The ONLY way to represent reused images is inside the "duplicate_photos" array.
4. For each photo hash, group all headlines that share it.
5. WHEN "Task - Duplicate Photos" is shown: If a hash appears only once, do not include it in "duplicate_photos".
6. **CRITICAL**: WHEN "Task - Duplicate Photos" is shown: Only report duplicate photos when DIFFERENT articles use the same image. Duplicate articles (same story repeated) have already been filtered out.

${storiesContext}

---

`;
if (CONFIG.useDuplicatePhotos) {
    fullPrompt = fullPrompt + `
    **Task – Duplicate Photos (Group by Hash - Different Articles Only)**
        - For each hash that appears in multiple stories, return one object with:
        - "hash": the exact hash
        - "count": how many DIFFERENT stories use that hash
        - "headlines": array of exact headlines (these should be different articles using the same image) 
    `
}
if (CONFIG.usePersonAnalysis) {
    fullPrompt = fullPrompt + `
    **Task – People in Photos**
        - For each duplicate photo group that clearly shows a person's face, assign a "person_hash".
        - If the same person appears across different hashes, use the same person_hash.
        - Format: {"hash": "abc123", "person_hash": "male_40s_dark_hair"}
    `
}

if (CONFIG.useMissingImages && CONFIG.useOldStories) {
    fullPrompt = fullPrompt + `
    **Task – Technical Issues**
        - **Missing Images:** Any story with empty imageUrl or missing hash. Return headline.
        - **Old Stories:** Any story with a visible date older than ` + CONFIG.DAYS_OLD + ` days. Return headline, visible_date, and age_days.
    `
} else if (CONFIG.useMissingImages && !CONFIG.useOldStories) {
    fullPrompt = fullPrompt + `
    **Task – Technical Issues**
        - **Missing Images:** Any story with empty imageUrl or missing hash. Return headline.
    `
} else if (!CONFIG.useMissingImages && CONFIG.useOldStories) {
    fullPrompt = fullPrompt + `
    **Task – Technical Issues**
        - **Old Stories:** Any story with a visible date older than ` + CONFIG.DAYS_OLD + ` days. Return headline, visible_date, and age_days.
    `
}

fullPrompt = fullPrompt + `
---
 **Return ONLY valid JSON** in this exact structure:

 {
` 
if (CONFIG.useDuplicatePhotos) {
    fullPrompt = fullPrompt + `
    "duplicate_photos": [
        {"hash": "abc123", "count": 3, "headlines": ["Story A", "Story B", "Story C"]}
    ], 
    `
}
if (CONFIG.usePersonAnalysis) {
    fullPrompt = fullPrompt + `
    "people_in_photos": [
        {"hash": "abc123", "person_hash": "male_40s_dark_hair"}
    ],
    `
}
if (CONFIG.useMissingImages && CONFIG.useOldStories) {
    fullPrompt = fullPrompt + `
    "missing_images": [
        {"headline": "Story D"}
    ],
    "old_stories": [
        {"headline": "Story E", "visible_date": "Aug 5, 2023", "age_days": 35}
    ]
}
    `
} else if (CONFIG.useMissingImages && !CONFIG.useOldStories) {
    fullPrompt = fullPrompt + `
    "missing_images": [
        {"headline": "Story D"}
    ]
}
    `
} else if (!CONFIG.useMissingImages && CONFIG.useOldStories) {
    fullPrompt = fullPrompt + `
    "old_stories": [
        {"headline": "Story E", "visible_date": "Aug 5, 2023", "age_days": 35}
    ]
}
    `
}
    
  return fullPrompt;
}