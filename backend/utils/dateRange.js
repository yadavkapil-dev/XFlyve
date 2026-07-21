const normalizeDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
};

/**
 * Builds a { [field]: { $gte, $lt } } range filter from "from"/"to"
 * YYYY-MM-DD query params. "to" is treated as inclusive (end of that day).
 * Returns null if neither bound is a valid date.
 */
const buildDateRangeFilter = (field, { from, to } = {}) => {
  const range = {};

  const start = normalizeDateOnly(from);
  if (start) range.$gte = start;

  const endBase = normalizeDateOnly(to);
  if (endBase) {
    const end = new Date(endBase);
    end.setUTCDate(end.getUTCDate() + 1);
    range.$lt = end;
  }

  return Object.keys(range).length ? { [field]: range } : null;
};

/**
 * Monday-start week containing `dateOnly` (a UTC-midnight Date, e.g. from
 * normalizeDateOnly). Matches the frontend's original getStartOfWeek()/
 * isThisWeek() logic exactly — Sunday belongs to the week that started the
 * previous Monday.
 */
const getMondayStartWeekRange = (dateOnly) => {
  const weekStart = new Date(dateOnly);
  const day = weekStart.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  return { weekStart, weekEnd };
};

module.exports = { normalizeDateOnly, buildDateRangeFilter, getMondayStartWeekRange };
