import { useEffect, useMemo, useState } from 'react';
import {
  bookAppointment,
  cancelAppointment,
  listAppointments,
  listAvailableDoctors,
  listDoctors,
  registerPatient,
} from '../lib/api';
import { normalizePhoneForSubmit, sanitizePhoneInput } from '../lib/phone';

const SLOT_INTERVAL_MINUTES = 30;
const SLOTS_PER_SHIFT = 16;
const ROSTER_PREFS_KEY = 'admin.rosterPrefs';

const SHIFT_START_TIME_BY_LABEL = {
  'Morning (06:00-14:00)': '06:00',
  'Afternoon (14:00-22:00)': '14:00',
  'Night (22:00-06:00)': '22:00',
};

function extractMessage(error, fallbackMessage) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    (typeof error?.response?.data === 'string' ? error.response.data : '') ||
    fallbackMessage
  );
}

function formatDateTimeValue(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatSlotTime(slotValue) {
  const date = new Date(slotValue);
  if (Number.isNaN(date.getTime())) return slotValue;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isSameSlot(left, right) {
  if (!left || !right) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return String(left) === String(right);
  }
  return leftDate.getTime() === rightDate.getTime();
}

function toSlotKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  return String(value).slice(0, 16);
}

function isWeekendDate(dateKey) {
  if (!dateKey) return false;
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
}

function buildShiftSlots(dateKey, shiftLabel) {
  const startTime = SHIFT_START_TIME_BY_LABEL[shiftLabel];
  if (!dateKey || !startTime) return [];

  const startDate = new Date(`${dateKey}T${startTime}:00`);
  if (Number.isNaN(startDate.getTime())) return [];

  const slots = [];
  for (let index = 0; index < SLOTS_PER_SHIFT; index += 1) {
    const slotDate = new Date(startDate.getTime() + index * SLOT_INTERVAL_MINUTES * 60 * 1000);
    slots.push(toSlotKey(slotDate));
  }
  return slots;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDateKeyForDayType(dayType) {
  const isWeekend = dayType === 'WEEKEND';
  const candidate = new Date();
  candidate.setHours(0, 0, 0, 0);

  for (let index = 0; index < 14; index += 1) {
    const probe = new Date(candidate.getTime() + index * 24 * 60 * 60 * 1000);
    const probeDay = probe.getDay();
    const probeWeekend = probeDay === 0 || probeDay === 6;
    if (probeWeekend === isWeekend) {
      return formatDateKey(probe);
    }
  }

  return formatDateKey(candidate);
}

function formatDateLabel(dateKey) {
  if (!dateKey) return '-';
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString([], {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildPatientMedicalHistory(chiefComplaint, medicalHistory) {
  return (
    [
      chiefComplaint?.trim() ? `Chief Complaint: ${chiefComplaint.trim()}` : '',
      medicalHistory?.trim() || '',
    ]
      .filter(Boolean)
      .join('\n') || undefined
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

function getStatusClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'BOOKED') return 'slot-booked';
  if (normalized === 'BLOCK') return 'slot-blocked';
  if (normalized === 'CANCELLED') return 'slot-cancelled';
  return 'slot-free';
}

export default function ReceptionistDashboard() {
  const [patientForm, setPatientForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    chiefComplaint: '',
    medicalHistory: '',
  });
  const [useValidatedRegister, setUseValidatedRegister] = useState(false);
  const [recentPatients, setRecentPatients] = useState([]);

  const [appointmentDoctorId, setAppointmentDoctorId] = useState('');
  const [appointmentPatientId, setAppointmentPatientId] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentReason, setAppointmentReason] = useState('');
  const [selectedSpecialization, setSelectedSpecialization] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [rosterPrefs, setRosterPrefs] = useState(() => loadJsonStorage(ROSTER_PREFS_KEY, {}));

  const [activeTab, setActiveTab] = useState('intake');
  const [availabilityDayType, setAvailabilityDayType] = useState('WEEKDAY');
  const [availabilitySpecialization, setAvailabilitySpecialization] = useState('');
  const [availabilitySearch, setAvailabilitySearch] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState('ALL');

  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [registeringPatient, setRegisteringPatient] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const [editingAppointmentId, setEditingAppointmentId] = useState('');
  const [editingSnapshot, setEditingSnapshot] = useState(null);

  const doctorNameById = useMemo(() => {
    const map = new Map();
    doctors.forEach((doctor) => map.set(Number(doctor.id), doctor.name || `Doctor #${doctor.id}`));
    return map;
  }, [doctors]);

  const bookedCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'BOOKED').length,
    [appointments],
  );

  const blockedCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'BLOCK').length,
    [appointments],
  );

  const cancelledCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'CANCELLED').length,
    [appointments],
  );

  const appointmentStatusCounts = useMemo(
    () => ({
      ALL: appointments.length,
      BOOKED: bookedCount,
      BLOCK: blockedCount,
      CANCELLED: cancelledCount,
    }),
    [appointments.length, bookedCount, blockedCount, cancelledCount],
  );

  const specializations = useMemo(() => {
    const values = Array.from(
      new Set(
        doctors
          .map((doctor) => (doctor.specialization || 'General').trim())
          .filter((value) => value.length > 0),
      ),
    );
    return values.sort((left, right) => left.localeCompare(right));
  }, [doctors]);

  const filteredDoctors = useMemo(() => {
    if (!selectedSpecialization) return [];
    return doctors.filter(
      (doctor) =>
        (doctor.specialization || 'General').toLowerCase() === selectedSpecialization.toLowerCase(),
    );
  }, [doctors, selectedSpecialization]);

  const selectedDoctor = useMemo(
    () => filteredDoctors.find((doctor) => String(doctor.id) === String(appointmentDoctorId)) || null,
    [filteredDoctors, appointmentDoctorId],
  );

  const appointmentsByDoctor = useMemo(() => {
    const map = new Map();
    appointments.forEach((appointment) => {
      const doctorId = Number(appointment?.doctorId);
      if (!doctorId) return;
      if (!map.has(doctorId)) map.set(doctorId, []);
      map.get(doctorId).push(appointment);
    });
    return map;
  }, [appointments]);

  const selectedDoctorAppointments = useMemo(() => {
    if (!selectedDoctor) return [];
    return appointmentsByDoctor.get(Number(selectedDoctor.id)) || [];
  }, [selectedDoctor, appointmentsByDoctor]);

  const patientDirectory = useMemo(() => {
    const map = new Map();

    appointments.forEach((appointment) => {
      const patient = appointment?.patient;
      if (!patient?.id) return;
      const existing = map.get(patient.id);
      map.set(patient.id, {
        id: patient.id,
        name: patient.name || '-',
        email: patient.email || existing?.email || '-',
        phone: patient.phone || existing?.phone || '-',
        source: existing?.source || 'Appointments',
      });
    });

    recentPatients.forEach((patient) => {
      if (!patient?.id) return;
      const existing = map.get(patient.id);
      map.set(patient.id, {
        id: patient.id,
        name: patient.name || existing?.name || '-',
        email: patient.email || existing?.email || '-',
        phone: patient.phone || existing?.phone || '-',
        source: existing?.source ? `${existing.source}, Intake` : 'Intake',
      });
    });

    return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [appointments, recentPatients]);

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patientDirectory;
    const normalized = patientSearch.trim().toLowerCase();
    return patientDirectory.filter((patient) =>
      [patient.id, patient.name, patient.email, patient.phone].some((value) =>
        String(value || '').toLowerCase().includes(normalized),
      ),
    );
  }, [patientDirectory, patientSearch]);

  const filteredAppointments = useMemo(() => {
    const normalized = appointmentSearch.trim().toLowerCase();
    return appointments
      .filter((appointment) => {
        if (appointmentStatusFilter === 'ALL') return true;
        return String(appointment.status || '').toUpperCase() === appointmentStatusFilter;
      })
      .filter((appointment) => {
        if (!normalized) return true;
        const values = [
          appointment.id,
          appointment.patient?.id,
          appointment.patient?.name,
          doctorNameById.get(Number(appointment.doctorId)),
          appointment.status,
          appointment.appointmentTime,
        ];
        return values.some((value) => String(value || '').toLowerCase().includes(normalized));
      });
  }, [appointments, appointmentSearch, appointmentStatusFilter, doctorNameById]);

  const selectedDayType = useMemo(
    () => (selectedDate && isWeekendDate(selectedDate) ? 'WEEKEND' : 'WEEKDAY'),
    [selectedDate],
  );

  const selectedDoctorShift = useMemo(() => {
    if (!selectedDoctor) return '';
    const pref = rosterPrefs[selectedDoctor.id] || rosterPrefs[String(selectedDoctor.id)] || {};
    return selectedDayType === 'WEEKEND' ? pref.weekendShift || '' : pref.weekdayShift || '';
  }, [selectedDoctor, rosterPrefs, selectedDayType]);

  const shiftSlots = useMemo(
    () => buildShiftSlots(selectedDate, selectedDoctorShift),
    [selectedDate, selectedDoctorShift],
  );

  const shiftSlotKeySet = useMemo(() => new Set(shiftSlots), [shiftSlots]);

  const selectedDoctorSlotStatusMap = useMemo(() => {
    const map = new Map();
    selectedDoctorAppointments.forEach((appointment) => {
      if (editingAppointmentId && Number(appointment.id) === Number(editingAppointmentId)) return;

      const normalized = String(appointment.status || '').toUpperCase();
      if (normalized !== 'BOOKED' && normalized !== 'BLOCK') return;

      const key = toSlotKey(appointment.appointmentTime);
      if (!shiftSlotKeySet.has(key)) return;

      const existing = map.get(key);
      if (existing === 'BLOCK') return;
      map.set(key, normalized);
    });
    return map;
  }, [selectedDoctorAppointments, shiftSlotKeySet, editingAppointmentId]);

  const slotGrid = useMemo(
    () =>
      shiftSlots.map((slotValue) => {
        const statusValue = selectedDoctorSlotStatusMap.get(slotValue) || 'FREE';
        const isSelected = appointmentTime ? toSlotKey(appointmentTime) === slotValue : false;
        return { slotValue, statusValue, isSelected };
      }),
    [shiftSlots, selectedDoctorSlotStatusMap, appointmentTime],
  );

  const selectedDoctorMetrics = useMemo(() => {
    const free = slotGrid.filter((item) => item.statusValue === 'FREE').length;
    const booked = slotGrid.filter((item) => item.statusValue === 'BOOKED').length;
    const blocked = slotGrid.filter((item) => item.statusValue === 'BLOCK').length;
    return { free, booked, blocked, total: slotGrid.length };
  }, [slotGrid]);

  const availabilityDate = useMemo(
    () => getNextDateKeyForDayType(availabilityDayType),
    [availabilityDayType],
  );

  const rosterAvailabilityDoctors = useMemo(() => {
    return doctors
      .map((doctor) => {
        const pref = rosterPrefs[doctor.id] || rosterPrefs[String(doctor.id)] || {};
        const shiftLabel = availabilityDayType === 'WEEKEND' ? pref.weekendShift || '' : pref.weekdayShift || '';
        if (!shiftLabel) return null;

        const specialization = (doctor.specialization || 'General').trim() || 'General';
        const shiftSlotsForDoctor = buildShiftSlots(availabilityDate, shiftLabel);
        const shiftSlotSet = new Set(shiftSlotsForDoctor);

        let booked = 0;
        let blocked = 0;

        const doctorAppointments = appointmentsByDoctor.get(Number(doctor.id)) || [];
        doctorAppointments.forEach((appointment) => {
          const normalized = String(appointment.status || '').toUpperCase();
          if (normalized !== 'BOOKED' && normalized !== 'BLOCK') return;
          if (!shiftSlotSet.has(toSlotKey(appointment.appointmentTime))) return;
          if (normalized === 'BOOKED') booked += 1;
          if (normalized === 'BLOCK') blocked += 1;
        });

        const total = shiftSlotsForDoctor.length;
        const free = Math.max(total - booked - blocked, 0);

        return {
          id: doctor.id,
          name: doctor.name || `Doctor #${doctor.id}`,
          specialization,
          shiftLabel,
          slotMetrics: { free, booked, blocked, total },
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [doctors, rosterPrefs, availabilityDayType, availabilityDate, appointmentsByDoctor]);

  const availabilitySpecializationOptions = useMemo(() => {
    const options = Array.from(
      new Set(rosterAvailabilityDoctors.map((doctor) => doctor.specialization).filter(Boolean)),
    );
    return options.sort((left, right) => left.localeCompare(right));
  }, [rosterAvailabilityDoctors]);

  const filteredAvailabilityDoctors = useMemo(() => {
    const normalized = availabilitySearch.trim().toLowerCase();
    return rosterAvailabilityDoctors.filter((doctor) => {
      const specializationMatch =
        !availabilitySpecialization ||
        doctor.specialization.toLowerCase() === availabilitySpecialization.toLowerCase();
      if (!specializationMatch) return false;
      if (!normalized) return true;
      return [doctor.id, doctor.name, doctor.specialization, doctor.shiftLabel].some((value) =>
        String(value || '').toLowerCase().includes(normalized),
      );
    });
  }, [rosterAvailabilityDoctors, availabilitySpecialization, availabilitySearch]);

  const availabilityTotals = useMemo(
    () =>
      filteredAvailabilityDoctors.reduce(
        (accumulator, doctor) => {
          accumulator.free += doctor.slotMetrics.free;
          accumulator.booked += doctor.slotMetrics.booked;
          accumulator.blocked += doctor.slotMetrics.blocked;
          accumulator.total += doctor.slotMetrics.total;
          return accumulator;
        },
        { free: 0, booked: 0, blocked: 0, total: 0 },
      ),
    [filteredAvailabilityDoctors],
  );

  const selectedTimeAvailability = useMemo(() => {
    if (!appointmentTime) return '';
    if (!shiftSlotKeySet.has(toSlotKey(appointmentTime))) return 'NOT_AVAILABLE';
    return selectedDoctorSlotStatusMap.get(toSlotKey(appointmentTime)) ? 'NOT_AVAILABLE' : 'AVAILABLE';
  }, [appointmentTime, shiftSlotKeySet, selectedDoctorSlotStatusMap]);

  const loadData = async ({ isManualSync = false } = {}) => {
    if (isManualSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }

    try {
      const [appointmentsResponse, availableDoctorsResponse, fallbackDoctorsResponse] = await Promise.all([
        listAppointments(),
        listAvailableDoctors().catch(() => null),
        listDoctors(),
      ]);

      setAppointments(Array.isArray(appointmentsResponse) ? appointmentsResponse : []);

      const availableDoctors = Array.isArray(availableDoctorsResponse?.doctors)
        ? availableDoctorsResponse.doctors
        : [];
      const fallbackDoctors = Array.isArray(fallbackDoctorsResponse?.doctors)
        ? fallbackDoctorsResponse.doctors
        : [];

      const doctorsList = availableDoctors.length ? availableDoctors : fallbackDoctors;
      setDoctors(doctorsList);
      setRosterPrefs(loadJsonStorage(ROSTER_PREFS_KEY, {}));

      if (isManualSync) {
        setStatus('Reception data synced.');
        setStatusType('success');
      }
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to load reception data.'));
      setStatusType('error');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const exists = filteredDoctors.some((doctor) => String(doctor.id) === String(appointmentDoctorId));
    if (!exists) {
      setAppointmentDoctorId('');
      setSelectedDate('');
      setAppointmentTime('');
    }
  }, [filteredDoctors, appointmentDoctorId]);

  useEffect(() => {
    if (!availabilitySpecialization) return;
    const exists = availabilitySpecializationOptions.some(
      (option) => option.toLowerCase() === availabilitySpecialization.toLowerCase(),
    );
    if (!exists) {
      setAvailabilitySpecialization('');
    }
  }, [availabilitySpecialization, availabilitySpecializationOptions]);

  useEffect(() => {
    if (!appointmentTime) return;
    if (!shiftSlots.length) {
      setAppointmentTime('');
      return;
    }

    const selectedKey = toSlotKey(appointmentTime);
    if (!shiftSlotKeySet.has(selectedKey)) {
      setAppointmentTime('');
      return;
    }

    const slotStatus = selectedDoctorSlotStatusMap.get(selectedKey);
    if (slotStatus === 'BOOKED' || slotStatus === 'BLOCK') {
      setAppointmentTime('');
    }
  }, [appointmentTime, shiftSlots.length, shiftSlotKeySet, selectedDoctorSlotStatusMap]);

  const cachePatientRecord = (patientRecord) => {
    setRecentPatients((previous) => {
      const filtered = previous.filter((item) => Number(item.id) !== Number(patientRecord.id));
      return [...filtered, patientRecord];
    });
  };

  const resetScheduleForm = () => {
    setAppointmentDoctorId('');
    setAppointmentPatientId('');
    setAppointmentReason('');
    setAppointmentTime('');
    setSelectedSpecialization('');
    setSelectedDate('');
  };

  const handleRegisterPatient = async (event) => {
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

    setRegisteringPatient(true);
    try {
      const response = await registerPatient(
        {
          name: patientForm.name.trim(),
          email: patientForm.email.trim() || undefined,
          phone: normalizedPatientPhone || undefined,
          address: patientForm.address.trim() || undefined,
          medicalHistory: buildPatientMedicalHistory(patientForm.chiefComplaint, patientForm.medicalHistory),
        },
        useValidatedRegister,
      );

      cachePatientRecord(response);
      setAppointmentPatientId(String(response.id));
      if (!appointmentReason.trim() && patientForm.chiefComplaint.trim()) {
        setAppointmentReason(patientForm.chiefComplaint.trim());
      }

      setPatientForm({
        name: '',
        email: '',
        phone: '',
        address: '',
        chiefComplaint: '',
        medicalHistory: '',
      });

      setStatus(`Patient registered with ID ${response.id}. Continue in Appointment Scheduling.`);
      setStatusType('success');
      setActiveTab('schedule');
    } catch (error) {
      setStatus(extractMessage(error, 'Patient registration failed.'));
      setStatusType('error');
    } finally {
      setRegisteringPatient(false);
    }
  };

  const handleSelectSlot = (slotValue, slotStatus) => {
    if (slotStatus !== 'FREE') {
      setStatus(`Selected slot ${formatSlotTime(slotValue)} is not available.`);
      setStatusType('error');
      return;
    }
    setAppointmentTime(slotValue);
    setStatus(`Slot ${formatSlotTime(slotValue)} is available and selected.`);
    setStatusType('success');
  };

  const handleStartEditAppointment = (appointment) => {
    const patientId = appointment?.patient?.id;
    if (!patientId) {
      setStatus('Cannot edit appointment because patient details are missing.');
      setStatusType('error');
      return;
    }

    const doctorId = appointment?.doctorId;
    const doctor = doctors.find((item) => Number(item.id) === Number(doctorId));
    const specialization = doctor?.specialization || 'General';
    const slotKey = toSlotKey(appointment.appointmentTime);

    setEditingAppointmentId(String(appointment.id));
    setEditingSnapshot({
      id: Number(appointment.id),
      patientId: Number(patientId),
      doctorId: Number(doctorId),
      appointmentTime: slotKey,
    });

    setAppointmentPatientId(String(patientId));
    setSelectedSpecialization(specialization);
    setAppointmentDoctorId(String(doctorId));
    setAppointmentReason('Follow-up consultation');
    setSelectedDate(slotKey.slice(0, 10));
    setAppointmentTime(slotKey);

    setActiveTab('schedule');
    setStatus(`Editing appointment #${appointment.id}. Update fields and save changes.`);
    setStatusType('success');
  };

  const clearEditMode = () => {
    setEditingAppointmentId('');
    setEditingSnapshot(null);
  };

  const handleBookAppointment = async (event) => {
    event.preventDefault();

    if (
      !appointmentPatientId ||
      !selectedSpecialization ||
      !appointmentDoctorId ||
      !appointmentReason.trim() ||
      !selectedDate ||
      !appointmentTime
    ) {
      setStatus('Complete patient, specialization, doctor, reason, date, and time before saving.');
      setStatusType('error');
      return;
    }

    if (!selectedDoctorShift) {
      setStatus('Selected doctor has no assigned shift for this day. Ask admin to assign roster shift first.');
      setStatusType('error');
      return;
    }

    const normalizedSlot = toSlotKey(appointmentTime);
    if (!shiftSlotKeySet.has(normalizedSlot)) {
      setStatus('Selected time is outside this doctor\'s 8-hour shift. Choose a slot from the grid.');
      setStatusType('error');
      return;
    }

    if (selectedTimeAvailability === 'NOT_AVAILABLE') {
      setStatus('Chosen slot is not available. Please select an available slot.');
      setStatusType('error');
      return;
    }

    const patientConflict = appointments.some(
      (appointment) =>
        Number(appointment?.id) !== Number(editingAppointmentId || -1) &&
        appointment?.status === 'BOOKED' &&
        Number(appointment?.patient?.id) === Number(appointmentPatientId) &&
        isSameSlot(appointment?.appointmentTime, normalizedSlot),
    );
    if (patientConflict) {
      setStatus('This patient already has another appointment in the same slot.');
      setStatusType('error');
      return;
    }

    const doctorConflict = appointments.some(
      (appointment) =>
        Number(appointment?.id) !== Number(editingAppointmentId || -1) &&
        Number(appointment?.doctorId) === Number(appointmentDoctorId) &&
        isSameSlot(appointment?.appointmentTime, normalizedSlot) &&
        (appointment?.status === 'BOOKED' || appointment?.status === 'BLOCK'),
    );
    if (doctorConflict) {
      setStatus('Selected doctor is not available in this slot (booked/blocked).');
      setStatusType('error');
      return;
    }

    setBooking(true);

    if (editingAppointmentId) {
      try {
        const unchanged =
          editingSnapshot &&
          Number(editingSnapshot.patientId) === Number(appointmentPatientId) &&
          Number(editingSnapshot.doctorId) === Number(appointmentDoctorId) &&
          isSameSlot(editingSnapshot.appointmentTime, normalizedSlot);

        if (unchanged) {
          setStatus('No schedule change detected for this appointment.');
          setStatusType('success');
          setBooking(false);
          return;
        }

        const confirmed = window.confirm(
          'This will cancel the current appointment and create an updated one. Continue?',
        );
        if (!confirmed) {
          setBooking(false);
          return;
        }

        await cancelAppointment(Number(editingAppointmentId));
        await bookAppointment({
          doctorId: Number(appointmentDoctorId),
          patientId: Number(appointmentPatientId),
          appointmentTime: normalizedSlot,
        });

        setStatus(`Appointment #${editingAppointmentId} updated successfully.`);
        setStatusType('success');
        clearEditMode();
        setAppointmentTime('');
        await loadData();
        setActiveTab('appointments');
      } catch (error) {
        let restored = false;

        if (editingSnapshot) {
          try {
            await bookAppointment({
              doctorId: Number(editingSnapshot.doctorId),
              patientId: Number(editingSnapshot.patientId),
              appointmentTime: editingSnapshot.appointmentTime,
            });
            restored = true;
          } catch {
            restored = false;
          }
        }

        if (restored) {
          setStatus(`Update failed. Original appointment restored. ${extractMessage(error, 'Please try again.')}`);
        } else {
          setStatus(
            `Update failed after cancellation. ${extractMessage(
              error,
              'Please verify appointment log and rebook manually.',
            )}`,
          );
        }
        setStatusType('error');
        await loadData();
      } finally {
        setBooking(false);
      }

      return;
    }

    try {
      const response = await bookAppointment({
        doctorId: Number(appointmentDoctorId),
        patientId: Number(appointmentPatientId),
        appointmentTime: normalizedSlot,
      });

      setStatus(`${response?.message || 'Appointment booked successfully.'} Reason: ${appointmentReason.trim()}.`);
      setStatusType('success');
      setAppointmentTime('');
      setAppointmentReason('');
      await loadData();
      setActiveTab('appointments');
    } catch (error) {
      setStatus(extractMessage(error, 'Appointment booking failed.'));
      setStatusType('error');
    } finally {
      setBooking(false);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    const confirmed = window.confirm('Cancel this appointment?');
    if (!confirmed) return;

    setCancellingId(appointmentId);
    try {
      const response = await cancelAppointment(appointmentId);
      setStatus(response?.message || 'Appointment cancelled successfully.');
      setStatusType('success');
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to cancel appointment.'));
      setStatusType('error');
    } finally {
      setCancellingId(null);
    }
  };

  const handleSelectAvailabilityDoctor = (doctor) => {
    setSelectedSpecialization(doctor.specialization);
    setAppointmentDoctorId(String(doctor.id));
    setSelectedDate(availabilityDate);
    setAppointmentTime('');
    setActiveTab('schedule');
    setStatus(
      `${doctor.name} selected for appointment scheduling. Continue with patient, reason, date, and slot.`,
    );
    setStatusType('success');
  };

  return (
    <div className="workspace">
      <section className="workspace-head">
        <h2>Reception Workstation</h2>
        <p>Patient-first appointment workflow with shift-based 30-minute slot booking.</p>
        <div className="metric-row">
          <article className="metric-card">
            <span>Total Appointments</span>
            <strong>{appointments.length}</strong>
          </article>
          <article className="metric-card">
            <span>Booked</span>
            <strong>{bookedCount}</strong>
          </article>
          <article className="metric-card">
            <span>Blocked</span>
            <strong>{blockedCount}</strong>
          </article>
          <article className="metric-card">
            <span>Cancelled</span>
            <strong>{cancelledCount}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="tab-row">
          <button
            type="button"
            className={`btn ${activeTab === 'intake' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('intake')}
          >
            Patient Intake
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'schedule' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('schedule')}
          >
            Appointment Scheduling
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'availability' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('availability')}
          >
            Doctor Availability
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'appointments' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('appointments')}
          >
            Appointment Log
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'patients' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('patients')}
          >
            All Patients
          </button>
          <button
            className="btn btn-outline btn-small"
            type="button"
            onClick={() => loadData({ isManualSync: true })}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        {status ? <div className={`status status-${statusType}`}>{status}</div> : null}
      </section>

      {activeTab === 'intake' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>New Patient Intake</h3>
            </div>

            <form className="form-grid" onSubmit={handleRegisterPatient}>
              <label className="field">
                <span>Patient Name</span>
                <input
                  value={patientForm.name}
                  onChange={(event) =>
                    setPatientForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="Full name"
                  required
                />
              </label>

              <label className="field">
                <span>Email (optional)</span>
                <input
                  type="email"
                  value={patientForm.email}
                  onChange={(event) =>
                    setPatientForm((previous) => ({ ...previous, email: event.target.value }))
                  }
                  placeholder="name@example.com"
                />
              </label>

              <label className="field">
                <span>Phone (optional)</span>
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
                <span>Address (optional)</span>
                <input
                  value={patientForm.address}
                  onChange={(event) =>
                    setPatientForm((previous) => ({ ...previous, address: event.target.value }))
                  }
                  placeholder="Patient address"
                />
              </label>

              <label className="field">
                <span>Chief Complaint / Cause</span>
                <input
                  value={patientForm.chiefComplaint}
                  onChange={(event) =>
                    setPatientForm((previous) => ({ ...previous, chiefComplaint: event.target.value }))
                  }
                  placeholder="Fever, cough, stomach pain, etc."
                />
              </label>

              <label className="field">
                <span>History Notes (optional)</span>
                <textarea
                  rows="4"
                  value={patientForm.medicalHistory}
                  onChange={(event) =>
                    setPatientForm((previous) => ({ ...previous, medicalHistory: event.target.value }))
                  }
                  placeholder="Allergies, conditions, remarks"
                />
              </label>

              <label className="switch-field">
                <input
                  type="checkbox"
                  checked={useValidatedRegister}
                  onChange={(event) => setUseValidatedRegister(event.target.checked)}
                />
                <span>Use strict validation registration</span>
              </label>

              <button className="btn btn-primary" type="submit" disabled={registeringPatient}>
                {registeringPatient ? 'Registering...' : 'Register Patient'}
              </button>
            </form>
          </article>
        </section>
      ) : null}

      {activeTab === 'schedule' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Appointment Scheduling</h3>
            </div>

            {editingAppointmentId ? (
              <div className="edit-banner">
                <span className="badge badge-info">Editing Appointment #{editingAppointmentId}</span>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={clearEditMode}
                  disabled={booking}
                >
                  Cancel Edit Mode
                </button>
              </div>
            ) : null}

            <div className="selection-flow">
              <form className="form-grid" onSubmit={handleBookAppointment}>
                <label className="field">
                  <span>1. Select Patient</span>
                  <select
                    value={appointmentPatientId}
                    onChange={(event) => setAppointmentPatientId(event.target.value)}
                    required
                    disabled={!patientDirectory.length}
                  >
                    <option value="">{patientDirectory.length ? 'Choose patient' : 'Register patient first'}</option>
                    {patientDirectory.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} (ID: {patient.id})
                      </option>
                    ))}
                  </select>
                </label>

                {!patientDirectory.length ? (
                  <div className="workspace-note-row">
                    <span className="workspace-note">No patient records available. Register patient first.</span>
                    <button type="button" className="btn btn-outline btn-small" onClick={() => setActiveTab('intake')}>
                      Go To Patient Intake
                    </button>
                  </div>
                ) : null}

                <label className="field">
                  <span>2. Select Specialization</span>
                  <select
                    value={selectedSpecialization}
                    onChange={(event) => {
                      setSelectedSpecialization(event.target.value);
                      setAppointmentDoctorId('');
                      setSelectedDate('');
                      setAppointmentTime('');
                    }}
                    required
                    disabled={!appointmentPatientId}
                  >
                    <option value="">
                      {!appointmentPatientId ? 'Choose patient first' : 'Choose specialization'}
                    </option>
                    {specializations.map((specialization) => (
                      <option key={specialization} value={specialization}>
                        {specialization}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>3. Select Doctor</span>
                  <select
                    value={appointmentDoctorId}
                    onChange={(event) => {
                      setAppointmentDoctorId(event.target.value);
                      setSelectedDate('');
                      setAppointmentTime('');
                    }}
                    required
                    disabled={!selectedSpecialization || !filteredDoctors.length}
                  >
                    <option value="">
                      {!selectedSpecialization
                        ? 'Choose specialization first'
                        : filteredDoctors.length
                          ? 'Choose doctor'
                          : 'No doctor available'}
                    </option>
                    {filteredDoctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>4. Reason / Cause</span>
                  <textarea
                    rows="2"
                    value={appointmentReason}
                    onChange={(event) => setAppointmentReason(event.target.value)}
                    placeholder="Reason for this appointment"
                    required
                    disabled={!appointmentDoctorId}
                  />
                </label>

                <label className="field">
                  <span>5. Select Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      setSelectedDate(event.target.value);
                      setAppointmentTime('');
                    }}
                    required
                    disabled={!appointmentReason.trim()}
                  />
                </label>

                <div className="field">
                  <span>6. Selected Slot</span>
                  <input
                    value={appointmentTime ? formatDateTimeValue(appointmentTime) : 'Pick from the slot grid'}
                    readOnly
                  />
                  {appointmentTime ? (
                    <span
                      className={`badge ${
                        selectedTimeAvailability === 'AVAILABLE' ? 'badge-success' : 'badge-danger'
                      }`}
                    >
                      {selectedTimeAvailability === 'AVAILABLE' ? 'Available' : 'Not available'}
                    </span>
                  ) : null}
                </div>

                <div className="table-actions">
                  <button
                    className="btn btn-secondary"
                    type="submit"
                    disabled={
                      loading ||
                      booking ||
                      !appointmentPatientId ||
                      !selectedSpecialization ||
                      !appointmentDoctorId ||
                      !appointmentReason.trim() ||
                      !selectedDate ||
                      !appointmentTime ||
                      !selectedDoctorShift
                    }
                  >
                    {booking
                      ? editingAppointmentId
                        ? 'Updating...'
                        : 'Booking...'
                      : editingAppointmentId
                        ? 'Save Appointment Changes'
                        : 'Book Appointment'}
                  </button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => {
                      clearEditMode();
                      resetScheduleForm();
                    }}
                    disabled={booking}
                  >
                    Reset Selection
                  </button>
                </div>
              </form>
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Doctor Shift Slots (8 hours, 30 min each)</h3>
            </div>

            {!appointmentPatientId ? (
              <p className="workspace-note">Step 1: Select patient to unlock scheduling.</p>
            ) : !selectedSpecialization ? (
              <p className="workspace-note">Step 2: Select specialization to view relevant doctors.</p>
            ) : !selectedDoctor ? (
              <p className="workspace-note">Step 3: Select doctor to view shift slots.</p>
            ) : !selectedDate ? (
              <p className="workspace-note">Step 5: Select date to load doctor shift slots.</p>
            ) : !selectedDoctorShift ? (
              <p className="workspace-note">
                No {selectedDayType.toLowerCase()} shift assigned for {selectedDoctor.name}. Assign shift from admin roster.
              </p>
            ) : (
              <>
                <div className="metric-row tab-metrics">
                  <article className="metric-card">
                    <span>Doctor</span>
                    <strong>{selectedDoctor.name}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Shift</span>
                    <strong>{selectedDoctorShift}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Free</span>
                    <strong>{selectedDoctorMetrics.free}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Booked</span>
                    <strong>{selectedDoctorMetrics.booked}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Blocked</span>
                    <strong>{selectedDoctorMetrics.blocked}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Total Slots</span>
                    <strong>{selectedDoctorMetrics.total}</strong>
                  </article>
                </div>

                <div className="slot-legend">
                  <span className="legend-item">
                    <span className="legend-dot dot-free" />
                    Available
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot dot-booked" />
                    Booked
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot dot-blocked" />
                    Blocked
                  </span>
                </div>

                <div className="slot-grid-wrap">
                  {slotGrid.map((slotItem) => {
                    const slotLabel =
                      slotItem.statusValue === 'FREE'
                        ? 'Available'
                        : slotItem.statusValue === 'BOOKED'
                          ? 'Not available'
                          : 'Blocked';
                    const statusClass =
                      slotItem.statusValue === 'FREE'
                        ? 'slot-state-free'
                        : slotItem.statusValue === 'BOOKED'
                          ? 'slot-state-booked'
                          : 'slot-state-blocked';

                    return (
                      <button
                        key={slotItem.slotValue}
                        type="button"
                        className={`slot-grid-item ${statusClass} ${
                          slotItem.isSelected ? 'slot-grid-item-selected' : ''
                        }`}
                        onClick={() => handleSelectSlot(slotItem.slotValue, slotItem.statusValue)}
                      >
                        <strong>{formatSlotTime(slotItem.slotValue)}</strong>
                        <small>{slotLabel}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'availability' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Doctor Availability</h3>
            </div>

            <div className="selection-flow availability-flow">
              <div className="availability-step">
                <span>1. Select Day Type</span>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`btn btn-small ${availabilityDayType === 'WEEKDAY' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setAvailabilityDayType('WEEKDAY')}
                  >
                    Weekday
                  </button>
                  <button
                    type="button"
                    className={`btn btn-small ${availabilityDayType === 'WEEKEND' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setAvailabilityDayType('WEEKEND')}
                  >
                    Weekend
                  </button>
                </div>
              </div>

              <label className="field">
                <span>2. Filter by Specialization</span>
                <select
                  value={availabilitySpecialization}
                  onChange={(event) => setAvailabilitySpecialization(event.target.value)}
                  disabled={!availabilitySpecializationOptions.length}
                >
                  <option value="">
                    {availabilitySpecializationOptions.length
                      ? 'All specializations'
                      : 'No specialization available'}
                  </option>
                  {availabilitySpecializationOptions.map((specialization) => (
                    <option key={specialization} value={specialization}>
                      {specialization}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>3. Search Doctor (optional)</span>
                <input
                  value={availabilitySearch}
                  onChange={(event) => setAvailabilitySearch(event.target.value)}
                  placeholder="Search by doctor name or ID"
                />
              </label>

              <div className="metric-row tab-metrics">
                <article className="metric-card">
                  <span>Doctors On Shift</span>
                  <strong>{filteredAvailabilityDoctors.length}</strong>
                </article>
                <article className="metric-card">
                  <span>Total Free Slots</span>
                  <strong>{availabilityTotals.free}</strong>
                </article>
                <article className="metric-card">
                  <span>Total Booked</span>
                  <strong>{availabilityTotals.booked}</strong>
                </article>
                <article className="metric-card">
                  <span>Total Blocked</span>
                  <strong>{availabilityTotals.blocked}</strong>
                </article>
              </div>

              <p className="workspace-note">
                Availability preview date: {formatDateLabel(availabilityDate)}.
              </p>
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>{availabilityDayType === 'WEEKEND' ? 'Weekend Doctors' : 'Weekday Doctors'}</h3>
            </div>

            {filteredAvailabilityDoctors.length ? (
              <div className="doctor-availability-grid">
                {filteredAvailabilityDoctors.map((doctor) => (
                  <article key={doctor.id} className="availability-card">
                    <header>
                      <h4>{doctor.name}</h4>
                      <span>{doctor.specialization}</span>
                    </header>

                    <div className="availability-meta">
                      <span>Assigned Shift</span>
                      <strong>{doctor.shiftLabel}</strong>
                    </div>

                    <div className="availability-metrics">
                      <p>
                        <span>Free slots</span>
                        <strong>
                          {doctor.slotMetrics.free}/{doctor.slotMetrics.total}
                        </strong>
                      </p>
                      <p>
                        <span>Booked slots</span>
                        <strong>{doctor.slotMetrics.booked}</strong>
                      </p>
                      <p>
                        <span>Blocked slots</span>
                        <strong>{doctor.slotMetrics.blocked}</strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary btn-small availability-cta"
                      onClick={() => handleSelectAvailabilityDoctor(doctor)}
                    >
                      Use In Appointment Scheduling
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="workspace-note">
                No doctors found for selected {availabilityDayType.toLowerCase()} and specialization filters.
              </p>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'appointments' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Appointment Log</h3>
              <span className="badge badge-info">Reception can edit/cancel booked appointments</span>
            </div>

            <div className="appointment-log-toolbar">
              <label className="field">
                <span>Search by appointment ID, patient, doctor, status</span>
                <input
                  value={appointmentSearch}
                  onChange={(event) => setAppointmentSearch(event.target.value)}
                  placeholder="Search appointments"
                />
              </label>

              <label className="field">
                <span>Status Filter</span>
                <select
                  value={appointmentStatusFilter}
                  onChange={(event) => setAppointmentStatusFilter(event.target.value)}
                >
                  <option value="ALL">All ({appointmentStatusCounts.ALL})</option>
                  <option value="BOOKED">Booked ({appointmentStatusCounts.BOOKED})</option>
                  <option value="BLOCK">Blocked ({appointmentStatusCounts.BLOCK})</option>
                  <option value="CANCELLED">Cancelled ({appointmentStatusCounts.CANCELLED})</option>
                </select>
              </label>
            </div>

            <div className="table-wrap compact-table appointment-log-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Date/Time</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((appointment) => (
                    <tr key={appointment.id} className={getStatusClass(appointment.status)}>
                      <td>{appointment.id}</td>
                      <td>{appointment.patient?.name || '-'}</td>
                      <td>{doctorNameById.get(Number(appointment.doctorId)) || appointment.doctorId || '-'}</td>
                      <td>{formatDateTimeValue(appointment.appointmentTime)}</td>
                      <td>
                        <span className={`slot-chip ${getStatusClass(appointment.status)}`}>
                          {appointment.status || '-'}
                        </span>
                      </td>
                      <td>
                        {appointment.status === 'BOOKED' ? (
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => handleStartEditAppointment(appointment)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-small"
                              disabled={cancellingId === appointment.id}
                              onClick={() => handleCancelAppointment(appointment.id)}
                            >
                              {cancellingId === appointment.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filteredAppointments.length ? (
                    <tr>
                      <td colSpan={6}>No appointments found for current filter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'patients' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>All Patients</h3>
            </div>
            <label className="field">
              <span>Search patient by ID, name, email, phone</span>
              <input
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Search patients"
              />
            </label>

            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td>{patient.id}</td>
                      <td>{patient.name || '-'}</td>
                      <td>{patient.email || '-'}</td>
                      <td>{patient.phone || '-'}</td>
                      <td>{patient.source}</td>
                    </tr>
                  ))}
                  {!filteredPatients.length ? (
                    <tr>
                      <td colSpan={5}>No patients found for current filter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
