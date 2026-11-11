import { BookRecord, StudentRecord, TransactionRecord, PaymentStatusLabel } from '../types/database';

export function normalizeVN(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatVND(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  const sign = num < 0 ? '-' : '';
  const absStr = Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${absStr} ₫`;
}

export function computeStudentBookStatus(
  student: StudentRecord,
  book: BookRecord,
  allTransactions: TransactionRecord[]
) {
  const txs = (allTransactions || []).filter(
    (t) => t.studentId === student.id && t.bookId === book.id
  );
  const validTxs = txs.filter((t) => t.status !== 'Đã hủy');
  const cancelledTxs = txs.filter((t) => t.status === 'Đã hủy');

  let lockedPrice = Number(book.price) || 0;
  if (validTxs.length > 0) {
    const sorted = [...validTxs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    if (sorted[0].bookPriceSnapshot !== undefined) {
      lockedPrice = Number(sorted[0].bookPriceSnapshot);
    }
  }

  let collected = 0;
  let discount = 0;
  let refunded = 0;
  let hasReturnBook = false;

  for (const t of validTxs) {
    const amt = Number(t.amountReceived) || 0;
    if (t.type === 'Thu tiền' || t.type === 'Điều chỉnh') collected += amt;
    else if (t.type === 'Miễn hoặc giảm') discount += amt;
    else if (t.type === 'Hoàn tiền') refunded += amt;
    else if (t.type === 'Trả sách') hasReturnBook = true;
  }

  const netReceived = Math.max(0, collected - refunded);
  const effectiveDue = hasReturnBook ? 0 : Math.max(0, lockedPrice - discount);
  const shortfall = Math.max(0, effectiveDue - netReceived);
  const overpaid = Math.max(0, netReceived - effectiveDue);

  let status: PaymentStatusLabel = 'Chưa đóng';
  if (hasReturnBook) status = 'Đã trả sách';
  else if (refunded > 0 && netReceived === 0) status = 'Đã hoàn tiền';
  else if (discount > 0 && netReceived === 0) status = 'Miễn hoặc giảm';
  else if (netReceived > effectiveDue && effectiveDue >= 0) status = 'Đóng dư';
  else if (effectiveDue > 0 && netReceived === effectiveDue) status = 'Đã đóng đủ';
  else if (discount >= lockedPrice && lockedPrice > 0) status = 'Miễn hoặc giảm';
  else if (netReceived > 0 && netReceived < effectiveDue) status = 'Đóng một phần';
  else if (validTxs.length === 0 && cancelledTxs.length > 0) status = 'Chưa đóng';

  return {
    studentId: student.id,
    bookId: book.id,
    lockedPrice,
    effectiveDue,
    collected,
    discount,
    refunded,
    netReceived,
    shortfall,
    overpaid,
    status,
    validTransactions: validTxs,
    allTransactions: txs
  };
}
