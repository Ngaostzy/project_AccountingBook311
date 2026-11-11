import React, { useEffect, useState } from 'react';
import { INITIAL_REAL_BOOKS, INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS, attachOwnerToRoster } from './data/realNotionRoster';
import {
  AppDatabaseState,
  exportJsonOrGzipBackup,
  validateAndPreviewJsonBackup
} from './lib/jsonBackup';
import {
  createBackupSignedDownloadUrl,
  deleteOwnBackup,
  isSupabaseConfigured,
  supabase,
  uploadOnlineBackupAndRecordMetadata
} from './lib/supabaseClient';
import { importNotionRosterToSupabase } from './lib/migrationService';
import { BackupFormat, BackupRecord, BookRecord, ClassRecord, StudentRecord } from './types/database';

export default function App() {
  const [ownerId, setOwnerId] = useState<string>('');
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [syncMessage, setSyncMessage] = useState<string>('');

  useEffect(() => {
    document.title = 'THU TIỀN SÁCH — Quản lý thu tiền sách học sinh';

    async function initOwnerAndRoster() {
      let resolvedOwner = 'local-session-owner';
      if (isSupabaseConfigured && supabase) {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (user?.id) {
          resolvedOwner = user.id;
        }
      }
      setOwnerId(resolvedOwner);
      const attached = attachOwnerToRoster(resolvedOwner, INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS);
      setClasses(attached.classes);
      setStudents(attached.students);
      setBooks(
        INITIAL_REAL_BOOKS.map((b) => ({
          ...b,
          ownerId: resolvedOwner
        }))
      );
    }

    void initOwnerAndRoster();
  }, []);

  const buildCurrentDbState = (): AppDatabaseState => ({
    ownerId: ownerId || 'local-session-owner',
    classes,
    students,
    books,
    transactions: [],
    transactionImages: [],
    auditLogs: [],
    settings: [
      {
        id: 'SETTINGS_MAIN',
        ownerId: ownerId || 'local-session-owner',
        appName: 'THU TIỀN SÁCH',
        currency: 'VND',
        timezone: 'Asia/Ho_Chi_Minh',
        autoBackupEnabled: false,
        autoBackupCronConfigured: false,
        migrationCompleted: false,
        migratedAt: null,
        updatedAt: new Date().toISOString()
      }
    ],
    backups
  });

  const handleSyncToSupabase = async () => {
    try {
      setSyncMessage('Đang đồng bộ danh sách lớp và học sinh lên Supabase...');
      const res = await importNotionRosterToSupabase(INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS);
      setSyncMessage(
        `Đã đồng bộ thành công ${res.targetCounts.classes} lớp và ${res.targetCounts.students} học sinh (owner_id: ${res.ownerId}).`
      );
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleQuickCloudBackup = async (format: Extract<BackupFormat, 'json' | 'json_gzip'>) => {
    try {
      const dbState = buildCurrentDbState();
      const startedAt = new Date().toISOString();
      const artifact = await exportJsonOrGzipBackup(dbState, format);
      const check = await validateAndPreviewJsonBackup({
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        rawBytes: artifact.bytes,
        currentDb: dbState
      });
      if (!check.valid) {
        throw new Error('Kiểm tra tính toàn vẹn bản sao lưu thất bại.');
      }
      if (isSupabaseConfigured) {
        const record = await uploadOnlineBackupAndRecordMetadata({
          backupId: `bk-${Date.now()}`,
          backupType: 'manual',
          format: artifact.actualFormat,
          schemaVersion: artifact.payload.metadata.schemaVersion,
          appVersion: artifact.payload.metadata.appVersion,
          startedAt,
          bytes: artifact.bytes,
          mimeType: artifact.mimeType,
          checksum: artifact.payload.metadata.checksum,
          recordCounts: artifact.payload.metadata.recordCounts
        });
        setBackups((prev) => [record, ...prev]);
        const signedUrl = await createBackupSignedDownloadUrl(record.filePath, 900);
        setSyncMessage(`Đã lưu ${artifact.fileName} lên Supabase Storage (${signedUrl.slice(0, 36)}...)`);
      } else {
        setSyncMessage(artifact.noticeMessage);
      }
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteCloudBackup = async (bk: BackupRecord) => {
    try {
      if (isSupabaseConfigured) {
        await deleteOwnBackup(bk.id, bk.filePath);
      }
      setBackups((prev) => prev.filter((item) => item.id !== bk.id));
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', margin: 0, padding: 0, background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif' }}>
      {isSupabaseConfigured && (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '8px 12px', background: '#f0fdfa', borderBottom: '1px solid #99f6e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#0f766e', fontWeight: 700 }}>
            ● Supabase ({classes.length} lớp • {students.length} HS • Owner: {ownerId.slice(0, 8)})
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => void handleQuickCloudBackup('json')}
              style={{ minHeight: 34, padding: '4px 8px', borderRadius: 8, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}
            >
              Sao lưu JSON
            </button>
            <button
              type="button"
              onClick={() => void handleQuickCloudBackup('json_gzip')}
              style={{ minHeight: 34, padding: '4px 8px', borderRadius: 8, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}
            >
              JSON.GZ
            </button>
            <button
              type="button"
              onClick={handleSyncToSupabase}
              style={{ minHeight: 34, padding: '4px 10px', borderRadius: 8, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}
            >
              Đồng bộ
            </button>
          </div>
        </div>
      )}
      {backups.length > 0 && (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '4px 12px', background: '#f0fdf4', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Bản sao lưu mới nhất: {backups[0].filePath} ({backups[0].format})</span>
          {backups[0].deletable && (
            <button
              type="button"
              onClick={() => void handleDeleteCloudBackup(backups[0])}
              style={{ border: 'none', background: 'transparent', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}
            >
              Xóa
            </button>
          )}
        </div>
      )}
      {syncMessage && (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '6px 12px', background: '#fffbeb', color: '#92400e', fontSize: 12, fontWeight: 600 }}>
          {syncMessage}
        </div>
      )}
      <iframe
        src="/standalone-preview.html"
        title="Thu tiền sách"
        style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      />
    </div>
  );
}
