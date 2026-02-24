import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  blockSlot,
  createPrescription,
  getDoctorProfile,
  getPatientDetails,
  listAppointmentsByDoctor,
  listMedicines,
  listPatientPrescriptions,
  updatePatientHistory,
} from '../lib/api';

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

function getStatusClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'BOOKED') return 'slot-booked';
  if (normalized === 'BLOCK') return 'slot-blocked';
  if (normalized === 'CANCELLED') return 'slot-cancelled';
  return 'slot-free';
}

export default function DoctorDashboard() {
  const [profile, setProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [medicines, setMedicines] = useState([]);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientDetails, setPatientDetails] = useState(null);
  const [patientPrescriptions, setPatientPrescriptions] = useState([]);

  const [activeTab, setActiveTab] = useState('queue');
  const [queueSearch, setQueueSearch] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState('ALL');

  const [selectedMedicines, setSelectedMedicines] = useState({});
  const [historyNote, setHistoryNote] = useState('');
  const [blockTime, setBlockTime] = useState('');

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadingPatientContext, setLoadingPatientContext] = useState(false);
  const [savingPrescription, setSavingPrescription] = useState(false);
  const [blockingSlot, setBlockingSlot] = useState(false);
  const [updatingHistory, setUpdatingHistory] = useState(false);

  const [doctorLinkWarning, setDoctorLinkWarning] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('');

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort(
        (left, right) => new Date(left.appointmentTime).getTime() - new Date(right.appointmentTime).getTime(),
      ),
    [appointments],
  );

  const upcomingAppointments = useMemo(
    () => sortedAppointments.filter((appointment) => appointment.status === 'BOOKED' && appointment?.patient?.id),
    [sortedAppointments],
  );

  const blockedAppointments = useMemo(
    () => sortedAppointments.filter((appointment) => appointment.status === 'BLOCK'),
    [sortedAppointments],
  );

  const consultationQueue = useMemo(() => {
    const grouped = new Map();

    upcomingAppointments.forEach((appointment) => {
      const patient = appointment?.patient;
      if (!patient?.id) return;

      if (!grouped.has(patient.id)) {
        grouped.set(patient.id, {
          patient,
          appointments: [],
        });
      }
      grouped.get(patient.id).appointments.push(appointment);
    });

    return Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        appointments: [...entry.appointments].sort(
          (left, right) =>
            new Date(left.appointmentTime).getTime() - new Date(right.appointmentTime).getTime(),
        ),
      }))
      .map((entry) => ({
        ...entry,
        nextAppointmentTime: entry.appointments[0]?.appointmentTime,
      }))
      .sort(
        (left, right) =>
          new Date(left.nextAppointmentTime || 0).getTime() -
          new Date(right.nextAppointmentTime || 0).getTime(),
      );
  }, [upcomingAppointments]);

  const selectedQueueEntry = useMemo(
    () => consultationQueue.find((entry) => String(entry.patient.id) === String(selectedPatientId)) || null,
    [consultationQueue, selectedPatientId],
  );

  const filteredConsultationQueue = useMemo(() => {
    if (!queueSearch.trim()) return consultationQueue;
    const normalized = queueSearch.trim().toLowerCase();

    return consultationQueue.filter((entry) => {
      const values = [
        entry.patient.id,
        entry.patient.name,
        entry.patient.email,
        entry.patient.phone,
        entry.nextAppointmentTime,
      ];
      return values.some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [consultationQueue, queueSearch]);

  const filteredMedicines = useMemo(() => {
    if (!medicineSearch.trim()) return medicines;
    const normalized = medicineSearch.trim().toLowerCase();
    return medicines.filter((medicine) =>
      [medicine.id, medicine.name, medicine.expiry].some((value) =>
        String(value || '').toLowerCase().includes(normalized),
      ),
    );
  }, [medicines, medicineSearch]);

  const filteredScheduleAppointments = useMemo(() => {
    const normalized = scheduleSearch.trim().toLowerCase();

    return sortedAppointments.filter((appointment) => {
      if (scheduleStatusFilter !== 'ALL' && String(appointment.status || '').toUpperCase() !== scheduleStatusFilter) {
        return false;
      }

      if (!normalized) return true;

      const values = [
        appointment.id,
        appointment.patient?.id,
        appointment.patient?.name,
        appointment.appointmentTime,
        appointment.status,
      ];
      return values.some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [sortedAppointments, scheduleSearch, scheduleStatusFilter]);

  const scheduleStatusCounts = useMemo(
    () => ({
      ALL: sortedAppointments.length,
      BOOKED: sortedAppointments.filter((appointment) => appointment.status === 'BOOKED').length,
      BLOCK: sortedAppointments.filter((appointment) => appointment.status === 'BLOCK').length,
      CANCELLED: sortedAppointments.filter((appointment) => appointment.status === 'CANCELLED').length,
    }),
    [sortedAppointments],
  );

  const selectedMedicinesCount = useMemo(
    () => Object.keys(selectedMedicines).length,
    [selectedMedicines],
  );

  const bookedCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'BOOKED').length,
    [appointments],
  );

  const blockedCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'BLOCK').length,
    [appointments],
  );

  const filterCompletedAppointments = useCallback(async (appointmentsList) => {
    const bookedPatients = Array.from(
      new Set(
        appointmentsList
          .filter(
            (appointment) =>
              appointment?.status === 'BOOKED' &&
              appointment?.patient?.id &&
              appointment?.appointmentTime,
          )
          .map((appointment) => Number(appointment.patient.id)),
      ),
    );

    if (!bookedPatients.length) return appointmentsList;

    const patientPrescriptionResponses = await Promise.all(
      bookedPatients.map(async (patientId) => ({
        patientId,
        response: await listPatientPrescriptions(patientId).catch(() => null),
      })),
    );

    const latestDispensedByPatient = new Map();

    patientPrescriptionResponses.forEach(({ patientId, response }) => {
      const prescriptions = Array.isArray(response?.prescriptions) ? response.prescriptions : [];
      const latestDispensed = prescriptions
        .filter((prescription) => String(prescription?.status || '').toUpperCase() === 'DISPENSED')
        .map((prescription) => new Date(prescription?.createdAt))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((left, right) => right.getTime() - left.getTime())[0];

      if (latestDispensed) {
        latestDispensedByPatient.set(Number(patientId), latestDispensed);
      }
    });

    return appointmentsList.filter((appointment) => {
      if (appointment?.status !== 'BOOKED') return true;
      const patientId = Number(appointment?.patient?.id);
      if (!patientId || !appointment?.appointmentTime) return true;

      const latestDispensed = latestDispensedByPatient.get(patientId);
      if (!latestDispensed) return true;

      const appointmentDate = new Date(appointment.appointmentTime);
      if (Number.isNaN(appointmentDate.getTime())) return true;

      return latestDispensed.getTime() < appointmentDate.getTime();
    });
  }, []);

  const loadDashboardData = useCallback(async ({ isManualSync = false } = {}) => {
    if (isManualSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }

    try {
      const [profileResponse, medicinesResponse] = await Promise.all([getDoctorProfile(), listMedicines()]);

      setProfile(profileResponse || null);

      if (!profileResponse?.doctorId) {
        setDoctorLinkWarning(
          'Your doctor account is not linked to a doctor record. Ask admin to align doctor username/full name with doctor name.',
        );
        setAppointments([]);
      } else {
        const appointmentResponse = await listAppointmentsByDoctor(profileResponse.doctorId);
        const doctorAppointments = Array.isArray(appointmentResponse) ? appointmentResponse : [];
        const filteredAppointments = await filterCompletedAppointments(doctorAppointments);
        setAppointments(filteredAppointments);
        setDoctorLinkWarning('');
      }

      setMedicines(Array.isArray(medicinesResponse?.medicines) ? medicinesResponse.medicines : []);

      if (isManualSync) {
        setStatus('Doctor dashboard synced.');
        setStatusType('success');
      }
    } catch (error) {
      setStatus(extractMessage(error, 'Unable to load doctor dashboard data.'));
      setStatusType('error');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [filterCompletedAppointments]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const loadPatientHistory = async (patientId) => {
    if (!patientId) {
      setPatientDetails(null);
      setPatientPrescriptions([]);
      setHistoryNote('');
      return;
    }

    setLoadingPatientContext(true);
    try {
      const [details, prescriptionsResponse] = await Promise.all([
        getPatientDetails(patientId),
        listPatientPrescriptions(patientId),
      ]);
      setPatientDetails(details);
      setPatientPrescriptions(
        Array.isArray(prescriptionsResponse?.prescriptions) ? prescriptionsResponse.prescriptions : [],
      );
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to fetch patient history.'));
      setStatusType('error');
      setPatientDetails(null);
      setPatientPrescriptions([]);
    } finally {
      setLoadingPatientContext(false);
    }
  };

  const selectPatient = (patientId, nextTab) => {
    setSelectedPatientId(String(patientId || ''));
    if (nextTab) {
      setActiveTab(nextTab);
    }
    loadPatientHistory(patientId);
  };

  const updateMedicineQty = (medicineId, quantity) => {
    const numericQty = Number.parseInt(quantity, 10);
    setSelectedMedicines((previous) => {
      if (!numericQty || numericQty < 1) {
        const copy = { ...previous };
        delete copy[medicineId];
        return copy;
      }
      return { ...previous, [medicineId]: numericQty };
    });
  };

  const handlePrescribe = async (event) => {
    event.preventDefault();

    if (!selectedPatientId) {
      setStatus('Select a patient before prescribing.');
      setStatusType('error');
      return;
    }

    const medicineMap = Object.entries(selectedMedicines).reduce((accumulator, [key, value]) => {
      if (value > 0) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});

    if (Object.keys(medicineMap).length === 0) {
      setStatus('Add at least one medicine quantity.');
      setStatusType('error');
      return;
    }

    setSavingPrescription(true);
    try {
      const response = await createPrescription({
        patientId: Number(selectedPatientId),
        medicines: medicineMap,
      });

      setStatus(response?.message || 'Prescription submitted successfully.');
      setStatusType('success');
      setSelectedMedicines({});
      await loadDashboardData();
      await loadPatientHistory(selectedPatientId);
      setActiveTab('record');
    } catch (error) {
      setStatus(extractMessage(error, 'Prescription submission failed.'));
      setStatusType('error');
    } finally {
      setSavingPrescription(false);
    }
  };

  const handleBlockSlot = async (event) => {
    event.preventDefault();

    if (!profile?.doctorId) {
      setStatus('Doctor account is not linked to a doctor record.');
      setStatusType('error');
      return;
    }

    if (!blockTime) {
      setStatus('Date and time are required to block a slot.');
      setStatusType('error');
      return;
    }

    const blockDate = new Date(blockTime);
    if (Number.isNaN(blockDate.getTime()) || ![0, 30].includes(blockDate.getMinutes())) {
      setStatus('Slot blocking must use 30-minute intervals (minutes 00 or 30).');
      setStatusType('error');
      return;
    }

    setBlockingSlot(true);
    try {
      const response = await blockSlot({
        doctorId: Number(profile.doctorId),
        appointmentTime: blockTime,
      });

      setStatus(response?.message || 'Slot blocked successfully.');
      setStatusType('success');
      setBlockTime('');
      await loadDashboardData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to block slot.'));
      setStatusType('error');
    } finally {
      setBlockingSlot(false);
    }
  };

  const handleAddHistoryNote = async (event) => {
    event.preventDefault();
    if (!selectedPatientId) {
      setStatus('Select a patient first.');
      setStatusType('error');
      return;
    }
    if (!historyNote.trim()) {
      setStatus('Please enter diagnosis/history note.');
      setStatusType('error');
      return;
    }

    setUpdatingHistory(true);
    try {
      const response = await updatePatientHistory(Number(selectedPatientId), historyNote.trim());
      setStatus(response?.message || 'Patient history updated.');
      setStatusType('success');
      setHistoryNote('');
      await loadPatientHistory(selectedPatientId);
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to update history.'));
      setStatusType('error');
    } finally {
      setUpdatingHistory(false);
    }
  };

  return (
    <div className="workspace">
      <section className="workspace-head">
        <h2>Doctor Workstation</h2>
        <p>Queue-first consultation flow with focused patient record, prescription, and schedule controls.</p>
        <div className="metric-row">
          <article className="metric-card">
            <span>Total Slots</span>
            <strong>{appointments.length}</strong>
          </article>
          <article className="metric-card">
            <span>Consult Queue</span>
            <strong>{consultationQueue.length}</strong>
          </article>
          <article className="metric-card">
            <span>Booked Slots</span>
            <strong>{bookedCount}</strong>
          </article>
          <article className="metric-card">
            <span>Blocked Slots</span>
            <strong>{blockedCount}</strong>
          </article>
        </div>
        {profile ? (
          <p className="workspace-note">
            Logged in as <strong>{profile.doctorName || profile.username}</strong>
            {profile?.specialization ? ` (${profile.specialization})` : ''}
          </p>
        ) : null}
        {doctorLinkWarning ? <div className="status status-error">{doctorLinkWarning}</div> : null}
      </section>

      <section className="panel">
        <div className="tab-row">
          <button
            type="button"
            className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('queue')}
          >
            Consult Queue
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'record' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('record')}
          >
            Patient Record
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'prescription' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('prescription')}
          >
            Prescription Desk
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'schedule' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('schedule')}
          >
            Schedule Control
          </button>
          <button className="btn btn-outline btn-small" type="button" onClick={() => loadDashboardData({ isManualSync: true })} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        {status ? <div className={`status status-${statusType}`}>{status}</div> : null}
      </section>

      {activeTab === 'queue' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Consultation Queue</h3>
            </div>
            <label className="field">
              <span>Search by patient name, ID, phone, or time</span>
              <input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Search queue"
              />
            </label>

            <div className="doctor-queue-grid">
              {filteredConsultationQueue.map((entry) => (
                <button
                  key={entry.patient.id}
                  type="button"
                  className={`doctor-queue-card ${String(selectedPatientId) === String(entry.patient.id) ? 'doctor-queue-card-selected' : ''}`}
                  onClick={() => selectPatient(entry.patient.id)}
                >
                  <header>
                    <h4>{entry.patient.name || `Patient #${entry.patient.id}`}</h4>
                    <span>ID {entry.patient.id}</span>
                  </header>
                  <p>Next Slot: {formatDateTimeValue(entry.nextAppointmentTime)}</p>
                  <div className="doctor-queue-meta">
                    <span className="badge badge-primary">Appointments: {entry.appointments.length}</span>
                    <span className="badge badge-success">Status: Ready</span>
                  </div>
                </button>
              ))}

              {!filteredConsultationQueue.length ? (
                <div className="empty-state">
                  <div className="empty-state-text">No upcoming patients in queue.</div>
                </div>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Selected Patient Snapshot</h3>
            </div>

            {selectedQueueEntry ? (
              <>
                <div className="history-card">
                  <h4>{selectedQueueEntry.patient.name}</h4>
                  <p>Patient ID: {selectedQueueEntry.patient.id}</p>
                  <p>Next Appointment: {formatDateTimeValue(selectedQueueEntry.nextAppointmentTime)}</p>
                  <p>Total Upcoming Appointments: {selectedQueueEntry.appointments.length}</p>
                </div>

                <div className="table-actions doctor-snapshot-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => selectPatient(selectedQueueEntry.patient.id, 'record')}
                  >
                    Open Patient Record
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => selectPatient(selectedQueueEntry.patient.id, 'prescription')}
                  >
                    Start Prescription
                  </button>
                </div>

                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Appointment ID</th>
                        <th>Time</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedQueueEntry.appointments.map((appointment) => (
                        <tr key={appointment.id} className={getStatusClass(appointment.status)}>
                          <td>{appointment.id}</td>
                          <td>{formatDateTimeValue(appointment.appointmentTime)}</td>
                          <td>
                            <span className={`slot-chip ${getStatusClass(appointment.status)}`}>
                              {appointment.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="workspace-note">Select a patient from queue to view consultation snapshot.</p>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'record' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Patient Medical Record</h3>
            </div>

            {!selectedPatientId ? (
              <p className="workspace-note">Select a patient from Consult Queue first.</p>
            ) : loadingPatientContext ? (
              <p className="workspace-note">Loading patient context...</p>
            ) : (
              <>
                <div className="history-card">
                  <h4>Current Record</h4>
                  {patientDetails ? (
                    <>
                      <p>
                        <strong>{patientDetails.name}</strong> (ID: {patientDetails.patientId})
                      </p>
                      <p>{patientDetails.medicalHistory || 'No history available.'}</p>
                    </>
                  ) : (
                    <p>Patient details not available.</p>
                  )}
                </div>

                <form className="form-grid" onSubmit={handleAddHistoryNote}>
                  <label className="field">
                    <span>Add Diagnosis / History Note</span>
                    <textarea
                      rows="4"
                      value={historyNote}
                      onChange={(event) => setHistoryNote(event.target.value)}
                      placeholder="Diagnosis, observed symptoms, follow-up plan"
                    />
                  </label>
                  <button
                    className="btn btn-secondary"
                    type="submit"
                    disabled={!selectedPatientId || updatingHistory}
                  >
                    {updatingHistory ? 'Updating...' : 'Update History'}
                  </button>
                </form>
              </>
            )}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Prescription Timeline</h3>
            </div>

            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Prescription ID</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Medicines</th>
                  </tr>
                </thead>
                <tbody>
                  {patientPrescriptions.map((item) => (
                    <tr key={item.id} className={getStatusClass(item.status)}>
                      <td>{item.id}</td>
                      <td>
                        <span className={`slot-chip ${getStatusClass(item.status)}`}>{item.status}</span>
                      </td>
                      <td>{formatDateTimeValue(item.createdAt)}</td>
                      <td>{Object.keys(item.medicineQuantities || {}).length}</td>
                    </tr>
                  ))}
                  {!patientPrescriptions.length ? (
                    <tr>
                      <td colSpan={4}>No prescriptions for selected patient.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'prescription' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Prescription Builder</h3>
            </div>

            {!selectedPatientId ? (
              <p className="workspace-note">Select a patient from Consult Queue to start prescription.</p>
            ) : (
              <p className="workspace-note">
                Creating prescription for <strong>{patientDetails?.name || `Patient #${selectedPatientId}`}</strong>
              </p>
            )}

            <form className="form-grid" onSubmit={handlePrescribe}>
              <label className="field">
                <span>Search medicines</span>
                <input
                  value={medicineSearch}
                  onChange={(event) => setMedicineSearch(event.target.value)}
                  placeholder="Search by medicine name or ID"
                  disabled={!selectedPatientId}
                />
              </label>

              <div className="medicine-grid">
                {filteredMedicines.map((medicine) => (
                  <div className="medicine-item" key={medicine.id}>
                    <div>
                      <strong>{medicine.name}</strong>
                      <small>
                        Stock: {medicine.stock} | Expiry: {medicine.expiry || 'N/A'}
                      </small>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={selectedMedicines[medicine.id] || ''}
                      onChange={(event) => updateMedicineQty(medicine.id, event.target.value)}
                      placeholder="Qty"
                      disabled={!selectedPatientId}
                    />
                  </div>
                ))}

                {!filteredMedicines.length ? (
                  <div className="empty-state">
                    <div className="empty-state-text">No medicines match the current search.</div>
                  </div>
                ) : null}
              </div>

              <div className="doctor-prescription-footer">
                <span className="badge badge-primary">Selected Medicines: {selectedMedicinesCount}</span>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading || savingPrescription || !selectedPatientId}
                >
                  {savingPrescription ? 'Submitting...' : 'Submit Prescription'}
                </button>
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Patient Context</h3>
            </div>

            {selectedPatientId && patientDetails ? (
              <div className="history-card">
                <h4>{patientDetails.name}</h4>
                <p>ID: {patientDetails.patientId}</p>
                <p>{patientDetails.medicalHistory || 'No prior history available.'}</p>
              </div>
            ) : (
              <p className="workspace-note">Patient context will appear after selecting patient from queue.</p>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'schedule' ? (
        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Block Availability Slot</h3>
            </div>

            <form className="form-grid" onSubmit={handleBlockSlot}>
              <label className="field">
                <span>Doctor</span>
                <input value={profile?.doctorName || profile?.username || ''} readOnly />
              </label>

              <label className="field">
                <span>Date & Time (30-min interval)</span>
                <input
                  type="datetime-local"
                  step={1800}
                  value={blockTime}
                  onChange={(event) => setBlockTime(event.target.value)}
                  required
                />
              </label>

              <button className="btn btn-secondary" type="submit" disabled={loading || blockingSlot}>
                {blockingSlot ? 'Blocking...' : 'Mark Unavailable'}
              </button>
            </form>

            {blockedAppointments.length ? (
              <div className="mini-list">
                <h4>Blocked Slots</h4>
                {blockedAppointments.slice(-8).map((appointment) => (
                  <p key={appointment.id} className="slot-blocked">
                    {formatDateTimeValue(appointment.appointmentTime)}
                  </p>
                ))}
              </div>
            ) : null}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h3>Appointment Board</h3>
            </div>

            <div className="appointment-log-toolbar">
              <label className="field">
                <span>Search by patient, ID, time, status</span>
                <input
                  value={scheduleSearch}
                  onChange={(event) => setScheduleSearch(event.target.value)}
                  placeholder="Search appointment board"
                />
              </label>

              <label className="field">
                <span>Status Filter</span>
                <select
                  value={scheduleStatusFilter}
                  onChange={(event) => setScheduleStatusFilter(event.target.value)}
                >
                  <option value="ALL">All ({scheduleStatusCounts.ALL})</option>
                  <option value="BOOKED">Booked ({scheduleStatusCounts.BOOKED})</option>
                  <option value="BLOCK">Blocked ({scheduleStatusCounts.BLOCK})</option>
                  <option value="CANCELLED">Cancelled ({scheduleStatusCounts.CANCELLED})</option>
                </select>
              </label>
            </div>

            <div className="slot-legend">
              <span className="legend-item">
                <i className="legend-dot dot-booked" /> Booked
              </span>
              <span className="legend-item">
                <i className="legend-dot dot-blocked" /> Blocked
              </span>
              <span className="legend-item">
                <i className="legend-dot dot-cancelled" /> Cancelled
              </span>
            </div>

            <div className="table-wrap compact-table appointment-log-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Patient</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScheduleAppointments.map((appointment) => (
                    <tr key={appointment.id} className={getStatusClass(appointment.status)}>
                      <td>{appointment.id}</td>
                      <td>{appointment.patient?.name || '-'}</td>
                      <td>{formatDateTimeValue(appointment.appointmentTime)}</td>
                      <td>
                        <span className={`slot-chip ${getStatusClass(appointment.status)}`}>
                          {appointment.status || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!filteredScheduleAppointments.length ? (
                    <tr>
                      <td colSpan={4}>No appointments match your filter.</td>
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
