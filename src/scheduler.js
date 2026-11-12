'use strict';

const UNARMED_ROLES = ['th1_main', 'th2_main', 'th3_main'];
const ARMED_ROLES = ['sk1K_main', 'sk1F_main', 'sk2K_main', 'sk2F_main', 'sk3K_main', 'sk3F_main'];
const MAIN_COLS = UNARMED_ROLES.concat(ARMED_ROLES);

const TWO_DAY_REST_POSTS = ['ΟΔΗΓΟΣ', 'ΓΡΑΦΕΑΣ', 'ΜΑΓΕΙΡΑΣ', 'ΚΨΜ'];
const ARMED_CAPABILITY = 'Ι1';

const pad = (n) => String(n).padStart(2, '0');

function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) throw new RangeError(`Μη έγκυρη ημερομηνία: ${str}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (fmtYmd(dt) !== str) throw new RangeError(`Μη έγκυρη ημερομηνία: ${str}`);
  return dt;
}
const fmtYmd = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createScheduler(db, { shuffle = fisherYates } = {}) {

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

  function getAvailableStratiotes(imerominia) {

    const kolymaAsms = new Set(
      db.prepare('SELECT stratiotis_asm FROM kolymata WHERE imerominia = ?').all(imerominia).map((r) => r.stratiotis_asm)
    );

    const current = parseYmd(imerominia);
    const yesterday = fmtYmd(addDays(current, -1));
    const minus2 = fmtYmd(addDays(current, -2));
    const cols = MAIN_COLS.join(', ');

    const playedLast2Days = new Set();
    const lastRows = db.prepare(`SELECT ${cols} FROM ypiresies WHERE imerominia >= ? AND imerominia <= ?`).all(minus2, yesterday);
    for (const r of lastRows) for (const c of MAIN_COLS) if (r[c]) playedLast2Days.add(r[c]);

    const playedYesterday = new Set();
    const yRow = db.prepare(`SELECT ${cols} FROM ypiresies WHERE imerominia = ?`).get(yesterday);
    if (yRow) for (const c of MAIN_COLS) if (yRow[c] != null) playedYesterday.add(yRow[c]);

    const allSoldiers = db.prepare(
      'SELECT asm, onoma, eponymo, xreostoumena, mina_ypiresion, posto, ikanotita FROM stratiotes WHERE energos = 1'
    ).all();

    const pool = [];
    for (const s of allSoldiers) {
      if (s.posto === 'ΜΟΝΤΕΡ ΤΟΥ ΜΗΝΑ') continue;
      if (kolymaAsms.has(s.asm)) continue;
      if (TWO_DAY_REST_POSTS.includes(s.posto) && playedLast2Days.has(s.asm)) continue;
      if (s.posto === 'ΑΠΛΟΣ' && playedYesterday.has(s.asm)) continue;
      pool.push({ ...s });
    }
    return pool;
  }

  function calculateHistoricalCounts() {
    const history = new Map();
    const bump = (asm, key) => {
      if (!history.has(asm)) history.set(asm, { th: 0, sk: 0 });
      history.get(asm)[key]++;
    };
    for (const row of db.prepare(`SELECT ${MAIN_COLS.join(', ')} FROM ypiresies`).all()) {
      for (const c of UNARMED_ROLES) if (row[c]) bump(row[c], 'th');
      for (const c of ARMED_ROLES) if (row[c]) bump(row[c], 'sk');
    }
    return history;
  }

  function distributeDailyServices(imerominia) {
    const diathesimoi = getAvailableStratiotes(imerominia);
    if (diathesimoi.length === 0) return;

    const historicalCounts = calculateHistoricalCounts();
    const counts = (s) => historicalCounts.get(s.asm) || { th: 0, sk: 0 };

    transaction(() => {
      db.prepare('INSERT OR IGNORE INTO ypiresies (imerominia) VALUES (?)').run(imerominia);

      const anoplesServices = shuffle(UNARMED_ROLES.slice());
      const enoplesServices = shuffle(ARMED_ROLES.slice());

      const assign = (role, soldier, key) => {
        db.prepare(`UPDATE ypiresies SET ${role} = ? WHERE imerominia = ?`).run(soldier.asm, imerominia);
        db.prepare('UPDATE stratiotes SET mina_ypiresion = mina_ypiresion + 1 WHERE asm = ?').run(soldier.asm);
        if (!historicalCounts.has(soldier.asm)) historicalCounts.set(soldier.asm, { th: 0, sk: 0 });
        historicalCounts.get(soldier.asm)[key]++;
      };

      for (const role of enoplesServices) {
        diathesimoi.sort((a, b) => (counts(a).sk - counts(a).th) - (counts(b).sk - counts(b).th));
        const index = diathesimoi.findIndex((s) => s.ikanotita === ARMED_CAPABILITY);
        if (index !== -1) assign(role, diathesimoi.splice(index, 1)[0], 'sk');
      }

      for (const role of anoplesServices) {
        diathesimoi.sort((a, b) => (counts(a).th - counts(a).sk) - (counts(b).th - counts(b).sk));
        if (diathesimoi.length > 0) assign(role, diathesimoi.shift(), 'th');
      }
    });
  }

  function releaseServices(rows) {
    const dec = db.prepare('UPDATE stratiotes SET mina_ypiresion = MAX(0, mina_ypiresion - 1) WHERE asm = ?');
    for (const row of rows) for (const c of MAIN_COLS) if (row[c]) dec.run(row[c]);
  }

  function checkYearMonth(year, month) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError('Μη έγκυρο έτος ή μήνας');
    }
  }

  function generateMonthSchedule(year, month, startFromDay = 1) {
    checkYearMonth(year, month);
    const startDateStr = `${year}-${pad(month)}-${pad(startFromDay)}`;
    const startDatePattern = `${year}-${pad(month)}-%`;

    transaction(() => {
      const oldRows = db.prepare(
        `SELECT ${MAIN_COLS.join(', ')} FROM ypiresies WHERE imerominia >= ? AND imerominia LIKE ?`
      ).all(startDateStr, startDatePattern);

      if (oldRows.length > 0) {
        releaseServices(oldRows);
        if (startFromDay > 1) {
          db.prepare('DELETE FROM ypiresies WHERE imerominia >= ? AND imerominia LIKE ?').run(startDateStr, startDatePattern);
        } else {
          db.prepare('DELETE FROM ypiresies WHERE imerominia LIKE ?').run(startDatePattern);
        }
      }

      const numDays = daysInMonth(year, month);
      for (let day = startFromDay; day <= numDays; day++) {
        distributeDailyServices(`${year}-${pad(month)}-${pad(day)}`);
      }
    });
  }

  function deleteMonthSchedule(year, month) {
    checkYearMonth(year, month);
    const startDatePattern = `${year}-${pad(month)}-%`;
    return transaction(() => {
      const oldRows = db.prepare(
        `SELECT ${MAIN_COLS.join(', ')} FROM ypiresies WHERE imerominia LIKE ?`
      ).all(startDatePattern);
      if (oldRows.length === 0) return false;
      releaseServices(oldRows);
      db.prepare('DELETE FROM ypiresies WHERE imerominia LIKE ?').run(startDatePattern);
      return true;
    });
  }

  return {
    getAvailableStratiotes, calculateHistoricalCounts, distributeDailyServices,
    generateMonthSchedule, deleteMonthSchedule,
  };
}

module.exports = { createScheduler, UNARMED_ROLES, ARMED_ROLES, MAIN_COLS };
