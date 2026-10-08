'use strict';
// Party repositories (Phase 11): parties + roles + phones + event balance.
// No balance column exists anywhere by design — getBalance() derives from
// posted receipts (supplier payable now; customer receivables land in P13/P16,
// when this function grows without changing its contract).
const { ConflictError, NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function toRow(r) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, displayName: r.display_name,
    phone: r.phone, email: r.email, address: r.address, city: r.city,
    taxId: r.tax_id, tradeRegister: r.trade_register,
    customerTypeCode: r.customer_type_code,
    creditLimit: r.credit_limit, paymentTermsDays: r.payment_terms_days,
    isActive: r.is_active === 1, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const UPDATE_COLUMNS = {
  displayName: 'display_name', phone: 'phone', email: 'email',
  address: 'address', city: 'city', taxId: 'tax_id', tradeRegister: 'trade_register',
  customerTypeCode: 'customer_type_code', creditLimit: 'credit_limit',
  paymentTermsDays: 'payment_terms_days', notes: 'notes',
};

function createPartyRepository(db) {
  return {
    insert(fields) {
      const now = utcNowIso();
      try {
        const info = db.prepare(
          `INSERT INTO parties
             (code, display_name, phone, email, address, city, tax_id, trade_register,
              customer_type_code, credit_limit, payment_terms_days, is_active, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        ).run(fields.code, fields.displayName, fields.phone, fields.email, fields.address,
          fields.city, fields.taxId, fields.tradeRegister, fields.customerTypeCode,
          fields.creditLimit, fields.paymentTermsDays, fields.notes, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`party code ${fields.code} already exists`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM parties WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`party ${id} not found`);
      return toRow(r);
    },
    getByCode(code) {
      return toRow(db.prepare('SELECT * FROM parties WHERE code = ?').get(code));
    },
    list({ role = null, search = '', activeOnly = false, limit = 200, offset = 0 } = {}) {
      const conds = [];
      const params = [];
      if (role) { conds.push('EXISTS (SELECT 1 FROM party_roles r WHERE r.party_id = parties.id AND r.role = ?)'); params.push(role); }
      if (search) { conds.push('(code LIKE ? OR display_name LIKE ? OR COALESCE(phone, \'\') LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      if (activeOnly) conds.push('is_active = 1');
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM parties ${where} ORDER BY display_name LIMIT ? OFFSET ?`).all(...params, limit, offset).map(toRow);
    },
    update(id, fields) {
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(UPDATE_COLUMNS)) {
        if (fields[key] !== undefined) { sets.push(`${column} = ?`); params.push(fields[key]); }
      }
      if (sets.length === 0) throw new NotFoundError(`party ${id} not found`);
      sets.push('updated_at = ?');
      params.push(utcNowIso(), id);
      const info = db.prepare(`UPDATE parties SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`party ${id} not found`);
      return this.getById(id);
    },
    setActive(id, active) {
      const info = db.prepare('UPDATE parties SET is_active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`party ${id} not found`);
      return this.getById(id);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM parties WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`party ${id} not found`);
      return true;
    },
    isReferenced(id) {
      const rec = db.prepare('SELECT 1 FROM purchase_receipts WHERE supplier_party_id = ? LIMIT 1').get(id);
      return Boolean(rec);
    },
    countByCodePrefix(prefix) {
      return db.prepare('SELECT COUNT(*) AS n FROM parties WHERE code LIKE ?').get(`${prefix}%`).n;
    },
  };
}

function createPartyRoleRepository(db) {
  return {
    setRoles(partyId, roles) {
      db.prepare('DELETE FROM party_roles WHERE party_id = ?').run(partyId);
      for (const role of roles) {
        db.prepare('INSERT INTO party_roles (party_id, role) VALUES (?, ?)').run(partyId, role);
      }
      return this.ofParty(partyId);
    },
    ofParty(partyId) {
      return db.prepare('SELECT role FROM party_roles WHERE party_id = ? ORDER BY role').all(partyId).map((r) => r.role);
    },
  };
}

function createPartyPhoneRepository(db) {
  return {
    add({ partyId, label = '', phone }) {
      const info = db.prepare('INSERT INTO party_phones (party_id, label, phone, created_at) VALUES (?, ?, ?, ?)')
        .run(partyId, label, phone, utcNowIso());
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM party_phones WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`phone ${id} not found`);
      return r;
    },
    ofParty(partyId) {
      return db.prepare('SELECT * FROM party_phones WHERE party_id = ? ORDER BY id').all(partyId);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM party_phones WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`phone ${id} not found`);
      return true;
    },
  };
}

function createPartyBalanceRepository(db) {
  return {
    // Supplier payable: posted (non-cancelled) receipt lines linked to the
    // party. Customer receivable: posted (non-cancelled) sales invoices
    // (P13); payments subtract from it in P16. No balance column anywhere.
    balanceOf(partyId) {
      const payable = db.prepare(
        `SELECT COALESCE(SUM(l.qty * l.unit_cost), 0) AS total
           FROM purchase_receipts r JOIN purchase_receipt_lines l ON l.receipt_id = r.id
          WHERE r.supplier_party_id = ? AND r.status = 'posted'`
      ).get(partyId).total;
      const receivable = db.prepare(
        `SELECT COALESCE(SUM(grand_total), 0) AS total FROM documents
          WHERE party_id = ? AND doc_type = 'sales_invoice' AND status IN ('posted', 'partially_paid', 'paid')`
      ).get(partyId).total;
      return { receivable, payable, net: receivable - payable };
    },
  };
}

module.exports = { createPartyRepository, createPartyRoleRepository, createPartyPhoneRepository, createPartyBalanceRepository };
