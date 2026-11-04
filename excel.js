import { monthRows, daysInMonth } from './model.js';

// Shared with the on-screen sheet so both views keep the same summary columns.
export const SUMMARY_HEADERS = ['Всего', 'Уваж.', 'Н/уваж.'];

// Fixed 31-day paper form; unused dates and days without absences stay blank.
export function createAttendanceWorkbook(ExcelJS, state, month) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Ведомость');
  const rows = monthRows(state, month), last = 36;
  const period = new Date(month + '-01T12:00:00').toLocaleDateString('ru', { month: 'long' });
  sheet.addRow([`Ведомость посещаемости группы ${state.group} за ${period} ${month.slice(0, 4)}г.`]);
  sheet.mergeCells(1, 1, 1, last);
  sheet.addRow(['№', 'ФИО обучающегося', ...Array.from({ length: 31 }, (_, i) => i + 1), ...SUMMARY_HEADERS]);
  rows.forEach((s, i) => sheet.addRow([i + 1, s.name, ...Array.from({ length: 31 }, (_, d) => d < daysInMonth(month) ? s.days[d] || null : null), s.total, null, s.total]));
  const total = rows.reduce((sum, s) => sum + s.total, 0);
  const summary = sheet.addRow([...Array(33).fill(null), total, null, total]);
  sheet.mergeCells(summary.number, 1, summary.number, 33);
  for (let r = 2; r <= summary.number; r++) {
    const row = sheet.getRow(r);
    row.height = 14;
    for (let c = 1; c <= last; c++) {
      const cell = row.getCell(c);
      cell.font = { name: c === 2 && r === 2 ? 'Times New Roman' : 'Arial', size: 10, bold: r === summary.number || (r === 2 && c <= 2) };
      cell.alignment = { vertical: 'middle', horizontal: c === 2 && r > 2 ? 'left' : 'center' };
      cell.border = Object.fromEntries(['top', 'left', 'bottom', 'right'].map(edge => [edge, { style: 'thin', color: { argb: 'FF000000' } }]));
    }
  }
  sheet.getRow(1).height = 24;
  sheet.getCell('A1').font = { name: 'Times New Roman', size: 12, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getColumn(1).width = 3.5;
  sheet.getColumn(2).width = 25;
  for (let c = 3; c <= 33; c++) sheet.getColumn(c).width = 3.3;
  for (let c = 34; c <= last; c++) sheet.getColumn(c).width = 7;
  const signatureRow = summary.number + 2;
  sheet.mergeCells(signatureRow, 1, signatureRow, last);
  sheet.getCell(signatureRow, 1).value = 'Староста_____________Кл. руководитель________________Зав. По ВР_____________________';
  sheet.getCell(signatureRow, 1).font = { name: 'Times New Roman', size: 12 };
  sheet.getRow(signatureRow).height = 24;
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: .2, right: .2, top: .2, bottom: .2, header: 0, footer: 0 } };
  sheet.pageSetup.printArea = `A1:AJ${signatureRow}`;
  return book;
}
