/**
 * Reads a dollar amount the way people type it.
 *
 * Accepts plain numbers ("10000", "2500.50"), thousands separators ("10,000"),
 * a leading dollar sign ("$10,000.00") and surrounding spaces.
 * Returns NaN for anything else, including negative numbers and commas that
 * aren't in thousands positions ("10,00"), so a typo is reported instead of
 * being silently read as a different amount.
 */
export function parseAmount(input: string): number {
  const cleaned = input.trim().replace(/^\$\s*/, '');
  if (cleaned === '') return NaN;

  const plain = /^\d+(\.\d*)?$|^\.\d+$/;
  const grouped = /^\d{1,3}(,\d{3})+(\.\d*)?$/;
  if (!plain.test(cleaned) && !grouped.test(cleaned)) return NaN;

  return Number(cleaned.replace(/,/g, ''));
}
