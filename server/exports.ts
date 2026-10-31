import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import type { Cell, Investigation } from '../shared/contracts.js';
import { active, tableOf } from './engine.js';
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
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Data Detective';
  const used = new Set(['Findings', 'History']);
  for (const [index, table] of inv.tables.entries()) {
    let name =
      table.name
        .replace(/[\\/*?:[\]]/g, ' ')
        .slice(0, 27)
        .trim() || `Table ${index + 1}`;
    if (used.has(name)) name = `${name.slice(0, 25)} ${index + 1}`;
    used.add(name);
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(table.columns.map((column) => safeCell(column.name)));
    for (const row of active(table))
      sheet.addRow(table.columns.map((column) => safeCell(row.values[column.id] ?? null)));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 22;
    });
  }
  const findings = workbook.addWorksheet('Findings');
  findings.addRow(['Title', 'Description', 'Evidence', 'Saved at']);
  for (const finding of inv.findings)
    findings.addRow([
      safeCell(finding.title),
      safeCell(finding.description),
      safeCell(JSON.stringify(finding.evidence)),
      finding.createdAt,
    ]);
  const history = workbook.addWorksheet('History');
  history.addRow(['Action ID', 'Label', 'Revision', 'Kind', 'Undone', 'Changes']);
  for (const entry of inv.history)
    history.addRow([
      entry.id,
      safeCell(entry.label),
      entry.revision,
      entry.kind,
      entry.undone,
      safeCell(JSON.stringify(entry.changes)),
    ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
