const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

async function test() {
  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('Projects');
  ws1.addRow(['Title']);
  ws1.addRow(['My Project Name']);

  const ws2 = wb.addWorksheet('Gantt');
  ws2.addRow(['Project']);
  ws2.addRow([{ formula: 'Projects!$A$2', result: 'My Project Name' }]);

  await wb.xlsx.writeFile('test.xlsx');

  const readWb = XLSX.readFile('test.xlsx', { cellFormula: true });
  const rows = XLSX.utils.sheet_to_json(readWb.Sheets['Gantt']);
  console.log('Parsed rows:', rows);
}

test().catch(console.error);
