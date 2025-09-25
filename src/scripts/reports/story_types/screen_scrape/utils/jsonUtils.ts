// Clean JSON response from GPT (remove markdown formatting)
export function cleanJsonResponse(response: string): string {
  let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
  cleaned = cleaned.trim();
  
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }
  
  return cleaned;
}

export function isLikelyHeadline(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const trimmedText = text.trim().replace(/\s+/g, " ");
  const words = trimmedText.split(/\s+/);

  // 1. Filter out articles with fewer than 4 words
  if (words.length < 4) return false;

  // 2. Filter out ALL-CAPS section headers
  const lettersOnly = trimmedText.replace(/[^a-zA-Z]/g, "");
  if (lettersOnly && lettersOnly === lettersOnly.toUpperCase()) return false;


  // 3. Everything else is considered a valid headline
  return true;
}
