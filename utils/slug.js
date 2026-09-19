/**
 * Generate a URL-safe slug from a string.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Ensure a unique slug on a Mongoose model (field must be unique/sparse).
 * @param {import('mongoose').Model} Model
 * @param {string} base
 * @param {string|null} excludeId
 * @param {string} field
 */
async function uniqueSlug(Model, base, excludeId = null, field = 'slug') {
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const filter = { [field]: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    const exists = await Model.exists(filter);
    if (!exists) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

module.exports = { slugify, uniqueSlug };
