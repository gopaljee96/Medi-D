import axios from 'axios';
import { clearSession, getToken } from './session';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function withAuthHeaders(headers = {}) {
  const token = getToken();
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

export async function apiRequest({ method = 'GET', path, data, params, headers }) {
  try {
    const response = await axios({
      method,
      url: `${API_BASE_URL}${path}`,
      data,
      params,
      headers: withAuthHeaders(headers),
      timeout: 15000,
    });

    return response.data;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401) {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    throw error;
  }
}

export async function login(credentials) {
  return apiRequest({
    method: 'POST',
    path: '/auth/login',
    data: credentials,
  });
}

export async function registerUser(payload) {
  return apiRequest({
    method: 'POST',
    path: '/auth/register',
    data: payload,
  });
}

export async function registerPatient(payload, validated = false) {
  return apiRequest({
    method: 'POST',
    path: validated ? '/patients/register-valid' : '/patients/register',
    data: payload,
  });
}

export async function pingBackend() {
  return apiRequest({
    method: 'GET',
    path: '/doctor/medicines',
  });
}

export async function listDoctors() {
  return apiRequest({
    method: 'GET',
    path: '/doctors',
  });
}

export async function createDoctor(payload) {
  return apiRequest({
    method: 'POST',
    path: '/doctors',
    data: payload,
  });
}

export async function updateDoctor(id, payload) {
  return apiRequest({
    method: 'PUT',
    path: `/doctors/${id}`,
    data: payload,
  });
}

export async function deleteDoctor(id) {
  return apiRequest({
    method: 'DELETE',
    path: `/doctors/${id}`,
  });
}

export async function listAppointments() {
  return apiRequest({
    method: 'GET',
    path: '/appointments',
  });
}

export async function listAppointmentsByDoctor(doctorId) {
  return apiRequest({
    method: 'GET',
    path: `/appointments/doctor/${doctorId}`,
  });
}

export async function listAppointmentsByPatient(patientId) {
  return apiRequest({
    method: 'GET',
    path: `/appointments/patient/${patientId}`,
  });
}

export async function listAvailableDoctors() {
  return apiRequest({
    method: 'GET',
    path: '/appointments/available-doctors',
  });
}

export async function bookAppointment(payload) {
  return apiRequest({
    method: 'POST',
    path: '/appointments/book',
    data: payload,
  });
}

export async function cancelAppointment(appointmentId) {
  return apiRequest({
    method: 'PUT',
    path: `/appointments/${appointmentId}/cancel`,
  });
}

export async function blockSlot(payload) {
  return apiRequest({
    method: 'POST',
    path: '/appointments/block',
    data: payload,
  });
}

export async function listMedicines() {
  return apiRequest({
    method: 'GET',
    path: '/doctor/medicines',
  });
}

export async function listAdminMedicines() {
  return apiRequest({
    method: 'GET',
    path: '/admin/medicines',
  });
}

export async function createAdminMedicine(payload) {
  return apiRequest({
    method: 'POST',
    path: '/admin/medicines',
    data: payload,
  });
}

export async function updateAdminMedicine(id, payload) {
  return apiRequest({
    method: 'PUT',
    path: `/admin/medicines/${id}`,
    data: payload,
  });
}

export async function deleteAdminMedicine(id) {
  return apiRequest({
    method: 'DELETE',
    path: `/admin/medicines/${id}`,
  });
}

export async function listAdminPatients() {
  return apiRequest({
    method: 'GET',
    path: '/admin/patients',
  });
}

export async function createAdminPatient(payload) {
  return apiRequest({
    method: 'POST',
    path: '/admin/patients',
    data: payload,
  });
}

export async function updateAdminPatient(id, payload) {
  return apiRequest({
    method: 'PUT',
    path: `/admin/patients/${id}`,
    data: payload,
  });
}

export async function deleteAdminPatient(id) {
  return apiRequest({
    method: 'DELETE',
    path: `/admin/patients/${id}`,
  });
}

export async function getPatientDetails(patientId) {
  return apiRequest({
    method: 'GET',
    path: `/doctor/patient/${patientId}`,
  });
}

export async function updatePatientHistory(patientId, note) {
  return apiRequest({
    method: 'PUT',
    path: `/doctor/patient/${patientId}/history`,
    data: { note },
  });
}

export async function createPrescription(payload) {
  return apiRequest({
    method: 'POST',
    path: '/doctor/prescribe',
    data: payload,
  });
}

export async function listPatientPrescriptions(patientId) {
  return apiRequest({
    method: 'GET',
    path: `/doctor/prescriptions/patient/${patientId}`,
  });
}

export async function getDoctorProfile() {
  return apiRequest({
    method: 'GET',
    path: '/doctor/profile',
  });
}

export async function listPharmacyQueue() {
  return apiRequest({
    method: 'GET',
    path: '/pharmacy/queue',
  });
}

export async function dispensePrescription(prescriptionId) {
  return apiRequest({
    method: 'POST',
    path: `/pharmacy/dispense/${prescriptionId}`,
  });
}

export async function cancelPrescription(prescriptionId) {
  return apiRequest({
    method: 'POST',
    path: `/pharmacy/cancel/${prescriptionId}`,
  });
}

export async function addPharmacyMedicine(payload) {
  return apiRequest({
    method: 'POST',
    path: '/pharmacy/medicines',
    data: payload,
  });
}

export async function listStaff() {
  return apiRequest({
    method: 'GET',
    path: '/admin/staff',
  });
}

export async function createStaff(payload) {
  return apiRequest({
    method: 'POST',
    path: '/admin/staff',
    data: payload,
  });
}

export async function resetStaffPassword(userId, newPassword) {
  return apiRequest({
    method: 'PUT',
    path: `/admin/staff/${userId}/password`,
    data: { newPassword },
  });
}

export async function syncDoctorRecords() {
  return apiRequest({
    method: 'POST',
    path: '/admin/staff/sync-doctors',
  });
}
