'use strict';
// Route settlement repositories (Phase 21). Claims are rows; the settled
// amount DERIVES from links to posted payments only — a cancelled payment
// releases its claim with no write at all. Nothing here is editable state.
const { ConflictError, NotFoundError } = require('../domain/errors');
const { SETTLEMENT_STATUSES } = require('../domain/vocabulary');
const { utcNowIso } = require('../db');

const SETTLED_SQL = `
  COALESCE((
    SELECT SUM(a.amount)
      FROM route_settlement_allocations a
      JOIN payments p ON p.id = a.payment_id
     WHERE a.settlement_id = s.id AND p.status = 'posted'
  ), 0)`;

function deriveStatus(amount, settled) {
  if (settled >= amount) return SETTLEMENT_STATUSES.SETTLED;
  if (settled > 0) return SETTLEMENT_STATUSES.PARTIAL;
  return SETTLEMENT_STATUSES.OPEN;
}

function hydrate(row) {
  if (!row) return null;
  const amount = row.amount;
  const settled = Number(row.settled_amount);
  return { ...row, settled_amount: settled, outstanding: amount - settled, status: deriveStatus(amount, settled) };
}

function createSettlementRepository(db) {
  return {
    ofStop(stopId) {
      const row = db.prepare(
        `SELECT s.*, ${SETTLED_SQL} AS settled_amount
           FROM route_settlements s WHERE s.stop_id = ?`
      ).get(stopId);
      return hydrate(row);
    },
    ofRoute(routeId) {
      const rows = db.prepare(
        `SELECT s.*, ${SETTLED_SQL} AS settled_amount,
                st.stop_no, st.status AS stop_status, st.party_id
           FROM route_settlements s
           JOIN route_stops st ON st.id = s.stop_id
          WHERE s.route_id = ? ORDER BY st.stop_no`
      ).all(routeId);
      return rows.map(hydrate);
    },
    // Idempotent claim materialization (one row per stop, UNIQUE stop_id).
    ensure({ stopId, routeId, amount }) {
      const now = utcNowIso();
      db.prepare(
        `INSERT INTO route_settlements (stop_id, route_id, amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(stop_id) DO NOTHING`
      ).run(stopId, routeId, amount, now, now);
      return this.ofStop(stopId);
    },
    link({ settlementId, paymentId, amount }) {
      try {
        db.prepare(
          `INSERT INTO route_settlement_allocations (settlement_id, payment_id, amount, created_at)
           VALUES (?, ?, ?, ?)`
        ).run(settlementId, paymentId, amount, utcNowIso());
      } catch (err) {
        if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''))) {
          throw new ConflictError('payment already linked to this stop (duplicate submission?)');
        }
        throw err;
      }
    },
    linksOfSettlement(settlementId) {
      return db.prepare(
        `SELECT a.*, p.payment_no, p.status AS payment_status, p.direction, p.method
           FROM route_settlement_allocations a JOIN payments p ON p.id = a.payment_id
          WHERE a.settlement_id = ? ORDER BY a.id`
      ).all(settlementId);
    },
    // Posted links only: cancelled payments free both till and claim.
    linkedPostedOfPayment(paymentId) {
      return Number(db.prepare(
        `SELECT COALESCE(SUM(a.amount), 0) AS n
           FROM route_settlement_allocations a JOIN payments p ON p.id = a.payment_id
          WHERE a.payment_id = ? AND p.status = 'posted'`
      ).get(paymentId).n);
    },
    reconciliationOfRoute(routeId) {
      const stops = this.ofRoute(routeId);
      const totals = stops.reduce(
        (acc, s) => ({
          claim: acc.claim + s.amount,
          settled: acc.settled + s.settled_amount,
          outstanding: acc.outstanding + s.outstanding,
        }),
        { claim: 0, settled: 0, outstanding: 0 }
      );
      return { stops, ...totals };
    },
  };
}

module.exports = { createSettlementRepository, deriveStatus };
