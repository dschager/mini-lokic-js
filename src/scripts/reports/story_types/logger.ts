import fs from "fs";
import path from "path";

// Ensure log dir exists
const logDir = path.resolve("log");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export function logGPTInteraction(url: string, prompt: string, output: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeHost = new URL(url).hostname.replace(/[^a-zA-Z0-9_-]/g, "_");
  const logFile = path.join(logDir, `${safeHost}-${ts}.txt`);

  const logData = {
    timestamp: new Date().toISOString(),
    url,
    prompt,
    output
  };

  fs.writeFileSync(logFile, JSON.stringify(logData, null, 2), "utf-8");
  console.log(`📝 Logged GPT interaction: ${logFile}`);
}
