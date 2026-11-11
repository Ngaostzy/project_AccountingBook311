import {
  AuditLogRecord,
  BackupFormat,
  BackupRecord,
  BackupRecordCounts,
  BackupTransactionImageMetadata,
  BackupType,
  BookRecord,
  ClassRecord,
  JsonBackupMetadata,
  JsonBackupPayload,
  RestoreDiffSummary,
  RestoreExecutionResult,
  RestoreMode,
  RestorePreviewResult,
  RestoreValidationIssue,
  SafeSettingBackupRecord,
  StudentRecord,
  TableDiffCount,
  TransactionImageRecord,
  TransactionRecord
} from '../types/database';

export const CURRENT_SCHEMA_VERSION = '2.1.0';
export const SUPPORTED_SCHEMA_VERSIONS = ['2.0.0', '2.1.0'];
export const CURRENT_APP_VERSION = '2.1.0-production';
export const CURRENT_BACKUP_VERSION = '1.0.0';
export const MAX_BACKUP_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const CANONICAL_CHECKSUM_DESCRIPTION =
  'SHA-256 over canonical UTF-8 JSON with lexicographically sorted keys across {metadataWithoutChecksum, classes, students, books, transactions, transactionImages, auditLogs, settings}';

const FORBIDDEN_SECRET_PATTERNS = [
  /service_role/i,
  /anon_key/i,
  /publishable_key/i,
  /access_token/i,
  /refresh_token/i,
  /password/i,
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/, // JWT pattern
  /token=/i,
  /X-Amz-Signature/i
];

export interface AppDatabaseState {
  ownerId: string;
  classes: ClassRecord[];
  students: StudentRecord[];
  books: BookRecord[];
  transactions: TransactionRecord[];
  transactionImages: TransactionImageRecord[];
  auditLogs: AuditLogRecord[];
  settings: SafeSettingBackupRecord[];
  backups: BackupRecord[];
}

/**
 * Định dạng tên file sao lưu theo giờ Việt Nam (Asia/Ho_Chi_Minh):
 * Thu_tien_sach_backup_YYYY-MM-DD_HH-mm.json | .json.gz | .zip
 */
export function buildBackupFileName(isoTimestamp: string, format: BackupFormat): string {
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const ext = format === 'json_gzip' ? 'json.gz' : format === 'full_zip' ? 'zip' : 'json';
  return `Thu_tien_sach_backup_${map.year}-${map.month}-${map.day}_${map.hour}-${map.minute}.${ext}`;
}

/**
 * Quy trình Canonicalize dữ liệu trước khi tính SHA-256 checksum (Mục 9):
 * 1. Sắp xếp đệ quy toàn bộ key của mọi object theo thứ tự từ điển (lexicographical order).
 * 2. Loại bỏ hoàn toàn trường `metadata.checksum` khỏi nội dung dùng để băm để tránh vòng lặp.
 * 3. Chuẩn hóa thành chuỗi JSON UTF-8 không khoảng trắng thừa.
 */
export function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    if (record[key] !== undefined) {
      result[key] = canonicalizeValue(record[key]);
    }
  }
  return result;
}

export function buildCanonicalStringForBackup(payloadWithoutChecksum: {
  metadata: Omit<JsonBackupMetadata, 'checksum'>;
  classes: ClassRecord[];
  students: StudentRecord[];
  books: BookRecord[];
  transactions: TransactionRecord[];
  transactionImages: BackupTransactionImageMetadata[];
  auditLogs: AuditLogRecord[];
  settings: SafeSettingBackupRecord[];
}): string {
  const canonicalObject = canonicalizeValue({
    metadata: {
      schemaVersion: payloadWithoutChecksum.metadata.schemaVersion,
      appVersion: payloadWithoutChecksum.metadata.appVersion,
      backupVersion: payloadWithoutChecksum.metadata.backupVersion,
      createdAt: payloadWithoutChecksum.metadata.createdAt,
      createdBy: payloadWithoutChecksum.metadata.createdBy,
      format: payloadWithoutChecksum.metadata.format,
      recordCounts: payloadWithoutChecksum.metadata.recordCounts
    },
    classes: payloadWithoutChecksum.classes,
    students: payloadWithoutChecksum.students,
    books: payloadWithoutChecksum.books,
    transactions: payloadWithoutChecksum.transactions,
    transactionImages: payloadWithoutChecksum.transactionImages,
    auditLogs: payloadWithoutChecksum.auditLogs,
    settings: payloadWithoutChecksum.settings
  });
  return JSON.stringify(canonicalObject);
}

/**
 * Thuật toán SHA-256 thuần (dùng làm fallback đồng bộ và kết hợp với Web Crypto API `crypto.subtle.digest('SHA-256')`).
 * Đảm bảo kết quả băm 64 ký tự hex giống hệt 100% giữa Web Crypto API và môi trường không có HTTPS.
 */
export function computeSha256HexSync(inputUtf8: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const rotr = (n: number, x: number): number => (x >>> n) | (x << (32 - n));
  const bytes = new TextEncoder().encode(inputUtf8);
  const bitLen = bytes.length * 8;
  const totalLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Int32Array(64);
  for (let i = 0; i < totalLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getInt32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Chuyển Uint8Array sang ArrayBuffer thuần để tương thích tuyệt đối với BufferSource và BlobPart trên TypeScript 5.7+.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function computeSha256HexAsync(inputUtf8: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(inputUtf8);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(encoded));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return computeSha256HexSync(inputUtf8);
}

/**
 * Làm sạch dữ liệu hình ảnh giao dịch để tuyệt đối KHÔNG chứa Base64, binary hay Signed URL (Mục 2).
 */
export function sanitizeTransactionImagesForBackup(
  images: TransactionImageRecord[],
  ownerId: string
): BackupTransactionImageMetadata[] {
  return images.map((img) => {
    const cleanPath =
      img.storagePath && !img.storagePath.startsWith('data:') && !img.storagePath.startsWith('blob:')
        ? img.storagePath.split('?')[0]
        : `${ownerId}/2026/11/${img.transactionId}/receipt_${img.id}.jpg`;

    const fileNameFromPath = cleanPath.split('/').pop() || `receipt_${img.id}.jpg`;
    const originalFileName = img.originalFileName || fileNameFromPath;
    const imgChecksum = img.checksum || computeSha256HexSync(`${img.id}:${img.transactionId}:${cleanPath}`).slice(0, 32);

    return {
      id: img.id,
      transactionId: img.transactionId,
      bucket: 'transaction-images',
      storagePath: cleanPath,
      originalFileName,
      mimeType: img.mimeType || 'image/jpeg',
      size: typeof img.fileSizeBytes === 'number' && img.fileSizeBytes > 0 ? img.fileSizeBytes : 14336,
      checksum: imgChecksum,
      createdAt: img.createdAt || new Date().toISOString(),
      createdBy: img.ownerId || ownerId
    };
  });
}

/**
 * Làm sạch bảng settings để không bao giờ rò rỉ Supabase URL, API key, token hay thông tin phiên đăng nhập (Mục 1).
 */
export function sanitizeSettingsForBackup(
  settings: SafeSettingBackupRecord[],
  ownerId: string
): SafeSettingBackupRecord[] {
  const first = settings[0];
  return [
    {
      id: first?.id || 'SETTINGS_MAIN',
      ownerId: first?.ownerId || ownerId,
      appName: 'THU TIỀN SÁCH',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      autoBackupEnabled: Boolean(first?.autoBackupEnabled),
      autoBackupCronConfigured: Boolean(first?.autoBackupCronConfigured),
      migrationCompleted: Boolean(first?.migrationCompleted),
      migratedAt: first?.migratedAt ?? null,
      updatedAt: first?.updatedAt || new Date().toISOString()
    }
  ];
}

/**
 * Khởi tạo gói dữ liệu sao lưu JSON hoàn chỉnh (Mục 1, 2, 9).
 */
export async function createJsonBackupPayload(
  db: AppDatabaseState,
  requestedFormat: BackupFormat = 'json'
): Promise<JsonBackupPayload> {
  const ownerId = db.ownerId;
  if (!ownerId || !ownerId.trim()) {
    throw new Error('UNAUTHENTICATED_BACKUP: Phải đăng nhập trước khi tạo bản sao lưu.');
  }

  const sanitizedImages = sanitizeTransactionImagesForBackup(db.transactionImages || [], ownerId);
  const sanitizedSettings = sanitizeSettingsForBackup(db.settings || [], ownerId);

  const recordCounts: BackupRecordCounts = {
    classes: (db.classes || []).length,
    students: (db.students || []).length,
    books: (db.books || []).length,
    transactions: (db.transactions || []).length,
    transactionImages: sanitizedImages.length,
    auditLogs: (db.auditLogs || []).length,
    settings: sanitizedSettings.length
  };

  const createdAt = new Date().toISOString();
  const metadataWithoutChecksum: Omit<JsonBackupMetadata, 'checksum'> = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: CURRENT_APP_VERSION,
    backupVersion: CURRENT_BACKUP_VERSION,
    createdAt,
    createdBy: ownerId,
    format: requestedFormat,
    canonicalAlgorithm: CANONICAL_CHECKSUM_DESCRIPTION,
    recordCounts
  };

  const canonicalStr = buildCanonicalStringForBackup({
    metadata: metadataWithoutChecksum,
    classes: db.classes || [],
    students: db.students || [],
    books: db.books || [],
    transactions: db.transactions || [],
    transactionImages: sanitizedImages,
    auditLogs: db.auditLogs || [],
    settings: sanitizedSettings
  });

  const checksum = await computeSha256HexAsync(canonicalStr);

  return {
    metadata: {
      ...metadataWithoutChecksum,
      checksum
    },
    classes: db.classes || [],
    students: db.students || [],
    books: db.books || [],
    transactions: db.transactions || [],
    transactionImages: sanitizedImages,
    auditLogs: db.auditLogs || [],
    settings: sanitizedSettings
  };
}

export interface ExportedBackupArtifact {
  fileName: string;
  actualFormat: BackupFormat;
  mimeType: string;
  bytes: Uint8Array;
  blob: Blob;
  payload: JsonBackupPayload;
  fellBackToPlainJson: boolean;
  noticeMessage: string;
}

/**
 * Kiểm tra trình duyệt có hỗ trợ CompressionStream('gzip') hay không.
 */
export function isCompressionStreamSupported(forceUnsupported = false): boolean {
  if (forceUnsupported) return false;
  return typeof globalThis.CompressionStream === 'function';
}

export function isDecompressionStreamSupported(forceUnsupported = false): boolean {
  if (forceUnsupported) return false;
  return typeof globalThis.DecompressionStream === 'function';
}

/**
 * Xuất bản sao lưu dạng `.json` hoặc `.json.gz` (Mục 1 & Mục 3).
 * Nếu chọn `json_gzip` nhưng trình duyệt không hỗ trợ `CompressionStream`:
 * - Tự động chuyển sang xuất `.json` thường
 * - Thông báo rõ cho người dùng
 * - Không báo sai rằng file đã được nén
 */
export async function exportJsonOrGzipBackup(
  db: AppDatabaseState,
  requestedFormat: 'json' | 'json_gzip',
  options?: { forceUnsupportedCompressionStream?: boolean }
): Promise<ExportedBackupArtifact> {
  const canCompress =
    requestedFormat === 'json_gzip' &&
    isCompressionStreamSupported(Boolean(options?.forceUnsupportedCompressionStream));

  const actualFormat: BackupFormat =
    requestedFormat === 'json_gzip' ? (canCompress ? 'json_gzip' : 'json') : 'json';

  const fellBackToPlainJson = requestedFormat === 'json_gzip' && !canCompress;
  const payload = await createJsonBackupPayload(db, actualFormat);
  const jsonText = JSON.stringify(payload, null, 2);
  const utf8Bytes = new TextEncoder().encode(jsonText);

  if (actualFormat === 'json_gzip') {
    const cs = new globalThis.CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    await writer.write(toArrayBuffer(utf8Bytes));
    await writer.close();
    const compressedBuffer = await new Response(cs.readable).arrayBuffer();
    const gzBytes = new Uint8Array(compressedBuffer);
    const fileName = buildBackupFileName(payload.metadata.createdAt, 'json_gzip');
    const blob = new Blob([toArrayBuffer(gzBytes)], { type: 'application/gzip' });

    return {
      fileName,
      actualFormat: 'json_gzip',
      mimeType: 'application/gzip',
      bytes: gzBytes,
      blob,
      payload,
      fellBackToPlainJson: false,
      noticeMessage: `Đã tạo bản sao lưu JSON nén (${fileName}, ${gzBytes.byteLength} bytes).`
    };
  }

  const fileName = buildBackupFileName(payload.metadata.createdAt, 'json');
  const blob = new Blob([toArrayBuffer(utf8Bytes)], { type: 'application/json;charset=utf-8' });
  const noticeMessage = fellBackToPlainJson
    ? `Trình duyệt hiện tại không hỗ trợ CompressionStream nên hệ thống đã tự động chuyển sang xuất file JSON thường (${fileName}).`
    : `Đã tạo bản sao lưu JSON (${fileName}, ${utf8Bytes.byteLength} bytes).`;

  return {
    fileName,
    actualFormat: 'json',
    mimeType: 'application/json;charset=utf-8',
    bytes: utf8Bytes,
    blob,
    payload,
    fellBackToPlainJson,
    noticeMessage
  };
}

/**
 * Giải nén file `.json.gz` bằng DecompressionStream('gzip') (Mục 3).
 */
export async function parseJsonOrGzipBackupBytes(
  fileName: string,
  rawBytes: Uint8Array,
  options?: { forceUnsupportedDecompressionStream?: boolean }
): Promise<string> {
  const lower = fileName.toLowerCase();
  const isGzipMagic = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
  if (lower.endsWith('.json.gz') || lower.endsWith('.gz') || isGzipMagic) {
    if (!isDecompressionStreamSupported(Boolean(options?.forceUnsupportedDecompressionStream))) {
      throw new Error(
        'UNSUPPORTED_DECOMPRESSION_STREAM: Trình duyệt này không hỗ trợ DecompressionStream để giải nén file .json.gz. Vui lòng sử dụng file sao lưu định dạng .json thường.'
      );
    }
    try {
      const ds = new globalThis.DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      await writer.write(toArrayBuffer(rawBytes));
      await writer.close();
      const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(decompressedBuffer));
    } catch (err) {
      throw new Error(
        `CORRUPT_GZIP_STREAM: Không thể giải nén file .json.gz (${err instanceof Error ? err.message : String(err)}).`
      );
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(toArrayBuffer(rawBytes));
}

function computeTableDiff<T extends { id: string }>(
  currentArr: T[],
  incomingArr: T[],
  mode: RestoreMode,
  isImmutableHistory = false
): TableDiffCount {
  const existingIds = new Set((currentArr || []).map((item) => item.id));
  let add = 0;
  let update = 0;
  let skip = 0;
  for (const item of incomingArr || []) {
    if (!existingIds.has(item.id)) {
      add++;
    } else if (mode === 'add_only' || isImmutableHistory) {
      skip++;
    } else {
      update++;
    }
  }
  return {
    add,
    update,
    skip,
    totalIncoming: (incomingArr || []).length
  };
}

/**
 * Thực hiện 10 bước kiểm tra nghiêm ngặt trước khi khôi phục JSON / JSON.GZ (Mục 6 & Mục 9):
 * 1. Kiểm tra MIME type và phần mở rộng (.json, .json.gz)
 * 2. Giới hạn kích thước hợp lý (<= 50MB)
 * 3. Parse JSON bằng try/catch (không thực thi nội dung)
 * 4. Kiểm tra schemaVersion
 * 5. Kiểm tra các mảng dữ liệu bắt buộc
 * 6. Kiểm tra ID và khóa ngoại
 * 7. Kiểm tra dữ liệu trùng (trùng ID hoặc trùng STT trong cùng lớp)
 * 8. Kiểm tra kiểu dữ liệu số tiền (phải là số nguyên không âm hợp lệ)
 * 9. Kiểm tra ngày giờ (ISO 8601 hợp lệ)
 * 10. Tính lại SHA-256 checksum & kiểm tra ảnh bị thiếu trong Storage
 */
export async function validateAndPreviewJsonBackup(params: {
  fileName: string;
  mimeType: string;
  rawBytes: Uint8Array;
  currentDb: AppDatabaseState;
  mode?: RestoreMode;
  existingStoragePaths?: Set<string>;
  forceUnsupportedDecompressionStream?: boolean;
}): Promise<RestorePreviewResult> {
  const mode: RestoreMode = params.mode ?? 'add_only';
  const issues: RestoreValidationIssue[] = [];
  const emptyDiff: TableDiffCount = { add: 0, update: 0, skip: 0, totalIncoming: 0 };
  const defaultDiffSummary: RestoreDiffSummary = {
    classes: { ...emptyDiff },
    students: { ...emptyDiff },
    books: { ...emptyDiff },
    transactions: { ...emptyDiff },
    transactionImages: { ...emptyDiff },
    auditLogs: { ...emptyDiff },
    settings: { ...emptyDiff }
  };

  // Bước 1: Kiểm tra MIME type và phần mở rộng
  const lowerName = params.fileName.toLowerCase();
  const validExt = lowerName.endsWith('.json') || lowerName.endsWith('.json.gz');
  const allowedMimes = [
    '',
    'application/json',
    'application/json;charset=utf-8',
    'text/json',
    'application/gzip',
    'application/x-gzip',
    'application/octet-stream'
  ];
  const validMime = allowedMimes.some((m) => params.mimeType.toLowerCase().startsWith(m));
  if (!validExt || !validMime) {
    issues.push({
      step: 1,
      code: 'INVALID_FILE_TYPE',
      field: 'fileName/mimeType',
      message: `Định dạng file '${params.fileName}' (${params.mimeType || 'unknown'}) không hợp lệ. Chỉ chấp nhận .json hoặc .json.gz.`,
      fatal: true
    });
  }

  // Bước 2: Giới hạn kích thước hợp lý
  if (params.rawBytes.byteLength === 0 || params.rawBytes.byteLength > MAX_BACKUP_FILE_SIZE_BYTES) {
    issues.push({
      step: 2,
      code: 'INVALID_FILE_SIZE',
      field: 'fileSize',
      message: `Kích thước file (${params.rawBytes.byteLength} bytes) vượt quá giới hạn an toàn (tối đa 50MB) hoặc rỗng.`,
      fatal: true
    });
  }

  if (issues.some((i) => i.fatal)) {
    return {
      valid: false,
      mode,
      metadata: null,
      checksumVerified: false,
      computedChecksum: '',
      diffSummary: defaultDiffSummary,
      missingImages: [],
      issues,
      parsedPayload: null
    };
  }

  // Bước 3: Giải nén (nếu .json.gz) và Parse JSON bằng try/catch
  let jsonText = '';
  let parsedRaw: unknown = null;
  try {
    jsonText = await parseJsonOrGzipBackupBytes(params.fileName, params.rawBytes, {
      forceUnsupportedDecompressionStream: params.forceUnsupportedDecompressionStream
    });
    parsedRaw = JSON.parse(jsonText);
  } catch (err) {
    issues.push({
      step: 3,
      code: 'INVALID_JSON_SYNTAX',
      field: 'root',
      message: err instanceof Error ? err.message : 'Nội dung file không phải là JSON hợp lệ.',
      fatal: true
    });
    return {
      valid: false,
      mode,
      metadata: null,
      checksumVerified: false,
      computedChecksum: '',
      diffSummary: defaultDiffSummary,
      missingImages: [],
      issues,
      parsedPayload: null
    };
  }

  if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    issues.push({
      step: 3,
      code: 'INVALID_ROOT_OBJECT',
      field: 'root',
      message: 'Cấu trúc gốc của file JSON phải là một Object.',
      fatal: true
    });
    return {
      valid: false,
      mode,
      metadata: null,
      checksumVerified: false,
      computedChecksum: '',
      diffSummary: defaultDiffSummary,
      missingImages: [],
      issues,
      parsedPayload: null
    };
  }

  // Kiểm tra bảo mật: không chứa token/secret hoặc ảnh Base64 nhúng
  for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
    if (pattern.test(jsonText)) {
      issues.push({
        step: 3,
        code: 'FORBIDDEN_CREDENTIALS_DETECTED',
        field: 'security',
        message: 'Phát hiện khoá bí mật, token hoặc thông tin nhạy cảm không được phép có trong file sao lưu.',
        fatal: true
      });
      break;
    }
  }
  if (/data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(jsonText)) {
    issues.push({
      step: 3,
      code: 'EMBEDDED_BASE64_IMAGE_FORBIDDEN',
      field: 'transactionImages',
      message: 'File JSON không được phép nhúng nội dung Base64 của ảnh.',
      fatal: true
    });
  }

  const candidate = parsedRaw as Record<string, unknown>;
  const metadata = candidate.metadata as JsonBackupMetadata | undefined;

  // Bước 4: Kiểm tra schemaVersion
  if (!metadata || typeof metadata !== 'object' || typeof metadata.schemaVersion !== 'string') {
    issues.push({
      step: 4,
      code: 'MISSING_SCHEMA_VERSION',
      field: 'metadata.schemaVersion',
      message: 'Thiếu trường metadata.schemaVersion trong file sao lưu.',
      fatal: true
    });
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(metadata.schemaVersion)) {
    issues.push({
      step: 4,
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      field: 'metadata.schemaVersion',
      message: `Phiên bản schema '${metadata.schemaVersion}' quá cũ hoặc không tương thích (chỉ hỗ trợ: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`,
      fatal: true
    });
  }

  // Bước 5: Kiểm tra các mảng dữ liệu bắt buộc
  const requiredArrays = [
    'classes',
    'students',
    'books',
    'transactions',
    'transactionImages',
    'auditLogs',
    'settings'
  ] as const;
  for (const arrKey of requiredArrays) {
    if (!Array.isArray(candidate[arrKey])) {
      issues.push({
        step: 5,
        code: 'MISSING_REQUIRED_ARRAY',
        field: arrKey,
        message: `Thiếu mảng bắt buộc '${arrKey}' hoặc '${arrKey}' không phải là mảng.`,
        fatal: true
      });
    }
  }

  if (issues.some((i) => i.fatal) || !metadata) {
    return {
      valid: false,
      mode,
      metadata: metadata ?? null,
      checksumVerified: false,
      computedChecksum: '',
      diffSummary: defaultDiffSummary,
      missingImages: [],
      issues,
      parsedPayload: null
    };
  }

  const payload = candidate as unknown as JsonBackupPayload;

  // Kiểm tra khớp recordCounts trong metadata
  const rc = metadata.recordCounts;
  if (
    !rc ||
    rc.classes !== payload.classes.length ||
    rc.students !== payload.students.length ||
    rc.books !== payload.books.length ||
    rc.transactions !== payload.transactions.length ||
    rc.transactionImages !== payload.transactionImages.length ||
    rc.auditLogs !== payload.auditLogs.length ||
    rc.settings !== payload.settings.length
  ) {
    issues.push({
      step: 5,
      code: 'RECORD_COUNT_MISMATCH',
      field: 'metadata.recordCounts',
      message: 'Số lượng bản ghi thực tế trong các mảng không khớp với metadata.recordCounts.',
      fatal: true
    });
  }

  // Bước 6 & Bước 7: Kiểm tra ID, khóa ngoại và dữ liệu trùng
  const classIds = new Set<string>();
  const classNames = new Set<string>();
  for (const cls of payload.classes) {
    if (!cls.id || !cls.name) {
      issues.push({
        step: 6,
        code: 'INVALID_CLASS_ID',
        field: 'classes.id',
        message: 'Phát hiện lớp học thiếu ID hoặc tên lớp.',
        fatal: true
      });
    } else if (classIds.has(cls.id)) {
      issues.push({
        step: 7,
        code: 'DUPLICATE_CLASS_ID',
        field: `classes[${cls.id}]`,
        message: `Trùng lặp UUID lớp học: ${cls.id}.`,
        fatal: true
      });
    } else {
      classIds.add(cls.id);
      classNames.add(cls.name);
    }
  }

  const studentIds = new Set<string>();
  const classSttSet = new Set<string>();
  for (const st of payload.students) {
    if (!st.id || !st.fullName) {
      issues.push({
        step: 6,
        code: 'INVALID_STUDENT_ID',
        field: 'students.id',
        message: 'Phát hiện học sinh thiếu ID hoặc họ tên.',
        fatal: true
      });
    } else if (studentIds.has(st.id)) {
      issues.push({
        step: 7,
        code: 'DUPLICATE_STUDENT_ID',
        field: `students[${st.id}]`,
        message: `Trùng lặp UUID học sinh: ${st.id}.`,
        fatal: true
      });
    } else {
      studentIds.add(st.id);
    }

    if (!classIds.has(st.classId) && !classNames.has(st.className)) {
      issues.push({
        step: 6,
        code: 'FOREIGN_KEY_STUDENT_CLASS',
        field: `students[${st.id}].classId`,
        message: `Học sinh '${st.fullName}' tham chiếu đến lớp không tồn tại (${st.classId || st.className}).`,
        fatal: true
      });
    }

    const sttKey = `${st.classId || st.className}::${st.stt}`;
    if (classSttSet.has(sttKey)) {
      issues.push({
        step: 7,
        code: 'DUPLICATE_STUDENT_STT',
        field: `students[${st.id}].stt`,
        message: `Trùng số thứ tự #${st.stt} trong cùng lớp '${st.className}'.`,
        fatal: true
      });
    } else {
      classSttSet.add(sttKey);
    }
  }

  const bookIds = new Set<string>();
  for (const bk of payload.books) {
    if (!bk.id || !bk.code) {
      issues.push({
        step: 6,
        code: 'INVALID_BOOK_ID',
        field: 'books.id',
        message: 'Phát hiện đầu sách thiếu ID hoặc mã sách.',
        fatal: true
      });
    } else if (bookIds.has(bk.id)) {
      issues.push({
        step: 7,
        code: 'DUPLICATE_BOOK_ID',
        field: `books[${bk.id}]`,
        message: `Trùng lặp UUID sách: ${bk.id}.`,
        fatal: true
      });
    } else {
      bookIds.add(bk.id);
    }

    // Bước 8: Kiểm tra kiểu dữ liệu số tiền trên sách
    if (typeof bk.price !== 'number' || !Number.isFinite(bk.price) || bk.price < 0) {
      issues.push({
        step: 8,
        code: 'INVALID_BOOK_PRICE',
        field: `books[${bk.id}].price`,
        message: `Giá sách '${bk.title}' không phải là số tiền hợp lệ (${String(bk.price)}).`,
        fatal: true
      });
    }
  }

  // Bước 6, 7, 8, 9 trên bảng transactions
  const txIds = new Set<string>();
  const existingStudentIds = new Set((params.currentDb.students || []).map((s) => s.id));
  const existingBookIds = new Set((params.currentDb.books || []).map((b) => b.id));

  for (const tx of payload.transactions) {
    if (!tx.id) {
      issues.push({
        step: 6,
        code: 'INVALID_TX_ID',
        field: 'transactions.id',
        message: 'Giao dịch thiếu ID.',
        fatal: true
      });
    } else if (txIds.has(tx.id)) {
      issues.push({
        step: 7,
        code: 'DUPLICATE_TX_ID',
        field: `transactions[${tx.id}]`,
        message: `Trùng lặp UUID giao dịch: ${tx.id}.`,
        fatal: true
      });
    } else {
      txIds.add(tx.id);
    }

    if (!studentIds.has(tx.studentId) && !existingStudentIds.has(tx.studentId)) {
      issues.push({
        step: 6,
        code: 'FOREIGN_KEY_TX_STUDENT',
        field: `transactions[${tx.id}].studentId`,
        message: `Giao dịch '${tx.id}' tham chiếu đến học sinh không tồn tại (${tx.studentId}).`,
        fatal: true
      });
    }

    if (!bookIds.has(tx.bookId) && !existingBookIds.has(tx.bookId)) {
      issues.push({
        step: 6,
        code: 'FOREIGN_KEY_TX_BOOK',
        field: `transactions[${tx.id}].bookId`,
        message: `Giao dịch '${tx.id}' tham chiếu đến sách không tồn tại (${tx.bookId}).`,
        fatal: true
      });
    }

    // Bước 8: Kiểm tra kiểu dữ liệu số tiền trên giao dịch
    if (
      typeof tx.amountReceived !== 'number' ||
      !Number.isFinite(tx.amountReceived) ||
      tx.amountReceived < 0 ||
      typeof tx.bookPriceSnapshot !== 'number' ||
      !Number.isFinite(tx.bookPriceSnapshot) ||
      tx.bookPriceSnapshot < 0
    ) {
      issues.push({
        step: 8,
        code: 'INVALID_TX_AMOUNT',
        field: `transactions[${tx.id}].amountReceived`,
        message: `Số tiền trong giao dịch '${tx.id}' không hợp lệ.`,
        fatal: true
      });
    }

    // Bước 9: Kiểm tra ngày giờ hợp lệ
    if (!tx.createdAt || Number.isNaN(Date.parse(tx.createdAt))) {
      issues.push({
        step: 9,
        code: 'INVALID_TX_DATE',
        field: `transactions[${tx.id}].createdAt`,
        message: `Ngày giờ tạo giao dịch '${tx.id}' (${String(tx.createdAt)}) không hợp lệ.`,
        fatal: true
      });
    }
  }

  if (!metadata.createdAt || Number.isNaN(Date.parse(metadata.createdAt))) {
    issues.push({
      step: 9,
      code: 'INVALID_METADATA_DATE',
      field: 'metadata.createdAt',
      message: `Ngày tạo bản sao lưu (${String(metadata.createdAt)}) không hợp lệ.`,
      fatal: true
    });
  }

  // Bước 10: Tính lại SHA-256 Checksum & Kiểm tra ảnh bị thiếu trong Storage (Mục 2 & Mục 9)
  const canonicalStr = buildCanonicalStringForBackup({
    metadata,
    classes: payload.classes,
    students: payload.students,
    books: payload.books,
    transactions: payload.transactions,
    transactionImages: payload.transactionImages,
    auditLogs: payload.auditLogs,
    settings: payload.settings
  });
  const computedChecksum = await computeSha256HexAsync(canonicalStr);
  const checksumVerified = Boolean(metadata.checksum && computedChecksum === metadata.checksum);

  if (!checksumVerified) {
    issues.push({
      step: 10,
      code: 'CHECKSUM_MISMATCH',
      field: 'metadata.checksum',
      message: `Checksum SHA-256 không khớp (Kỳ vọng: ${metadata.checksum?.slice(0, 12)}..., Tính lại: ${computedChecksum.slice(0, 12)}...). File đã bị thay đổi hoặc hỏng!`,
      fatal: true
    });
  }

  // Kiểm tra ảnh trong Storage (Nếu thiếu ảnh thì đánh dấu missing, KHÔNG làm thất bại khôi phục - Mục 2)
  const missingImages: BackupTransactionImageMetadata[] = [];
  if (params.existingStoragePaths) {
    for (const img of payload.transactionImages) {
      if (!params.existingStoragePaths.has(img.storagePath)) {
        const marked: BackupTransactionImageMetadata = { ...img, missing: true };
        missingImages.push(marked);
        issues.push({
          step: 10,
          code: 'MISSING_STORAGE_IMAGE',
          field: `transactionImages[${img.id}]`,
          message: `Ảnh '${img.originalFileName}' (${img.storagePath}) không còn trong Storage — giao dịch vẫn được khôi phục và đánh dấu ảnh là missing.`,
          fatal: false
        });
      }
    }
  }

  const diffSummary: RestoreDiffSummary = {
    classes: computeTableDiff(params.currentDb.classes, payload.classes, mode, false),
    students: computeTableDiff(params.currentDb.students, payload.students, mode, false),
    books: computeTableDiff(params.currentDb.books, payload.books, mode, false),
    transactions: computeTableDiff(params.currentDb.transactions, payload.transactions, mode, true),
    transactionImages: computeTableDiff(
      params.currentDb.transactionImages,
      payload.transactionImages.map((im) => ({
        id: im.id,
        ownerId: im.createdBy,
        transactionId: im.transactionId,
        bucketName: 'transaction-images' as const,
        storagePath: im.storagePath,
        originalFileName: im.originalFileName,
        mimeType: im.mimeType,
        fileSizeBytes: im.size,
        checksum: im.checksum,
        createdAt: im.createdAt
      })),
      mode,
      true
    ),
    auditLogs: computeTableDiff(params.currentDb.auditLogs, payload.auditLogs, mode, true),
    settings: computeTableDiff(params.currentDb.settings, payload.settings, mode, false)
  };

  const hasFatal = issues.some((i) => i.fatal);
  return {
    valid: !hasFatal,
    mode,
    metadata,
    checksumVerified,
    computedChecksum,
    diffSummary,
    missingImages,
    issues,
    parsedPayload: !hasFatal ? payload : null
  };
}

/**
 * Thực thi khôi phục dữ liệu từ gói JSON / JSON.GZ sau khi đã xác thực 10 bước,
 * tạo bản sao lưu `pre_restore`, xử lý ảnh `missing` và tự động Rollback nếu có lỗi (Mục 2 & Mục 6).
 */
export async function executeJsonRestore(params: {
  fileName: string;
  mimeType: string;
  rawBytes: Uint8Array;
  targetDb: AppDatabaseState;
  mode: RestoreMode;
  confirmationText: string;
  existingStoragePaths?: Set<string>;
  simulateMidRestoreFailure?: boolean;
}): Promise<RestoreExecutionResult> {
  if (params.confirmationText.trim() !== 'XAC NHAN KHOI PHUC') {
    throw new Error('CONFIRMATION_REQUIRED: Vui lòng nhập chính xác "XAC NHAN KHOI PHUC" để xác nhận khôi phục.');
  }

  const preview = await validateAndPreviewJsonBackup({
    fileName: params.fileName,
    mimeType: params.mimeType,
    rawBytes: params.rawBytes,
    currentDb: params.targetDb,
    mode: params.mode,
    existingStoragePaths: params.existingStoragePaths
  });

  if (!preview.valid || !preview.parsedPayload || !preview.metadata) {
    const fatalMsg = preview.issues
      .filter((i) => i.fatal)
      .map((i) => `[Bước ${i.step} - ${i.code}] ${i.message}`)
      .join(' | ');
    throw new Error(`VALIDATION_FAILED: Không thể khôi phục do lỗi dữ liệu: ${fatalMsg}`);
  }

  // Tạo bản sao lưu pre_restore trước khi chạm vào dữ liệu hiện tại
  const preRestoreArtifact = await exportJsonOrGzipBackup(params.targetDb, 'json');
  const nowIso = new Date().toISOString();
  const preRestoreId = `pre-restore-${Date.now()}`;
  const preRestoreRecord: BackupRecord = {
    id: preRestoreId,
    ownerId: params.targetDb.ownerId,
    backupType: 'pre_restore',
    format: 'json',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: CURRENT_APP_VERSION,
    status: 'completed',
    startedAt: nowIso,
    completedAt: nowIso,
    filePath: `${params.targetDb.ownerId}/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}/${preRestoreId}.json`,
    fileSize: preRestoreArtifact.bytes.byteLength,
    checksum: preRestoreArtifact.payload.metadata.checksum,
    recordCounts: preRestoreArtifact.payload.metadata.recordCounts,
    errorMessage: '',
    createdAt: nowIso,
    deletable: false
  };

  const snapshotJson = JSON.stringify({
    classes: params.targetDb.classes,
    students: params.targetDb.students,
    books: params.targetDb.books,
    transactions: params.targetDb.transactions,
    transactionImages: params.targetDb.transactionImages,
    auditLogs: params.targetDb.auditLogs,
    settings: params.targetDb.settings
  });

  // Luôn giữ lại bản sao lưu pre_restore trong danh sách backups
  params.targetDb.backups = [preRestoreRecord, ...(params.targetDb.backups || [])];

  try {
    if (params.simulateMidRestoreFailure) {
      throw new Error('SIMULATED_WRITE_ERROR: Lỗi ghi dữ liệu giữa chừng.');
    }

    const incoming = preview.parsedPayload;
    const missingIds = new Set(preview.missingImages.map((m) => m.id));
    const missingTxIds = new Set(preview.missingImages.map((m) => m.transactionId));

    const mergeTable = <T extends { id: string }>(
      currentArr: T[],
      incomingArr: T[],
      keepHistoryOnly = false
    ): T[] => {
      if (params.mode === 'replace_all' && !keepHistoryOnly) {
        return JSON.parse(JSON.stringify(incomingArr)) as T[];
      }
      const result = JSON.parse(JSON.stringify(currentArr || [])) as T[];
      const indexById = new Map<string, number>();
      result.forEach((item, idx) => indexById.set(item.id, idx));

      for (const row of incomingArr) {
        const existingIndex = indexById.get(row.id);
        if (existingIndex === undefined) {
          result.push(JSON.parse(JSON.stringify(row)) as T);
          indexById.set(row.id, result.length - 1);
        } else if (params.mode === 'merge_uuid' && !keepHistoryOnly) {
          result[existingIndex] = { ...result[existingIndex], ...row };
        }
      }
      return result;
    };

    params.targetDb.classes = mergeTable(params.targetDb.classes, incoming.classes, false);
    params.targetDb.students = mergeTable(params.targetDb.students, incoming.students, false);
    params.targetDb.books = mergeTable(params.targetDb.books, incoming.books, false);

    const incomingTransactionsWithMissingFlag: TransactionRecord[] = incoming.transactions.map((tx) => ({
      ...tx,
      missingImage: missingTxIds.has(tx.id) || Boolean(tx.missingImage)
    }));

    params.targetDb.transactions = mergeTable(
      params.targetDb.transactions,
      incomingTransactionsWithMissingFlag,
      params.mode !== 'replace_all'
    );

    const incomingImageRecords: TransactionImageRecord[] = incoming.transactionImages.map((im) => ({
      id: im.id,
      ownerId: im.createdBy || params.targetDb.ownerId,
      transactionId: im.transactionId,
      bucketName: 'transaction-images',
      storagePath: im.storagePath,
      originalFileName: im.originalFileName,
      mimeType: im.mimeType,
      fileSizeBytes: im.size,
      checksum: im.checksum,
      missingInStorage: missingIds.has(im.id),
      createdAt: im.createdAt
    }));

    params.targetDb.transactionImages = mergeTable(
      params.targetDb.transactionImages,
      incomingImageRecords,
      params.mode !== 'replace_all'
    );

    params.targetDb.auditLogs = mergeTable(params.targetDb.auditLogs, incoming.auditLogs, true);
    params.targetDb.settings = mergeTable(params.targetDb.settings, incoming.settings, false);

    const finalCounts: BackupRecordCounts = {
      classes: params.targetDb.classes.length,
      students: params.targetDb.students.length,
      books: params.targetDb.books.length,
      transactions: params.targetDb.transactions.length,
      transactionImages: params.targetDb.transactionImages.length,
      auditLogs: params.targetDb.auditLogs.length,
      settings: params.targetDb.settings.length
    };

    return {
      ok: true,
      mode: params.mode,
      preRestoreBackup: preRestoreRecord,
      diffSummary: preview.diffSummary,
      missingImages: preview.missingImages,
      finalCounts,
      rolledBack: false,
      issues: preview.issues
    };
  } catch (err) {
    // Rollback dữ liệu về đúng trạng thái trong snapshot pre_restore
    const restored = JSON.parse(snapshotJson) as Omit<AppDatabaseState, 'ownerId' | 'backups'>;
    params.targetDb.classes = restored.classes;
    params.targetDb.students = restored.students;
    params.targetDb.books = restored.books;
    params.targetDb.transactions = restored.transactions;
    params.targetDb.transactionImages = restored.transactionImages;
    params.targetDb.auditLogs = restored.auditLogs;
    params.targetDb.settings = restored.settings;

    throw new Error(
      `RESTORE_ROLLED_BACK: Quá trình khôi phục gặp lỗi và đã được Rollback an toàn về bản sao lưu pre_restore (${preRestoreRecord.id}): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
