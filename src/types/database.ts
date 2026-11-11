export type GradeLevel = 10 | 11;

export type TransactionType =
  | 'Thu tiền'
  | 'Hoàn tiền'
  | 'Miễn hoặc giảm'
  | 'Trả sách'
  | 'Điều chỉnh';

export type PaymentMethod = 'Tiền mặt' | 'Chuyển khoản';

export type TransactionStatus = 'Hoạt động' | 'Đã hủy';

export type PaymentStatusLabel =
  | 'Chưa đóng'
  | 'Đóng một phần'
  | 'Đã đóng đủ'
  | 'Đóng dư'
  | 'Miễn hoặc giảm'
  | 'Đã hoàn tiền'
  | 'Đã trả sách'
  | 'Đã hủy';

export type BackupFormat = 'json' | 'json_gzip' | 'full_zip';

export type BackupType = 'manual' | 'automatic' | 'pre_restore' | 'pre_update';

export type BackupStorageDestination = 'device' | 'supabase';

export type RestoreMode = 'add_only' | 'merge_uuid' | 'replace_all';

/**
 * Kiểu dữ liệu nguồn nhập lớp học từ Notion (chưa gắn ownerId).
 */
export interface ClassSeedInput {
  id: string;
  name: string;
  grade: GradeLevel;
  teacherName: string;
  schoolYear: string;
}

/**
 * Kiểu dữ liệu nguồn nhập học sinh từ Notion (chưa gắn ownerId).
 */
export interface StudentSeedInput {
  id: string;
  classId: string;
  className: string;
  stt: number;
  fullName: string;
  grade: GradeLevel;
  school: string;
  facebookUrl: string;
  parentName: string;
  parentPhone: string;
  status: 'studying' | 'inactive';
  note: string;
}

/**
 * Kiểu dữ liệu Lớp học ở Frontend (camelCase, bắt buộc có ownerId).
 */
export interface ClassRecord extends ClassSeedInput {
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Kiểu dữ liệu Học sinh ở Frontend (camelCase, bắt buộc có ownerId).
 */
export interface StudentRecord extends StudentSeedInput {
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookRecord {
  id: string;
  ownerId: string;
  code: string;
  title: string;
  grade: GradeLevel;
  price: number;
  status: 'selling' | 'stopped';
  note: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransactionRecord {
  id: string;
  transactionCode: string;
  idempotencyKey: string;
  ownerId: string;
  studentId: string;
  studentName: string;
  stt: number;
  classId: string;
  className: string;
  grade: GradeLevel;
  bookId: string;
  bookCode: string;
  bookTitle: string;
  bookPriceSnapshot: number;
  amountDue: number;
  amountReceived: number;
  balanceAfter: number;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  imageId: string;
  missingImage?: boolean;
  createdAt: string;
  updatedAt?: string;
  note: string;
  status: TransactionStatus;
  cancelReason: string;
  cancelledAt?: string | null;
  refTransactionId: string;
}

/**
 * Metadata của ảnh giao dịch trong database và trong bản sao lưu JSON (Tuyệt đối không lưu Base64 hay Signed URL).
 */
export interface TransactionImageRecord {
  id: string;
  ownerId: string;
  transactionId: string;
  bucketName: 'transaction-images';
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksum: string;
  width?: number;
  height?: number;
  missingInStorage?: boolean;
  createdAt: string;
}

/**
 * Cấu trúc metadata của ảnh xuất trong mảng `transactionImages` của file sao lưu JSON/JSON.GZ (Mục 2).
 */
export interface BackupTransactionImageMetadata {
  id: string;
  transactionId: string;
  bucket: 'transaction-images';
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: string;
  createdBy: string;
  missing?: boolean;
}

export interface AuditLogRecord {
  id: string;
  ownerId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
}

export interface SafeSettingBackupRecord {
  id: string;
  ownerId: string;
  appName: string;
  currency: 'VND';
  timezone: 'Asia/Ho_Chi_Minh';
  autoBackupEnabled: boolean;
  autoBackupCronConfigured: boolean;
  migrationCompleted: boolean;
  migratedAt?: string | null;
  updatedAt: string;
}

export interface BackupRecordCounts {
  classes: number;
  students: number;
  books: number;
  transactions: number;
  transactionImages: number;
  auditLogs: number;
  settings: number;
}

/**
 * Cấu trúc `metadata` bên trong file sao lưu JSON / JSON.GZ (Mục 1 & Mục 9).
 */
export interface JsonBackupMetadata {
  schemaVersion: string;
  appVersion: string;
  backupVersion: string;
  createdAt: string;
  createdBy: string;
  format: BackupFormat;
  canonicalAlgorithm: string;
  recordCounts: BackupRecordCounts;
  checksum: string;
}

/**
 * Cấu trúc đầy đủ của file sao lưu JSON / JSON.GZ (Mục 1).
 */
export interface JsonBackupPayload {
  metadata: JsonBackupMetadata;
  classes: ClassRecord[];
  students: StudentRecord[];
  books: BookRecord[];
  transactions: TransactionRecord[];
  transactionImages: BackupTransactionImageMetadata[];
  auditLogs: AuditLogRecord[];
  settings: SafeSettingBackupRecord[];
}

/**
 * Bản ghi lịch sử sao lưu ở Frontend (ánh xạ với bảng `public.backups` trong Mục 4).
 */
export interface BackupRecord {
  id: string;
  ownerId: string;
  backupType: BackupType;
  format: BackupFormat;
  schemaVersion: string;
  appVersion: string;
  status: 'pending' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  filePath: string;
  fileSize: number;
  checksum: string;
  recordCounts: BackupRecordCounts;
  errorMessage: string;
  createdAt: string;
  deletable?: boolean;
}

export interface BackupDbRow {
  id: string;
  owner_id: string;
  user_id?: string;
  backup_type: BackupType;
  format: BackupFormat;
  schema_version: string;
  app_version: string;
  status: 'pending' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  file_path: string;
  file_size: number;
  checksum: string;
  record_counts: BackupRecordCounts;
  error_message: string;
  created_at: string;
}

export interface TableDiffCount {
  add: number;
  update: number;
  skip: number;
  totalIncoming: number;
}

export interface RestoreDiffSummary {
  classes: TableDiffCount;
  students: TableDiffCount;
  books: TableDiffCount;
  transactions: TableDiffCount;
  transactionImages: TableDiffCount;
  auditLogs: TableDiffCount;
  settings: TableDiffCount;
}

export interface RestoreValidationIssue {
  step: number;
  code: string;
  field: string;
  message: string;
  fatal: boolean;
}

export interface RestorePreviewResult {
  valid: boolean;
  mode: RestoreMode;
  metadata: JsonBackupMetadata | null;
  checksumVerified: boolean;
  computedChecksum: string;
  diffSummary: RestoreDiffSummary;
  missingImages: BackupTransactionImageMetadata[];
  issues: RestoreValidationIssue[];
  parsedPayload: JsonBackupPayload | null;
}

export interface RestoreExecutionResult {
  ok: boolean;
  mode: RestoreMode;
  preRestoreBackup: BackupRecord;
  diffSummary: RestoreDiffSummary;
  missingImages: BackupTransactionImageMetadata[];
  finalCounts: BackupRecordCounts;
  rolledBack: boolean;
  issues: RestoreValidationIssue[];
}

/**
 * Kiểu dữ liệu dòng bảng trong Supabase PostgreSQL (snake_case, bắt buộc có owner_id).
 */
export interface ClassDbRow {
  id: string;
  owner_id: string;
  name: string;
  grade: GradeLevel;
  teacher_name: string;
  school_year: string;
  created_at?: string;
  updated_at?: string;
}

export interface StudentDbRow {
  id: string;
  owner_id: string;
  class_id: string;
  class_name: string;
  stt: number;
  full_name: string;
  full_name_normalized: string;
  grade: GradeLevel;
  school: string;
  facebook_url: string;
  parent_name: string;
  parent_phone: string;
  status: 'studying' | 'inactive';
  note: string;
  created_at?: string;
  updated_at?: string;
}

export interface BookDbRow {
  id: string;
  owner_id: string;
  code: string;
  title: string;
  title_normalized: string;
  grade: GradeLevel;
  price: number;
  status: 'selling' | 'stopped';
  note: string;
  created_at?: string;
  updated_at?: string;
}

export interface TransactionDbRow {
  id: string;
  transaction_code: string;
  idempotency_key: string;
  owner_id: string;
  student_id: string;
  book_id: string;
  class_id: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  book_price_snapshot: number;
  amount_due: number;
  amount_received: number;
  balance_after: number;
  note: string;
  status: TransactionStatus;
  cancel_reason: string;
  cancelled_at: string | null;
  ref_transaction_id: string | null;
  created_at: string;
  updated_at?: string;
}
