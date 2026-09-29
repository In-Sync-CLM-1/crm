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

// Every charge on Amit's card is a business expense. The account depends on
// what it is: tools and subscriptions, card fees, or meeting spend (cash,
// fuel, food).
const SOFTWARE_MERCHANTS = ["BOLNA", "MICROSOFT", "CLOUDFLARE", "EXOTEL", "ANTHROPIC", "ELEVENLABS", "SUPABASE", "OPENAI", "GITHUB", "RESEND", "GROQ", "GOOGLE", "ZOOM", "CANVA", "SPOTIFY"];

// Blinkit and Amazon purchases are personal: never booked in the company accounts.
export function isPersonalCardSpend(narration: string): boolean {
  return /BLINKIT|GROFERS|AMAZON|AMZN/i.test(narration);
}

export function cardExpenseCode(narration: string): "5030" | "5050" | "5060" {
  const n = narration.toUpperCase().trim();
  if (SOFTWARE_MERCHANTS.some(m => n.includes(m))) return "5030"; // Software & Subscriptions
  if (/CASH ADVANCE FEE|JOINING FEE|SURCHARGE/.test(n) || /^IGST/.test(n)) return "5050"; // Bank Charges
  return "5060"; // Travel & Conveyance (meetings: cash, fuel, food)
}
