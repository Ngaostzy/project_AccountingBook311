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

/**
 * Kiểu dữ liệu nguồn nhập lớp học từ Notion (chưa gắn ownerId).
 * Khi lưu vào ứng dụng hoặc đồng bộ lên Supabase, service sẽ lấy user.id từ supabase.auth.getUser() để gắn thành ownerId.
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
  createdAt: string;
  updatedAt?: string;
  note: string;
  status: TransactionStatus;
  cancelReason: string;
  cancelledAt?: string | null;
  refTransactionId: string;
}

export interface TransactionImageRecord {
  id: string;
  ownerId: string;
  transactionId: string;
  bucketName: 'transaction-images';
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  createdAt: string;
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

export interface BackupRecord {
  id: string;
  ownerId: string;
  backupType: 'manual_local' | 'manual_cloud' | 'auto_weekly' | 'pre_restore_snapshot';
  status: 'pending' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  recordCounts: Record<string, number>;
  filePath: string;
  checksum: string;
  errorMessage?: string;
  createdAt: string;
}

/**
 * Kiểu dữ liệu dòng bảng trong Supabase PostgreSQL (snake_case, bắt buộc có owner_id).
 * Ánh xạ 1-1: Frontend `ownerId` <-> Database `owner_id`.
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
