import { CalendarDays, Hospital, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../lib/session';

const roleLabels = {
  DOCTOR: 'Doctor Desk',
  RECEPTIONIST: 'Reception Desk',
  PHARMACIST: 'Pharmacy Desk',
  ADMIN: 'Admin Console',
};

const roleColors = {
  DOCTOR: '#0288d1',
  RECEPTIONIST: '#f57c00',
  PHARMACIST: '#7b1fa2',
  ADMIN: '#1976d2',
};

export default function Header() {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-icon" style={{ backgroundColor: `${roleColors[user?.role] || '#2b2f77'}20` }}>
          <Hospital size={18} style={{ color: roleColors[user?.role] || '#2b2f77' }} />
        </span>
        <div>
          <h1>Medi-D OPD</h1>
          <p>{roleLabels[user?.role] || 'Clinical Workstation'}</p>
        </div>
      </div>

      <div className="header-actions">
        <div className="meta-chip">
          <CalendarDays size={14} />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>
        
        <div className="meta-chip role-chip" style={{ backgroundColor: `${roleColors[user?.role] || '#2b2f77'}25`, borderColor: roleColors[user?.role] || '#2b2f77' }}>
          <ShieldCheck size={14} style={{ color: roleColors[user?.role] || '#2b2f77' }} />
          <span>{roleLabels[user?.role] || 'Staff'}</span>
        </div>

        <div className="user-meta">
          <strong>{user?.fullName || user?.username}</strong>
          <small>@{user?.username}</small>
        </div>

        <button 
          type="button" 
          className="btn btn-ghost" 
          onClick={handleLogout}
          title="Logout"
        >
          <LogOut size={15} />
          <span style={{ display: 'none' }}>Logout</span>
        </button>
      </div>
    </header>
  );
}
