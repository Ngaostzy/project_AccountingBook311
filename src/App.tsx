import React, { useEffect, useState } from 'react';
import { INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS, attachOwnerToRoster } from './data/realNotionRoster';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import { importNotionRosterToSupabase } from './lib/migrationService';
import { ClassRecord, StudentRecord } from './types/database';

export default function App() {
  const [ownerId, setOwnerId] = useState<string>('');
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [syncMessage, setSyncMessage] = useState<string>('');

  useEffect(() => {
    document.title = 'THU TIỀN SÁCH — Quản lý thu tiền sách học sinh';

    async function initOwnerAndRoster() {
      if (isSupabaseConfigured && supabase) {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (user?.id) {
          setOwnerId(user.id);
          const attached = attachOwnerToRoster(user.id, INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS);
          setClasses(attached.classes);
          setStudents(attached.students);
          return;
        }
      }
      // Khi chưa cấu hình Supabase hoặc đang chạy cục bộ, sử dụng phiên cục bộ tạm thời
      const localOwnerId = 'local-session-owner';
      setOwnerId(localOwnerId);
      const attached = attachOwnerToRoster(localOwnerId, INITIAL_REAL_CLASSES, INITIAL_REAL_STUDENTS);
      setClasses(attached.classes);
      setStudents(attached.students);
    }

    void initOwnerAndRoster();
  }, []);

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

  return (
    <div style={{ width: '100%', minHeight: '100vh', margin: 0, padding: 0, background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif' }}>
      {isSupabaseConfigured && (
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '8px 12px', background: '#f0fdfa', borderBottom: '1px solid #99f6e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#0f766e', fontWeight: 700 }}>
            ● Supabase ({classes.length} lớp • {students.length} HS • Owner: {ownerId.slice(0, 8)})
          </span>
          <button
            type="button"
            onClick={handleSyncToSupabase}
            style={{ minHeight: 36, padding: '4px 10px', borderRadius: 8, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Đồng bộ Supabase
          </button>
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
