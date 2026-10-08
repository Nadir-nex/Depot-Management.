'use strict';
// Delivery collections & settlement (Phase 21). The stop's collected_amount
// is a CLAIM against the driver (cash in hand); a settlement row materializes
// it at delivery. Money moves ONLY through the payments ledger (Phase 16):
// settling either links an existing posted incoming payment or records a new
// one, then links it. Status derives from posted links, so reversing a
// payment re-opens its claim with no write here. Partial settlement allowed;
// claims and payment legs always reconcile against each other.
const { NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { validatePaymentAmount } = require('../domain/payments');
const { createRouteStopRepository, createRouteRepository } = require('../data/logisticsRepository');
const { createSettlementRepository } = require('../data/settlementRepository');
const { createPaymentRepository } = require('../data/paymentRepository');
const { createAuditRepository } = require('../data/stockRepository');
const paymentsApp = require('./payments');
const { withTransaction } = require('../db');

// Called by logistics.completeStop inside its transaction when cash was taken.
function ensureStopSettlement(db, stop) {
  if (!(stop.collected_amount > 0)) return null;
  return createSettlementRepository(db).ensure({
    stopId: stop.id, routeId: stop.route_id, amount: stop.collected_amount,
  });
}

function getStopSettlement(db, stopId) {
  const settlement = createSettlementRepository(db).ofStop(stopId);
  if (!settlement) throw new NotFoundError(`stop ${stopId} has no collection claim`);
  return { ...settlement, links: createSettlementRepository(db).linksOfSettlement(settlement.id) };
}

// settleStop: link money to a claim. Either paymentId (existing posted
// incoming payment of the same party, with headroom) or a fresh payment
// recorded through the payments service (its cash leg, allocations and
// invoice refreshes apply unchanged).
function settleStop(db, stopId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'payments.record');
  return withTransaction(db, () => {
    const settlements = createSettlementRepository(db);
    const stop = createRouteStopRepository(db).getById(stopId);
    if (stop.status !== 'delivered') throw new StateError(`stop ${stop.stop_no} is ${stop.status}: only delivered stops settle`);
    const settlement = settlements.ofStop(stopId);
    if (!settlement) throw new StateError(`stop ${stop.stop_no} has no collection claim to settle`);
    const remaining = settlement.outstanding;
    if (remaining <= 0) throw new StateError(`stop ${stop.stop_no} claim is already settled`);
    const amount = raw.amount === undefined || raw.amount === null
      ? remaining
      : validatePaymentAmount(raw.amount);
    if (amount > remaining) {
      throw new StateError(`only ${remaining} remaining on stop ${stop.stop_no} claim`);
    }
    let payment;
    if (raw.paymentId !== undefined && raw.paymentId !== null) {
      payment = createPaymentRepository(db).getById(raw.paymentId);
      if (payment.status !== 'posted') throw new StateError(`payment ${payment.payment_no} is ${payment.status}`);
      if (payment.direction !== 'in') throw new StateError('only incoming payments settle collections');
      if (payment.party_id !== stop.party_id) throw new ValidationError('payment belongs to another party than this stop');
      const linked = settlements.linkedPostedOfPayment(payment.id);
      if (linked + amount > payment.amount) {
        throw new StateError(`payment ${payment.payment_no} only has ${payment.amount - linked} unlinked`);
      }
    } else {
      payment = paymentsApp.recordPayment(db, {
        direction: 'in',
        partyId: stop.party_id,
        method: raw.method ?? 'cash',
        cashAccountId: raw.cashAccountId ?? raw.cash_account_id,
        cashAccountCode: raw.cashAccountCode ?? raw.cash_account_code,
        amount,
        paymentDate: raw.paymentDate ?? raw.payment_date,
        allocations: raw.allocations,
      }, auth);
    }
    settlements.link({ settlementId: settlement.id, paymentId: payment.id, amount });
    createAuditRepository(db).append({
      actor: auth.actor, operation: 'settlement.stop', entityType: 'route',
      entityId: stop.route_id, details: `stop=${stop.stop_no} linked=${amount} payment=${payment.payment_no} settled=${settlement.settled_amount + amount}/${settlement.amount}`,
      referenceNo: payment.payment_no,
    });
    return getStopSettlement(db, stopId);
  });
}

// Route cash reconciliation: claims vs settled vs cash still in the driver's
// hand. Read-only; every figure derives from claims and posted payments.
function routeReconciliation(db, routeId) {
  const route = createRouteRepository(db).getById(routeId);
  const rec = createSettlementRepository(db).reconciliationOfRoute(routeId);
  return { routeId: route.id, routeNo: route.route_no, routeDate: route.route_date, status: route.status, ...rec };
}

module.exports = { ensureStopSettlement, getStopSettlement, settleStop, routeReconciliation };
