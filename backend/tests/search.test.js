const { escapeRegex, buildSearchOr } = require("../utils/search");

describe("escapeRegex", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegex("a.b*c?")).toBe("a\\.b\\*c\\?");
  });
});

describe("buildSearchOr", () => {
  test("returns null for an empty/whitespace term", () => {
    expect(buildSearchOr("", ["name"])).toBeNull();
    expect(buildSearchOr("   ", ["name"])).toBeNull();
    expect(buildSearchOr(undefined, ["name"])).toBeNull();
  });

  test("builds a case-insensitive $or across all given fields", () => {
    const result = buildSearchOr("wool", ["customerName", "pickupLocation"]);
    expect(result.$or).toHaveLength(2);
    expect(result.$or[0].customerName.test("Woolworths")).toBe(true);
    expect(result.$or[0].customerName.flags).toContain("i");
    expect(result.$or[1].pickupLocation.test("Woolworths Distribution")).toBe(true);
  });

  test("matches as a substring, not a whole-word/stemmed match (unlike $text)", () => {
    const result = buildSearchOr("wool", ["name"]);
    expect(result.$or[0].name.test("Woolworths")).toBe(true);
  });

  test("does not match unrelated text", () => {
    const result = buildSearchOr("zzz-no-match", ["name"]);
    expect(result.$or[0].name.test("Woolworths")).toBe(false);
  });

  test("safely escapes a regex-special search term instead of throwing or matching everything", () => {
    const result = buildSearchOr("a.*b", ["name"]);
    expect(result.$or[0].name.test("a.*b")).toBe(true);
    expect(result.$or[0].name.test("aXXXb")).toBe(false);
  });
});
