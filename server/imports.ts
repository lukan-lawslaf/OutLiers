import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import type ExcelJS from 'exceljs';
import { LIMITS, type Cell, type Column, type DataTable } from '../shared/contracts.js';
import { insist, AppError } from './errors.js';

export interface Upload {
  originalname: string;
  buffer: Buffer;
  size?: number;
}
export function makeTable(name: string, matrix: Cell[][], selected = true): DataTable {
  insist(
    matrix.length >= 2,
    400,
    'EMPTY_TABLE',
    `${name} needs a header and at least one data row.`,
  );
  const width = Math.max(...matrix.map((row) => row.length));
  insist(
    width > 0 && (!selected || width <= LIMITS.maxColumns),
    400,
    'COLUMN_LIMIT',
    `Selected tables may contain at most ${LIMITS.maxColumns} columns.`,
  );
  insist(
    !selected || matrix.length - 1 <= LIMITS.maxRows,
    400,
    'ROW_LIMIT',
    `Selected tables may contain at most ${LIMITS.maxRows} data rows.`,
  );
  const tableId = `table_${randomUUID()}`;
  const columns: Column[] = Array.from({ length: width }, (_, index) => {
    const types = new Set(
      matrix
        .slice(1)
        .map((row) => row[index])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => typeof value),
    );
    const kind =
      types.size > 1
        ? 'mixed'
        : types.has('number')
          ? 'number'
          : types.has('boolean')
            ? 'boolean'
            : 'text';
    return {
      id: `col_${index}`,
      name: String(matrix[0]?.[index] ?? '').trim() || `Column ${index + 1}`,
      kind,
    };
  });
  const rows = matrix.slice(1).map((row, index) => {
    const values: Record<string, Cell> = {};
    for (const [columnIndex, column] of columns.entries()) {
      const value = row[columnIndex] ?? null;
      insist(
        typeof value !== 'string' || value.length <= LIMITS.maxCellLength,
        400,
        'CELL_LIMIT',
        `Cell text must be at most ${LIMITS.maxCellLength} characters.`,
      );
      values[column.id] = value;
    }
    return { id: `row_${index + 1}`, original: structuredClone(values), values, excluded: false };
  });
  return { id: tableId, name: name.slice(0, 120), columns, rows };
}

// Check ZIP central-directory sizes before ExcelJS inflates an XLSX workbook.
function validateZip(buffer: Buffer): void {
  let footer = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--)
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      footer = offset;
      break;
    }
  insist(footer >= 0, 400, 'INVALID_XLSX', 'This file is not a supported XLSX workbook.');
  const entries = buffer.readUInt16LE(footer + 10);
  let offset = buffer.readUInt32LE(footer + 16);
  let total = 0;
  insist(
    entries > 0 && entries <= 2000 && offset < footer,
    413,
    'WORKBOOK_LIMIT',
    'The workbook archive is too large or unsupported.',
  );
  for (let entry = 0; entry < entries; entry++) {
    insist(
      offset + 46 <= footer && buffer.readUInt32LE(offset) === 0x02014b50,
      400,
      'INVALID_XLSX',
      'Invalid workbook archive directory.',
    );
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const local = buffer.readUInt32LE(offset + 42);
    insist(
      !(flags & 1) &&
        (method === 0 || method === 8) &&
        uncompressed !== 0xffffffff &&
        total + uncompressed <= 16 * 1024 * 1024,
      413,
      'WORKBOOK_LIMIT',
      'Encrypted, oversized or unsupported workbook archive.',
    );
    insist(
      local + 30 <= offset && buffer.readUInt32LE(local) === 0x04034b50,
      400,
      'INVALID_XLSX',
      'Invalid workbook archive entry.',
    );
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    insist(start + compressed <= offset, 400, 'INVALID_XLSX', 'Invalid workbook archive bounds.');
    try {
      const raw = buffer.subarray(start, start + compressed);
      const inflated =
        method === 0
          ? raw
          : inflateRawSync(raw, { maxOutputLength: Math.max(1, 16 * 1024 * 1024 - total) });
      insist(
        inflated.length === uncompressed,
        400,
        'INVALID_XLSX',
        'Workbook archive sizes do not match.',
      );
      total += inflated.length;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        413,
        'WORKBOOK_LIMIT',
        'The expanded workbook exceeds the safe parsing budget.',
      );
    }
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
function excelCell(cell: ExcelJS.Cell): Cell {
  let value = cell.value;
  if (value === null || value === undefined) return null;
  if (
    (typeof value === 'object' && 'formula' in value) ||
    (typeof value === 'object' && value !== null && 'sharedFormula' in value)
  ) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    insist(
      result !== undefined && !(typeof result === 'object'),
      400,
      'FORMULA_UNSUPPORTED',
      'Formula cells need cached literal results. Re-save the workbook as values and try again.',
    );
    value = result as ExcelJS.CellValue;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    insist(
      Number.isFinite(value),
      400,
      'INVALID_CELL',
      'Non-finite numeric cells are unsupported.',
    );
    return value;
  }
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'richText' in value)
    return value.richText.map((part) => part.text).join('');
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  throw new AppError(
    400,
    'UNSUPPORTED_CELL',
    'Workbook error or unsupported cell value. Export the sheet as values and try again.',
  );
}
export async function parseUploads(
  files: Upload[],
): Promise<{ tables: DataTable[]; warnings: string[] }> {
  insist(
    files.length > 0 && files.length <= LIMITS.maxFiles,
    400,
    'FILE_LIMIT',
    'Choose one or two CSV/XLSX files.',
  );
  const tables: DataTable[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    insist(
      file.buffer.length <= LIMITS.maxFileBytes,
      413,
      'FILE_LIMIT',
      'Each file must be at most 2 MB.',
    );
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === '.csv') {
      let matrix: string[][];
      try {
        matrix = parse(file.buffer, {
          bom: true,
          skip_empty_lines: true,
          relax_column_count: true,
          max_record_size: 50_000,
          to: 5002,
        }) as string[][];
      } catch {
        throw new AppError(
          400,
          'INVALID_CSV',
          'The CSV could not be parsed. Check quoting and row lengths.',
        );
      }
      insist(
        matrix.length <= 5001 && matrix.every((row) => row.length <= 100),
        413,
        'CANDIDATE_LIMIT',
        'Candidate tables must fit 5000 rows and 100 columns before selection.',
      );
      tables.push(makeTable(path.basename(file.originalname, extension), matrix, false));
    } else if (extension === '.xlsx') {
      validateZip(file.buffer);
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(
          file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(400, 'INVALID_XLSX', 'The XLSX workbook could not be read.');
      }
      insist(
        workbook.worksheets.length <= 12,
        400,
        'SHEET_LIMIT',
        'Please upload a workbook containing at most 12 sheets.',
      );
      for (const sheet of workbook.worksheets) {
        if (sheet.actualRowCount === 0) continue;
        // Preserve oversized sheet metadata as an explicit error; never silently drop records.
        insist(
          sheet.rowCount <= 5000 && sheet.columnCount <= 100,
          400,
          'TABLE_LIMIT',
          'The candidate sheet is too large to inspect. Export only the required table.',
        );
        const matrix: Cell[][] = [];
        for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
          const row: Cell[] = [];
          for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex++)
            row.push(excelCell(sheet.getCell(rowIndex, columnIndex)));
          matrix.push(row);
        }
        if (matrix.length > 1) tables.push(makeTable(sheet.name, matrix, false));
      }
      warnings.push(
        'XLSX cached formula results are imported as literal values; workbook styling is not retained.',
      );
    } else throw new AppError(400, 'INVALID_FILE_TYPE', 'Only CSV and XLSX files are supported.');
  }
  insist(
    tables.length > 0 && tables.length <= 12,
    400,
    'TABLE_LIMIT',
    'Upload at least one table and no more than 12 candidate sheets. Select at most two tables for an investigation.',
  );
  insist(
    Buffer.byteLength(JSON.stringify(tables)) <= LIMITS.maxParsedBytes,
    413,
    'PARSED_LIMIT',
    'Parsed data exceeds the 4 MB investigation budget.',
  );
  return { tables, warnings };
}
