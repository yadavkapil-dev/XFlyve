// Plain MongoDB regex search (not $text): the admin search boxes need
// simple case-insensitive "contains" matching (e.g. typing "wool" should
// match "Woolworths Distribution"), which is exactly what $text does NOT
// do — $text tokenizes into whole words/stems, so "wool" wouldn't match
// "Woolworths" and it can't do partial/substring matches. $text also
// requires a dedicated text index per collection and doesn't compose well
// with the compound indexes already in place from Phase 3. Regex is less
// index-friendly for leading-wildcard patterns, but these are small,
// SMB-scale collections (not a full-text-search workload), so a plain
// substring regex is the simpler, more predictable choice here.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a Mongo $or clause matching `term` (case-insensitive, substring)
 * against any of `fields`. Returns null if there's no usable search term.
 */
const buildSearchOr = (term, fields) => {
  if (!term || typeof term !== "string" || !term.trim()) return null;

  const pattern = new RegExp(escapeRegex(term.trim()), "i");
  return { $or: fields.map((field) => ({ [field]: pattern })) };
};

module.exports = { escapeRegex, buildSearchOr };
