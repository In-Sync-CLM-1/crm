// Indian financial year (1 April – 31 March) containing the given date.
export function getFinancialYearRange(date: Date = new Date()): { from: string; to: string } {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}
