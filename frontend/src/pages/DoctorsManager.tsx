import { useEffect, useState } from 'react';
import { usePageMeta } from '../layout/PageMeta';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { SkeletonCards } from '../components/Skeleton';

export interface DoctorSchedule {
  day: string;
  start_time: string;
  end_time: string;
  slot_duration_min: number;
}

export interface Doctor {
  id: string;
  name: string;
  title: string;
  fee_pkr: number;
  room: string | null;
  appointment_mode: string;
  department: {
    id: string;
    name: string;
    building: string;
    floor: string;
  };
  service_id: string | null;
  duration_min: number;
  schedules: DoctorSchedule[];
}

export interface Department {
  id: string;
  name: string;
  building: string;
  floor: string;
  description: string;
}

export default function DoctorsManager() {
  const { user } = useAuth();
  const isStaff = user?.role === 'staff';
  usePageMeta(isStaff ? 'Doctor OPD Roster (Read-Only)' : 'Doctor OPD Shifts (Manage)');

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get<{ doctors: Doctor[] }>('/doctors'),
      api.get<{ departments: Department[] }>('/departments'),
    ])
      .then(([docRes, deptRes]) => {
        if (alive) {
          setDoctors(docRes.doctors);
          setDepartments(deptRes.departments);
        }
      })
      .catch((err) => console.error('Failed to load doctors and schedules:', err))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filtered = doctors.filter((doc) => {
    if (selectedDept !== 'all' && doc.department.id !== selectedDept) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = doc.name.toLowerCase().includes(q);
      const matchTitle = doc.title.toLowerCase().includes(q);
      const matchDept = doc.department.name.toLowerCase().includes(q);
      if (!matchName && !matchTitle && !matchDept) return false;
    }
    return true;
  });

  return (
    <div className="page" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-main, #0f172a)' }}>
              {isStaff ? 'Doctor OPD Roster' : 'Specialist Consultants & OPD Shifts'}
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                background: isStaff ? 'rgba(16, 185, 129, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                color: isStaff ? '#059669' : '#2563eb',
                border: `1px solid ${isStaff ? 'rgba(16, 185, 129, 0.25)' : 'rgba(37, 99, 235, 0.25)'}`,
              }}
            >
              {isStaff ? 'Read-Only Roster' : 'Manage Shifts'}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', fontSize: '0.875rem' }}>
            {isStaff
              ? `Reference clinical roster for patient inquiries • ${doctors.length} Doctors across ${departments.length} Departments`
              : `${doctors.length} Verified Medical Specialists across ${departments.length} Clinical Departments`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search doctor or specialty…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm, 4px)',
              border: '1px solid var(--border, #e2e8f0)',
              background: 'var(--bg-card, #ffffff)',
              fontSize: '0.875rem',
              outline: 'none',
              minWidth: '220px',
            }}
          />

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm, 4px)',
              border: '1px solid var(--border, #e2e8f0)',
              background: 'var(--bg-card, #ffffff)',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Departments ({departments.length})</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted, #64748b)' }}>
          No doctors match your search or filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filtered.map((doc) => (
            <div
              key={doc.id}
              style={{
                background: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 'var(--radius, 6px)',
                padding: '18px',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                    {doc.name}
                  </h3>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--primary, #2563eb)', fontWeight: 500 }}>
                    {doc.title}
                  </div>
                </div>
                <div
                  style={{
                    background: '#f1f5f9',
                    color: '#0f172a',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  PKR {doc.fee_pkr.toLocaleString()}
                </div>
              </div>

              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #64748b)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                  <strong>Dept:</strong> {doc.department.name} ({doc.department.building}, {doc.department.floor})
                </div>
                <div>
                  <strong>Location:</strong> Room {doc.room ?? 'OPD Tower'}
                </div>
                <div>
                  <strong>Mode:</strong> {doc.appointment_mode === 'both' ? 'Appointment & Walk-in' : doc.appointment_mode}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', marginBottom: '8px' }}>
                  Weekly OPD Shifts ({doc.schedules.length})
                </div>
                {doc.schedules.length === 0 ? (
                  <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>By on-call appointment</span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {doc.schedules.map((s, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: 'rgba(37, 99, 235, 0.08)',
                          color: '#1d4ed8',
                          border: '1px solid rgba(37, 99, 235, 0.2)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        {s.day}: {s.start_time}–{s.end_time}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
