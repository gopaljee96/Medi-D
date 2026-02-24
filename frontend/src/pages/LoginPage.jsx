import { useMemo, useState } from 'react';
import { ArrowLeft, KeyRound, Pill, Shield, Stethoscope, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import { saveSession } from '../lib/session';

const roleCards = [
  { 
    role: 'DOCTOR', 
    title: 'Doctor Desk', 
    subtitle: 'Consultation and prescribing',
    icon: Stethoscope,
    color: '#0d9488'
  },
  { 
    role: 'RECEPTIONIST', 
    title: 'Reception Desk', 
    subtitle: 'Patient intake and appointments',
    icon: UserRound,
    color: '#ea580c'
  },
  { 
    role: 'PHARMACIST', 
    title: 'Pharmacy Desk', 
    subtitle: 'Medicine and dispense workflow',
    icon: Pill,
    color: '#4f46e5'
  },
  { 
    role: 'ADMIN', 
    title: 'Admin Console', 
    subtitle: 'Staff, roster, and controls',
    icon: Shield,
    color: '#0f766e'
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedRoleInfo = useMemo(
    () => roleCards.find((roleCard) => roleCard.role === selectedRole),
    [selectedRole],
  );

  const handleRoleSelect = (roleCard) => {
    setSelectedRole(roleCard.role);
    setUsername('');
    setPassword('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await login({ username, password });

      if (!response?.token || !response?.role) {
        throw new Error(response?.message || 'Invalid login response');
      }

      if (response.role !== selectedRole) {
        throw new Error(`This account belongs to ${response.role}. Please select the correct role.`);
      }

      saveSession(response);
      navigate(`/${response.role.toLowerCase()}`);
    } catch (apiError) {
      const serverMessage = apiError?.response?.data?.message;
      const isNetworkIssue = !apiError?.response;
      setError(
        serverMessage ||
          (isNetworkIssue
            ? 'Cannot reach backend. Start Medico backend on port 8080.'
            : apiError.message || 'Login failed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const inCredentialStep = Boolean(selectedRole);

  return (
    <div className="login-shell">
      <div className="login-topbar">Medi-D OPD</div>
      <main className="login-main">
        <section className="panel login-panel-wide">
          <header className="login-head">
            <h1>Medi-D Clinical Dashboard</h1>
            <p>Secure access for Admin, Reception, Doctor, and Pharmacy operations.</p>
          </header>

          {!inCredentialStep ? (
            <>
              <div className="panel-title">
                <h3>Select Role</h3>
              </div>
              <div className="role-grid role-grid-wide">
                {roleCards.map((roleCard) => (
                  <button
                    key={roleCard.role}
                    type="button"
                    className="role-card role-card-pick"
                    onClick={() => handleRoleSelect(roleCard)}
                    style={{ borderColor: `${roleCard.color}60`, backgroundColor: `${roleCard.color}0a` }}
                  >
                    <span className="role-card-icon" style={{ color: roleCard.color, backgroundColor: `${roleCard.color}18` }}>
                      <roleCard.icon size={20} />
                    </span>
                    <strong style={{ color: roleCard.color }}>{roleCard.title}</strong>
                    <span>{roleCard.subtitle}</span>
                  </button>
                ))}
              </div>
              <p className="admin-hint">Use your assigned organization credentials. Demo passwords are not shown in production UI.</p>
            </>
          ) : (
            <>
              <button className="inline-link" type="button" onClick={() => setSelectedRole('')}>
                <ArrowLeft size={15} />
                Back to role selection
              </button>

              <div className="panel-title">
                <Shield size={16} />
                <h3>{selectedRoleInfo?.title} Login</h3>
              </div>
              <p className="workspace-note">Access is role-based. If role mismatch appears, contact admin for account mapping.</p>

              <form onSubmit={handleSubmit} className="form-grid">
                <label className="field">
                  <span>Username</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter username"
                    required
                    autoComplete="username"
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                  />
                </label>

                {error ? <div className="alert alert-error">{error}</div> : null}

                <button 
                  className="btn btn-primary btn-large" 
                  type="submit" 
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <KeyRound size={16} />
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
