const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parses page/limit query params with safe defaults — invalid, missing, or
 * out-of-range values fall back rather than erroring. limit is capped
 * server-side regardless of what the client asks for.
 */
const parsePagination = (query = {}) => {
  const rawPage = Number.parseInt(query.page, 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;

  const rawLimit = Number.parseInt(query.limit, 10);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildPaginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / limit),
});

/**
 * Parses a sort query param like "-createdAt" or "jobDate" into a Mongoose
 * sort object. Only fields in allowedFields can be sorted on — anything
 * else (typo, unindexed field, injection attempt) silently falls back to
 * defaultSort instead of erroring.
 */
const parseSort = (sortParam, allowedFields, defaultSort) => {
  if (!sortParam || typeof sortParam !== "string") return defaultSort;

  const direction = sortParam.startsWith("-") ? -1 : 1;
  const field = sortParam.replace(/^-/, "");

  if (!allowedFields.includes(field)) return defaultSort;

  return { [field]: direction };
};

module.exports = {
  parsePagination,
  buildPaginationMeta,
  parseSort,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
