'use strict';
// Phase 11 gate: canonical parties, dual roles, event-derived balances,
// centralized credit with audited override, receipt linkage.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('parties', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('creates customers, suppliers and dual-role parties with auto codes', () => {
    const c = t.app.commands.createParty({ displayName: 'بقالة النور', roles: ['customer'], phone: '+213 500 00 00' });
    assert.ok(/^CUST-\d{8}-\d{4}$/.test(c.code));
    assert.deepEqual(c.roles, ['customer']);
    assert.deepEqual(c.balance, { receivable: 0, payable: 0, net: 0 });
    const s = t.app.commands.createParty({ code: 'sup-7', displayName: 'Grossiste', roles: ['supplier'] });
    assert.equal(s.code, 'SUP-7');
    const both = t.app.commands.createParty({ displayName: 'Both', roles: ['customer', 'supplier'] });
    assert.deepEqual(both.roles, ['customer', 'supplier']);
    assert.throws(() => t.app.commands.createParty({ displayName: 'Dup', code: 'SUP-7', roles: ['supplier'] }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createParty({ displayName: '' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createParty({ displayName: 'X', roles: [] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createParty({ displayName: 'X', roles: ['vip'] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createParty({ displayName: 'X', creditLimit: -5 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createParty({ displayName: 'X', email: 'not-an-email' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createParty({ displayName: 'X' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('edits profiles with code immutable and history staying linked', () => {
    const s = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
    const p = t.app.commands.createProduct({ sku: 'G-1', name: 'G' });
    const r = t.app.commands.receiveStock({ supplierPartyCode: s.code, lines: [{ productId: p.id, qty: 4, unitCost: 25 }] });
    assert.equal(r.supplier_party_id, s.id);
    assert.equal(r.supplier_name, 'Grossiste');
    const updated = t.app.commands.updateParty(s.id, { displayName: 'Grossiste Plus', phone: '+213 1', creditLimit: 5000 });
    assert.equal(updated.displayName, 'Grossiste Plus');
    assert.equal(t.app.queries.getReceipt(r.id).supplier_party_id, s.id); // history intact
    assert.throws(() => t.app.commands.updateParty(s.id, { code: 'NEW' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.updateParty(s.id, {}), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.updateParty(99999, { displayName: 'x' }), (e) => e.code === 'NOT_FOUND');
    const withRoles = t.app.commands.setPartyRoles(s.id, ['supplier', 'customer']);
    assert.deepEqual(withRoles.roles, ['customer', 'supplier']);
    assert.throws(() => t.app.commands.setPartyRoles(s.id, ['vip']), (e) => e.code === 'VALIDATION');
  });

  it('derives the supplier payable from posted receipts, never a stored field', () => {
    const s = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
    const p = t.app.commands.createProduct({ sku: 'G-1', name: 'G' });
    t.app.commands.receiveStock({ supplierPartyCode: s.code, lines: [{ productId: p.id, qty: 4, unitCost: 25 }] });
    t.app.commands.receiveStock({ supplierPartyId: s.id, lines: [{ productId: p.id, qty: 2, unitCost: 30 }] });
    const balance = t.app.queries.getParty(s.id).balance;
    assert.deepEqual(balance, { receivable: 0, payable: 160, net: -160 });
    const cols = t.app.db.prepare('PRAGMA table_info(parties)').all().map((c) => c.name);
    assert.ok(!cols.includes('balance'), 'no balance column may exist');
    // cancelled receipts leave the payable
    const r = t.app.commands.receiveStock({ supplierPartyCode: s.code, lines: [{ productId: p.id, qty: 10, unitCost: 100 }] });
    t.app.commands.cancelReceipt(r.id, 'void');
    assert.equal(t.app.queries.getParty(s.id).balance.payable, 160);
  });

  it('rejects non-supplier and unknown receipt linkage', () => {
    const c = t.app.commands.createParty({ displayName: 'Client', roles: ['customer'] });
    const p = t.app.commands.createProduct({ sku: 'G-1', name: 'G' });
    assert.throws(() => t.app.commands.receiveStock({ supplierPartyCode: c.code, lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.receiveStock({ supplierPartyCode: 'NOPE', lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'NOT_FOUND');
  });

  it('enforces credit centrally with audited override', () => {
    const c = t.app.commands.createParty({ displayName: 'Client', roles: ['customer'] });
    const open = t.app.queries.checkCredit({ partyId: c.id, additionalAmount: 999999 });
    assert.equal(open.allowed, true); // unlimited by default
    t.app.commands.updateParty(c.id, { creditLimit: 500 });
    const ok = t.app.queries.checkCredit({ partyId: c.id, additionalAmount: 500 });
    assert.equal(ok.allowed, true);
    const blocked = t.app.queries.checkCredit({ partyId: c.id, additionalAmount: 501 });
    assert.equal(blocked.allowed, false);
    const partiesApp = require('../src/application/parties');
    assert.throws(() => partiesApp.assertCredit(t.app.db, { partyId: c.id, additionalAmount: 501 }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => partiesApp.assertCredit(t.app.db, { partyId: c.id, additionalAmount: 501, override: { reason: 'manager ok' }, auth: { actor: 'm', grants: [] } }), (e) => e.code === 'FORBIDDEN');
    const over = partiesApp.assertCredit(t.app.db, { partyId: c.id, additionalAmount: 501, override: { reason: 'manager ok' }, auth: { actor: 'boss', grants: ['credit.override'] } });
    assert.equal(over.overridden, true);
    const audit = t.app.queries.recentAudit({ limit: 3 });
    assert.equal(audit[0].operation, 'credit.override');
    assert.equal(audit[0].reason, 'manager ok');
  });

  it('manages phones and blocks deletion of linked parties', () => {
    const s = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
    const ph = t.app.commands.addPartyPhone(s.id, { label: 'shop', phone: '+213 600' });
    assert.equal(t.app.queries.getParty(s.id).phones.length, 1);
    assert.throws(() => t.app.commands.addPartyPhone(s.id, { phone: '' }), (e) => e.code === 'VALIDATION');
    assert.equal(t.app.commands.removePartyPhone(ph.id), true);
    assert.throws(() => t.app.commands.removePartyPhone(ph.id), (e) => e.code === 'NOT_FOUND');
    const p = t.app.commands.createProduct({ sku: 'G-1', name: 'G' });
    t.app.commands.receiveStock({ supplierPartyId: s.id, lines: [{ productId: p.id, qty: 1 }] });
    assert.throws(() => t.app.commands.deleteParty(s.id), (e) => e.code === 'CONFLICT');
    assert.equal(t.app.commands.setPartyActive(s.id, false).isActive, false);
    const free = t.app.commands.createParty({ displayName: 'Free', roles: ['customer'] });
    assert.equal(t.app.commands.deleteParty(free.id), true);
    assert.throws(() => t.app.commands.deleteParty(free.id), (e) => e.code === 'NOT_FOUND');
  });

  it('searches and filters the party list', () => {
    t.app.commands.createParty({ displayName: 'Alpha Shop', roles: ['customer'] });
    t.app.commands.createParty({ displayName: 'Beta Supply', roles: ['supplier'] });
    assert.equal(t.app.queries.listParties({ search: 'Alpha' }).length, 1);
    assert.equal(t.app.queries.listParties({ role: 'supplier' }).length, 1);
    assert.equal(t.app.queries.listParties({}).length, 2);
  });
});
