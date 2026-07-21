const { parsePagination, buildPaginationMeta, parseSort, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require("../utils/pagination");

describe("parsePagination", () => {
  test("defaults page and limit when the query is empty", () => {
    expect(parsePagination({})).toEqual({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT, skip: 0 });
  });

  test("computes skip correctly for page 2", () => {
    expect(parsePagination({ page: "2", limit: "10" })).toEqual({ page: 2, limit: 10, skip: 10 });
  });

  test.each([
    ["0", DEFAULT_PAGE],
    ["-1", DEFAULT_PAGE],
    ["abc", DEFAULT_PAGE],
    [undefined, DEFAULT_PAGE],
    ["1.5", 1], // parseInt truncates rather than erroring
  ])("falls back to the default page for invalid input %p", (input, expected) => {
    expect(parsePagination({ page: input }).page).toBe(expected);
  });

  test.each([
    ["0", DEFAULT_LIMIT],
    ["-5", DEFAULT_LIMIT],
    ["abc", DEFAULT_LIMIT],
    [undefined, DEFAULT_LIMIT],
  ])("falls back to the default limit for invalid input %p", (input, expected) => {
    expect(parsePagination({ limit: input }).limit).toBe(expected);
  });

  test("caps limit at MAX_LIMIT even when the client asks for more", () => {
    expect(parsePagination({ limit: "500" }).limit).toBe(MAX_LIMIT);
  });

  test("accepts a limit right at the cap", () => {
    expect(parsePagination({ limit: String(MAX_LIMIT) }).limit).toBe(MAX_LIMIT);
  });
});

describe("buildPaginationMeta", () => {
  test("computes totalPages by ceiling division", () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 45 })).toEqual({
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3,
    });
  });

  test("totalPages is 0 when there are no results", () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 0 }).totalPages).toBe(0);
  });

  test("totalPages is exact when total is an even multiple of limit", () => {
    expect(buildPaginationMeta({ page: 1, limit: 10, total: 20 }).totalPages).toBe(2);
  });
});

describe("parseSort", () => {
  const allowed = ["jobDate", "createdAt", "status"];
  const fallback = { jobDate: 1 };

  test("returns the default sort when no sort param is given", () => {
    expect(parseSort(undefined, allowed, fallback)).toBe(fallback);
  });

  test("parses an ascending field", () => {
    expect(parseSort("status", allowed, fallback)).toEqual({ status: 1 });
  });

  test("parses a descending field (leading -)", () => {
    expect(parseSort("-createdAt", allowed, fallback)).toEqual({ createdAt: -1 });
  });

  test("falls back to default for a field not in the allowlist", () => {
    expect(parseSort("password", allowed, fallback)).toBe(fallback);
  });

  test("falls back to default for a non-string sort param", () => {
    expect(parseSort(123, allowed, fallback)).toBe(fallback);
  });
});
