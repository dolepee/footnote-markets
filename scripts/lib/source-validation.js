import { isAddress } from "viem";

export const DEFAULT_MAX_PRICE = 0.05;
export const DEFAULT_MAX_BATCH_BOND = 0;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function numberField(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateSourceCandidate(candidate, options = {}) {
  const maxPrice = Number(options.maxPrice ?? DEFAULT_MAX_PRICE);
  const maxBond = Number(options.maxBond ?? Number.POSITIVE_INFINITY);
  const errors = [];
  const warnings = [];
  const price = numberField(candidate.price);
  const bond = numberField(candidate.bond || "0");

  if (!candidate.creator?.trim()) errors.push("creator is required");
  if (!candidate.title?.trim()) errors.push("title is required");
  if (!candidate.summary?.trim()) errors.push("summary is required");
  if (!isHttpUrl(candidate.sourceUrl)) errors.push("sourceUrl must be http(s)");
  if (!isAddress(candidate.payoutWallet || "")) errors.push("payoutWallet must be an EVM address");
  if (price === null || price <= 0) errors.push("price must be a positive number");
  if (Number.isFinite(maxPrice) && price !== null && price > maxPrice) {
    errors.push(`price exceeds maxPrice ${maxPrice}`);
  }
  if (bond === null || bond < 0) errors.push("bond must be a non-negative number");
  if (Number.isFinite(maxBond) && bond !== null && bond > maxBond) {
    errors.push(`bond exceeds maxBond ${maxBond}`);
  }
  if ((candidate.summary || "").length < 24) warnings.push("summary is short; judges/users may not understand why to cite it");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: {
      ...candidate,
      price: price === null ? candidate.price : String(price),
      bond: bond === null ? candidate.bond || "0" : String(bond),
    },
  };
}
