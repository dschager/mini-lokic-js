import "dotenv/config";

import { MysqlService } from "../../../services/Mysql.service";
import { SlackWebService } from "../../../services/Slack.service";
import { DB02 } from "../../../config/constants";

import type { PoolConnection, FieldPacket } from "mysql2/promise";

interface IReportResultRow {
    id: number;
    name: string;
    status: string;
    category: string;
    frequency: string;
    story_id: number;
    story_headline: string;
    export_date: Date;
}

const SLACK_CHANNEL_ID = "C08LTF13TPB"; // Channel ID for the report

// Report: Schedules and Non0Scheduled story types
export async function ScheduledNonScheduledStoryTypesReport(date: Date = getMonday()): Promise<void> {
    let connection: PoolConnection | undefined;

    try {
        connection = await MysqlService(DB02, "lokic").getConnection();

        const reportDateStart = new Date(date);
        const reportDateEnd = new Date(date);

        reportDateStart.setDate(date.getDate() + 14);
        reportDateEnd.setDate(date.getDate() + 20);

        const reportDatesFormatted = `${reportDateStart.toLocaleDateString("en-CA")} - ${reportDateEnd.toLocaleDateString("en-CA")}`;
        const prevYearMonthStart = new Date(
            date.getFullYear() - 1,
            date.getMonth(),
            1
        );
        const prevYearMonthEnd = new Date(
            date.getFullYear() - 1,
            date.getMonth() + 1,
            0
        );
        const prevYearDateFormatted = prevYearMonthEnd.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
        });

        const scheduledStoryTypes: IReportResultRow[] = [];
        const nonScheduledStoryTypes: IReportResultRow[] = [];
        const [rows] = (await connection.query(reportQuery())) as [
            IReportResultRow[],
            FieldPacket[]
        ];

        rows
            .sort(
                (a, b) =>
                    new Date(a.export_date).getTime() - new Date(b.export_date).getTime()
            )
            .forEach((row) => {
                if (
                    row.export_date >= prevYearMonthStart &&
                    row.export_date <= prevYearMonthEnd
                ) {
                    nonScheduledStoryTypes.push(row);
                    return;
                }

                const nextExportDate = getNextExport(
                    row.export_date as Date,
                    row.frequency
                );

                if (!nextExportDate) {
                    return;
                } else if (
                    nextExportDate >= reportDateStart &&
                    nextExportDate <= reportDateEnd
                ) {
                    row.export_date = nextExportDate;
                    scheduledStoryTypes.push(row);
                }
            });

        const reportTitles = [
            `Scheduled Story Types (${reportDatesFormatted})`,
            `Non-Scheduled Story Types (${prevYearDateFormatted})`,
        ];
        const storyTypes = [scheduledStoryTypes, nonScheduledStoryTypes];

        const canvasLinks: string[] = await Promise.all(
            reportTitles.map(async (title, i) => {
                const markdown = generateMarkdown(title, storyTypes[i]);

                const canvas = await SlackWebService.canvases.create({
                    document_content: { type: "markdown", markdown: markdown },
                    title,
                });

                await SlackWebService.canvases.access.set({
                    access_level: "read",
                    canvas_id: canvas.canvas_id as string,
                    channel_ids: [SLACK_CHANNEL_ID],
                });

                return `https://locallabs.slack.com/docs/T027X55QW/${canvas.canvas_id}`;
            })
        );

        let postMessage: string;
        postMessage = `Report: Scheduled (${reportDatesFormatted}) and Non-Scheduled(${prevYearDateFormatted}) Story Types\n`;
        postMessage += canvasLinks.join("\n");

        await SlackWebService.chat.postMessage({
            channel: SLACK_CHANNEL_ID,
            text: postMessage,
        });
    } catch (error) {
        await SlackWebService.chat.postMessage({
            channel: SLACK_CHANNEL_ID,
            text: `🔴 *report* "story_type:sched-nonsched-stypes" returned error: ${error}`,
        });
    } finally {
        connection?.release();
    }
}

function getMonday(date = new Date()) {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
}

function reportQuery(): string {
    return [
        "select st.id id,",
        "       st.name,",
        "       sts.name status,",
        "       dsc.name category,",
        "       f.name frequency,",
        "       ss.pl_production_story_id story_id,",
        "       sso.headline story_headline,",
        "       ss.exported_at export_date",
        "from story_types st",
        "        left join statuses sts on st.status_id = sts.id",
        "        left join frequencies f on st.frequency_id = f.id",
        "        left join accounts stdev on st.developer_id = stdev.id",
        "        left join data_sets ds on st.data_set_id = ds.id",
        "        left join data_set_categories dsc on ds.category_id = dsc.id",
        "        left join data_sets_scrape_tasks dssct on ds.id = dssct.data_set_id",
        "        left join scrape_tasks sct on dssct.scrape_task_id = sct.id",
        "        left join accounts sctdev on sct.scraper_id = sctdev.id",
        "        left join story_type_client_publication_tags_safe stcpt on st.id = stcpt.story_type_id",
        "        left join clients c on stcpt.client_id = c.id",
        "        left join hle_content_previews hcp on st.id = hcp.hle_content_previewable_id and",
        "                                            hcp.hle_content_previewable_type = 'StoryType'",
        "        left join stories ss on hcp.sample_id = ss.id",
        "        left join outputs sso on ss.output_id = sso.id",
        "        left join publications sp on ss.publication_id = sp.id",
        "where ss.exported_at is not null and",
        "    dsc.name != 'Press Releases' and",
        "    sts.name not in('canceled', 'archived')",
        "group by st.id;",
    ].join("\n");
}

function getNextExport(lastExport: Date, frequency: string): Date | undefined {
    const nextExport = new Date(lastExport);

    switch (frequency) {
        case "daily":
            nextExport.setDate(nextExport.getDate() + 1);
            break;
        case "weekly":
            nextExport.setDate(nextExport.getDate() + 7);
            break;
        case "biweekly":
            nextExport.setDate(nextExport.getDate() + 14);
            break;
        case "monthly":
            nextExport.setMonth(nextExport.getMonth() + 1);
            break;
        case "quarterly":
            nextExport.setMonth(nextExport.getMonth() + 3);
            break;
        case "biannually":
            nextExport.setMonth(nextExport.getMonth() + 6);
            break;
        case "annually":
            nextExport.setFullYear(nextExport.getFullYear() + 1);
            break;
        case "biennially":
            nextExport.setFullYear(nextExport.getFullYear() + 2);
            break;
        default:
            return;
    }

    return nextExport;
}

function generateMarkdown(title: string, data: IReportResultRow[]): string {
    let markdown = `# ${title}: \n\n`;

    data.forEach((item) => {
        markdown += `- *[#${item.id} - ${item.name}](https://lokic.locallabs.com/story_types/${item.id})*\n`;
        markdown += `  - [${item.story_headline}](https://pipeline.locallabs.com/stories/${item.story_id})\n`;
        markdown += `  - *Status:* ${item.status}\n`;
        markdown += `  - *Category & Frequency:* ${item.category}, ${item.frequency}\n`;
        markdown += `  - *Export Date:* ${item.export_date.toLocaleDateString(
            "en-CA"
        )}\n`;
    });

    return markdown;
}
