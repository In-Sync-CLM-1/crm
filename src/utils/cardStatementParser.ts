// Parses the transaction lines of an IDFC FIRST Bank credit card statement
// (text lines already extracted from the PDF, top-to-bottom).

export interface CardStatementRow {
  transaction_date: string; // YYYY-MM-DD
  narration: string;
  debit: number;            // purchase / fee / IGST
  credit: number;           // payment / refund / waiver
  card: string | null;      // last 4 digits
}

const TXN_END = /^(.*?)\s*([\d,]+\.\d{2})\s+(DR|CR)$/;
const TXN_START = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.*)$/;
const SECTION_HEADER = /^(Purchases, EMIs & Other Debits|Payments & Other Credits)\b/i;
const CARD_MARKER = /^Card Number:\s*XXXX\s*(\d{4})/i;
const NOISE = /^(YOUR TRANSACTIONS|Date Details|Pay Now|Pay in EMI)/i;

export function parseCardStatementLines(lines: string[]): CardStatementRow[] {
  const rows: CardStatementRow[] = [];
  let card: string | null = null;
  let prefix: string[] = [];   // wrapped description above the dated line (ends with a comma)
  let lastRowOpen = false;     // the previous line was a dated row, so a wrapped tail may follow

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const cardMatch = line.match(CARD_MARKER);
    if (cardMatch) { card = cardMatch[1]; prefix = []; lastRowOpen = false; continue; }
    if (SECTION_HEADER.test(line) || NOISE.test(line)) { prefix = []; lastRowOpen = false; continue; }

    const start = line.match(TXN_START);
    if (!start) {
      // Wrapped description: a piece ending in a comma belongs to the next row,
      // any other piece is the tail of the row just read.
      if (line.endsWith(",")) prefix.push(line);
      else if (lastRowOpen && rows.length > 0) {
        rows[rows.length - 1].narration = `${rows[rows.length - 1].narration} ${line}`.trim();
        lastRowOpen = false; // only one tail line per row
      }
      continue;
    }

    const end = start[4].match(TXN_END);
    if (!end) { lastRowOpen = false; continue; }
    const amount = parseFloat(end[2].replace(/,/g, ""));
    const isCredit = end[3] === "CR";
    rows.push({
      transaction_date: `${start[3]}-${start[2]}-${start[1]}`,
      narration: [...prefix, end[1]].join(" ").replace(/\s+/g, " ").trim(),
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      card,
    });
    lastRowOpen = prefix.length > 0; // wrapped rows carry one tail line
    prefix = [];
  }
  return rows;
}

// What a charge most likely is. The reviewer can change it before posting.
export type CardSuggestion = "software" | "advertising" | "personal";

const SOFTWARE_MERCHANTS = ["BOLNA", "MICROSOFT", "CLOUDFLARE", "EXOTEL", "ANTHROPIC", "ELEVENLABS", "SUPABASE", "OPENAI", "GITHUB", "RESEND", "GROQ", "GOOGLE WORKSPACE", "GOOGLE CLOUD", "ZOOM", "CANVA"];
const ADVERTISING_MERCHANTS = ["GOOGLE ADS", "GOOGLEADS", "FACEBK", "META ADS", "LINKEDIN ADS"];

export function suggestCardCategory(row: Pick<CardStatementRow, "narration" | "debit" | "credit">): CardSuggestion {
  const n = row.narration.toUpperCase();
  if (ADVERTISING_MERCHANTS.some(m => n.includes(m))) return "advertising";
  if (SOFTWARE_MERCHANTS.some(m => n.includes(m))) return "software";
  // everything else on a personal card (cash, fuel, food, fees, IGST on fees)
  // is presumed personal until the reviewer says otherwise
  return "personal";
}
