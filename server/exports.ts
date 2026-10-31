import { stringify } from 'csv-stringify/sync';
import type { Cell, Investigation } from '../shared/contracts.js';
import { active, tableOf } from './engine.js';

function sheetName(input: string, used: Set<string>): string {
  const base =
    input
      .replace(/[\\/*?:[\]]/g, ' ')
      .replace(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31) || 'Table';
  let result = base;
  for (let suffix = 2; used.has(result.toLowerCase()); suffix++) {
    const ending = ` (${suffix})`;
    result = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  used.add(result.toLowerCase());
  return result;
}

function cellTextParts(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + 30_000, value.length);
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
    parts.push(value.slice(start, end));
    start = end;
  }
  return parts.length ? parts : [''];
}
export function safeCell(value: Cell): Cell {
  return typeof value === 'string' &&
    /^[\s]*[=+@-]/u.test(value.replaceAll(String.fromCharCode(0), ''))
    ? `'${value}`
    : value;
}
export function exportCsv(inv: Investigation, tableId: string): string {
  const table = tableOf(inv, tableId);
  return stringify(
    [
      table.columns.map((column) => safeCell(column.name)),
      ...active(table).map((row) =>
        table.columns.map((column) => safeCell(row.values[column.id] ?? null)),
      ),
    ],
    { bom: true },
  );
}
export async function exportXlsx(inv: Investigation): Promise<Buffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Data Detective';
  // History is reserved by Excel; names are also unique without regard to case.
  const used = new Set(['findings', 'history', 'change log']);
  for (const table of inv.tables) {
    const sheet = workbook.addWorksheet(sheetName(table.name, used));
    sheet.addRow(table.columns.map((column) => safeCell(column.name)));
    for (const row of active(table))
      sheet.addRow(table.columns.map((column) => safeCell(row.values[column.id] ?? null)));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 22;
    });
  }
  const findings = workbook.addWorksheet('Findings');
  findings.addRow(['Title', 'Description', 'Part', 'Evidence JSON', 'Saved at']);
  for (const finding of inv.findings) {
    const parts = cellTextParts(JSON.stringify(finding.evidence));
    for (const [index, part] of parts.entries())
      findings.addRow([
        safeCell(finding.title),
        safeCell(finding.description),
        `${index + 1}/${parts.length}`,
        safeCell(part),
        finding.createdAt,
      ]);
  }
  const history = workbook.addWorksheet('Change log');
  history.addRow(['Action ID', 'Label', 'Revision', 'Kind', 'Undone', 'Part', 'Changes JSON']);
  for (const entry of inv.history) {
    const parts = cellTextParts(JSON.stringify(entry.changes));
    for (const [index, part] of parts.entries())
      history.addRow([
        safeCell(entry.id),
        safeCell(entry.label),
        entry.revision,
        entry.kind,
        entry.undone,
        `${index + 1}/${parts.length}`,
        safeCell(part),
      ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
