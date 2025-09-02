import "dotenv/config";

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

import csv from 'csv-parser';

import { SlackWebService } from "../../../services/Slack.service";
import {GoogleDriveService, GoogleSheetsService} from "../../../services/GoogleAPIs.service";

const REPORTS_STORAGE = "/home/app/rc/reports/story_types_for_tatiana"
const SLACK_CHANNEL_ID = "C05J3GZ744X";

export function TatianaStoryTypesReport() {
    const spawnArgs = ['-l', '-c', `cd /home/app/LokiC/current && bundle exec rails story_type:report_tatiana`];
    const command = spawn('/bin/bash', spawnArgs);

    command.on("spawn", async () => {
        await SlackWebService.chat.postMessage({
            channel: SLACK_CHANNEL_ID,
            text: `🟡 *report* "story_type:report_tatiana" is executed`,
        });
    });

    command.on('close', async (code) => {
        if (!Number.isInteger(code) || code !== 0) {
            await SlackWebService.chat.postMessage({
                channel: SLACK_CHANNEL_ID,
                text: `🔴 *report* "story_type:report_tatiana" returned code ${code}`,
            });

            return;
        }

        const spreadsheet = await createAndFillSpreadsheet();
        await SlackWebService.chat.postMessage({
            channel: SLACK_CHANNEL_ID,
            text: `${spreadsheet.title}\n<${spreadsheet.link}|click here>`
        });
    });
}

async function createAndFillSpreadsheet() {
    const reports = await fs.promises.readdir(REPORTS_STORAGE);
    const date: string = reports.at(-1)!;
    const reportFiles = await fs.promises.readdir(`${REPORTS_STORAGE}/${reports.at(-1)}`);

    const title = `Report (${date}) Exported/Published/ExportsNext12weeks/Blocked/InQueue Story Types`;
    const sheetsService = await GoogleSheetsService();
    const driveService = await GoogleDriveService();

    const googleSheet = await sheetsService.spreadsheets.create({
        requestBody: { properties: {title} }
    });

    const spreadsheetId = googleSheet.data.spreadsheetId;
    const firstSheetId = googleSheet.data.sheets?.[0]?.properties?.sheetId;
    const link = googleSheet.data.spreadsheetUrl;

    if (!spreadsheetId) {
        throw new Error('Failed to create spreadsheet');
    }

    for (const file of reportFiles) {
        const sheetTitle = path.basename(file, '.csv').replace(/\s+/g, '_'); // Use file name as sheet name
        await sheetsService.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requestBody: {
                requests: [
                    { addSheet: { properties: { title: sheetTitle } } }
                ]
            },
        });

        const data: Array<string[]> = [];
        fs.createReadStream(`${REPORTS_STORAGE}/${date}/${file}`)
            .pipe(csv({headers: true}))
            .on('data', (row) => data.push(Object.values(row)))
            .on('end', async () => {
                await sheetsService.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetTitle}!A1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: data },
                });
            });
    }

    if (firstSheetId !== undefined) {
        await sheetsService.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requestBody: {
                requests: [
                    { deleteSheet: { sheetId: firstSheetId } },
                ],
            },
        });
    }

    await driveService.permissions.create({
        fileId: spreadsheetId,
        requestBody: { role: "writer", type: "anyone" }
    });

    return { title, link }
}