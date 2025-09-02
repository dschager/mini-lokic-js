import "dotenv/config";
import { OpenAI as AI } from "openai";

export const OpenAI = new AI({ apiKey: process.env.OPEN_AI_API_KEY });
