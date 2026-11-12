'use strict';

const POSITIONS = [
  ['th1_main', 'Θ1'], ['th1_backup', 'Θ1-Επ'],
  ['th2_main', 'Θ2'], ['th2_backup', 'Θ2-Επ'],
  ['th3_main', 'Θ3'], ['th3_backup', 'Θ3-Επ'],
  ['sk1K_main', 'ΣΚ1'], ['sk1K_backup', 'ΣΚ1-Επ'],
  ['sk1F_main', 'ΣΚ1Φ'], ['sk1F_backup', 'ΣΚ1Φ-Επ'],
  ['sk2K_main', 'ΣΚ2'], ['sk2K_backup', 'ΣΚ2-Επ'],
  ['sk2F_main', 'ΣΚ2Φ'], ['sk2F_backup', 'ΣΚ2Φ-Επ'],
  ['sk3K_main', 'ΣΚ3'], ['sk3K_backup', 'ΣΚ3-Επ'],
  ['sk3F_main', 'ΣΚ3Φ'], ['sk3F_backup', 'ΣΚ3Φ-Επ'],
];

const DAY_NAMES = ['Δ', 'Τρ', 'Τε', 'Π', 'Πα', 'Σ', 'Κ'];
const pad = (n) => String(n).padStart(2, '0');

function buildMonthView(soldiers, scheduleRows, leaveRows, year, month) {
  const view = {
    year, month, monthLabel: `${pad(month)}/${year}`,
    empty: null, days: [], grid: [], leavesSummary: [], stats: [],
  };

  if (soldiers.length === 0) { view.empty = 'no_soldiers'; return view; }
  if (scheduleRows.length === 0) { view.empty = 'no_schedule'; return view; }

  const leavesMap = {};
  for (const { stratiotis_asm: asm, imerominia, typos } of leaveRows) {
    (leavesMap[imerominia] = leavesMap[imerominia] || {})[asm] = typos;
  }

  const scheduleMatrix = {};
  const monthlyCounts = {};
  for (const s of soldiers) monthlyCounts[s.asm] = { total: 0, th: 0, sk: 0 };

  for (const row of scheduleRows) {
    const cell = (scheduleMatrix[row.imerominia] = {});
    for (const [col, label] of POSITIONS) {
      const asm = row[col];
      if (!asm) continue;
      cell[asm] = cell[asm] ? `${cell[asm]}, ${label}` : label;
      if (monthlyCounts[asm]) {
        monthlyCounts[asm].total++;
        if (label.startsWith('Θ')) monthlyCounts[asm].th++;
        else monthlyCounts[asm].sk++;
      }
    }
  }

  const numDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateOf = (day) => `${year}-${pad(month)}-${pad(day)}`;

  for (let day = 1; day <= numDays; day++) {
    const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
    view.days.push({ day, label: `${pad(day)} (${DAY_NAMES[weekday]})`, weekend: weekday >= 5 });
  }

  for (const s of soldiers) {
    const cells = [];
    for (let day = 1; day <= numDays; day++) {
      const date = dateOf(day);
      if (leavesMap[date] && leavesMap[date][s.asm]) cells.push(leavesMap[date][s.asm]);
      else if (scheduleMatrix[date] && scheduleMatrix[date][s.asm]) cells.push(scheduleMatrix[date][s.asm]);
      else if (s.posto === 'ΜΟΝΤΕΡ ΤΟΥ ΜΗΝΑ' && scheduleMatrix[date]) cells.push('ΜΟΝΤΕΡ');
      else cells.push('-');
    }
    view.grid.push({ asm: s.asm, soldier: `${s.eponymo} ${(s.onoma || '').charAt(0)}. (${s.asm})`, cells });
  }

  for (const s of soldiers) {
    const fullname = `${s.eponymo} ${s.onoma} (${s.asm})`;
    let start = null;
    let last = null;
    let type = null;
    const close = () => view.leavesSummary.push({ soldier: fullname, type, from: start, to: last });
    for (let day = 1; day <= numDays; day++) {
      const date = dateOf(day);
      const t = leavesMap[date] && leavesMap[date][s.asm];
      if (t) {
        if (start === null) { start = date; type = t; }
        else if (t !== type) { close(); start = date; type = t; }
        last = date;
      } else if (start !== null) {
        close(); start = null; last = null; type = null;
      }
    }
    if (start !== null) close();
  }

  for (const s of soldiers) {
    const c = monthlyCounts[s.asm];
    view.stats.push({
      asm: s.asm, eponymo: s.eponymo, onoma: s.onoma, monada: s.monada, posto: s.posto,
      th: c.th, sk: c.sk, total: c.total,
    });
  }
  return view;
}

module.exports = { buildMonthView, POSITIONS };
