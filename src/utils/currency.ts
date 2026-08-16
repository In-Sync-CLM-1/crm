/**
 * Currency formatting used across the dashboard, billing and client screens.
 * Previously re-declared inline in a dozen components, each with slightly
 * different rounding.
 */

/** Compact Indian-notation rupees: ₹1.25Cr / ₹3.40L / ₹12K / ₹850 */
export function formatCompactINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

/** Full amount with currency symbol and no decimals: ₹12,34,567 */
export function formatCurrency(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}
