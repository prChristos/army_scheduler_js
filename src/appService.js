'use strict';

const { createDbManager } = require('./dbManager');
const { createScheduler } = require('./scheduler');
const { buildMonthView } = require('./monthView');

const pad = (n) => String(n).padStart(2, '0');
const note = (type, message) => ({ type, message });
const fail = (type, message) => ({ ok: false, notify: note(type, message) });
const done = (type, message, extra = {}) => ({ ok: true, notify: note(type, message), ...extra });

function toInt(value) {
  const s = String(value ?? '').trim();
  return /^[+-]?\d+$/.test(s) ? Number(s) : null;
}

function parseLeaveDate(text) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(text).trim().replace(/\//g, '-'));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
const fmtYmd = (dt) => dt.toISOString().slice(0, 10);

function createAppService(db, { shuffle, now = () => new Date() } = {}) {
  const dbm = createDbManager(db);
  const scheduler = createScheduler(db, { shuffle });
  dbm.initDb();

  let depth = 0;
  function transaction(fn) {
    if (depth > 0) return fn();
    depth++;
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {  }
      throw err;
    } finally {
      depth--;
    }
  }

  const currentMonthKey = () => {
    const d = now();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  function getSoldiers() {
    return dbm.getAllStratiotes();
  }

  function addSoldier({ asm, onoma, eponymo, monada, posto, ikanotita }) {
    asm = String(asm ?? '').trim();
    onoma = String(onoma ?? '').trim().toUpperCase();
    eponymo = String(eponymo ?? '').trim().toUpperCase();
    if (!(asm && onoma && eponymo && monada && posto && ikanotita)) {
      return fail('warning', 'Συμπλήρωσε όλα τα πεδία!');
    }
    try {
      transaction(() => {
        dbm.addStratiotis(asm, onoma, eponymo, monada, ikanotita);
        if (posto !== 'ΑΠΛΟΣ') dbm.updateStratiotis(asm, onoma, eponymo, monada, posto, ikanotita);
      });
    } catch (err) {
      if (/constraint/i.test(`${err.code || ''} ${err.message}`)) return fail('negative', 'Το ΑΣΜ αυτό υπάρχει ήδη!');
      throw err;
    }
    return done('positive', `Ο ${ikanotita} ${eponymo} ${onoma} προστέθηκε!`);
  }

  function updateSoldier({ asm, onoma, eponymo, monada, posto, ikanotita }) {
    onoma = String(onoma ?? '').trim().toUpperCase();
    eponymo = String(eponymo ?? '').trim().toUpperCase();
    if (!(onoma && eponymo)) return fail('warning', 'Συμπλήρωσε Όνομα και Επώνυμο!');
    dbm.updateStratiotis(asm, onoma, eponymo, monada, posto, ikanotita);
    return done('positive', 'Τα στοιχεία ενημερώθηκαν επιτυχώς!');
  }

  function deleteSoldier(asm) {
    dbm.deleteStratiotis(asm);
    return done('warning', `Ο στρατιώτης με ΑΣΜ ${asm} αφαιρέθηκε!`);
  }

  function getLeaves() {
    return db.prepare(`
      SELECT k.id, k.stratiotis_asm, s.eponymo, s.onoma, k.imerominia, k.typos
      FROM kolymata k
      JOIN stratiotes s ON k.stratiotis_asm = s.asm
      ORDER BY k.imerominia DESC
    `).all().map((r) => ({
      id: r.id,
      asm: r.stratiotis_asm,
      soldier: `${r.eponymo} ${r.onoma} (${r.stratiotis_asm})`,
      date: r.imerominia,
      type: r.typos,
    }));
  }

  function addLeave({ asm, start, end, type }) {
    if (!asm || !start || !end) return fail('warning', 'Συμπλήρωσε όλα τα πεδία!');
    const startDt = parseLeaveDate(start);
    const endDt = parseLeaveDate(end);
    if (!startDt || !endDt) return fail('negative', 'Σφάλμα: μη έγκυρη ημερομηνία (YYYY-MM-DD)');
    if (startDt > endDt) return fail('negative', 'Λάθος ημερομηνίες!');

    let days = 0;
    let debts = 0;
    try {
      transaction(() => {
        for (let d = startDt; d <= endDt; d = new Date(d.getTime() + 86400000)) {
          dbm.addAdeia(asm, fmtYmd(d), type);
          days++;
        }
        if (type === 'ΑΔΕΙΑ') {

          debts = Math.max(1, Math.floor((days + 2) / 3));
          db.prepare('UPDATE stratiotes SET xreostoumena = xreostoumena + ? WHERE asm = ?').run(debts, asm);
        }
      });
    } catch (err) {
      return fail('negative', `Σφάλμα: ${err.message}`);
    }
    return type === 'ΑΔΕΙΑ'
      ? done('positive', `Καταχωρήθηκε η άδεια (${days} μέρες) και προστέθηκαν +${debts} Χρεωστούμενες Υπηρεσίες!`)
      : done('positive', `Καταχωρήθηκε το κώλυμα (${days} μέρες).`);
  }

  function deleteLeave(id) {
    transaction(() => {
      const row = db.prepare('SELECT stratiotis_asm, typos FROM kolymata WHERE id = ?').get(id);
      if (!row) return;
      db.prepare('DELETE FROM kolymata WHERE id = ?').run(id);
      if (row.typos === 'ΑΔΕΙΑ') {
        db.prepare('UPDATE stratiotes SET xreostoumena = MAX(0, xreostoumena - 1) WHERE asm = ?').run(row.stratiotis_asm);
      }
    });
    return done('warning', 'Η άδεια αφαιρέθηκε και τα χρεωστούμενα ενημερώθηκαν!');
  }

  function getSavedMonths() {
    const months = db.prepare('SELECT DISTINCT SUBSTR(imerominia, 1, 7) AS m FROM ypiresies ORDER BY imerominia DESC')
      .all().map((r) => r.m);
    const current = currentMonthKey();
    if (!months.includes(current)) months.unshift(current);
    return { months, current };
  }

  function getMonthView(year, month) {
    const y = toInt(year);
    const m = toInt(month);
    if (y === null || m === null || m < 1 || m > 12) return fail('negative', 'Δώσε έγκυρο Έτος και Μήνα!');
    const pattern = `${y}-${pad(m)}-%`;
    const rows = db.prepare('SELECT * FROM ypiresies WHERE imerominia LIKE ? ORDER BY imerominia ASC').all(pattern);
    const leaves = db.prepare('SELECT stratiotis_asm, imerominia, typos FROM kolymata WHERE imerominia LIKE ?').all(pattern);
    const view = buildMonthView(
      getSoldiers(), rows.map((r) => ({ ...r })), leaves.map((r) => ({ ...r })), y, m
    );
    return { ok: true, view };
  }

  function generateSchedule({ year, month, day }) {
    const y = toInt(year);
    const m = toInt(month);
    const d = toInt(day);
    if (y === null || m === null || d === null || d < 1) return fail('negative', 'Έγκυρα δεδομένα παρακαλώ!');
    try {
      scheduler.generateMonthSchedule(y, m, d);
    } catch (err) {
      if (err instanceof RangeError) return fail('negative', 'Έγκυρα δεδομένα παρακαλώ!');
      throw err;
    }
    return done('positive', 'Το πρόγραμμα ενημερώθηκε!', { month: `${y}-${pad(m)}` });
  }

  function deleteSchedule({ year, month }) {
    const y = toInt(year);
    const m = toInt(month);
    if (y === null || m === null) return fail('negative', 'Δώσε έγκυρο Έτος και Μήνα!');
    let deleted;
    try {
      deleted = scheduler.deleteMonthSchedule(y, m);
    } catch (err) {
      if (err instanceof RangeError) return fail('negative', 'Δώσε έγκυρο Έτος και Μήνα!');
      throw err;
    }
    const extra = { month: currentMonthKey() };
    return deleted
      ? done('warning', `Το πρόγραμμα του μήνα ${pad(m)}/${y} διαγράφηκε!`, extra)
      : done('info', 'Δεν βρέθηκε πρόγραμμα.', extra);
  }

  return {
    getSoldiers, addSoldier, updateSoldier, deleteSoldier,
    getLeaves, addLeave, deleteLeave,
    getSavedMonths, getMonthView, generateSchedule, deleteSchedule,
  };
}

const API_METHODS = [
  'getSoldiers', 'addSoldier', 'updateSoldier', 'deleteSoldier',
  'getLeaves', 'addLeave', 'deleteLeave',
  'getSavedMonths', 'getMonthView', 'generateSchedule', 'deleteSchedule',
];

module.exports = { createAppService, API_METHODS };
