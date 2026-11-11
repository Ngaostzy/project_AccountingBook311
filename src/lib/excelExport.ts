import * as XLSX from 'xlsx';

export interface SheetDefinition {
  name: string;
  rows: Array<Array<string | number>>;
}

export function exportNineSheetsToXlsx(sheets: SheetDefinition[], fileName: string): void {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  }
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
}
