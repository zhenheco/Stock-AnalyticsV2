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

export function extractMentionedSymbols(text: string): string[] {
  const normalizedText = stripDateLikeText(text);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const match of normalizedText.matchAll(SYMBOL_PATTERN)) {
    appendUnique(match[0], seen, results);
  }

  for (const [alias, symbol] of Object.entries(ALIASES)) {
    if (normalizedText.includes(alias)) {
      appendUnique(symbol, seen, results);
    }
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
