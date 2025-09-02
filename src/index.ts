import "dotenv/config";
import express from "express";

import { ScheduledNonScheduledStoryTypesReport } from "./scripts/reports/story_types/sched-nonsched-stypes";
import { TatianaStoryTypesReport } from "./scripts/reports/story_types/tatiana-stypes";

import { spawn } from "child_process";

const app = express();
const router = express.Router();
const PORT = 9999;

router.post("/hlesync", async (req, res) => {
    const { response_url, text } = req.body;
    const args = ["clients_pubs_tags_sections", "opportunities", 'photo_buckets', "schemas_tables"];

    if (!args.includes(text)) {
        res.status(400).send(`🔴 *hlesync* "${text}" is invalid text parameter`);
        return;
    } else {
        res.status(200).send("");
    }

    const spawnArgs = ['-l', '-c', `cd /home/app/LokiC/current && bundle exec rails ${text}`];
    const command = spawn('/bin/bash', spawnArgs);

    command.on("spawn", () => {
        fetch(response_url, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({
                text: `🟡 *hlesync* "${text}" is executed`,
                response_type: "in_channel",
            })
        });
    });

    command.on('close', (code) => {
        const statusIndicator = Number.isInteger(code) && code === 0 ? "🟢️" : "🔴";

        fetch(response_url, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({
                text: `${statusIndicator} *hlesync* "${text}" completed with code ${code}`,
                response_type: "in_channel",
            })
        });
    });
});

router.post("/reports/story_types/tati_hle_calendar", (_req, res) => {
    res.status(200).send("Report is being generated...");
    TatianaStoryTypesReport()
});

router.post("/reports/story_types/hle_upcoming_stories", async (_req, res) => {
    res.status(200).send("Report is being generated...");
    await ScheduledNonScheduledStoryTypesReport();
});

app.use(express.json());
app.use(express.urlencoded());
app.use("/mini-loki-js", router);
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
