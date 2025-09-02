import { GoogleSheetsService } from "../../../services/GoogleAPIs.service";
import { SlackWebService } from "../../../services/Slack.service";

type DailyReportEntry = {
    [school: string]: Array<{
        publication: string,
        sport: string,
    }>
}

type Counts = {
    filled: number,
    missed: number,
}

const StatisticsSheetId = "1vK-SWK-DgSi1mNKrQzVD8ZOhlU8MqvhglobmSRYXOq8";

function dayOfWeekToName(): string {
    const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDate = new Date();
    const dayIndex = currentDate.getDay();
    return daysOfWeek[dayIndex];
}

function isToday(date: Date): boolean {
    const today = new Date();

    return date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();
}

export async function DailyReport() {
    try {
        const dayOfWeek = dayOfWeekToName()
        const sheetsClient = await GoogleSheetsService();
        const sheetInfo = await sheetsClient.spreadsheets.get({ spreadsheetId: StatisticsSheetId });
        const sheetTabs = (sheetInfo.data.sheets?.map(s => s.properties?.title) ?? []).filter((title): title is string => typeof title === "string");
        const tabNameCriteria = new RegExp(`${dayOfWeek}`, 'i');

        if (sheetTabs.findIndex(tabName => tabName.match(tabNameCriteria)) === -1) return;

        const sheetData = await sheetsClient.spreadsheets.values.batchGet({
            spreadsheetId: StatisticsSheetId,
            ranges: sheetTabs
        });

        sheetData.data.valueRanges?.forEach(async (tab) => {
            const values = tab.values || [];
            const datesRow = values[1] || [];
            const startRowIndex = 3;

            const dateRangeIndex = datesRow.findIndex((dateStr) => {
                if (!dateStr) return false;

                const date = new Date(dateStr);
                return isToday(date);
            });

            if (dateRangeIndex === -1) return;

            const dailyReportEntries: DailyReportEntry = {};
            const counts: Counts = { filled: 0, missed: 0 };

            for (let rowIndex = startRowIndex; rowIndex < values.length; rowIndex++) {
                const school = values[rowIndex][0];
                const publication = values[rowIndex][1];
                const sport = values[rowIndex][5];
                const gameDateInfo = values[rowIndex][dateRangeIndex + 1];
                const plStoryLink = values[rowIndex][dateRangeIndex + 2];

                if (!publication) {
                    continue
                } else if (gameDateInfo && plStoryLink) {
                    counts.filled += 1;
                    continue;
                }

                counts.missed += 1;
                dailyReportEntries[school] ??= [];
                dailyReportEntries[school].push({ publication, sport });
            }

            const summary = `*<https://docs.google.com/spreadsheets/d/${StatisticsSheetId}|Daily Report for ${tab.range?.split("!")[0]}>:*\n\n` +
                `*Filled:* ${counts.filled}\n*Missed:* ${counts.missed}\n\n` +
                `Schools with missed publications: ${Object.keys(dailyReportEntries).length}\n` +
                `Full details below in thread 👇`;

            const fullReport = Object.entries(dailyReportEntries)
                .map(([schoolName, items]) => {
                    const list = items.map(i => `• ${i.publication} (${i.sport})`).join("\n");
                    return `*${schoolName}:*\n${list}`;
                })
                .join("\n\n");

            const result = await SlackWebService.chat.postMessage({
                channel: "C09BCUA6M6U",
                text: summary,
            });

            await SlackWebService.chat.postMessage({
                channel: "C09BCUA6M6U",
                thread_ts: result.ts,
                text: fullReport
            });
        });
    } catch (err: unknown) {
        console.error("Error in DailyReport:", (err as Error).message);
    }
}