/** Copy only allow-listed keys (blocks mass-assignment of status, version, isLocked, …). */
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

module.exports = { pick };
