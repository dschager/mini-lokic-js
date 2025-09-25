import { OpenAI } from "../../../../../services/OpenAI.service";
import { logGPTInteraction } from "../../../story_types/logger";
import { cleanJsonResponse } from "../utils/jsonUtils";
import { createImprovedGPTPrompt } from "./gptPrompt";

// Ask GPT to analyze stories for duplicate photos and old content (when local analysis needs validation)
export async function analyzeWithGPT(url: string, modelId: string, extractedStories: { headline: string; imageUrl: string; hash: string, dateText?: string }[]): Promise<string> {
  const prompt = createImprovedGPTPrompt(url, extractedStories);

  const resp = await OpenAI.chat.completions.create({
    model: modelId,
    messages: [
      { 
        role: "system", 
        content: "You are a precise JSON generator. Only output valid JSON. Never hallucinate or modify provided headlines. Use exact headlines from the provided list only." 
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.0
  });

  const rawOutput = resp.choices[0].message?.content?.trim() || "{}";
  const cleanedOutput = cleanJsonResponse(rawOutput);
  
  logGPTInteraction(url, prompt, rawOutput);
  
  return cleanedOutput;
}