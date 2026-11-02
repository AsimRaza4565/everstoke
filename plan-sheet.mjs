// Generates PLAN.xlsx from PLAN.md (the append-only source of truth).
// Run after every PLAN.md update: node plan-sheet.mjs
// Never hand-edit PLAN.xlsx — it gets overwritten.
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const md = fs.readFileSync('PLAN.md', 'utf8');

const STATUS_BY_SECTION = {
  '✅ DONE': 'DONE',
  '🔄 IN PROGRESS': 'IN PROGRESS',
  '📌 TODO': 'TODO',
  '🔒 BLOCKED': 'BLOCKED',
  '💡 IDEAS': 'IDEA',
};

const rows = [];
let status = '';
let doneSeq = 0;
for (const line of md.split('\n')) {
  const sec = Object.keys(STATUS_BY_SECTION).find((k) => line.includes(`## ${k}`));
  if (sec) { status = STATUS_BY_SECTION[sec]; continue; }
  if (line.startsWith('## ') || line.startsWith('# ')) { status = status; continue; }
  const m = /^- \[(x| |~|!)\] (.*)$/.exec(line.trim());
  if (!m) continue;
  let text = m[2];
  let doneDate = '';
  if (status === 'DONE') {
    doneSeq++;
    const dm = /^(20\d\d-\d\d-\d\d) — (.*)$/.exec(text);
    if (dm) { doneDate = dm[1]; text = dm[2]; }
  }
  // split a trailing "— estimate" when present
  let est = '';
  const em = /\s+—\s+(~?\d+\s*(?:min|minutes|day|days|hour)|~half day|5 min|10 min|15 min|30 min)$/.exec(text);
  if (em) { est = em[1]; text = text.slice(0, em.index); }
  rows.push({ status, id: status === 'DONE' ? 'D' + String(doneSeq).padStart(2, '0') : '', text, est, doneDate });
}

const STYLE = {
  DONE: { fill: 'FFE8F5E9', font: 'FF1B5E20' },
  'IN PROGRESS': { fill: 'FFFFF8E1', font: 'FF8D6E00' },
  TODO: { fill: 'FFFFFFFF', font: 'FF1A1A2E' },
  BLOCKED: { fill: 'FFFDECEA', font: 'FFB71C1C' },
  IDEA: { fill: 'FFF3E5F5', font: 'FF6A1B9A' },
};

const wb = new ExcelJS.Workbook();
wb.creator = 'Quarry Studio';
const ws = wb.addWorksheet('MASTER PLAN');
ws.columns = [
  { header: 'Status', key: 'status', width: 14 },
  { header: 'ID', key: 'id', width: 8 },
  { header: 'Task / Goal', key: 'text', width: 95 },
  { header: 'Estimate', key: 'est', width: 12 },
  { header: 'Done date', key: 'doneDate', width: 12 },
];
const head = ws.getRow(1);
head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
head.height = 24;

for (const r of rows) {
  const row = ws.addRow({ status: r.status, id: r.id, text: r.text, est: r.est, doneDate: r.doneDate });
  const st = STYLE[r.status] || STYLE.TODO;
  row.font = { color: { argb: st.font }, strike: r.status === 'DONE' };
  row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } }; });
}
ws.views = [{ state: 'frozen', ySplit: 1 }];
ws.autoFilter = { from: 'A1', to: 'E1' };

await wb.xlsx.writeFile('PLAN.xlsx');
console.log(`PLAN.xlsx written: ${rows.length} rows`);
