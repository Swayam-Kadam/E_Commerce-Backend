/**
 * Normalize product variants into SKU rows.
 * Accepts either:
 * - New format: [{ sku, color, size, stock }, ...]
 * - Legacy format: [{ color: string[], size: string[] }]
 *
 * @param {Array} rawVariants
 * @param {number} productStock fallback stock when expanding legacy / missing per-SKU stock
 * @param {string} productIdHint short id for auto SKUs
 * @returns {{ variants: Array<{sku:string,color?:string,size?:string,stock:number}>, totalStock: number }}
 */
function normalizeVariants(rawVariants, productStock = 0, productIdHint = 'prod') {
  if (!Array.isArray(rawVariants) || rawVariants.length === 0) {
    return { variants: [], totalStock: Math.max(0, Number(productStock) || 0) };
  }

  const first = rawVariants[0];
  const isLegacyOptionBag =
    first &&
    (Array.isArray(first.color) || Array.isArray(first.size)) &&
    !first.sku;

  let rows = [];

  if (isLegacyOptionBag) {
    const colors =
      Array.isArray(first.color) && first.color.length > 0 ? first.color : [null];
    const sizes =
      Array.isArray(first.size) && first.size.length > 0 ? first.size : [null];
    let index = 0;
    for (const color of colors) {
      for (const size of sizes) {
        const skuParts = [
          'SKU',
          String(productIdHint).slice(-6),
          color || 'default',
          size || 'os',
        ];
        rows.push({
          sku: skuParts.join('-').replace(/\s+/g, '-').toUpperCase(),
          color: color || undefined,
          size: size || undefined,
          stock: index === 0 ? Math.max(0, Number(productStock) || 0) : 0,
        });
        index += 1;
      }
    }
  } else {
    rows = rawVariants.map((v, i) => {
      const color = Array.isArray(v.color) ? v.color[0] : v.color;
      const size = Array.isArray(v.size) ? v.size[0] : v.size;
      const sku =
        v.sku ||
        ['SKU', String(productIdHint).slice(-6), color || 'default', size || 'os', i]
          .join('-')
          .replace(/\s+/g, '-')
          .toUpperCase();
      return {
        sku: String(sku).trim(),
        color: color || undefined,
        size: size || undefined,
        stock: Math.max(0, Number(v.stock != null ? v.stock : 0) || 0),
      };
    });
  }

  const totalStock = rows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  return { variants: rows, totalStock };
}

/**
 * Resolve available units for a cart/order line.
 * @param {object} product
 * @param {string|null} variantSku
 * @param {{color?:string,size?:string}|null} variant
 */
function getAvailableStock(product, variantSku = null, variant = null) {
  if (!product) return 0;
  const variants = product.variants || [];

  if (variantSku && variants.length > 0) {
    const match = variants.find((v) => v.sku === variantSku);
    return match ? Number(match.stock) || 0 : 0;
  }

  if (variant && (variant.color || variant.size) && variants.length > 0) {
    const match = variants.find(
      (v) =>
        (variant.color == null || v.color === variant.color) &&
        (variant.size == null || v.size === variant.size)
    );
    if (match) return Number(match.stock) || 0;
  }

  if (variants.length > 0) {
    return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }

  return Number(product.stock) || 0;
}

module.exports = { normalizeVariants, getAvailableStock };
