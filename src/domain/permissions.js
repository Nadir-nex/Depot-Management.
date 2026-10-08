'use strict';
// Authorization primitives (Phase 04). Capability keys + server-side enforcement.
// Trust model (v0.2, single-user desktop): the OS user IS the authority, so the
// Electron main process grants itself '*'. The RENDERER never supplies grants —
// main.js builds auth server-side from a bare actor name. A compromised
// renderer calling IPC directly still hits requirePermission() in the
// application layer. Hosted multi-user mode later passes real grant lists
// (from the session) through the SAME check, no business-layer rewrite.
//
// Convention: writes require permissions; reads are open (documented, P04).
// Roles map to these keys in a later phase; only keys + checks ship now.
const { ValidationError, ForbiddenError } = require('./errors');

// enforced: 'P04' = checked by a current command; otherwise the owning phase.
const PERMISSIONS = Object.freeze({
  'products.view': Object.freeze({ description: 'Read catalog', enforced: 'open-read' }),
  'products.edit': Object.freeze({ description: 'Create/deactivate/delete products', enforced: 'P04' }),
  'pricing.edit': Object.freeze({ description: 'Edit price lists (reserved)', enforced: 'P07' }),
  'stock.view': Object.freeze({ description: 'Read stock and movements', enforced: 'open-read' }),
  'stock.adjust': Object.freeze({ description: 'Manual stock adjustments (reserved)', enforced: 'P09' }),
  'stock.transfer': Object.freeze({ description: 'Transfer stock between warehouses (reserved)', enforced: 'P09' }),
  'warehouses.view': Object.freeze({ description: 'Read warehouses', enforced: 'open-read' }),
  'warehouses.edit': Object.freeze({ description: 'Create/deactivate/delete warehouses', enforced: 'P08' }),
  'purchases.create': Object.freeze({ description: 'Draft purchase documents (reserved)', enforced: 'P14' }),
  'purchases.post': Object.freeze({ description: 'Post a purchase receipt (receive stock)', enforced: 'P04' }),
  'purchases.cancel': Object.freeze({ description: 'Cancel a posted purchase receipt', enforced: 'P04' }),
  'sales.create': Object.freeze({ description: 'Draft sales documents (reserved)', enforced: 'P13' }),
  'sales.post': Object.freeze({ description: 'Post sales documents (reserved)', enforced: 'P13' }),
  'sales.cancel': Object.freeze({ description: 'Cancel sales documents (reserved)', enforced: 'P15' }),
  'payments.record': Object.freeze({ description: 'Record payments (reserved)', enforced: 'P16' }),
  'payments.reverse': Object.freeze({ description: 'Reverse payments (reserved)', enforced: 'P16' }),
  'cash.manage': Object.freeze({ description: 'Manage cash accounts, sessions and expenses', enforced: 'P16' }),
  'customers.edit': Object.freeze({ description: 'Edit customers/parties (reserved)', enforced: 'P11' }),
  'credit.override': Object.freeze({ description: 'Override credit limits (reserved)', enforced: 'P11' }),
  'deliveries.create': Object.freeze({ description: 'Create deliveries/routes (reserved)', enforced: 'P19' }),
  'deliveries.complete': Object.freeze({ description: 'Complete deliveries (reserved)', enforced: 'P19' }),
  'reports.view': Object.freeze({ description: 'View reports (reserved)', enforced: 'P24' }),
  'fiscal.manage': Object.freeze({ description: 'Open/close fiscal years, manage accounting', enforced: 'P25' }),
  'admin.backup': Object.freeze({ description: 'Backup database (reserved)', enforced: 'P28' }),
  'admin.restore': Object.freeze({ description: 'Restore database (reserved)', enforced: 'P28' }),
});

const ALL_GRANTS = '*';

function cleanActor(a) {
  const s = typeof a === 'string' ? a.trim() : '';
  return (s || 'system').slice(0, 120);
}

// Trusted server-side shorthand: a bare actor name (seed, bootstrap, tests,
// Electron main) carries full grants. Anything arriving from an UNTRUSTED
// transport must be an explicit { actor, grants } object. main.js coerces
// non-string renderer input to a name-only identity — privilege never crosses IPC.
function normalizeAuth(actorOrAuth) {
  if (typeof actorOrAuth === 'string' || actorOrAuth === undefined || actorOrAuth === null) {
    return { actor: cleanActor(actorOrAuth), grants: [ALL_GRANTS] };
  }
  const grants = Array.isArray(actorOrAuth.grants)
    ? [...new Set(actorOrAuth.grants.filter((g) => typeof g === 'string'))]
    : [];
  return { actor: cleanActor(actorOrAuth.actor), grants };
}

function hasPermission(auth, perm) {
  return auth.grants.includes(ALL_GRANTS) || auth.grants.includes(perm);
}

function requirePermission(auth, perm) {
  if (!Object.prototype.hasOwnProperty.call(PERMISSIONS, perm)) {
    throw new ValidationError(`unknown permission: ${perm}`);
  }
  if (!hasPermission(auth, perm)) {
    throw new ForbiddenError(`missing permission: ${perm}`);
  }
  return auth;
}

module.exports = { PERMISSIONS, normalizeAuth, requirePermission };
