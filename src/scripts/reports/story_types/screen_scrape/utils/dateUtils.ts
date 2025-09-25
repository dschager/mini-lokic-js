import { CONFIG } from "../config";

export interface ParsedDateResult {
  originalText: string;
  parsedDate: Date | null;
  ageDays: number | null;
  isValid: boolean;
  error?: string;
}

/**
 * Gets today's date at midnight for consistent comparisons
 */
function getTodayDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/**
 * Calculates the difference in days between two dates
 */
function calculateDaysDifference(date1: Date, date2: Date): number {
  const diffInMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Parses various date formats commonly found on news websites
 */
function parseNewsDate(dateText: string): Date | null {
  if (!dateText || typeof dateText !== 'string') {
    console.log(`❌ Invalid input: "${dateText}" (type: ${typeof dateText})`);
    return null;
  }

  const cleanText = dateText.trim().toLowerCase();
  const today = getTodayDate();
  
  console.log(`🔍 Attempting to parse date: "${dateText}" (cleaned: "${cleanText}")`);

  // Handle relative dates first
  if (cleanText === 'today') {
    console.log(`✅ Parsed as 'today': ${today.toISOString().split('T')[0]}`);
    return today;
  }

  if (cleanText === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    console.log(`✅ Parsed as 'yesterday': ${yesterday.toISOString().split('T')[0]}`);
    return yesterday;
  }

  // Handle "X hours/days/weeks/months ago"
  const relativeMatch = cleanText.match(/(\d+)\s+(hour|hours|hr|hrs|day|days|week|weeks|month|months)\s+ago/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const date = new Date(today);

    console.log(`🔍 Found relative date: ${amount} ${unit} ago`);

    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      date.setHours(date.getHours() - amount);
    } else if (unit.startsWith('day')) {
      date.setDate(date.getDate() - amount);
    } else if (unit.startsWith('week')) {
      date.setDate(date.getDate() - (amount * 7));
    } else if (unit.startsWith('month')) {
      date.setMonth(date.getMonth() - amount);
    }

    console.log(`✅ Parsed relative date: ${date.toISOString().split('T')[0]}`);
    return date;
  }

  // Handle days of the week (assume current week or last week)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.indexOf(cleanText);
  if (dayIndex !== -1) {
    const todayDayIndex = today.getDay();
    const date = new Date(today);
    
    let dayDifference = todayDayIndex - dayIndex;
    if (dayDifference <= 0) {
      dayDifference += 7; // Go to last week
    }
    
    date.setDate(date.getDate() - dayDifference);
    console.log(`✅ Parsed day name '${cleanText}': ${date.toISOString().split('T')[0]}`);
    return date;
  }

  // Extract just the date part if there's extra text
  const dateExtractionPatterns = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/, // YYYY-MM-DD
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // MM/DD/YYYY or MM/DD/YY
    /\b\d{1,2}-\d{1,2}-\d{2,4}\b/, // MM-DD-YYYY
    /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/, // DD.MM.YYYY
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{2,4}\b/i, // Month DD, YYYY
    /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}\b/i, // DD Month YYYY
  ];

  let extractedDate = dateText.trim();
  for (const pattern of dateExtractionPatterns) {
    const match = dateText.match(pattern);
    if (match) {
      extractedDate = match[0];
      console.log(`🔍 Extracted date portion: "${extractedDate}" from "${dateText}"`);
      break;
    }
  }

  // Direct parsing attempts with various transformations
  const parseAttempts = [
    extractedDate, // Extracted or original text
    dateText.trim(), // Original text trimmed
    
    // Convert European format DD.MM.YYYY to ISO
    extractedDate.replace(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, '$3-$2-$1'),
    
    // Convert US format MM/DD/YYYY to ISO
    extractedDate.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, '$3-$1-$2'),
    
    // Convert US format MM/DD/YY to full year
    extractedDate.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, (_, month, day, year) => {
      const fullYear = parseInt(year) > 30 ? `19${year}` : `20${year}`;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }),
    
    // Convert DD-MM-YYYY to ISO
    extractedDate.replace(/^(\d{1,2})-(\d{1,2})-(\d{4})$/, '$3-$2-$1'),
  ];

  console.log(`🔍 Trying ${parseAttempts.length} parsing attempts...`);

  for (let i = 0; i < parseAttempts.length; i++) {
    const attempt = parseAttempts[i];
    if (!attempt || attempt === dateText) {
      if (i > 0) continue; // Skip duplicate original text
    }
    
    try {
      console.log(`  Attempt ${i + 1}: "${attempt}"`);
      const parsed = new Date(attempt);
      
      console.log(`  -> Parsed to: ${parsed.toISOString()} (valid: ${!isNaN(parsed.getTime())})`);
      
      // Validate the parsed date
      if (isValidParsedDate(parsed, attempt)) {
        console.log(`✅ Successfully parsed "${dateText}" as ${parsed.toISOString().split('T')[0]}`);
        return parsed;
      } else {
        console.log(`  -> Validation failed for ${parsed.toISOString()}`);
      }
    } catch (error) {
      console.log(`  -> Parse error: ${error}`);
      continue;
    }
  }

  console.log(`❌ Failed to parse date: "${dateText}"`);
  return null;
}

/**
 * Validates that a parsed date is reasonable
 */
function isValidParsedDate(date: Date, originalText: string): boolean {
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return false;
  }

  const today = getTodayDate();
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  
  const oneWeekFuture = new Date(today);
  oneWeekFuture.setDate(oneWeekFuture.getDate() + 7);

  // Date should be within reasonable range for news articles
  // Not more than 2 years old, not more than 1 week in the future
  if (date < twoYearsAgo || date > oneWeekFuture) {
    return false;
  }

  // Additional validation for two-digit years
  if (originalText.match(/\/\d{2}$/) && date.getFullYear() > 2050) {
    // Likely misinterpreted 2-digit year, try adjusting
    const adjustedDate = new Date(date);
    adjustedDate.setFullYear(adjustedDate.getFullYear() - 100);
    if (adjustedDate >= twoYearsAgo && adjustedDate <= today) {
      date.setFullYear(adjustedDate.getFullYear());
    }
  }

  return true;
}

/**
 * Main function to parse date text and calculate age
 */
export function parseDateAndCalculateAge(dateText: string): ParsedDateResult {
  try {
    const today = getTodayDate();
    const parsedDate = parseNewsDate(dateText);

    if (!parsedDate) {
      return {
        originalText: dateText,
        parsedDate: null,
        ageDays: null,
        isValid: false,
        error: 'Could not parse date'
      };
    }

    const ageDays = calculateDaysDifference(parsedDate, today);

    return {
      originalText: dateText,
      parsedDate: parsedDate,
      ageDays: ageDays,
      isValid: true
    };
  } catch (error) {
    return {
      originalText: dateText,
      parsedDate: null,
      ageDays: null,
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Processes an array of stories and adds parsed date information
 */
export function processStoriesWithDates<T extends { dateText: string }>(
  stories: T[]
): (T & { parsedDateInfo: ParsedDateResult })[] {
  return stories.map(story => ({
    ...story,
    parsedDateInfo: parseDateAndCalculateAge(story.dateText)
  }));
}

/**
 * Filters stories that are older than the specified number of days
 */
export function findOldStories<T extends { parsedDateInfo: ParsedDateResult }>(
  stories: T[],
  maxAgeDays: number = CONFIG.DAYS_OLD
): T[] {
  return stories.filter(story => 
    story.parsedDateInfo.isValid && 
    story.parsedDateInfo.ageDays !== null && 
    story.parsedDateInfo.ageDays > maxAgeDays
  );
}