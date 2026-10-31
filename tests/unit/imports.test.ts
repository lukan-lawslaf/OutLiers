import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { LIMITS } from '../../shared/contracts.js';
import { makeTable, parseUploads, type Upload } from '../../server/imports.js';

function csvUpload(text: string, filename = 'records.csv'): Upload {
  const buffer = Buffer.from(text, 'utf8');
  return { originalname: filename, buffer, size: buffer.length };
}

async function xlsxUpload(makeWorkbook: (workbook: ExcelJS.Workbook) => void): Promise<Upload> {
  const workbook = new ExcelJS.Workbook();
  makeWorkbook(workbook);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { originalname: 'records.xlsx', buffer, size: buffer.length };
}

describe('CSV and XLSX import limits', () => {
  it('strips a CSV byte-order mark and preserves literal values in originals', async () => {
    const result = await parseUploads([csvUpload('\uFEFFid,name\n001,Ada Lovelace\n002,Grace Hopper')]);
    const table = result.tables[0]!;

    expect(table.columns.map((column) => column.name)).toEqual(['id', 'name']);
    expect(table.rows[0]?.original).toEqual({ col_0: '001', col_1: 'Ada Lovelace' });
    expect(table.rows[0]?.values).toEqual(table.rows[0]?.original);
    expect(result.warnings).toEqual([]);
  });

  it('preserves candidate rows on import and enforces the selected-table row limit', async () => {
    const allowed = ['id,value', ...Array.from({ length: LIMITS.maxRows }, (_, index) => `${index},row-${index}`)].join('\n');
    const parsed = await parseUploads([csvUpload(allowed)]);
    expect(parsed.tables[0]?.rows).toHaveLength(LIMITS.maxRows);

    const excess = `${allowed}\n500,row-500`;
    const imported = await parseUploads([csvUpload(excess)]);
    expect(imported.tables[0]?.rows).toHaveLength(LIMITS.maxRows + 1);
    expect(imported.tables[0]?.rows.at(-1)?.values.col_0).toBe('500');

    const matrix = [['id', 'value'], ...Array.from({ length: LIMITS.maxRows + 1 }, (_, index) => [String(index), `row-${index}`])];
    expect(() => makeTable('selected-too-large', matrix)).toThrowError(expect.objectContaining({ code: 'ROW_LIMIT', status: 400 }));
  });

  it('preserves candidate columns on import and enforces the selected-table column limit', async () => {
    const header = Array.from({ length: LIMITS.maxColumns }, (_, index) => `c${index}`).join(',');
    const row = Array.from({ length: LIMITS.maxColumns }, (_, index) => String(index)).join(',');
    const accepted = await parseUploads([csvUpload(`${header}\n${row}`)]);
    expect(accepted.tables[0]?.columns).toHaveLength(LIMITS.maxColumns);

    const tooWideHeader = `${header},overflow`;
    const tooWideRow = `${row},extra`;
    const tooWide = await parseUploads([csvUpload(`${tooWideHeader}\n${tooWideRow}`)]);
    expect(tooWide.tables[0]?.columns).toHaveLength(LIMITS.maxColumns + 1);
    expect(() => makeTable('selected-too-wide', [tooWideHeader.split(','), tooWideRow.split(',')])).toThrowError(expect.objectContaining({ code: 'COLUMN_LIMIT', status: 400 }));
  });

  it('rejects files over the upload size limit before parsing them', async () => {
    const buffer = Buffer.alloc(LIMITS.maxFileBytes + 1, 32);
    await expect(parseUploads([{ originalname: 'large.csv', buffer }])).rejects.toMatchObject({ code: 'FILE_LIMIT', status: 413 });
  });

  it('imports XLSX cached formula results as literal values', async () => {
    const upload = await xlsxUpload((workbook) => {
      const sheet = workbook.addWorksheet('Values');
      sheet.addRows([['id', 'total'], ['A', 10]]);
      sheet.getCell('B3').value = { formula: '5+7', result: 12 };
      sheet.getCell('A3').value = 'B';
    });
    const parsed = await parseUploads([upload]);

    expect(parsed.tables[0]?.name).toBe('Values');
    expect(parsed.tables[0]?.rows[1]?.values).toEqual({ col_0: 'B', col_1: 12 });
    expect(parsed.warnings.join(' ')).toContain('cached formula results');
  });

  it('rejects XLSX formulas with no cached literal result instead of executing them', async () => {
    const upload = await xlsxUpload((workbook) => {
      const sheet = workbook.addWorksheet('Formula');
      sheet.addRows([['id', 'total'], ['A', 10]]);
      sheet.getCell('A3').value = 'B';
      sheet.getCell('B3').value = { formula: 'SUM(B2:B2)' };
    });

    await expect(parseUploads([upload])).rejects.toMatchObject({ code: 'FORMULA_UNSUPPORTED', status: 400 });
  });
});
