const { normalizeDateOnly, buildDateRangeFilter, getMondayStartWeekRange } = require("../utils/dateRange");

describe("normalizeDateOnly", () => {
  test("normalizes a YYYY-MM-DD string to UTC midnight", () => {
    expect(normalizeDateOnly("2026-07-20").toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  test("returns null for falsy input", () => {
    expect(normalizeDateOnly(undefined)).toBeNull();
    expect(normalizeDateOnly("")).toBeNull();
  });

  test("returns null for an unparseable string", () => {
    expect(normalizeDateOnly("not-a-date")).toBeNull();
  });
});

describe("buildDateRangeFilter", () => {
  test("returns null when neither from nor to is valid", () => {
    expect(buildDateRangeFilter("jobDate", {})).toBeNull();
    expect(buildDateRangeFilter("jobDate", { from: "bad", to: "bad" })).toBeNull();
  });

  test("builds a $gte-only filter when only from is given", () => {
    const result = buildDateRangeFilter("jobDate", { from: "2026-07-01" });
    expect(result.jobDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result.jobDate.$lt).toBeUndefined();
  });

  test("builds a $lt-only filter (exclusive, end of day) when only to is given", () => {
    const result = buildDateRangeFilter("jobDate", { to: "2026-07-10" });
    expect(result.jobDate.$lt.toISOString()).toBe("2026-07-11T00:00:00.000Z");
    expect(result.jobDate.$gte).toBeUndefined();
  });

  test("builds a full inclusive range when both are given", () => {
    const result = buildDateRangeFilter("jobDate", { from: "2026-07-01", to: "2026-07-10" });
    expect(result.jobDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result.jobDate.$lt.toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  test("uses the given field name as the key", () => {
    const result = buildDateRangeFilter("uploadDate", { from: "2026-07-01" });
    expect(result).toHaveProperty("uploadDate");
  });
});

describe("getMondayStartWeekRange", () => {
  test("an exact Monday resolves to itself as the week start", () => {
    const { weekStart, weekEnd } = getMondayStartWeekRange(normalizeDateOnly("2026-07-20"));
    expect(weekStart.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("a mid-week Thursday resolves back to that week's Monday", () => {
    const { weekStart, weekEnd } = getMondayStartWeekRange(normalizeDateOnly("2026-07-23"));
    expect(weekStart.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("a Sunday belongs to the week that started the previous Monday", () => {
    const { weekStart, weekEnd } = getMondayStartWeekRange(normalizeDateOnly("2026-07-26"));
    expect(weekStart.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });
});
