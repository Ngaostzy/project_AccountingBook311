import { supabase, getAuthenticatedOwnerId } from './supabaseClient';
import { normalizeVN } from './engine';
import { attachOwnerToRoster, INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS } from '../data/realNotionRoster';
import {
  ClassSeedInput,
  StudentSeedInput,
  ClassRecord,
  StudentRecord,
  BookRecord,
  TransactionRecord,
  ClassDbRow,
  StudentDbRow,
  BookDbRow,
  TransactionDbRow
} from '../types/database';

/**
 * Ánh xạ tường minh từ Frontend (camelCase `ownerId`) sang Database (snake_case `owner_id`)
 */
export function toClassDbRow(record: ClassRecord): ClassDbRow {
  return {
    id: record.id,
    owner_id: record.ownerId,
    name: record.name,
    grade: record.grade,
    teacher_name: record.teacherName,
    school_year: record.schoolYear,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

export function fromClassDbRow(row: ClassDbRow): ClassRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    grade: row.grade,
    teacherName: row.teacher_name,
    schoolYear: row.school_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toStudentDbRow(record: StudentRecord): StudentDbRow {
  return {
    id: record.id,
    owner_id: record.ownerId,
    class_id: record.classId,
    class_name: record.className,
    stt: record.stt,
    full_name: record.fullName,
    full_name_normalized: normalizeVN(record.fullName),
    grade: record.grade,
    school: record.school,
    facebook_url: record.facebookUrl,
    parent_name: record.parentName,
    parent_phone: record.parentPhone,
    status: record.status,
    note: record.note,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

export function fromStudentDbRow(row: StudentDbRow): StudentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    classId: row.class_id,
    className: row.class_name,
    stt: row.stt,
    fullName: row.full_name,
    grade: row.grade,
    school: row.school,
    facebookUrl: row.facebook_url,
    parentName: row.parent_name,
    parentPhone: row.parent_phone,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toBookDbRow(record: BookRecord): BookDbRow {
  return {
    id: record.id,
    owner_id: record.ownerId,
    code: record.code,
    title: record.title,
    title_normalized: normalizeVN(record.title),
    grade: record.grade,
    price: record.price,
    status: record.status,
    note: record.note,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

export function toTransactionDbRow(record: TransactionRecord): TransactionDbRow {
  return {
    id: record.id,
    transaction_code: record.transactionCode,
    idempotency_key: record.idempotencyKey,
    owner_id: record.ownerId,
    student_id: record.studentId,
    book_id: record.bookId,
    class_id: record.classId,
    transaction_type: record.type,
    payment_method: record.paymentMethod,
    book_price_snapshot: record.bookPriceSnapshot,
    amount_due: record.amountDue,
    amount_received: record.amountReceived,
    balance_after: record.balanceAfter,
    note: record.note,
    status: record.status,
    cancel_reason: record.cancelReason,
    cancelled_at: record.cancelledAt ?? null,
    ref_transaction_id: record.refTransactionId ? record.refTransactionId : null,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

/**
 * Nhập danh sách lớp và học sinh từ dữ liệu nguồn Notion vào Supabase,
 * tự động lấy user.id từ supabase.auth.getUser() làm chủ sở hữu (ownerId -> owner_id).
 */
export async function importNotionRosterToSupabase(
  seedClasses: ClassSeedInput[] = INITIAL_REAL_CLASSES,
  seedStudents: StudentSeedInput[] = INITIAL_REAL_STUDENTS
) {
  const authenticatedOwnerId = await getAuthenticatedOwnerId();
  const { classes, students } = attachOwnerToRoster(authenticatedOwnerId, seedClasses, seedStudents);
  return await migrateExistingDataToSupabase({
    classes,
    students,
    books: [],
    transactions: []
  });
}

export async function migrateExistingDataToSupabase(payload: {
  classes: ClassRecord[];
  students: StudentRecord[];
  books: BookRecord[];
  transactions: TransactionRecord[];
}) {
  if (!supabase) {
    throw new Error('Vui lòng cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trước khi chuyển dữ liệu');
  }

  // Luôn lấy ID của người đang đăng nhập bằng Supabase Auth (supabase.auth.getUser())
  const authenticatedOwnerId = await getAuthenticatedOwnerId();

  const sourceCounts = {
    classes: payload.classes.length,
    students: payload.students.length,
    books: payload.books.length,
    transactions: payload.transactions.length
  };

  if (payload.classes.length > 0) {
    const classRows: ClassDbRow[] = payload.classes.map((c) =>
      toClassDbRow({ ...c, ownerId: authenticatedOwnerId })
    );
    const { error } = await supabase.from('classes').upsert(classRows, { onConflict: 'id' });
    if (error) throw error;
  }

  if (payload.students.length > 0) {
    const studentRows: StudentDbRow[] = payload.students.map((s) =>
      toStudentDbRow({ ...s, ownerId: authenticatedOwnerId })
    );
    const { error } = await supabase.from('students').upsert(studentRows, { onConflict: 'id' });
    if (error) throw error;
  }

  if (payload.books.length > 0) {
    const bookRows: BookDbRow[] = payload.books.map((b) =>
      toBookDbRow({ ...b, ownerId: authenticatedOwnerId })
    );
    const { error } = await supabase.from('books').upsert(bookRows, { onConflict: 'id' });
    if (error) throw error;
  }

  if (payload.transactions.length > 0) {
    const txRows: TransactionDbRow[] = payload.transactions.map((t) =>
      toTransactionDbRow({ ...t, ownerId: authenticatedOwnerId })
    );
    const { error } = await supabase.from('transactions').upsert(txRows, { onConflict: 'id' });
    if (error) throw error;
  }

  // Đối chiếu số lượng bản ghi sau khi chuyển theo đúng cột owner_id của người đang đăng nhập
  const [cRes, sRes, bRes, tRes] = await Promise.all([
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('owner_id', authenticatedOwnerId),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('owner_id', authenticatedOwnerId),
    supabase.from('books').select('id', { count: 'exact', head: true }).eq('owner_id', authenticatedOwnerId),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('owner_id', authenticatedOwnerId)
  ]);

  const targetCounts = {
    classes: cRes.count ?? 0,
    students: sRes.count ?? 0,
    books: bRes.count ?? 0,
    transactions: tRes.count ?? 0
  };

  const matched =
    targetCounts.classes >= sourceCounts.classes &&
    targetCounts.students >= sourceCounts.students &&
    targetCounts.books >= sourceCounts.books &&
    targetCounts.transactions >= sourceCounts.transactions;

  if (!matched) {
    throw new Error('Đối chiếu bản ghi chưa khớp, chưa đánh dấu hoàn tất chuyển đổi!');
  }

  return { ok: true, ownerId: authenticatedOwnerId, sourceCounts, targetCounts };
}
