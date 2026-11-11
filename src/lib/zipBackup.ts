import JSZip from 'jszip';

export interface BackupMetadata {
  schemaVersion: string;
  appVersion: string;
  backupAt: string;
  ownerId: string;
  recordCounts: Record<string, number>;
  checksum: string;
}

export async function buildBackupZipBlob(payload: {
  metadata: BackupMetadata;
  classes: unknown[];
  students: unknown[];
  books: unknown[];
  transactions: unknown[];
  transaction_images: unknown[];
  audit_logs: unknown[];
  settings: Record<string, unknown>;
}): Promise<Blob> {
  const zip = new JSZip();
  const metadataJson = {
    schema_version: payload.metadata.schemaVersion,
    app_version: payload.metadata.appVersion,
    backup_at: payload.metadata.backupAt,
    owner_id: payload.metadata.ownerId,
    record_counts: payload.metadata.recordCounts,
    checksum: payload.metadata.checksum
  };
  zip.file('metadata.json', JSON.stringify(metadataJson, null, 2));
  zip.file('classes.json', JSON.stringify(payload.classes, null, 2));
  zip.file('students.json', JSON.stringify(payload.students, null, 2));
  zip.file('books.json', JSON.stringify(payload.books, null, 2));
  zip.file('transactions.json', JSON.stringify(payload.transactions, null, 2));
  zip.file('transaction_images.json', JSON.stringify(payload.transaction_images, null, 2));
  zip.file('audit_logs.json', JSON.stringify(payload.audit_logs, null, 2));
  zip.file('settings.json', JSON.stringify(payload.settings, null, 2));
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
