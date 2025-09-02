import cron from "node-cron"

import { TatianaStoryTypesReport } from "./scripts/reports/story_types/tatiana-stypes";
import { ScheduledNonScheduledStoryTypesReport } from "./scripts/reports/story_types/sched-nonsched-stypes";
import { NewGames } from './scripts/stories/ai-sport-stories/NewGames';
import { DailyReport } from "./scripts/stories/ai-sport-stories/DailyReport";

cron.schedule("0 9 * * 1", () => {
    TatianaStoryTypesReport();
});

cron.schedule("0 9 * * 1", async () => {
    await ScheduledNonScheduledStoryTypesReport();
});

cron.schedule("*/5 * * * *", async () => {
    await NewGames();
});

cron.schedule("0 8 * * * *", async () => {
    await DailyReport();
});
