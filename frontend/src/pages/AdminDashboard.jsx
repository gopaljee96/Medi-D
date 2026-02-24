import { useEffect, useMemo, useState } from 'react';
import {
  createAdminMedicine,
  createAdminPatient,
  createDoctor,
  createStaff,
  deleteAdminMedicine,
  deleteAdminPatient,
  deleteDoctor,
  listAdminMedicines,
  listAdminPatients,
  listDoctors,
  listStaff,
  resetStaffPassword,
  syncDoctorRecords,
  updateAdminMedicine,
  updateAdminPatient,
  updateDoctor,
} from '../lib/api';
import { normalizePhoneForSubmit, sanitizePhoneInput } from '../lib/phone';

const roles = ['DOCTOR', 'RECEPTIONIST', 'PHARMACIST', 'ADMIN'];
const shiftOptions = ['Morning (06:00-14:00)', 'Afternoon (14:00-22:00)', 'Night (22:00-06:00)'];

const ROSTER_PREFS_KEY = 'admin.rosterPrefs';
const DOCTOR_CONTACTS_KEY = 'admin.doctorContacts';

function extractMessage(error, fallbackMessage) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    (typeof error?.response?.data === 'string' ? error.response.data : '') ||
    fallbackMessage
  );
}

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminDashboard() {
  const [registerForm, setRegisterForm] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'DOCTOR',
  });
  const [staff, setStaff] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [medicines, setMedicines] = useState([]);

  const [doctorForm, setDoctorForm] = useState({
    name: '',
    specialization: '',
    phone: '',
    email: '',
    weekdayShift: '',
    weekendShift: '',
  });
  const [doctorEdit, setDoctorEdit] = useState({
    id: '',
    name: '',
    specialization: '',
    phone: '',
    email: '',
    weekdayShift: '',
    weekendShift: '',
  });
  const [showDoctorEdit, setShowDoctorEdit] = useState(false);
  const [showDoctorCreate, setShowDoctorCreate] = useState(true);
  const [doctorContacts, setDoctorContacts] = useState(() => loadJsonStorage(DOCTOR_CONTACTS_KEY, {}));

  const [passwordForm, setPasswordForm] = useState({ userId: '', newPassword: '' });
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showStaffCreate, setShowStaffCreate] = useState(true);

  const [patientForm, setPatientForm] = useState({ name: '', email: '', phone: '', medicalHistory: '' });
  const [patientEdit, setPatientEdit] = useState({ id: '', name: '', email: '', phone: '', medicalHistory: '' });
  const [showPatientCreate, setShowPatientCreate] = useState(false);
  const [showPatientEdit, setShowPatientEdit] = useState(false);

  const [medicineForm, setMedicineForm] = useState({ name: '', stock: '', expiry: '' });
  const [medicineEdit, setMedicineEdit] = useState({ id: '', name: '', stock: '', expiry: '' });
  const [showMedicineCreate, setShowMedicineCreate] = useState(false);
  const [showMedicineEdit, setShowMedicineEdit] = useState(false);

  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [savingDoctor, setSavingDoctor] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [savingMedicine, setSavingMedicine] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [syncingDoctors, setSyncingDoctors] = useState(false);
  const [deletingDoctorId, setDeletingDoctorId] = useState(null);
  const [deletingPatientId, setDeletingPatientId] = useState(null);
  const [deletingMedicineId, setDeletingMedicineId] = useState(null);
  const [activeTab, setActiveTab] = useState('staff');
  const [operationsView, setOperationsView] = useState('patients');
  const [selectedRosterDoctorId, setSelectedRosterDoctorId] = useState('');
  const [rosterDayType, setRosterDayType] = useState('WEEKDAY');
  const [rosterShift, setRosterShift] = useState('');
  const [doctorSearch, setDoctorSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [showCoverageDetails, setShowCoverageDetails] = useState(false);

  const [rosterPrefs, setRosterPrefs] = useState(() => loadJsonStorage(ROSTER_PREFS_KEY, {}));

  const selectedRosterDoctor = useMemo(
    () => doctors.find((doctor) => String(doctor.id) === selectedRosterDoctorId),
    [doctors, selectedRosterDoctorId],
  );

  const filteredDoctors = useMemo(() => {
    const query = doctorSearch.trim().toLowerCase();
    if (!query) return doctors;
    return doctors.filter(
      (doctor) =>
        String(doctor.id).includes(query) ||
        (doctor.name || '').toLowerCase().includes(query) ||
        (doctor.specialization || '').toLowerCase().includes(query),
    );
  }, [doctors, doctorSearch]);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter(
      (member) =>
        String(member.id).includes(query) ||
        (member.fullName || '').toLowerCase().includes(query) ||
        (member.username || '').toLowerCase().includes(query) ||
        (member.email || '').toLowerCase().includes(query) ||
        (member.role || '').toLowerCase().includes(query),
    );
  }, [staff, staffSearch]);

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return patients;
    return patients.filter(
      (patient) =>
        String(patient.id).includes(query) ||
        (patient.name || '').toLowerCase().includes(query) ||
        (patient.email || '').toLowerCase().includes(query) ||
        (patient.phone || '').toLowerCase().includes(query),
    );
  }, [patients, patientSearch]);

  const filteredMedicines = useMemo(() => {
    const query = medicineSearch.trim().toLowerCase();
    if (!query) return medicines;
    return medicines.filter(
      (medicine) =>
        String(medicine.id).includes(query) ||
        (medicine.name || '').toLowerCase().includes(query),
    );
  }, [medicines, medicineSearch]);

  const weekendAssignedDoctors = useMemo(
    () => doctors.filter((doctor) => (rosterPrefs[doctor.id] || {}).weekendShift),
    [doctors, rosterPrefs],
  );

  const weekdayAssignedDoctors = useMemo(
    () => doctors.filter((doctor) => (rosterPrefs[doctor.id] || {}).weekdayShift),
    [doctors, rosterPrefs],
  );

  const coverageByShift = useMemo(() => {
    const shiftKey = rosterDayType === 'WEEKEND' ? 'weekendShift' : 'weekdayShift';
    return shiftOptions.map((shift) => ({
      shift,
      count: doctors.filter((doctor) => (rosterPrefs[doctor.id] || {})[shiftKey] === shift).length,
    }));
  }, [doctors, rosterPrefs, rosterDayType]);

  const assignedDoctorsCount = rosterDayType === 'WEEKEND' ? weekendAssignedDoctors.length : weekdayAssignedDoctors.length;
  const unassignedDoctorsCount = doctors.length - assignedDoctorsCount;
  const maxCoverageCount = Math.max(...coverageByShift.map((item) => item.count), 1);

  const staffRoleCounts = useMemo(() => {
    const counts = { ADMIN: 0, DOCTOR: 0, RECEPTIONIST: 0, PHARMACIST: 0 };
    staff.forEach((member) => {
      const role = member.role;
      if (counts[role] !== undefined) {
        counts[role] += 1;
      }
    });
    return counts;
  }, [staff]);

  const lowStockMedicines = useMemo(
    () => medicines.filter((medicine) => Number(medicine.stock) <= 10).length,
    [medicines],
  );

  useEffect(() => {
    saveJsonStorage(ROSTER_PREFS_KEY, rosterPrefs);
  }, [rosterPrefs]);

  useEffect(() => {
    saveJsonStorage(DOCTOR_CONTACTS_KEY, doctorContacts);
  }, [doctorContacts]);

  useEffect(() => {
    setShowCoverageDetails(false);
  }, [rosterDayType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [staffResult, doctorsResult, patientsResult, medicinesResult] = await Promise.allSettled([
        listStaff(),
        listDoctors(),
        listAdminPatients(),
        listAdminMedicines(),
      ]);

      if (staffResult.status === 'fulfilled') {
        setStaff(Array.isArray(staffResult.value) ? staffResult.value : []);
      }

      if (doctorsResult.status === 'fulfilled') {
        const data = Array.isArray(doctorsResult.value?.doctors) ? doctorsResult.value.doctors : [];
        setDoctors(data);
        setSelectedRosterDoctorId((previous) => {
          if (!data.length) return '';
          const exists = data.some((doctor) => String(doctor.id) === previous);
          return exists ? previous : '';
        });
      }

      if (patientsResult.status === 'fulfilled') {
        setPatients(Array.isArray(patientsResult.value?.patients) ? patientsResult.value.patients : []);
      } else {
        setPatients([]);
      }

      if (medicinesResult.status === 'fulfilled') {
        setMedicines(Array.isArray(medicinesResult.value?.medicines) ? medicinesResult.value.medicines : []);
      } else {
        setMedicines([]);
      }
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to load admin data.'));
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegister = async (event) => {
    event.preventDefault();
    setStatus('');
    setStatusType('');

    setSavingStaff(true);
    try {
      const response = await createStaff(registerForm);
      if (registerForm.role === 'DOCTOR') {
        await syncDoctorRecords();
      }
      setStatus(response?.message || 'Staff account created successfully.');
      setStatusType('success');
      setRegisterForm({
        username: '',
        email: '',
        password: '',
        fullName: '',
        role: 'DOCTOR',
      });
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to create staff account.'));
      setStatusType('error');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleCreateDoctor = async (event) => {
    event.preventDefault();
    const normalizedDoctorPhone = normalizePhoneForSubmit(doctorForm.phone);

    if (!doctorForm.name.trim() || !doctorForm.specialization.trim() || !doctorForm.phone.trim() || !doctorForm.email.trim()) {
      setStatus('Doctor name, specialization, phone, and email are required.');
      setStatusType('error');
      return;
    }
    if (!normalizedDoctorPhone) {
      setStatus('Doctor phone must be a valid 10-digit number.');
      setStatusType('error');
      return;
    }
    if (!doctorForm.weekdayShift || !doctorForm.weekendShift) {
      setStatus('Choose weekday and weekend shifts before creating a doctor.');
      setStatusType('error');
      return;
    }

    setSavingDoctor(true);
    try {
      const response = await createDoctor({
        name: doctorForm.name.trim(),
        specialization: doctorForm.specialization.trim(),
        phone: normalizedDoctorPhone,
        email: doctorForm.email.trim(),
      });

      const doctorId = response?.doctorId;
      if (doctorId) {
        setDoctorContacts((previous) => ({
          ...previous,
          [doctorId]: {
            phone: normalizedDoctorPhone,
            email: doctorForm.email.trim(),
          },
        }));

        setRosterPrefs((previous) => ({
          ...previous,
          [doctorId]: {
            weekdayShift: doctorForm.weekdayShift,
            weekendShift: doctorForm.weekendShift,
            slotHours: 8,
          },
        }));
      }

      setStatus(`${response?.message || 'Doctor created successfully.'} Doctor ID: ${response?.doctorId ?? 'N/A'}.`);
      setStatusType('success');
      setDoctorForm({ name: '', specialization: '', phone: '', email: '', weekdayShift: '', weekendShift: '' });
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to create doctor.'));
      setStatusType('error');
    } finally {
      setSavingDoctor(false);
    }
  };

  const handleLoadDoctorEdit = (doctor) => {
    const contact = doctorContacts[doctor.id] || {};
    const preference = rosterPrefs[doctor.id] || {};

    setDoctorEdit({
      id: String(doctor.id),
      name: doctor.name || '',
      specialization: doctor.specialization || '',
      phone: sanitizePhoneInput(contact.phone || ''),
      email: contact.email || '',
      weekdayShift: preference.weekdayShift || '',
      weekendShift: preference.weekendShift || '',
    });
    setShowDoctorEdit(true);
  };

  const handleUpdateDoctor = async (event) => {
    event.preventDefault();
    const normalizedDoctorPhone = normalizePhoneForSubmit(doctorEdit.phone);

    if (!doctorEdit.id) {
      setStatus('Select a doctor from the list to edit.');
      setStatusType('error');
      return;
    }
    if (!doctorEdit.name.trim() || !doctorEdit.specialization.trim() || !doctorEdit.email.trim()) {
      setStatus('Doctor name, specialization, and email are required.');
      setStatusType('error');
      return;
    }
    if (!normalizedDoctorPhone) {
      setStatus('Doctor phone must be a valid 10-digit number.');
      setStatusType('error');
      return;
    }

    setSavingDoctor(true);
    try {
      const response = await updateDoctor(Number(doctorEdit.id), {
        name: doctorEdit.name.trim(),
        specialization: doctorEdit.specialization.trim(),
        phone: normalizedDoctorPhone,
        email: doctorEdit.email.trim(),
      });

      setDoctorContacts((previous) => ({
        ...previous,
        [doctorEdit.id]: {
          phone: normalizedDoctorPhone,
          email: doctorEdit.email.trim(),
        },
      }));

      if (doctorEdit.weekdayShift || doctorEdit.weekendShift) {
        setRosterPrefs((previous) => ({
          ...previous,
          [doctorEdit.id]: {
            weekdayShift: doctorEdit.weekdayShift,
            weekendShift: doctorEdit.weekendShift,
            slotHours: 8,
          },
        }));
      }

      setStatus(response?.message || 'Doctor updated successfully.');
      setStatusType('success');
      setShowDoctorEdit(false);
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to update doctor.'));
      setStatusType('error');
    } finally {
      setSavingDoctor(false);
    }
  };

  const handleDeleteDoctor = async (doctorId) => {
    const confirmed = window.confirm('Delete this doctor record? This action cannot be undone.');
    if (!confirmed) {
      return;
    }
    setDeletingDoctorId(doctorId);
    try {
      const response = await deleteDoctor(doctorId);
      setStatus(response?.message || 'Doctor deleted successfully.');
      setStatusType('success');

      if (String(doctorId) === doctorEdit.id) {
        setDoctorEdit({ id: '', name: '', specialization: '', phone: '', email: '', weekdayShift: '', weekendShift: '' });
        setShowDoctorEdit(false);
      }

      setDoctorContacts((previous) => {
        const copy = { ...previous };
        delete copy[doctorId];
        return copy;
      });

      setRosterPrefs((previous) => {
        const copy = { ...previous };
        delete copy[doctorId];
        return copy;
      });

      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to delete doctor.'));
      setStatusType('error');
    } finally {
      setDeletingDoctorId(null);
    }
  };

  const handlePreparePasswordReset = (member) => {
    setPasswordForm({ userId: String(member.id), newPassword: '' });
    setShowPasswordReset(true);
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!passwordForm.userId || !passwordForm.newPassword.trim()) {
      setStatus('User ID and new password are required.');
      setStatusType('error');
      return;
    }

    setResettingPassword(true);
    try {
      const response = await resetStaffPassword(
        Number(passwordForm.userId),
        passwordForm.newPassword.trim(),
      );
      setStatus(response?.message || 'Password updated successfully.');
      setStatusType('success');
      setPasswordForm((previous) => ({ ...previous, newPassword: '' }));
      setShowPasswordReset(false);
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to update password.'));
      setStatusType('error');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSyncDoctorRecords = async () => {
    setSyncingDoctors(true);
    try {
      const response = await syncDoctorRecords();
      setStatus(`${response?.message || 'Doctor sync completed.'} New records created: ${response?.created ?? 0}`);
      setStatusType('success');
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to sync doctor records.'));
      setStatusType('error');
    } finally {
      setSyncingDoctors(false);
    }
  };

  const handleSaveRosterAssignment = () => {
    if (!selectedRosterDoctorId) {
      setStatus('Select a doctor before assigning a roster.');
      setStatusType('error');
      return;
    }
    if (!rosterShift) {
      setStatus('Select a shift before saving.');
      setStatusType('error');
      return;
    }

    const shiftKey = rosterDayType === 'WEEKDAY' ? 'weekdayShift' : 'weekendShift';

    setRosterPrefs((previous) => ({
      ...previous,
      [selectedRosterDoctorId]: {
        ...previous[selectedRosterDoctorId],
        [shiftKey]: rosterShift,
        slotHours: 8,
      },
    }));

    setStatus(
      `Roster saved for ${selectedRosterDoctor?.name || 'doctor'}: ${rosterDayType.toLowerCase()} ${rosterShift}.`,
    );
    setStatusType('success');
  };

  const handleCreatePatient = async (event) => {
    event.preventDefault();
    const normalizedPatientPhone = normalizePhoneForSubmit(patientForm.phone);

    if (!patientForm.name.trim()) {
      setStatus('Patient name is required.');
      setStatusType('error');
      return;
    }
    if (patientForm.phone.trim() && !normalizedPatientPhone) {
      setStatus('Patient phone must be a valid 10-digit number.');
      setStatusType('error');
      return;
    }

    setSavingPatient(true);
    try {
      const response = await createAdminPatient({
        name: patientForm.name.trim(),
        email: patientForm.email.trim(),
        phone: normalizedPatientPhone,
        medicalHistory: patientForm.medicalHistory.trim(),
      });
      setStatus(response?.message || 'Patient created successfully.');
      setStatusType('success');
      setPatientForm({ name: '', email: '', phone: '', medicalHistory: '' });
      setShowPatientCreate(false);
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to create patient.'));
      setStatusType('error');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleLoadPatientEdit = (patient) => {
    setPatientEdit({
      id: String(patient.id),
      name: patient.name || '',
      email: patient.email || '',
      phone: sanitizePhoneInput(patient.phone || ''),
      medicalHistory: patient.medicalHistory || '',
    });
    setShowPatientEdit(true);
  };

  const handleUpdatePatient = async (event) => {
    event.preventDefault();
    const normalizedPatientPhone = normalizePhoneForSubmit(patientEdit.phone);

    if (!patientEdit.id || !patientEdit.name.trim()) {
      setStatus('Patient name is required.');
      setStatusType('error');
      return;
    }
    if (patientEdit.phone.trim() && !normalizedPatientPhone) {
      setStatus('Patient phone must be a valid 10-digit number.');
      setStatusType('error');
      return;
    }

    setSavingPatient(true);
    try {
      const response = await updateAdminPatient(Number(patientEdit.id), {
        name: patientEdit.name.trim(),
        email: patientEdit.email.trim(),
        phone: normalizedPatientPhone,
        medicalHistory: patientEdit.medicalHistory.trim(),
      });
      setStatus(response?.message || 'Patient updated successfully.');
      setStatusType('success');
      setShowPatientEdit(false);
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to update patient.'));
      setStatusType('error');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleDeletePatient = async (patientId) => {
    const confirmed = window.confirm('Delete this patient record? This action cannot be undone.');
    if (!confirmed) {
      return;
    }
    setDeletingPatientId(patientId);
    try {
      const response = await deleteAdminPatient(patientId);
      setStatus(response?.message || 'Patient deleted successfully.');
      setStatusType('success');
      if (String(patientId) === patientEdit.id) {
        setShowPatientEdit(false);
      }
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to delete patient.'));
      setStatusType('error');
    } finally {
      setDeletingPatientId(null);
    }
  };

  const handleCreateMedicine = async (event) => {
    event.preventDefault();
    if (!medicineForm.name.trim() || medicineForm.stock === '' || !medicineForm.expiry) {
      setStatus('Medicine name, stock, and expiry date are required.');
      setStatusType('error');
      return;
    }

    setSavingMedicine(true);
    try {
      const response = await createAdminMedicine({
        name: medicineForm.name.trim(),
        stock: Number(medicineForm.stock),
        expiry: medicineForm.expiry,
      });
      setStatus(response?.message || 'Medicine created successfully.');
      setStatusType('success');
      setMedicineForm({ name: '', stock: '', expiry: '' });
      setShowMedicineCreate(false);
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to create medicine.'));
      setStatusType('error');
    } finally {
      setSavingMedicine(false);
    }
  };

  const handleLoadMedicineEdit = (medicine) => {
    setMedicineEdit({
      id: String(medicine.id),
      name: medicine.name || '',
      stock: String(medicine.stock ?? ''),
      expiry: medicine.expiry || '',
    });
    setShowMedicineEdit(true);
  };

  const handleUpdateMedicine = async (event) => {
    event.preventDefault();
    if (!medicineEdit.id || !medicineEdit.name.trim() || medicineEdit.stock === '' || !medicineEdit.expiry) {
      setStatus('Medicine name, stock, and expiry date are required.');
      setStatusType('error');
      return;
    }

    setSavingMedicine(true);
    try {
      const response = await updateAdminMedicine(Number(medicineEdit.id), {
        name: medicineEdit.name.trim(),
        stock: Number(medicineEdit.stock),
        expiry: medicineEdit.expiry,
      });
      setStatus(response?.message || 'Medicine updated successfully.');
      setStatusType('success');
      setShowMedicineEdit(false);
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to update medicine.'));
      setStatusType('error');
    } finally {
      setSavingMedicine(false);
    }
  };

  const handleDeleteMedicine = async (medicineId) => {
    const confirmed = window.confirm('Delete this medicine from inventory? This action cannot be undone.');
    if (!confirmed) {
      return;
    }
    setDeletingMedicineId(medicineId);
    try {
      const response = await deleteAdminMedicine(medicineId);
      setStatus(response?.message || 'Medicine deleted successfully.');
      setStatusType('success');
      if (String(medicineId) === medicineEdit.id) {
        setShowMedicineEdit(false);
      }
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to delete medicine.'));
      setStatusType('error');
    } finally {
      setDeletingMedicineId(null);
    }
  };

  return (
    <div className="workspace">
      <section className="workspace-head">
        <h2>Admin Console</h2>
        <p>Production workflow controls for staff, doctor roster, slots, and operational visibility.</p>
        <div className="metric-row">
          <article className="metric-card">
            <span>Total Staff</span>
            <strong>{staff.length}</strong>
          </article>
          <article className="metric-card">
            <span>Total Doctors</span>
            <strong>{doctors.length}</strong>
          </article>
          <article className="metric-card">
            <span>Patients</span>
            <strong>{patients.length}</strong>
          </article>
          <article className="metric-card">
            <span>Medicines</span>
            <strong>{medicines.length}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="tab-row">
          <button
            type="button"
            className={`btn ${activeTab === 'staff' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('staff')}
          >
            Staff Accounts
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'doctors' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('doctors')}
          >
            Doctor Directory
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'roster' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('roster')}
          >
            Roster & Slots
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'operations' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('operations')}
          >
            Patients & Medicine
          </button>
          <button className="btn btn-outline btn-small" type="button" onClick={loadData}>
            Sync Dashboard
          </button>
        </div>
        <p className="workspace-note">Use Sync Dashboard after backend changes made outside this page.</p>
        {status ? <div className={`status status-${statusType}`}>{status}</div> : null}
      </section>

      {activeTab === 'staff' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Staff Management</h3>
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={() => setShowStaffCreate((previous) => !previous)}
              >
                {showStaffCreate ? 'Hide Create Form' : 'Create Staff'}
              </button>
            </div>
            <div className="metric-row tab-metrics">
              <article className="metric-card">
                <span>Admins</span>
                <strong>{staffRoleCounts.ADMIN}</strong>
              </article>
              <article className="metric-card">
                <span>Doctors</span>
                <strong>{staffRoleCounts.DOCTOR}</strong>
              </article>
              <article className="metric-card">
                <span>Receptionists</span>
                <strong>{staffRoleCounts.RECEPTIONIST}</strong>
              </article>
              <article className="metric-card">
                <span>Pharmacists</span>
                <strong>{staffRoleCounts.PHARMACIST}</strong>
              </article>
            </div>

            {showStaffCreate ? (
              <form className="form-grid" onSubmit={handleRegister}>
                <label className="field">
                  <span>Full Name</span>
                  <input
                    value={registerForm.fullName}
                    onChange={(event) => setRegisterForm((previous) => ({ ...previous, fullName: event.target.value }))}
                    required
                  />
                </label>

                <label className="field">
                  <span>Username</span>
                  <input
                    value={registerForm.username}
                    onChange={(event) => setRegisterForm((previous) => ({ ...previous, username: event.target.value }))}
                    required
                  />
                </label>

                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm((previous) => ({ ...previous, email: event.target.value }))}
                    required
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={registerForm.password}
                    onChange={(event) => setRegisterForm((previous) => ({ ...previous, password: event.target.value }))}
                    required
                  />
                </label>

                <label className="field">
                  <span>Role</span>
                  <select
                    value={registerForm.role}
                    onChange={(event) => setRegisterForm((previous) => ({ ...previous, role: event.target.value }))}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="btn btn-primary" type="submit" disabled={loading || savingStaff}>
                  {savingStaff ? 'Creating...' : 'Create Staff Account'}
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  disabled={loading || syncingDoctors}
                  onClick={handleSyncDoctorRecords}
                >
                  {syncingDoctors ? 'Syncing...' : 'Sync Existing Doctor Records'}
                </button>
              </form>
            ) : (
              <p className="workspace-note">Create form is hidden. Use the Create Staff button to add new users.</p>
            )}

            <div className="divider" />

            <div className="panel-title">
              <h3>Password Management</h3>
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={() => setShowPasswordReset((previous) => !previous)}
              >
                {showPasswordReset ? 'Hide Password Form' : 'Change Password'}
              </button>
            </div>

            {showPasswordReset ? (
              <form className="form-grid" onSubmit={handleResetPassword}>
                <label className="field">
                  <span>User ID</span>
                  <input
                    type="number"
                    min="1"
                    value={passwordForm.userId}
                    onChange={(event) => setPasswordForm((previous) => ({ ...previous, userId: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>New Password</span>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({ ...previous, newPassword: event.target.value }))
                    }
                    required
                  />
                </label>
                <button className="btn btn-secondary" type="submit" disabled={loading || resettingPassword}>
                  {resettingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            ) : (
              <p className="workspace-note">Password fields stay hidden until you click Change Password.</p>
            )}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Staff Directory</h3>
              <div className="table-toolbar">
                <input
                  className="table-search"
                  placeholder="Search by name, username, role, email, ID..."
                  value={staffSearch}
                  onChange={(event) => setStaffSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((member) => (
                    <tr key={member.id}>
                      <td>{member.id}</td>
                      <td>{member.fullName || '-'}</td>
                      <td>{member.username}</td>
                      <td>{member.email}</td>
                      <td>{member.role}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline btn-small"
                          onClick={() => handlePreparePasswordReset(member)}
                        >
                          Set Password
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredStaff.length ? (
                    <tr>
                      <td colSpan={6}>No staff members match your search.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'doctors' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Doctor Onboarding</h3>
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={() => setShowDoctorCreate((previous) => !previous)}
              >
                {showDoctorCreate ? 'Hide Create Form' : 'Create Doctor'}
              </button>
            </div>
            <p className="workspace-note">Doctor ID is generated automatically after create.</p>

            {showDoctorCreate ? (
              <form className="form-grid" onSubmit={handleCreateDoctor}>
              <label className="field">
                <span>Doctor Name</span>
                <input
                  value={doctorForm.name}
                  onChange={(event) => setDoctorForm((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Specialization</span>
                <input
                  value={doctorForm.specialization}
                  onChange={(event) =>
                    setDoctorForm((previous) => ({ ...previous, specialization: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={doctorForm.phone}
                  onChange={(event) =>
                    setDoctorForm((previous) => ({ ...previous, phone: sanitizePhoneInput(event.target.value) }))
                  }
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  required
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={doctorForm.email}
                  onChange={(event) => setDoctorForm((previous) => ({ ...previous, email: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Weekday Primary Shift (8 hours)</span>
                <select
                  value={doctorForm.weekdayShift}
                  onChange={(event) =>
                    setDoctorForm((previous) => ({ ...previous, weekdayShift: event.target.value }))
                  }
                  required
                >
                  <option value="">Select shift</option>
                  {shiftOptions.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Weekend Preferred Shift (8 hours)</span>
                <select
                  value={doctorForm.weekendShift}
                  onChange={(event) =>
                    setDoctorForm((previous) => ({ ...previous, weekendShift: event.target.value }))
                  }
                  required
                >
                  <option value="">Select shift</option>
                  {shiftOptions.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" type="submit" disabled={loading || savingDoctor}>
                {savingDoctor ? 'Saving...' : 'Create Doctor'}
              </button>
              </form>
            ) : (
              <p className="workspace-note">Create form is hidden. Use Create Doctor when onboarding a new doctor.</p>
            )}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Doctor Directory</h3>
              <div className="table-toolbar">
                <input
                  className="table-search"
                  placeholder="Search by name, specialization, ID..."
                  value={doctorSearch}
                  onChange={(event) => setDoctorSearch(event.target.value)}
                />
              </div>
            </div>
            <p className="workspace-note">Doctor updates open only when you click Edit.</p>

            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Specialization</th>
                    <th>Weekday Shift</th>
                    <th>Weekend Shift</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDoctors.map((doctor) => {
                    const pref = rosterPrefs[doctor.id] || {};
                    return (
                      <tr key={doctor.id}>
                        <td>{doctor.id}</td>
                        <td>{doctor.name}</td>
                        <td>{doctor.specialization || '-'}</td>
                        <td>{pref.weekdayShift || '-'}</td>
                        <td>{pref.weekendShift || '-'}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-small"
                              onClick={() => handleLoadDoctorEdit(doctor)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-small"
                              disabled={deletingDoctorId === doctor.id}
                              onClick={() => handleDeleteDoctor(doctor.id)}
                            >
                              {deletingDoctorId === doctor.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredDoctors.length ? (
                    <tr>
                      <td colSpan={6}>No doctors match your search.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'roster' ? (
        <>
          <section className="workspace-grid roster-top-grid">
            <article className="panel">
              <div className="panel-title">
                <h3>Doctor Shift Assignment</h3>
              </div>
              <p className="workspace-note">
                Step flow: doctor, weekday/weekend, shift, then save. One shift equals one 8-hour slot, so no extra slot field is required.
              </p>

              <div className="roster-flow">
                <label className="field">
                  <span>1. Select Doctor</span>
                  <select
                    value={selectedRosterDoctorId}
                    onChange={(event) => {
                      const doctorId = event.target.value;
                      setSelectedRosterDoctorId(doctorId);
                      const pref = rosterPrefs[doctorId] || {};
                      const defaultShift = rosterDayType === 'WEEKDAY' ? pref.weekdayShift || '' : pref.weekendShift || '';
                      setRosterShift(defaultShift);
                    }}
                  >
                    <option value="">Select doctor</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field">
                  <span>2. Choose Day Type</span>
                  <div className="toggle-group">
                    <button
                      type="button"
                      className={`btn btn-small ${rosterDayType === 'WEEKDAY' ? 'btn-primary' : 'btn-outline'}`}
                      disabled={!selectedRosterDoctorId}
                      onClick={() => {
                        setRosterDayType('WEEKDAY');
                        if (selectedRosterDoctorId) {
                          const pref = rosterPrefs[selectedRosterDoctorId] || {};
                          setRosterShift(pref.weekdayShift || '');
                        }
                      }}
                    >
                      Weekday
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${rosterDayType === 'WEEKEND' ? 'btn-primary' : 'btn-outline'}`}
                      disabled={!selectedRosterDoctorId}
                      onClick={() => {
                        setRosterDayType('WEEKEND');
                        if (selectedRosterDoctorId) {
                          const pref = rosterPrefs[selectedRosterDoctorId] || {};
                          setRosterShift(pref.weekendShift || '');
                        }
                      }}
                    >
                      Weekend
                    </button>
                  </div>
                  {!selectedRosterDoctorId ? (
                    <p className="workspace-note">Select a doctor first to enable day type and shift selection.</p>
                  ) : null}
                </div>

                <label className="field">
                  <span>3. Select Shift</span>
                  <select
                    value={rosterShift}
                    onChange={(event) => setRosterShift(event.target.value)}
                    disabled={!selectedRosterDoctorId}
                  >
                    <option value="">Select shift</option>
                    {shiftOptions.map((shift) => (
                      <option key={shift} value={shift}>
                        {shift}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="roster-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!selectedRosterDoctorId || !rosterShift}
                    onClick={handleSaveRosterAssignment}
                  >
                    Save Assignment
                  </button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => {
                      setRosterShift('');
                    }}
                  >
                    Reset Selection
                  </button>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <h3>Coverage Snapshot</h3>
              </div>
              <p className="workspace-note">Live summary for {rosterDayType === 'WEEKEND' ? 'weekend' : 'weekday'} assignment quality.</p>

              <div className="coverage-chip-row">
                <span className="badge badge-primary">{rosterDayType === 'WEEKEND' ? 'Weekend Mode' : 'Weekday Mode'}</span>
                <span className="badge badge-success">Assigned: {assignedDoctorsCount}</span>
                <span className="badge badge-warning">Unassigned: {unassignedDoctorsCount}</span>
              </div>

              <div className="coverage-shift-list">
                {coverageByShift.map((item) => (
                  <article key={`${rosterDayType}-${item.shift}`} className="coverage-shift-card">
                    <header>
                      <strong>{item.shift}</strong>
                      <span>{item.count}</span>
                    </header>
                    <div className="coverage-bar-track">
                      <div
                        className="coverage-bar-fill"
                        style={{ width: `${Math.round((item.count / maxCoverageCount) * 100)}%` }}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <div className="coverage-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => setShowCoverageDetails((previous) => !previous)}
                >
                  {showCoverageDetails ? 'Hide Doctor Mapping' : 'View Doctor Mapping'}
                </button>
              </div>

              {showCoverageDetails ? (
                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th>Specialization</th>
                        <th>{rosterDayType === 'WEEKEND' ? 'Weekend Shift' : 'Weekday Shift'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctors.map((doctor) => {
                        const pref = rosterPrefs[doctor.id] || {};
                        const shift = rosterDayType === 'WEEKEND' ? pref.weekendShift : pref.weekdayShift;
                        return (
                          <tr key={`${rosterDayType}-detail-${doctor.id}`}>
                            <td>{doctor.name}</td>
                            <td>{doctor.specialization || 'General'}</td>
                            <td>{shift || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {!assignedDoctorsCount ? (
                <p className="workspace-note">No shifts assigned yet for {rosterDayType.toLowerCase()} mode.</p>
              ) : null}
            </article>
          </section>

          <section className="panel">
            <div className="panel-title">
              <h3>Full Roster Matrix</h3>
            </div>
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Specialization</th>
                    <th>Weekday Shift</th>
                    <th>Weekend Shift</th>
                    <th>Slot Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doctor) => {
                    const pref = rosterPrefs[doctor.id] || {};
                    return (
                      <tr key={doctor.id}>
                        <td>{doctor.name}</td>
                        <td>{doctor.specialization || 'General'}</td>
                        <td>{pref.weekdayShift || '-'}</td>
                        <td>{pref.weekendShift || '-'}</td>
                        <td>{pref.slotHours || 8}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'operations' ? (
        <>
          <section className="panel">
            <div className="panel-title">
              <h3>Operations Summary</h3>
            </div>
            <div className="metric-row tab-metrics">
              <article className="metric-card">
                <span>Total Patients</span>
                <strong>{patients.length}</strong>
              </article>
              <article className="metric-card">
                <span>Total Medicines</span>
                <strong>{medicines.length}</strong>
              </article>
              <article className="metric-card">
                <span>Low Stock (&lt;= 10)</span>
                <strong>{lowStockMedicines}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="tab-row">
              <button
                type="button"
                className={`btn ${operationsView === 'patients' ? 'btn-primary' : 'btn-outline'} btn-small`}
                onClick={() => setOperationsView('patients')}
              >
                Patients
              </button>
              <button
                type="button"
                className={`btn ${operationsView === 'medicines' ? 'btn-primary' : 'btn-outline'} btn-small`}
                onClick={() => setOperationsView('medicines')}
              >
                Medicines
              </button>
            </div>
            <p className="workspace-note">Manage one operations module at a time to keep the interface focused.</p>
          </section>

          <section className="workspace-grid single-grid">
            {operationsView === 'patients' ? (
              <article className="panel">
                <div className="panel-title">
                  <h3>Patient Directory</h3>
                  <div className="table-toolbar">
                    <input
                      className="table-search"
                      placeholder="Search patient by name, email, phone, ID..."
                      value={patientSearch}
                      onChange={(event) => setPatientSearch(event.target.value)}
                    />
                    <button
                      className="btn btn-outline btn-small"
                      type="button"
                      onClick={() => setShowPatientCreate((previous) => !previous)}
                    >
                      {showPatientCreate ? 'Hide Add Form' : 'Add Patient'}
                    </button>
                  </div>
                </div>

                {showPatientCreate ? (
                  <form className="form-grid" onSubmit={handleCreatePatient}>
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={patientForm.name}
                        onChange={(event) => setPatientForm((previous) => ({ ...previous, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={patientForm.email}
                        onChange={(event) => setPatientForm((previous) => ({ ...previous, email: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Phone</span>
                      <input
                        value={patientForm.phone}
                        onChange={(event) =>
                          setPatientForm((previous) => ({ ...previous, phone: sanitizePhoneInput(event.target.value) }))
                        }
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="10-digit mobile"
                      />
                    </label>
                    <label className="field">
                      <span>Medical History</span>
                      <textarea
                        rows="3"
                        value={patientForm.medicalHistory}
                        onChange={(event) =>
                          setPatientForm((previous) => ({ ...previous, medicalHistory: event.target.value }))
                        }
                      />
                    </label>
                    <button className="btn btn-primary" type="submit" disabled={loading || savingPatient}>
                      {savingPatient ? 'Saving...' : 'Create Patient'}
                    </button>
                  </form>
                ) : null}

                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map((patient) => (
                        <tr key={patient.id}>
                          <td>{patient.id}</td>
                          <td>{patient.name || '-'}</td>
                          <td>{patient.email || '-'}</td>
                          <td>{patient.phone || '-'}</td>
                          <td>{formatDate(patient.createdAt)}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="btn btn-outline btn-small"
                                type="button"
                                onClick={() => handleLoadPatientEdit(patient)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-outline btn-small"
                                type="button"
                                disabled={deletingPatientId === patient.id}
                                onClick={() => handleDeletePatient(patient.id)}
                              >
                                {deletingPatientId === patient.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredPatients.length ? (
                        <tr>
                          <td colSpan={6}>No patients match your search.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : (
              <article className="panel">
                <div className="panel-title">
                  <h3>Medicine Inventory</h3>
                  <div className="table-toolbar">
                    <input
                      className="table-search"
                      placeholder="Search medicine by name or ID..."
                      value={medicineSearch}
                      onChange={(event) => setMedicineSearch(event.target.value)}
                    />
                    <button
                      className="btn btn-outline btn-small"
                      type="button"
                      onClick={() => setShowMedicineCreate((previous) => !previous)}
                    >
                      {showMedicineCreate ? 'Hide Add Form' : 'Add Medicine'}
                    </button>
                  </div>
                </div>

                {showMedicineCreate ? (
                  <form className="form-grid" onSubmit={handleCreateMedicine}>
                    <label className="field">
                      <span>Medicine Name</span>
                      <input
                        value={medicineForm.name}
                        onChange={(event) => setMedicineForm((previous) => ({ ...previous, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Stock</span>
                      <input
                        type="number"
                        min="0"
                        value={medicineForm.stock}
                        onChange={(event) => setMedicineForm((previous) => ({ ...previous, stock: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Expiry Date</span>
                      <input
                        type="date"
                        value={medicineForm.expiry}
                        onChange={(event) => setMedicineForm((previous) => ({ ...previous, expiry: event.target.value }))}
                        required
                      />
                    </label>
                    <button className="btn btn-primary" type="submit" disabled={loading || savingMedicine}>
                      {savingMedicine ? 'Saving...' : 'Create Medicine'}
                    </button>
                  </form>
                ) : null}

                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Stock</th>
                        <th>Expiry</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMedicines.map((medicine) => (
                        <tr key={medicine.id}>
                          <td>{medicine.id}</td>
                          <td>{medicine.name || '-'}</td>
                          <td>{medicine.stock}</td>
                          <td>{medicine.expiry || '-'}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="btn btn-outline btn-small"
                                type="button"
                                onClick={() => handleLoadMedicineEdit(medicine)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-outline btn-small"
                                type="button"
                                disabled={deletingMedicineId === medicine.id}
                                onClick={() => handleDeleteMedicine(medicine.id)}
                              >
                                {deletingMedicineId === medicine.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredMedicines.length ? (
                        <tr>
                          <td colSpan={5}>No medicines match your search.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </section>
        </>
      ) : null}

      {showDoctorEdit ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowDoctorEdit(false)}>
          <div className="modal-content" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title">
              <h3>Edit Doctor</h3>
              <button className="btn btn-outline btn-small" type="button" onClick={() => setShowDoctorEdit(false)}>
                Close
              </button>
            </div>
            <form className="form-grid" onSubmit={handleUpdateDoctor}>
              <label className="field">
                <span>Doctor ID</span>
                <input value={doctorEdit.id} readOnly />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={doctorEdit.name}
                  onChange={(event) => setDoctorEdit((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Specialization</span>
                <input
                  value={doctorEdit.specialization}
                  onChange={(event) =>
                    setDoctorEdit((previous) => ({ ...previous, specialization: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={doctorEdit.phone}
                  onChange={(event) =>
                    setDoctorEdit((previous) => ({ ...previous, phone: sanitizePhoneInput(event.target.value) }))
                  }
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  required
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={doctorEdit.email}
                  onChange={(event) => setDoctorEdit((previous) => ({ ...previous, email: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Weekday Shift</span>
                <select
                  value={doctorEdit.weekdayShift}
                  onChange={(event) => setDoctorEdit((previous) => ({ ...previous, weekdayShift: event.target.value }))}
                >
                  <option value="">Select shift</option>
                  {shiftOptions.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Weekend Shift</span>
                <select
                  value={doctorEdit.weekendShift}
                  onChange={(event) => setDoctorEdit((previous) => ({ ...previous, weekendShift: event.target.value }))}
                >
                  <option value="">Select shift</option>
                  {shiftOptions.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-secondary" type="submit" disabled={loading || savingDoctor}>
                {savingDoctor ? 'Saving...' : 'Update Doctor'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showPatientEdit ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowPatientEdit(false)}>
          <div className="modal-content" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title">
              <h3>Edit Patient</h3>
              <button className="btn btn-outline btn-small" type="button" onClick={() => setShowPatientEdit(false)}>
                Close
              </button>
            </div>
            <form className="form-grid" onSubmit={handleUpdatePatient}>
              <label className="field">
                <span>Patient ID</span>
                <input value={patientEdit.id} readOnly />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={patientEdit.name}
                  onChange={(event) => setPatientEdit((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={patientEdit.email}
                  onChange={(event) => setPatientEdit((previous) => ({ ...previous, email: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={patientEdit.phone}
                  onChange={(event) =>
                    setPatientEdit((previous) => ({ ...previous, phone: sanitizePhoneInput(event.target.value) }))
                  }
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                />
              </label>
              <label className="field">
                <span>Medical History</span>
                <textarea
                  rows="3"
                  value={patientEdit.medicalHistory}
                  onChange={(event) =>
                    setPatientEdit((previous) => ({ ...previous, medicalHistory: event.target.value }))
                  }
                />
              </label>
              <button className="btn btn-secondary" type="submit" disabled={loading || savingPatient}>
                {savingPatient ? 'Saving...' : 'Update Patient'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showMedicineEdit ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowMedicineEdit(false)}>
          <div className="modal-content" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title">
              <h3>Edit Medicine</h3>
              <button className="btn btn-outline btn-small" type="button" onClick={() => setShowMedicineEdit(false)}>
                Close
              </button>
            </div>
            <form className="form-grid" onSubmit={handleUpdateMedicine}>
              <label className="field">
                <span>Medicine ID</span>
                <input value={medicineEdit.id} readOnly />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={medicineEdit.name}
                  onChange={(event) => setMedicineEdit((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Stock</span>
                <input
                  type="number"
                  min="0"
                  value={medicineEdit.stock}
                  onChange={(event) => setMedicineEdit((previous) => ({ ...previous, stock: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Expiry Date</span>
                <input
                  type="date"
                  value={medicineEdit.expiry}
                  onChange={(event) => setMedicineEdit((previous) => ({ ...previous, expiry: event.target.value }))}
                  required
                />
              </label>
              <button className="btn btn-secondary" type="submit" disabled={loading || savingMedicine}>
                {savingMedicine ? 'Saving...' : 'Update Medicine'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
