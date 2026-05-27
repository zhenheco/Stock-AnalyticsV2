const SYMBOL_PATTERN = /\b\d{4,6}[A-Z]?\b/g;

const ALIASES: Record<string, string> = {
  台積電: "2330",
  鴻海: "2317",
  聯發科: "2454",
  廣達: "2382",
  緯創: "3231",
  聯電: "2303",
  中華電: "2412",
  富邦金: "2881",
  國泰金: "2882",
  元大台灣50: "0050"
};

export function extractMentionedSymbols(text: string, aliases: Record<string, string> = {}): string[] {
  const normalizedText = stripDateLikeText(text);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const match of normalizedText.matchAll(SYMBOL_PATTERN)) {
    appendUnique(match[0], seen, results);
  }

  const matchedRanges: Array<{ start: number; end: number }> = [];
  const acceptedAliases: Array<{ start: number; symbol: string }> = [];
  const sortedAliases = Object.entries({ ...ALIASES, ...aliases })
    .filter(([alias]) => alias.trim().length > 0)
    .sort(([left], [right]) => right.length - left.length);
  for (const [alias, symbol] of sortedAliases) {
    const start = normalizedText.indexOf(alias);
    if (start >= 0 && !overlapsMatchedRange(start, start + alias.length, matchedRanges)) {
      matchedRanges.push({ start, end: start + alias.length });
      acceptedAliases.push({ start, symbol });
    }
  }
  for (const match of acceptedAliases.sort((left, right) => left.start - right.start)) {
    appendUnique(match.symbol, seen, results);
  }

  return results;
}

function stripDateLikeText(text: string): string {
  return text
    .replace(/\b20\d{2}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, " ")
    .replace(/\b19\d{2}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, " ");
}

function appendUnique(symbol: string, seen: Set<string>, results: string[]): void {
  if (!seen.has(symbol)) {
    seen.add(symbol);
    results.push(symbol);
  }
}

function overlapsMatchedRange(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}
