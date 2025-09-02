import "dotenv/config";

import { WebClient } from "@slack/web-api";

const token = process.env.SLACK_LOKIC_ACCESS_TOKEN;

export const SlackWebService = new WebClient(token);
