import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit-test runner — separate from Playwright (playwright.config.ts).
 * Does not start the Express server or touch data/ / data-e2e/.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/fieldValidation.ts',
        'src/utils/ledgerUtils.ts',
        'src/utils/csvHelpers.ts',
        'src/utils/summaryUtils.ts',
        'src/utils/csvExport.ts',
        'src/utils/excelExport.ts',
        'src/utils/excelWorkbookOrder.ts',
        'src/utils/gstExcelExport.ts',
        'src/utils/gstExcelImport.ts',
        'src/utils/api.ts',
        'passwordPolicy.ts',
        'portalCrypto.ts',
        'backupCrypto.ts',
        'src/utils/paymentStatusUi.ts',
        'src/utils/recordSearch.ts',
        'src/utils/gstFilingSanitize.ts',
        'src/utils/gstCopy.ts',
        'src/import/columnMapping.ts',
        'src/import/itMappedParse.ts',
        'src/import/gstMappedParse.ts',
        'src/import/validateImport.ts',
        'src/import/applyImportToLedger.ts',
        'src/import/workbookInspect.ts',
        'src/import/importSessionStore.ts',
        'src/business/businessDataBackend.ts',
        'src/business/pgLedgerRepository.ts',
        'src/db/passwordResetStore.ts',
        'src/db/sessionToken.ts',
        'src/auth/authBackend.ts',
        'src/auth/resetTokenDelivery.ts',
        'src/import/excelCells.ts',
        'src/import/fieldCatalog.ts',
        'src/import/anonymizePreview.ts',
        'src/db/sessionStore.ts',
        'src/db/authUsers.ts',
        'src/db/pool.ts',
      ],
      exclude: [
        'e2e/**',
        'tests/**',
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
      ],
    },
  },
});
