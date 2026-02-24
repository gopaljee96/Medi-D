import { useEffect, useMemo, useState } from 'react';
import {
  addPharmacyMedicine,
  cancelPrescription,
  dispensePrescription,
  listMedicines,
  listPharmacyQueue,
} from '../lib/api';

function extractMessage(error, fallbackMessage) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    (typeof error?.response?.data === 'string' ? error.response.data : '') ||
    fallbackMessage
  );
}

function getPrescriptionStatusClass(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PENDING') return 'slot-booked';
  if (normalized === 'DISPENSED') return 'slot-free';
  return 'slot-cancelled';
}

function isExpired(expiry) {
  if (!expiry) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(expiry);
  if (Number.isNaN(expiryDate.getTime())) return false;
  expiryDate.setHours(0, 0, 0, 0);
  return expiryDate.getTime() < today.getTime();
}

function getMedicineStatus(medicine) {
  if (isExpired(medicine?.expiry)) {
    return { label: 'EXPIRED', chipClass: 'inv-chip-expired', rowClass: 'inv-row-expired' };
  }

  const stock = Number(medicine?.stock || 0);
  if (stock <= 0) {
    return { label: 'OUT OF STOCK', chipClass: 'inv-chip-out', rowClass: 'inv-row-out' };
  }
  if (stock <= 10) {
    return { label: 'REORDER SOON', chipClass: 'inv-chip-low', rowClass: 'inv-row-low' };
  }
  return { label: 'IN STOCK', chipClass: 'inv-chip-in', rowClass: 'inv-row-in' };
}

export default function PharmacistDashboard() {
  const [queue, setQueue] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dispensingId, setDispensingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [activeTab, setActiveTab] = useState('dispense');
  const [addMedicineForm, setAddMedicineForm] = useState({
    name: '',
    quantity: '',
    expiry: '',
  });

  const pendingCount = useMemo(
    () => queue.filter((prescription) => String(prescription.status || '').toUpperCase() === 'PENDING').length,
    [queue],
  );

  const expiredMedicines = useMemo(
    () => medicines.filter((medicine) => getMedicineStatus(medicine).label === 'EXPIRED'),
    [medicines],
  );

  const lowStockMedicines = useMemo(
    () => medicines.filter((medicine) => getMedicineStatus(medicine).label === 'REORDER SOON').length,
    [medicines],
  );

  const filteredQueue = useMemo(() => {
    if (!searchTerm.trim()) return queue;
    const normalized = searchTerm.trim().toLowerCase();
    return queue.filter((item) => {
      const patientName = String(item.patientName || '').toLowerCase();
      const prescriptionId = String(item.prescriptionId || '').toLowerCase();
      const medicineNames = Object.keys(item.medicinesToDispense || {}).join(' ').toLowerCase();
      return (
        patientName.includes(normalized) ||
        prescriptionId.includes(normalized) ||
        medicineNames.includes(normalized)
      );
    });
  }, [queue, searchTerm]);

  const filteredMedicines = useMemo(() => {
    if (!medicineSearch.trim()) return medicines;
    const normalized = medicineSearch.trim().toLowerCase();
    return medicines.filter((medicine) => {
      const name = String(medicine.name || '').toLowerCase();
      const id = String(medicine.id || '').toLowerCase();
      return name.includes(normalized) || id.includes(normalized);
    });
  }, [medicines, medicineSearch]);

  const loadData = async ({ showSuccessMessage = false, isManualSync = false } = {}) => {
    if (isManualSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }

    try {
      const [queueResponse, medicinesResponse] = await Promise.all([listPharmacyQueue(), listMedicines()]);
      setQueue(Array.isArray(queueResponse) ? queueResponse : []);
      setMedicines(Array.isArray(medicinesResponse?.medicines) ? medicinesResponse.medicines : []);

      if (showSuccessMessage) {
        setStatus('Pharmacy data synced.');
        setStatusType('success');
      }
    } catch (error) {
      setStatus(extractMessage(error, 'Unable to load pharmacy data.'));
      setStatusType('error');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncNow = async () => {
    await loadData({ showSuccessMessage: true, isManualSync: true });
  };

  const handleDispense = async (prescriptionId) => {
    setDispensingId(prescriptionId);
    try {
      const responseText = await dispensePrescription(prescriptionId);
      setStatus(responseText || 'Dispensed successfully.');
      setStatusType('success');
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Dispense failed.'));
      setStatusType('error');
    } finally {
      setDispensingId(null);
    }
  };

  const handleCancel = async (prescriptionId) => {
    const confirmed = window.confirm('Cancel this prescription from pharmacy queue?');
    if (!confirmed) {
      return;
    }

    setCancellingId(prescriptionId);
    try {
      const response = await cancelPrescription(prescriptionId);
      setStatus(response?.message || 'Prescription cancelled successfully.');
      setStatusType('success');
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to cancel prescription.'));
      setStatusType('error');
    } finally {
      setCancellingId(null);
    }
  };

  const handleAddMedicine = async (event) => {
    event.preventDefault();

    if (!addMedicineForm.name.trim() || !addMedicineForm.quantity || !addMedicineForm.expiry) {
      setStatus('Medicine name, quantity, and expiry are required.');
      setStatusType('error');
      return;
    }

    try {
      const response = await addPharmacyMedicine({
        name: addMedicineForm.name.trim(),
        quantity: Number(addMedicineForm.quantity),
        expiry: addMedicineForm.expiry,
      });

      setStatus(response?.message || 'Medicine batch added successfully.');
      setStatusType('success');
      setAddMedicineForm({ name: '', quantity: '', expiry: '' });
      setActiveTab('all');
      await loadData();
    } catch (error) {
      setStatus(extractMessage(error, 'Failed to add medicine batch.'));
      setStatusType('error');
    }
  };

  return (
    <div className="workspace">
      <section className="workspace-head">
        <h2>Pharmacy Workstation</h2>
        <p>Dispense prescriptions, monitor inventory health, and intake new medicine batches.</p>
        <div className="metric-row">
          <article className="metric-card">
            <span>Pending Prescriptions</span>
            <strong>{pendingCount}</strong>
          </article>
          <article className="metric-card">
            <span>All Medicines</span>
            <strong>{medicines.length}</strong>
          </article>
          <article className="metric-card">
            <span>Low Stock</span>
            <strong>{lowStockMedicines}</strong>
          </article>
          <article className="metric-card">
            <span>Expired Medicines</span>
            <strong>{expiredMedicines.length}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="tab-row">
          <button
            type="button"
            className={`btn ${activeTab === 'dispense' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('dispense')}
          >
            Dispense Queue
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('all')}
          >
            Inventory
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'expired' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('expired')}
          >
            Expired
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'add' ? 'btn-primary' : 'btn-outline'} btn-small`}
            onClick={() => setActiveTab('add')}
          >
            Intake Stock
          </button>
          <button className="btn btn-outline btn-small" type="button" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        {status ? <div className={`status status-${statusType}`}>{status}</div> : null}
      </section>

      {activeTab === 'dispense' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Prescription Queue</h3>
            </div>

            <label className="field">
              <span>Search by patient, prescription ID, or medicine</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search queue"
              />
            </label>

            <div className="queue-list">
              {filteredQueue.map((item) => (
                <article className="queue-card" key={item.prescriptionId}>
                  <header>
                    <div>
                      <h4>Prescription #{item.prescriptionId}</h4>
                      <p>Patient: {item.patientName || 'Unknown Patient'}</p>
                    </div>
                    <span className={`pill ${getPrescriptionStatusClass(item.status)}`}>{item.status || 'PENDING'}</span>
                  </header>

                  <div className="med-list">
                    {item.medicinesToDispense && Object.keys(item.medicinesToDispense).length > 0 ? (
                      Object.entries(item.medicinesToDispense).map(([medicine, quantity]) => (
                        <div className="med-row" key={`${item.prescriptionId}-${medicine}`}>
                          <span>{medicine}</span>
                          <strong>Qty {quantity}</strong>
                        </div>
                      ))
                    ) : (
                      <p>No medicine details found.</p>
                    )}
                  </div>

                  <div className="table-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => handleDispense(item.prescriptionId)}
                      disabled={loading || dispensingId === item.prescriptionId || cancellingId === item.prescriptionId}
                    >
                      {dispensingId === item.prescriptionId ? 'Dispensing...' : 'Dispense'}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => handleCancel(item.prescriptionId)}
                      disabled={loading || cancellingId === item.prescriptionId || dispensingId === item.prescriptionId}
                    >
                      {cancellingId === item.prescriptionId ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                </article>
              ))}

              {!filteredQueue.length ? (
                <div className="empty-state">
                  <div className="empty-state-text">No matching pending prescriptions.</div>
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'all' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Inventory Overview</h3>
            </div>

            <label className="field">
              <span>Search by medicine name or ID</span>
              <input
                value={medicineSearch}
                onChange={(event) => setMedicineSearch(event.target.value)}
                placeholder="Search inventory"
              />
            </label>

            <p className="workspace-note">
              Status logic: IN STOCK (stock {'>'} 10 and not expired), REORDER SOON (1-10), OUT OF STOCK (0), EXPIRED (expiry passed).
            </p>

            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Stock</th>
                    <th>Expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMedicines.map((medicine) => {
                    const medicineStatus = getMedicineStatus(medicine);
                    return (
                      <tr key={medicine.id} className={medicineStatus.rowClass}>
                        <td>{medicine.id}</td>
                        <td>{medicine.name}</td>
                        <td>{medicine.stock}</td>
                        <td>{medicine.expiry || '-'}</td>
                        <td>
                          <span className={`inventory-chip ${medicineStatus.chipClass}`}>{medicineStatus.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredMedicines.length ? (
                    <tr>
                      <td colSpan={5}>No medicines found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'expired' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Expired Medicines</h3>
            </div>
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Stock</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredMedicines.map((medicine) => (
                    <tr key={medicine.id} className="slot-blocked">
                      <td>{medicine.id}</td>
                      <td>{medicine.name}</td>
                      <td>{medicine.stock}</td>
                      <td>{medicine.expiry || '-'}</td>
                    </tr>
                  ))}
                  {!expiredMedicines.length ? (
                    <tr>
                      <td colSpan={4}>No expired medicines currently.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'add' ? (
        <section className="workspace-grid single-grid">
          <article className="panel">
            <div className="panel-title">
              <h3>Intake Medicine Batch</h3>
            </div>
            <p className="workspace-note">
              Same medicine + same expiry merges stock automatically. New expiry creates a separate batch record.
            </p>
            <form className="form-grid" onSubmit={handleAddMedicine}>
              <label className="field">
                <span>Medicine Name</span>
                <input
                  value={addMedicineForm.name}
                  onChange={(event) =>
                    setAddMedicineForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Quantity</span>
                <input
                  type="number"
                  min="1"
                  value={addMedicineForm.quantity}
                  onChange={(event) =>
                    setAddMedicineForm((previous) => ({ ...previous, quantity: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Expiry</span>
                <input
                  type="date"
                  value={addMedicineForm.expiry}
                  onChange={(event) =>
                    setAddMedicineForm((previous) => ({ ...previous, expiry: event.target.value }))
                  }
                  required
                />
              </label>

              <div className="table-actions">
                <button className="btn btn-primary" type="submit">
                  Add Medicine Batch
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setAddMedicineForm({ name: '', quantity: '', expiry: '' })}
                >
                  Clear
                </button>
              </div>
            </form>
          </article>
        </section>
      ) : null}
    </div>
  );
}
