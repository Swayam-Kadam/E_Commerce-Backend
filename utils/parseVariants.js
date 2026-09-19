const { normalizeVariants } = require('./productVariants');

/**
 * Parse variants from request body (JSON string or value).
 * Accepts:
 * - SKU rows: [{ sku, color, size, stock }, ...]
 * - Legacy option bag array: [{ color: [], size: [] }]
 * - Legacy option bag object: { color: [], size: [] }
 */
function parseVariantsInput(raw, productStock = 0, productIdHint = 'prod') {
  if (raw == null || raw === '') {
    return { variants: [], totalStock: Math.max(0, Number(productStock) || 0) };
  }

  let parsed = raw;
  if (typeof raw === 'string') {
    parsed = JSON.parse(raw);
  }

  const asArray = Array.isArray(parsed) ? parsed : [parsed];
  return normalizeVariants(asArray, productStock, productIdHint);
}

module.exports = { parseVariantsInput };
