'use strict';

const IKANOTITES = ['Ι1', 'Ι2', 'Ι3', 'Ι4'];
const POSTA = ['ΑΠΛΟΣ', 'ΟΔΗΓΟΣ', 'ΜΟΝΤΕΡ ΤΟΥ ΜΗΝΑ', 'ΓΡΑΦΕΑΣ', 'ΜΑΓΕΙΡΑΣ', 'ΚΨΜ'];
const MONADES = ['ΤΟΜΣ', 'ΓΥΣ', 'ΤΥΣ'];

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

function toast(type, message) {
  const t = h('div', { class: `toast ${type || 'info'}` }, message);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4000);
}

async function call(name, ...args) {
  const res = await window.api[name](...args);
  if (!res.ok) { toast('negative', `Σφάλμα: ${res.error}`); return null; }
  return res.data;
}

async function act(name, ...args) {
  const data = await call(name, ...args);
  if (!data) return null;
  if (data.notify) toast(data.notify.type, data.notify.message);
  return data;
}

function fillSelect(sel, options, value) {
  sel.replaceChildren(...options.map((o) => {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: val }, label);
  }));
  if (value !== undefined) sel.value = value;
}

function dataTable(columns, rows, { cls = '' } = {}) {
  let sortKey = null;
  let dir = 1;
  const table = h('table', { class: cls });
  function draw() {
    const data = [...rows];
    if (sortKey) {
      data.sort((a, b) => {
        const x = a[sortKey]; const y = b[sortKey];
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'el', { numeric: true })) * dir;
      });
    }
    const head = h('tr', {}, columns.map((c) => h('th', {
      class: c.sortable ? 'sortable' : '',
      onclick: c.sortable ? () => { dir = sortKey === c.key ? -dir : 1; sortKey = c.key; draw(); } : null,
    }, c.label + (sortKey === c.key ? (dir > 0 ? ' ▲' : ' ▼') : ''))));
    table.replaceChildren(h('thead', {}, head), h('tbody', {}, data.map((r) =>
      h('tr', {}, columns.map((c) => h('td', { class: c.cls || '' }, c.render ? c.render(r) : r[c.key]))))));
  }
  draw();
  return table;
}

document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${b.dataset.tab}`));
}));

let soldiers = [];

async function loadSoldiers() {
  soldiers = (await call('getSoldiers')) || [];
  renderSoldiers();
  const current = $('#leave-soldier').value;
  fillSelect($('#leave-soldier'), soldiers.map((s) => [s.asm, `${s.eponymo} ${s.onoma} (${s.asm})`]));
  if (soldiers.some((s) => s.asm === current)) $('#leave-soldier').value = current;
}

function renderSoldiers() {
  const box = $('#soldiers-table');
  if (!soldiers.length) { box.replaceChildren(h('p', { class: 'empty' }, 'Δεν υπάρχουν καταχωρημένοι στρατιώτες.')); return; }
  box.replaceChildren(dataTable([
    { key: 'asm', label: 'ΑΣΜ', sortable: true },
    { key: 'eponymo', label: 'Επώνυμο', sortable: true },
    { key: 'onoma', label: 'Όνομα', sortable: true },
    { key: 'ikanotita', label: 'Ικανότητα', sortable: true },
    { key: 'posto', label: 'Πόστο', sortable: true },
    { key: 'monada', label: 'Μονάδα', sortable: true },
    { key: 'xreostoumena', label: 'Χρεωστούμενα', sortable: true },
    { key: 'mina_ypiresion', label: 'Υπηρεσίες Μήνα', sortable: true },
    { key: 'actions', label: 'Ενέργειες', cls: 'actions', render: (s) => h('span', {},
      h('button', { class: 'btn small', onclick: () => openEdit(s) }, 'Επεξεργασία'), ' ',
      h('button', { class: 'btn small danger', onclick: () => removeSoldier(s) }, 'Διαγραφή')) },
  ], soldiers));
}

async function removeSoldier(s) {
  if (!confirm(`Διαγραφή του ${s.eponymo} ${s.onoma} (${s.asm}); Θα διαγραφούν και οι άδειές του.`)) return;
  await act('deleteSoldier', s.asm);
  await loadSoldiers();
  await loadLeaves();
  await showMonth();
}

const soldierForm = $('#soldier-form');
fillSelect(soldierForm.ikanotita, IKANOTITES, IKANOTITES[0]);
fillSelect(soldierForm.posto, POSTA, 'ΑΠΛΟΣ');
fillSelect(soldierForm.monada, MONADES, 'ΤΟΜΣ');

soldierForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = soldierForm;
  const res = await act('addSoldier', {
    asm: f.asm.value, eponymo: f.eponymo.value, onoma: f.onoma.value,
    ikanotita: f.ikanotita.value, posto: f.posto.value, monada: f.monada.value,
  });
  if (res && res.ok) {
    f.asm.value = ''; f.eponymo.value = ''; f.onoma.value = '';
    await loadSoldiers();
    f.asm.focus();
  }
});

const dlg = $('#edit-dialog');
const editForm = $('#edit-form');
fillSelect(editForm.ikanotita, IKANOTITES);
fillSelect(editForm.posto, POSTA);
fillSelect(editForm.monada, MONADES);

function openEdit(s) {
  editForm.asm.value = s.asm;
  editForm.eponymo.value = s.eponymo;
  editForm.onoma.value = s.onoma;
  editForm.ikanotita.value = s.ikanotita;
  editForm.posto.value = s.posto;
  editForm.monada.value = s.monada;
  dlg.showModal();
}
$('#edit-cancel').addEventListener('click', () => dlg.close());
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = editForm;
  const res = await act('updateSoldier', {
    asm: f.asm.value, eponymo: f.eponymo.value, onoma: f.onoma.value,
    ikanotita: f.ikanotita.value, posto: f.posto.value, monada: f.monada.value,
  });
  if (res && res.ok) { dlg.close(); await loadSoldiers(); await showMonth(); }
});

async function loadLeaves() {
  const leaves = (await call('getLeaves')) || [];
  const box = $('#leaves-table');
  if (!leaves.length) { box.replaceChildren(h('p', { class: 'empty' }, 'Δεν υπάρχουν καταχωρημένες άδειες/κωλύματα.')); return; }
  box.replaceChildren(dataTable([
    { key: 'soldier', label: 'Στρατιώτης', sortable: true },
    { key: 'date', label: 'Ημερομηνία', sortable: true },
    { key: 'type', label: 'Τύπος', sortable: true },
    { key: 'actions', label: 'Ενέργειες', render: (l) =>
      h('button', { class: 'btn small danger', onclick: () => removeLeave(l) }, 'Διαγραφή') },
  ], leaves, { cls: 'narrow' }));
}

async function removeLeave(l) {
  if (!confirm(`Διαγραφή ${l.type} της ${l.date} για ${l.soldier};`)) return;
  await act('deleteLeave', l.id);
  await loadLeaves();
  await loadSoldiers();
  await showMonth();
}

$('#leave-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const res = await act('addLeave', { asm: f.asm.value, start: f.start.value, end: f.end.value, type: f.type.value });
  if (res && res.ok) {
    f.start.value = ''; f.end.value = '';
    await loadLeaves();
    await loadSoldiers();
    await showMonth();
  }
});

const yearEl = $('#sch-year');
const monthEl = $('#sch-month');
const dayEl = $('#sch-day');
const historyEl = $('#history');

async function loadHistory(selected) {
  const data = await call('getSavedMonths');
  if (!data) return;
  fillSelect(historyEl, data.months);
  historyEl.value = data.months.includes(selected) ? selected : data.current;
  return historyEl.value;
}

function setYearMonth(key) {
  const [y, m] = key.split('-');
  yearEl.value = y;
  monthEl.value = String(Number(m));
}

async function showMonth() {
  const data = await call('getMonthView', yearEl.value, monthEl.value);
  if (!data) return;
  if (!data.ok) { toast(data.notify.type, data.notify.message); return; }
  renderMonth(data.view);
}

function cellClass(v) {
  if (v === '-') return 'dash';
  if (v === 'ΑΔΕΙΑ') return 'leave';
  if (v === 'ΕΛΕΥΘΕΡΟΣ' || v === 'ΜΟΝΤΕΡ') return 'free';
  return 'svc';
}

function renderMonth(v) {
  const box = $('#schedule-view');
  if (v.empty === 'no_soldiers') { box.replaceChildren(h('p', { class: 'empty' }, 'Προσθέστε πρώτα στρατιώτες για να εμφανιστεί το πλάνο.')); return; }
  if (v.empty === 'no_schedule') { box.replaceChildren(h('p', { class: 'empty' }, `Δεν υπάρχει εκδομένο πρόγραμμα για τον μήνα ${v.monthLabel}.`)); return; }

  const grid = h('table', { class: 'grid' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Στρατιώτης'), v.days.map((d) => h('th', { class: d.weekend ? 'weekend' : '' }, d.label)))),
    h('tbody', {}, v.grid.map((r) => h('tr', {}, h('td', { class: 'name' }, r.soldier),
      r.cells.map((c, i) => h('td', { class: `${cellClass(c)} ${v.days[i].weekend ? 'weekend' : ''}` }, c))))));

  const summary = v.leavesSummary.length
    ? dataTable([
      { key: 'soldier', label: 'Στρατιώτης' }, { key: 'type', label: 'Τύπος' },
      { key: 'from', label: 'Από' }, { key: 'to', label: 'Έως' },
    ], v.leavesSummary, { cls: 'narrow' })
    : h('p', { class: 'empty' }, "Δεν υπάρχουν καταχωρημένες άδειες/κωλύματα γι' αυτόν τον μήνα.");

  const stats = dataTable([
    { key: 'asm', label: 'ΑΣΜ', sortable: true },
    { key: 'eponymo', label: 'Επώνυμο', sortable: true },
    { key: 'onoma', label: 'Όνομα', sortable: true },
    { key: 'monada', label: 'Μονάδα', sortable: true },
    { key: 'posto', label: 'Πόστο', sortable: true },
    { key: 'th', label: 'Θ', sortable: true },
    { key: 'sk', label: 'ΣΚ', sortable: true },
    { key: 'total', label: 'Σύνολο', sortable: true },
  ], v.stats, { cls: 'narrow' });

  box.replaceChildren(
    h('h2', {}, `Μηνιαίο Grid Υπηρεσιών (${v.monthLabel})`),
    h('div', { class: 'scroll' }, grid),
    h('h3', {}, `Συγκεντρωτικό Ημερολόγιο Αδειών Μήνα (${v.monthLabel})`),
    summary,
    h('h3', { class: 'no-print green' }, `Συγκεντρωτικό Σύνολο Υπηρεσιών Μήνα (${v.monthLabel})`),
    h('div', { class: 'no-print' }, stats),
  );
}

$('#btn-view').addEventListener('click', showMonth);
$('#btn-print').addEventListener('click', () => window.print());

$('#btn-generate').addEventListener('click', async () => {
  const res = await act('generateSchedule', { year: yearEl.value, month: monthEl.value, day: dayEl.value });
  if (res && res.ok) {
    await loadHistory(res.month);
    await loadSoldiers();
    setYearMonth(res.month);
    await showMonth();
  }
});

$('#btn-delete').addEventListener('click', async () => {
  if (!confirm(`Διαγραφή του προγράμματος ${monthEl.value}/${yearEl.value};`)) return;
  const res = await act('deleteSchedule', { year: yearEl.value, month: monthEl.value });
  if (res && res.ok) {
    await loadHistory(res.month);
    await loadSoldiers();
    setYearMonth(res.month);
    await showMonth();
  }
});

historyEl.addEventListener('change', async () => {
  setYearMonth(historyEl.value);
  await showMonth();
});

(async function init() {
  await loadSoldiers();
  await loadLeaves();
  const cur = await loadHistory();
  if (cur) setYearMonth(cur);
  await showMonth();
})();
