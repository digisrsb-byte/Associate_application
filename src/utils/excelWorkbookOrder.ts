import ExcelJS from 'exceljs';

/**
 * Copy worksheets from an unordered workbook into a Blob in a fixed sheet order.
 * Shared by IT and GST Excel export builders (preserve sheet content bit-for-bit).
 */
export async function orderedWorkbookToBlob(
  content: ExcelJS.Workbook,
  desiredOrder: string[],
  creator = 'TaxLedger'
): Promise<Blob> {
  const desired = desiredOrder.filter((n) => !!content.getWorksheet(n));
  const orderedWb = new ExcelJS.Workbook();
  orderedWb.calcProperties.fullCalcOnLoad = true;
  orderedWb.creator = creator;

  for (const name of desired) {
    const src = content.getWorksheet(name);
    if (!src) continue;
    const dest = orderedWb.addWorksheet(name);
    src.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const newRow = dest.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const newCell = newRow.getCell(colNumber);
        newCell.value = cell.value as ExcelJS.CellValue;
        if (cell.numFmt) newCell.numFmt = cell.numFmt;
        if (cell.font) newCell.font = { ...cell.font };
        if (cell.fill) newCell.fill = cell.fill;
        if (cell.alignment) newCell.alignment = { ...cell.alignment };
      });
      if (row.height) newRow.height = row.height;
    });
    (src.columns || []).forEach((col, i) => {
      if (col?.width) dest.getColumn(i + 1).width = col.width;
    });
    if (src.autoFilter) dest.autoFilter = src.autoFilter;
    if (src.views?.length) dest.views = [...src.views];
  }

  const buf = await orderedWb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
