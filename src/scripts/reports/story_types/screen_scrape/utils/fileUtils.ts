import crypto from "crypto";

// Generate simple UUID v4
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Utility to build safe filenames
export function safeName(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 12);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${new URL(url).hostname}-${ts}-${hash}.png`;
}

// Sleep utility for retries
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}