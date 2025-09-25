import "dotenv/config";

export const CONFIG = {
    CONCURRENT_LIMIT: 3, // Process N URLs concurrently
    MAX_RETRIES: 3, // Retry failed screenshots
    RETRY_DELAY: 2000, // 2 seconds between retries
    DAYS_OLD: 14,
    slackChannel:  "C09DZPGNZH9",
    /* Toggles */
    useDuplicatePhotos: true,
    usePersonAnalysis: false,
    useMissingImages: false,
    useOldStories: true,
    keepScreenshots: false,
    useSlack: true,
    useScreenshotAnalysis: false, // Upload screenshots to OpenAI for vision analysis (expensive)
    useGPTAnalysis: false, // Use ChatGPT for duplicate/old story analysis (redundant with local analysis)
}
