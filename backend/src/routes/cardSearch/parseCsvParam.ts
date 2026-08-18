export const parseCsvParam = (value: unknown): string[] | undefined => {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};
