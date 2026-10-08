'use strict';
// Distributor delivery domain (Phase 19). Routes move PAPER and TRUCKS, never
// stock: goods commit at delivery-note posting (P13), long before dispatch.
// Completion is rule-gated (crew assigned, no pending stops, outcome mix
// matches the target state, failures always reasoned); collected amounts are
// recorded CLAIMS, settled in P21 — never confused with payments.
const { NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { ROUTE_TRANSITIONS } = require('../domain/vocabulary');
const {
  validateRegistryCode,
  validatePersonName,
  validateRouteDate,
  validateFailReason,
  validateCollectedAmount,
} = require('../domain/logistics');
const { todayDateString } = require('../domain/dates');
const { validatePhone } = require('../domain/parties');
const { createPartyRepository, createPartyRoleRepository } = require('../data/partyRepository');
const { createDocumentRepository } = require('../data/documentRepository');
const {
  createDriverRepository,
  createVehicleRepository,
  createRouteRepository,
  createRouteStopRepository,
} = require('../data/logisticsRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function assertRouteTransition(from, to) {
  if (!(ROUTE_TRANSITIONS[from] || []).includes(to)) {
    throw new ValidationError(`route cannot move from ${from} to ${to}`);
  }
}

function buildRouteNo(routes, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 32) throw new ValidationError('route number must be at most 32 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `RT-${day}-`;
  return `${prefix}${String(routes.nextDailySequence(prefix)).padStart(4, '0')}`;
}

function createDriver(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  const code = validateRegistryCode(raw.code, 'driver code');
  const name = validatePersonName(raw.name, 'driver name');
  return withTransaction(db, () => {
    const created = createDriverRepository(db).insert({ code, name, phone: validatePhone(raw.phone ?? '') });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'driver.create', entityType: 'driver', entityId: created.id, details: `code=${code}`, referenceNo: code });
    return created;
  });
}

function listDrivers(db) {
  return createDriverRepository(db).list();
}

function setDriverActive(db, id, active, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  return withTransaction(db, () => {
    const updated = createDriverRepository(db).setActive(id, active);
    createAuditRepository(db).append({ actor: auth.actor, operation: active ? 'driver.reactivate' : 'driver.deactivate', entityType: 'driver', entityId: id, referenceNo: updated.code });
    return updated;
  });
}

function createVehicle(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  const code = validateRegistryCode(raw.code, 'vehicle code');
  return withTransaction(db, () => {
    const created = createVehicleRepository(db).insert({
      code, plate: cleanText(raw.plate ?? '').slice(0, 32), description: cleanText(raw.description ?? '').slice(0, 200),
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'vehicle.create', entityType: 'vehicle', entityId: created.id, details: `code=${code}`, referenceNo: code });
    return created;
  });
}

function listVehicles(db) {
  return createVehicleRepository(db).list();
}

function setVehicleActive(db, id, active, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  return withTransaction(db, () => {
    const updated = createVehicleRepository(db).setActive(id, active);
    createAuditRepository(db).append({ actor: auth.actor, operation: active ? 'vehicle.reactivate' : 'vehicle.deactivate', entityType: 'vehicle', entityId: id, referenceNo: updated.code });
    return updated;
  });
}

function createRoute(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  const routeDate = validateRouteDate(raw.routeDate ?? raw.route_date) || todayDateString();
  return withTransaction(db, () => {
    const routes = createRouteRepository(db);
    const created = routes.insert({
      routeNo: buildRouteNo(routes, raw.routeNo ?? raw.route_no),
      routeDate,
      notes: cleanText(raw.notes ?? '').slice(0, 1000),
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.create', entityType: 'route', entityId: created.id, details: `date=${routeDate}`, referenceNo: created.route_no });
    return getRoute(db, created.id);
  });
}

function getRoute(db, id) {
  const route = createRouteRepository(db).getById(id);
  const stops = createRouteStopRepository(db).ofRoute(id);
  const driver = route.driver_id ? createDriverRepository(db).getById(route.driver_id) : null;
  const vehicle = route.vehicle_id ? createVehicleRepository(db).getById(route.vehicle_id) : null;
  return { ...route, driver, vehicle, stops };
}

function listRoutes(db, opts) {
  return createRouteRepository(db).list(opts);
}

function resolveCrew(db, { driverId = null, vehicleId = null }) {
  let driver = null;
  let vehicle = null;
  if (driverId !== null && driverId !== undefined) {
    driver = createDriverRepository(db).getById(driverId);
    if (!driver.is_active) throw new StateError(`driver ${driver.code} is inactive`);
  }
  if (vehicleId !== null && vehicleId !== undefined) {
    vehicle = createVehicleRepository(db).getById(vehicleId);
    if (!vehicle.is_active) throw new StateError(`vehicle ${vehicle.code} is inactive`);
  }
  return { driver, vehicle };
}

function assignRoute(db, routeId, { driverId = null, vehicleId = null } = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  return withTransaction(db, () => {
    const current = createRouteRepository(db).getById(routeId);
    if (current.status !== 'planned' && current.status !== 'loaded') {
      throw new StateError(`route ${current.route_no} is ${current.status}: crew changes stop at dispatch`);
    }
    const { driver, vehicle } = resolveCrew(db, { driverId, vehicleId });
    createRouteRepository(db).assign({
      id: routeId,
      driverId: driver ? driver.id : current.driver_id,
      vehicleId: vehicle ? vehicle.id : current.vehicle_id,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.assign', entityType: 'route', entityId: routeId, details: `driver=${driver ? driver.code : '-'} vehicle=${vehicle ? vehicle.code : '-'}`, referenceNo: current.route_no });
    return getRoute(db, routeId);
  });
}

function resolveStopParty(db, ref) {
  const parties = createPartyRepository(db);
  const party = ref.partyId !== undefined && ref.partyId !== null
    ? parties.getById(ref.partyId)
    : parties.getByCode(cleanText(ref.partyCode).toUpperCase());
  if (!party) throw new NotFoundError(`customer ${ref.partyCode || ref.partyId} not found`);
  if (!party.isActive) throw new StateError(`party ${party.code} is inactive`);
  if (!createPartyRoleRepository(db).ofParty(party.id).includes('customer')) {
    throw new StateError(`party ${party.code} is not a customer`);
  }
  return party;
}

function resolveStopDocument(db, deliveryDocId) {
  if (deliveryDocId === undefined || deliveryDocId === null) return null;
  const doc = createDocumentRepository(db).getById(deliveryDocId);
  if (doc.docType !== 'delivery_note') throw new ValidationError('route stops take delivery notes');
  if (doc.status !== 'confirmed' && doc.status !== 'posted') {
    throw new StateError(`delivery ${doc.docNo} is ${doc.status}: only confirmed/posted deliveries route`);
  }
  return doc;
}

function addStop(db, routeId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  return withTransaction(db, () => {
    const current = createRouteRepository(db).getById(routeId);
    if (current.status !== 'planned' && current.status !== 'loaded') {
      throw new StateError(`route ${current.route_no} is ${current.status}: stops change before dispatch`);
    }
    const party = resolveStopParty(db, raw);
    const doc = resolveStopDocument(db, raw.deliveryDocId ?? raw.delivery_doc_id);
    const stops = createRouteStopRepository(db);
    const row = stops.insert({ routeId, stopNo: stops.nextStopNo(routeId), partyId: party.id, deliveryDocId: doc ? doc.id : null });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.stop_add', entityType: 'route', entityId: routeId, details: `stop=${row.stop_no} customer=${party.code}`, referenceNo: current.route_no });
    return row;
  });
}

function removeStop(db, stopId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  return withTransaction(db, () => {
    const stops = createRouteStopRepository(db);
    const existing = stops.getById(stopId);
    const current = createRouteRepository(db).getById(existing.route_id);
    if (current.status !== 'planned' && current.status !== 'loaded') {
      throw new StateError(`route ${current.route_no} is ${current.status}: stops change before dispatch`);
    }
    if (existing.status !== 'pending') throw new StateError('only pending stops can be removed');
    db.prepare('DELETE FROM route_stops WHERE id = ?').run(stopId);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.stop_remove', entityType: 'route', entityId: current.id, referenceNo: current.route_no });
    return true;
  });
}

// Loading stages the truck: crew + at least one stop + every attached
// delivery already posted (goods committed). Administrative until P20 adds
// reservations — stock still moves at delivery-note posting.
function loadRoute(db, routeId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  const current = createRouteRepository(db).getById(routeId);
  assertRouteTransition(current.status, 'loaded');
  return withTransaction(db, () => {
    if (!current.driver_id || !current.vehicle_id) throw new StateError('loading needs a driver and a vehicle assigned');
    const stops = createRouteStopRepository(db).ofRoute(routeId);
    if (stops.length === 0) throw new StateError('loading needs at least one stop');
    const docs = createDocumentRepository(db);
    for (const s of stops) {
      if (s.delivery_doc_id === null || s.delivery_doc_id === undefined) continue;
      const doc = docs.getById(s.delivery_doc_id);
      if (doc.status !== 'posted') throw new StateError(`delivery ${doc.docNo} is ${doc.status}: only posted deliveries load`);
    }
    createRouteRepository(db).setStatus(routeId, 'loaded');
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.load', entityType: 'route', entityId: routeId, details: `stops=${stops.length}`, referenceNo: current.route_no });
    return getRoute(db, routeId);
  });
}

function dispatchRoute(db, routeId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.complete');
  const current = createRouteRepository(db).getById(routeId);
  assertRouteTransition(current.status, 'out_for_delivery');
  return withTransaction(db, () => {
    const driver = createDriverRepository(db).getById(current.driver_id);
    const vehicle = createVehicleRepository(db).getById(current.vehicle_id);
    if (!driver.is_active) throw new StateError(`driver ${driver.code} is inactive`);
    if (!vehicle.is_active) throw new StateError(`vehicle ${vehicle.code} is inactive`);
    createRouteRepository(db).setStatus(routeId, 'out_for_delivery', { dispatchedAt: utcNowIso() });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.dispatch', entityType: 'route', entityId: routeId, referenceNo: current.route_no });
    return getRoute(db, routeId);
  });
}

function completeStop(db, stopId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.complete');
  return withTransaction(db, () => {
    const stops = createRouteStopRepository(db);
    const stop = stops.getById(stopId);
    const route = createRouteRepository(db).getById(stop.route_id);
    if (route.status !== 'out_for_delivery') throw new StateError(`route ${route.route_no} is ${route.status}: stops complete out for delivery`);
    if (stop.status !== 'pending') throw new StateError(`stop ${stop.stop_no} is already ${stop.status}`);
    const row = stops.setOutcome(stopId, {
      status: 'delivered', collectedAmount: validateCollectedAmount(raw.collectedAmount ?? raw.collected_amount),
      proofRef: cleanText(raw.proofRef ?? raw.proof_ref ?? '').slice(0, 200),
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.stop_complete', entityType: 'route', entityId: route.id, details: `stop=${stop.stop_no} collected=${row.collected_amount}`, referenceNo: route.route_no });
    return row;
  });
}

function failStop(db, stopId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.complete');
  const reason = validateFailReason(raw.reason ?? raw.fail_reason);
  return withTransaction(db, () => {
    const stops = createRouteStopRepository(db);
    const stop = stops.getById(stopId);
    const route = createRouteRepository(db).getById(stop.route_id);
    if (route.status !== 'out_for_delivery') throw new StateError(`route ${route.route_no} is ${route.status}: stops fail out for delivery`);
    if (stop.status !== 'pending') throw new StateError(`stop ${stop.stop_no} is already ${stop.status}`);
    const row = stops.setOutcome(stopId, {
      status: 'failed', failReason: reason, collectedAmount: 0,
      proofRef: cleanText(raw.proofRef ?? raw.proof_ref ?? '').slice(0, 200),
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.stop_fail', entityType: 'route', entityId: route.id, details: `stop=${stop.stop_no} reason=${reason}`, reason, referenceNo: route.route_no });
    return row;
  });
}

// Route completion requires every stop terminal, and the outcome mix must
// match the target: delivered = all delivered; partial = mixed with at least
// one delivery; failed = none delivered.
function completeRoute(db, routeId, to, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.complete');
  if (to !== 'delivered' && to !== 'partial' && to !== 'failed') {
    throw new ValidationError('route completes as delivered, partial or failed');
  }
  const current = createRouteRepository(db).getById(routeId);
  assertRouteTransition(current.status, to);
  return withTransaction(db, () => {
    const stops = createRouteStopRepository(db).ofRoute(routeId);
    if (stops.some((s) => s.status === 'pending')) {
      throw new StateError('route has pending stops: complete or fail every stop first');
    }
    const delivered = stops.filter((s) => s.status === 'delivered').length;
    const failed = stops.filter((s) => s.status === 'failed').length;
    if (to === 'delivered' && failed > 0) throw new StateError('route has failed stops: complete as partial or failed');
    if (to === 'partial' && (delivered === 0 || failed === 0)) {
      throw new StateError('partial needs at least one delivered and one failed stop');
    }
    if (to === 'failed' && delivered > 0) throw new StateError('route has delivered stops: complete as partial');
    createRouteRepository(db).setStatus(routeId, to, { completedAt: utcNowIso() });
    const collected = stops.reduce((n, s) => n + s.collected_amount, 0);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.complete', entityType: 'route', entityId: routeId, details: `${to} delivered=${delivered} failed=${failed} collected=${collected}`, referenceNo: current.route_no });
    return getRoute(db, routeId);
  });
}

function cancelRoute(db, routeId, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a cancel reason is required');
  const current = createRouteRepository(db).getById(routeId);
  assertRouteTransition(current.status, 'cancelled');
  return withTransaction(db, () => {
    createRouteStopRepository(db).cancelPending(routeId);
    createRouteRepository(db).setStatus(routeId, 'cancelled', { cancelReason: why.slice(0, 1000) });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'route.cancel', entityType: 'route', entityId: routeId, reason: why.slice(0, 1000), referenceNo: current.route_no });
    return getRoute(db, routeId);
  });
}

module.exports = {
  createDriver,
  listDrivers,
  setDriverActive,
  createVehicle,
  listVehicles,
  setVehicleActive,
  createRoute,
  getRoute,
  listRoutes,
  assignRoute,
  addStop,
  removeStop,
  loadRoute,
  dispatchRoute,
  completeStop,
  failStop,
  completeRoute,
  cancelRoute,
};
