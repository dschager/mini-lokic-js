import { DB02, PL_PROD_DB_HOST } from "../../../config/constants";
import { GoogleFormsService, GoogleSheetsService } from "../../../services/GoogleAPIs.service";
import { MysqlService } from "../../../services/Mysql.service";
import { OpenAI } from "../../../services/OpenAI.service";
import { SlackWebService } from "../../../services/Slack.service";
import { LimparAPI } from "../../../services/Limpar";

import type { forms_v1 } from "googleapis";
import type { Pool } from "mysql2/promise";
import type { FactoidValue, FactoidValues } from "../../../services/Limpar/modules/FactoidValues";
import type { FormResponse, FormAnswer, PublishedStoryData, GptOutput, LimparFactoid } from "./types";

const FormId = "1L1YahWACKh2dcM_F_5Eru4sgAgPmHaz7C78H3yTpBUc";
const ConfigSheetId = "1Mww3X9ZN36WoDYR4Wo3TrH4OONGU04cfLisGTIxLhZs";
const StatisticsSheetId = "1vK-SWK-DgSi1mNKrQzVD8ZOhlU8MqvhglobmSRYXOq8";

function SystemInstruction(): string {
    const response_format = {
        "name": "sport_story",
        "strict": true,
        "schema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Copy \"id\" from #SourceDataJSON object"
                },
                "sport": {
                    "type": "string",
                    "description": "Copy \"Sport\" from #SourceDataJSON object"
                },
                "images": {
                    "type": "string",
                    "description": "If \"Please Upload Photo from Game if accessible\" field in #SourceDataJSON exists and is not empty (if empty, or not exists -- just put null), take each object in the array and create links separated by ',', using the template https://drive.usercontent.google.com/download?id=<fileId>&export=view&authuser=0 where <fileId> is the 'fileId' from the object. This is only one field where can be used data from \"Please Upload Photo from Game if accessible\""
                },
                "headline": {
                    "type": "string",
                    "description": "Write a headline for the story about this game. The headline must be no more than 70 characters long, in AP-Style, and professional. The story will be published in a high school newspaper dedicated to covering only sports content about the school mentioned in the 'School' field in #SourceDataJson object"
                },
                "teaser": {
                    "type": "string",
                    "description": "Copy the first sentence from the \"body\" field. If sentence has period in the end of the sentence, you'll drop it"
                },
                "body": {
                    "type": "string",
                    "description": "Write an AP-style game recap in clear, factual, and professional language for a print newspaper. The story must be based only on the facts provided in the #SourceDataJson object, without adding or inventing details. Include the exact \"Head Coach's QuoteQuote\" from #SourceDataJson object in the story, using quotation marks and proper attribution. Word count: The story must be between 195 and 205 words, with a strong preference for exactly 200. If the draft is outside this range, discard it and rewrite until it meets the target. Avoid over-the-top, clichéd, or vague language unless it comes directly from the \"Head Coach's Quote\" (e.g., no \"thrilling game,\" \"players showed their skills,\" etc.). Use precise, concrete descriptions instead. Follow Associated Press style for spelling, grammar, and punctuation. Always return a complete story. Do not leave out required elements, and do not write fewer than 195 words. The focus is on a straightforward, chronological game recap, suitable for a high school sports section. Instruction for text formatting: Write the story in multiple paragraphs; Each paragraph must be wrapped in <p></p> html tags; The first paragraph must be only one sentence long and should work as a teaser or hook to grab attention; The rest of the story should follow in a natural paragraph structure, breaking ideas into logical sections without forcing artificial splits"
                },
                "delivery_info": {
                    "type": "object",
                    "description": "Using the information from the 'Sport', 'Sex', 'Game Date', 'Name (Head Coach)' and 'School' fields from #SourceDataJson object, find the school this data is about and return the school's corresponding 'high_school', 'publication', 'opportunity', 'opportunity_type', 'content_type', 'limpar_org_id' as listed in #DeliveryInfoJson array of objects. School's data MUST be from one object!",
                    "properties": {
                        "high_school": { "type": "string" },
                        "publication": { "type": "string" },
                        "sport": { "type": "string" },
                        "sex": { "type": "string" },
                        "game_date": { "type": "string" },
                        "opportunity": { "type": "string" },
                        "opportunity_type": { "type": "string" },
                        "content_type": { "type": "string" },
                        "limpar_org_id": { "type": "string" }
                    },
                    "required": ["high_school", "publication", "opportunity", "opportunity_type", "content_type", "limpar_org_id"],
                    "additionalProperties": false
                }
            },
            "additionalProperties": false,
            "required": ["id", "images", "headline", "teaser", "body", "delivery_info"]
        }
    }

    return (
        `You will receive two JSON objects:\n` +
        `#SourceDataJson – contains the input data.\n` +
        `#DeliveryInfoJson – This contains array of objects.Each object has these keys:n\n` +
        `- high_school\n` +
        `- publication\n` +
        `- opportunity\n` +
        `- opportunity_type\n` +
        `- content_type\n` +
        `- limpar_org_id\n` +
        `All task - specific instructions are included in the description fields of the #JsonSchema. ` +
        `Follow those descriptions exactly when generating the output.\n\n#JsonSchema\n${JSON.stringify(response_format)} `
    )
}

async function getConfigSheetAsJson(
    spreadsheetId: string,
    range: string = "Sheet1!A:Z"
): Promise<Record<string, string>[]> {
    const sheets = await GoogleSheetsService();

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    const rows = res.data.values || [];

    if (rows.length === 0) return [];

    const headers = rows[0];
    const dataRows = rows.slice(1);

    return dataRows.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] ?? "";
        });
        return obj;
    });
}

async function updateStatistSheet(publishedStories: PublishedStoryData[]): Promise<PublishedStoryData[]> {
    const sheetsClient = await GoogleSheetsService();
    const sheetInfo = await sheetsClient.spreadsheets.get({ spreadsheetId: StatisticsSheetId });
    const sheetTabs = (sheetInfo.data.sheets?.map(s => s.properties?.title) ?? []).filter((title): title is string => typeof title === "string");

    const sheetData = await sheetsClient.spreadsheets.values.batchGet({
        spreadsheetId: StatisticsSheetId,
        ranges: sheetTabs
    });

    sheetData.data.valueRanges?.forEach(async (tab) => {
        const values = tab.values || [];
        const datesRow = values[1] || [];
        const startRowIndex: number = 3;

        publishedStories.forEach((story: PublishedStoryData): void => {
            const school: string = story.high_school;
            const publication: string = story.publication;
            const game_date: string = story.game_date;
            const sex: string = story.sex;
            const sport: string = story.sport === "Soccer" ? `Soccer - ${sex}` : story.sport;

            for (let rowIndex = startRowIndex; rowIndex < values.length; rowIndex++) {
                const gameDate = new Date(game_date);

                const dateRangeIndex = datesRow.findIndex(dateStr => {
                    if (!dateStr) return false;

                    const periodEnd = new Date(dateStr);
                    const periodStart = new Date(dateStr);
                    periodStart.setDate(periodEnd.getDate() - 7);

                    return gameDate >= periodStart && gameDate <= periodEnd;
                });

                if (dateRangeIndex === -1) {
                    story.isInSheet = false;
                    continue;
                } else {
                    story.isInSheet = true;
                }

                const row = values[rowIndex];

                if (values[rowIndex][0] === school && values[rowIndex][1] === publication && values[rowIndex][5] === sport) {
                    const link: string = `https://locallabs.com/stories/${story.storyId}`;

                    row[dateRangeIndex] = "Coach Form - AI";
                    row[dateRangeIndex + 1] = `${row[dateRangeIndex + 1] ? row[dateRangeIndex + 1] + "\n" + game_date : game_date}`;
                    row[dateRangeIndex + 2] = row[dateRangeIndex + 2] ? row[dateRangeIndex + 2] + "\n" + link : link;
                    break;
                }
            }
        });

        await sheetsClient.spreadsheets.values.batchUpdate({
            spreadsheetId: StatisticsSheetId,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    {
                        range: "Weekly (Thursday)",
                        values: tab.values || [],
                    }
                ],
            },
        });
    });

    return publishedStories;
}

async function createFactoidValue(answers: FormResponse["answers"], storyId: number, headline: string): Promise<FactoidValue> {
    const limparClient: FactoidValues = new LimparAPI.FactoidValues();

    const questionKeys = {
        "Name (Head Coach)": "head_coach_name",
        "School": "school",
        "SporZT": "sex",
        "Game Date": "game_date",
        "Location": "location",
        "Venue Name (e.g., name of field/stadium/etc.)": "venue_name",
        "Opposing Team ": "opposing_team",
        "Game Type": "game_type",
        "Competitive Stage": "competitive_stage",
        "Noteworthy Game": "noteworthy_game",
        "Matchup History (Tell us about your team's history against this opponent)": "matchup_history",
        "Which team won?": "which_team_won",
        "Score": "score",
        "Key Team Stats": "key_team_stats",
        "2-3 Top Individual Players & Key Individual Stats/Contributions": "top_individual_players",
        "Head Coach's Quote": "head_coach_quote",
        "Standout Plays or Noteworthy Scoring Sequences (e.g., \"John Doe had his first-ever walk-off hit with a come-from-behind three-run triple in the bottom of the seventh.\")": "standout_plays_or_noteworthy_sequences",
        "Anything else to add about the game?": "anything_else_about_game",
        "Season Record": "season_record",
        "Next Event": "next_event",
        "Please Upload Photo from Game if accessible": "photo_"
    }

    const factoidValues: LimparFactoid = {};

    for (const rawKey of Object.keys(answers)) {
        const requestKey = questionKeys[rawKey as keyof typeof questionKeys];

        if (!requestKey) continue;

        const value = answers[rawKey];

        if (rawKey === "Please Upload Photo from Game if accessible" && Array.isArray(value)) {
            value.forEach((file, index) => {
                if (index < 5) {
                    factoidValues[`photo_${index + 1}` as keyof LimparFactoid] =
                        `https://drive.usercontent.google.com/download?id=${file.fileId}&export=view&authuser=0`;
                }
            });
        } else if (typeof value === "string" || value === null) {
            factoidValues[requestKey as keyof LimparFactoid] = value ?? undefined;
        }
    }

    factoidValues.pl_story_url = `https://locallabs.com/stories/${storyId}`;
    factoidValues.pl_story_headline = headline;

    const factroidValue = await limparClient.create("6613a8a3-2dd6-452c-a5a3-23b0b8cc2fbe", factoidValues)

    return factroidValue;
}

export async function NewGames() {
    let googleFormClient: forms_v1.Forms | undefined;
    let mysqlStoryClient: Pool | undefined;
    let mysqlLokiClient: Pool | undefined;
    let mysqlPipelineClient: Pool | undefined;

    try {
        console.log(`[${new Date().toISOString()}] Starting NewGames process...`);
        googleFormClient = await GoogleFormsService();
        mysqlStoryClient = MysqlService(DB02, 'loki_storycreator');
        mysqlLokiClient = MysqlService(DB02, 'lokic');
        mysqlPipelineClient = MysqlService(PL_PROD_DB_HOST, "jnswire_prod", {
            user: process.env.PL_PROD_DB_USER,
            password: process.env.PL_PROD_DB_PASSWORD
        });

        const deliveryInfoRaw = await getConfigSheetAsJson(ConfigSheetId);
        const questionsRaw = await googleFormClient.forms.get({ formId: FormId });
        const responsesRaw = await googleFormClient.forms.responses.list({ formId: FormId });

        const deliveryInfo = deliveryInfoRaw
            .filter((row) => {
                return !!row["Project"].trim();
            }).map((row) => {
                return {
                    high_school: row["High School"],
                    publication: row["Project"],
                    opportunity: "Prep Sports USA",
                    opportunity_type: row["Opportunity Type"],
                    content_type: row["Content Type"],
                    limpar_org_id: row["HS Limpar Org ID"]
                };
            });

        const questions: { [key: string]: string } = {};
        questionsRaw.data.items?.forEach((item) => {
            const questionId = item.questionItem?.question?.questionId;
            if (questionId && typeof item.title === "string") {
                questions[questionId] = item.title;
            }
        });

        const responses: FormResponse[] = [];
        for (const resp of responsesRaw.data.responses ?? []) {

            const id = resp["responseId"];
            const timestamp = resp["createTime"];
            const answers: Record<string, FormAnswer> = {};

            if (resp.answers) {
                Object.values(resp.answers).forEach((answer) => {
                    if (answer.questionId !== null && answer.questionId !== undefined) {
                        const questionTitle = questions[answer.questionId].trim();
                        if (Object.hasOwn(answer, 'textAnswers')) {
                            answers[questionTitle] = answer.textAnswers?.answers?.map(a => a.value?.trim()).filter(a => !!a).join(', ') || null;
                        } else if (Object.hasOwn(answer, 'fileUploadAnswers')) {
                            answers[questionTitle] = answer.fileUploadAnswers?.answers || null;
                        }
                    }
                });
            }

            const [res] = await mysqlStoryClient?.query(
                `INSERT INTO ai_sport_stories(id, timestamp, answers)
                SELECT ?, ?, CAST(? AS JSON)
                WHERE NOT EXISTS(SELECT 1 FROM ai_sport_stories WHERE id = ?);`,
                [id, timestamp, JSON.stringify(answers), id]
            );

            // @ts-ignore
            if (res.affectedRows > 0) {
                responses.push({ id, timestamp, answers });
            }
        }

        const outputs: Array<GptOutput> = [];
        for (const resp of responses) {
            const userRequest = [
                `#SourceDataJson\n${JSON.stringify({ id: resp.id, ...resp.answers })}`,
                `#DeliveryInfoJson\n${JSON.stringify(deliveryInfo)}`
            ].join('\n\n');

            const result = await OpenAI.responses.create({
                model: "gpt-5-mini",
                input: [
                    {
                        type: "message", role: "system",
                        content: [{ type: "input_text", text: SystemInstruction() }]
                    }, {
                        type: "message", role: "user",
                        content: [{ type: "input_text", text: userRequest }]
                    }
                ]
            });

            outputs.push(JSON.parse(result.output_text));
        }

        let publishedStoriesData: Array<PublishedStoryData> = [];
        for (const output of outputs) {
            type OpportunityRow = {
                opportunity_id: number;
                content_type_id: string;
                opportunity_type_id: string;
                publication_id: number;
            };

            const [rows] = await mysqlLokiClient?.query(`
                SELECT o.id opportunity_id,
                       ct.id content_type_id,
                       ot.id opportunity_type_id,
                       p.pl_identifier publication_id
                FROM opportunities o
                    JOIN opportunities_content_types oct ON o.id = oct.opportunity_id
                    JOIN content_types ct ON oct.content_type_id = ct.id
                    JOIN opportunities_opportunity_types oot ON o.id = oot.opportunity_id
                    JOIN opportunity_types ot ON oot.opportunity_type_id = ot.id
                    JOIN opportunities_publications op ON o.id = op.opportunity_id
                    JOIN publications p ON op.publication_id = p.id
                WHERE o.name = '${output.delivery_info.opportunity}' AND
                    p.name = '${output.delivery_info.publication}' AND
                    ct.name = '${output.delivery_info.content_type}' AND
                    ot.name = '${output.delivery_info.opportunity_type}' AND
                    o.archived_at IS NULL AND
                    oct.archived_at IS NULL AND
                    ct.archived_at IS NULL AND
                    oot.archived_at IS NULL AND
                    op.archived_at IS NULL AND
                    p.archived_at IS NULL
                LIMIT 1;
            `) as [OpportunityRow[], any];

            let jobId;
            const jobRaw = await fetch('https://pipeline-api.locallabs.com/api/v1/jobs', {
                method: 'POST',
                headers: {
                    'Authorization': process.env.PL_API_TOKEN || "",
                    'Content-Type': 'application/json',
                    'X-Force-Update': 'true'
                },
                body: JSON.stringify({
                    project_id: rows[0].publication_id,
                    name: `${output.delivery_info.publication} - AI`
                })
            })

            if (jobRaw.ok) {
                const job = await jobRaw.json()

                jobId = job.id;
            } else {
                const [rows] = await mysqlPipelineClient.query(`
                    select id from jobs
                    where name = '${output.delivery_info.publication} - AI'
                `) as [Array<{ id: number }>, any];

                jobId = rows[0].id
            }

            let jobItemId;
            const jobItemRaw = await fetch('https://pipeline-api.locallabs.com/api/v1/job_items', {
                method: 'POST',
                headers: {
                    'Authorization': process.env.PL_API_TOKEN || "",
                    'Content-Type': 'application/json',
                    'X-Force-Update': 'true'
                },
                body: JSON.stringify({
                    job_id: jobId,
                    name: `${output.delivery_info.publication} - Gameday Recap PrepSportsUSA AI`,
                    content_type: 'print',
                    twitter_disabled: true,
                    org_required: false
                })
            })

            if (jobItemRaw.ok) {
                const jobItem = await jobItemRaw.json()

                jobItemId = jobItem.id;
            } else {
                const [rows] = await mysqlPipelineClient.query(`
                    select id from job_items
                    where name = '${output.delivery_info.publication} - Gameday Recap PrepSportsUSA AI'
                `) as [Array<{ id: number }>, any];

                jobItemId = rows[0].id
            }

            const [storyTagsAuthors] = await mysqlLokiClient?.query(`
                select st.pl_identifier s_tag_id, authors
                from publications p
                         join publications_story_tags pst on p.id = pst.publication_id
                         join story_tags st on pst.story_tag_id = st.id
                where p.pl_identifier = ${rows[0].publication_id} and
                      st.name = '${output.delivery_info.sport}' and
                      p.archived_at is null and
                      pst.archived_at is null and
                      st.archived_at is null;
            `) as [Array<{ s_tag_id: string, authors: string }>, any];

            let author, storyTag;
            if (storyTagsAuthors.length > 0) {
                const authors = storyTagsAuthors[0].authors;
                author = authors[Math.floor(Math.random() * authors.length)];
                storyTag = storyTagsAuthors[0].s_tag_id;
            } else {
                author = 'AI';
                storyTag = null;
            }

            const leadRaw = await fetch('https://pipeline-api.locallabs.com/api/v1/leads', {
                method: 'POST',
                headers: {
                    'Authorization': process.env.PL_API_TOKEN || "",
                    'Content-Type': 'application/json',
                    'X-Force-Update': 'true'
                },
                body: JSON.stringify({
                    name: `${output.headline} -- [${+new Date()}]`,
                    job_item_id: jobItemId,
                    sub_type_id: 594,
                    community_ids: [rows[0].publication_id],
                    opportunity_id: rows[0].opportunity_id,
                    opportunity_type_id: rows[0].opportunity_type_id,
                    content_type_id: rows[0].content_type_id
                })
            })

            const lead = await leadRaw.json();
            const images = output.images ? output.images.split(',').map((url) => ({ url })) : [];
            const storyRaw = await fetch('https://pipeline-api.locallabs.com/api/v1/stories', {
                method: 'POST',
                headers: {
                    'Authorization': process.env.PL_API_TOKEN || "",
                    'Content-Type': 'application/json',
                    'X-Force-Update': 'true'
                },
                body: JSON.stringify({
                    community_id: rows[0].publication_id,
                    lead_id: lead.id,
                    organization_ids: [],
                    headline: output.headline,
                    teaser: output.teaser,
                    body: output.body,
                    author: author,
                    story_section_ids: [16],
                    story_tag_ids: [storyTag],
                    images: images
                })
            });

            const story = await storyRaw.json();
            await fetch(`https://pipeline-api.locallabs.com/api/v1/stories/${story.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': process.env.PL_API_TOKEN || "",
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ limpar: { organization_ids: [output.delivery_info.limpar_org_id] } })
            });

            publishedStoriesData.push({
                id: output.id,
                storyId: story.id,
                high_school: output.delivery_info.high_school,
                publication: output.delivery_info.publication,
                game_date: output.delivery_info.game_date,
                sport: output.delivery_info.sport,
                sex: output.delivery_info.sex
            });

            await mysqlStoryClient?.query(
                `UPDATE ai_sport_stories
                SET publication_id = ?,
                    opportunity_id = ?,
                    opportunity_type_id = ?,
                    content_type_id = ?,
                    pl_lead_id = ?,
                    pl_story_id = ?
                WHERE id = ?;`,
                [rows[0].publication_id, rows[0].opportunity_id, rows[0].opportunity_type_id, rows[0].content_type_id, lead.id, story.id, output.id]
            );

            const response = responses.find(r => r.id === output.id);
            if (response) await createFactoidValue(response.answers, story.id, output.headline);
        }

        publishedStoriesData = await updateStatistSheet(publishedStoriesData);

        if (publishedStoriesData.length > 0) {
            const notifications = publishedStoriesData.reduce((ntf, row) => {
                ntf += `- <https://pipeline.locallabs.com/stories/${row.storyId}|Pipeline Draft Story>\n`;
                ntf += `- *Added in <https://docs.google.com/spreadsheets/d/${StatisticsSheetId}|Google Sheet>:* ${row.isInSheet ? 'YES' : "*NO*"}\n`;
                ntf += `- *Publication:* ${row.publication}\n`;
                ntf += `- *Sport:* ${row.sport} - ${row.sex}\n`;

                return ntf;
            }, "<@U02TSHJ0E> <@U07J2QBNMV1> <@U08BXH4N4T1>\n");

            await SlackWebService.chat.postMessage({
                channel: 'C09BCUA6M6U',
                text: notifications,
            });
        }
    } catch (err: unknown) {
        console.log((err as Error).stack)

        await SlackWebService.chat.postMessage({
            channel: "U024ZKRR8AE",
            text: `*[AI Sport Stories]::[ERROR]*\n>${(err as Error).message} `,
        });
    } finally {
        mysqlStoryClient && mysqlStoryClient.end();
        mysqlLokiClient && mysqlLokiClient.end();
        mysqlPipelineClient && mysqlPipelineClient.end();
    }
}
