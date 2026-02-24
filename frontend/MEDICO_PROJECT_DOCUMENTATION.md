# MediCo Project Documentation (Frontend + Backend)

Date: 2026-02-23

## 1. Document Purpose
This document explains the full MediCo implementation in practical, client-friendly, and developer-friendly language.
It is designed for:
- client walkthroughs,
- team onboarding,
- technical handover,
- production troubleshooting.

It covers both projects:
- Frontend: `medi-dfrontend` (React + Vite)
- Backend: `Medico` (Spring Boot)

## 2. Product Overview
MediCo is a role-based OPD workflow system with four roles:
- `ADMIN`
- `RECEPTIONIST`
- `DOCTOR`
- `PHARMACIST`

Main business flows:
1. Admin creates/manages staff users and doctor roster.
2. Receptionist registers patients and books appointments.
3. Doctor sees only own schedule/patients, adds clinical notes, prescribes medicines.
4. Pharmacist dispenses pending prescriptions safely.

## 3. Architecture Overview

### 3.1 High-Level Architecture
- Frontend is a role-based SPA using JWT session in browser storage.
- Backend provides role-protected REST APIs.
- Database stores users, doctors, patients, appointments, medicines, prescriptions.
- Frontend calls backend through `VITE_API_BASE_URL` (default `/api`).

### 3.2 Frontend Structure (`medi-dfrontend`)
- Routing and protection: `src/App.jsx`
- API layer: `src/lib/api.js`
- Session utilities: `src/lib/session.js`
- Role pages:
  - `src/pages/LoginPage.jsx`
  - `src/pages/AdminDashboard.jsx`
  - `src/pages/ReceptionistDashboard.jsx`
  - `src/pages/DoctorDashboard.jsx`
  - `src/pages/PharmacistDashboard.jsx`

### 3.3 Backend Structure (`Medico`)
- Controllers: role endpoints and workflow APIs
- Services: auth logic, pharmacy logic, manual/declarative transaction examples
- Repositories: Spring Data JPA access
- Security: JWT filter, token provider, route-level authorization
- Models: JPA entities for business data

## 4. Technology Stack

### 4.1 Frontend
- React 19
- React Router 7
- Axios
- Vite 7
- Lucide React (icons)

### 4.2 Backend
- Spring Boot 3.5.10
- Java 17
- Spring Web
- Spring Data JPA
- Spring Security
- Bean Validation
- JWT (`jjwt`)
- Bucket4j (rate limiting)
- PostgreSQL runtime driver
- H2 runtime driver

## 5. Role Responsibilities and Guardrails

### 5.1 Admin
- Create staff users.
- Reset any user password.
- Manage doctor roster (create/update/delete).
- Trigger doctor sync to create missing doctor records for legacy DOCTOR users.

### 5.2 Receptionist
- Register patient with complaint/cause and notes.
- Assign patient to doctor by slot.
- Cannot book unavailable slot.
- Cannot assign same patient to two doctors at same time slot.

### 5.3 Doctor
- Can view only own appointments.
- Can block only own slot.
- Can select only patients from own appointment list in UI.
- Can add diagnosis/history notes to patient record.
- Can create prescription for selected patient.

### 5.4 Pharmacist
- Sees pending queue only.
- Dispenses prescription with stock safety checks.

## 6. Frontend Implementation Details

### 6.1 Login and Session
- Login sends credentials to `/api/auth/login`.
- JWT token and user payload are stored in localStorage.
- Protected routes enforce role before dashboard access.
- Any `401/403` from API clears session and redirects to `/login`.

### 6.2 Receptionist Dashboard
- Patient intake form includes:
  - name, email, phone, address,
  - chief complaint/cause,
  - optional history notes.
- Appointment booking form:
  - doctor dropdown from backend roster,
  - patient id,
  - date-time slot.
- UI pre-validates conflicts, and backend enforces final authority.

### 6.3 Doctor Dashboard
- Loads doctor profile first to determine resolved `doctorId`.
- Fetches appointments for that doctor id only.
- Patient dropdown is derived only from doctor's own appointments.
- Block slot action uses own resolved `doctorId`.
- History update writes a timestamped note entry.

### 6.4 Admin Dashboard
- Staff create/reset password panel.
- Doctor roster management panel.
- Sync button executes `/api/admin/staff/sync-doctors` so new/old doctor users appear in receptionist doctor list.

### 6.5 Pharmacist Dashboard
- Shows queue from `/api/pharmacy/queue`.
- Dispense action triggers transactional backend flow.

## 7. Backend Security and Login Flow

### 7.1 Authentication Flow
1. User posts username/password to `/api/auth/login`.
2. Backend validates user existence, active state, and BCrypt password match.
3. Backend returns JWT with claims: `subject=username`, `role`, `fullName`.
4. Frontend stores token and attaches `Authorization: Bearer <token>` in subsequent calls.

### 7.2 Authorization Rules
- `/api/admin/**` -> ADMIN
- `/api/pharmacy/**` -> PHARMACIST
- `/api/doctor/**` -> DOCTOR
- `/api/patients/**`, `/api/appointments/**` -> RECEPTIONIST or DOCTOR (plus endpoint-level checks)
- Public/permitAll includes `/api/auth/login`, `/api/auth/register-temp`, `/api/doctor/medicines`

### 7.3 Request Rate Limiting
- Implemented in JWT filter using Bucket4j.
- Limit: 100 requests/minute per client IP.
- Exceeding limit returns HTTP 429.

## 8. Backend API Coverage (Working Set)

### 8.1 Auth
- `POST /api/auth/login`
- `POST /api/auth/register` (ADMIN protected)
- `POST /api/auth/register-temp` (open, mainly for bootstrap/testing)
- `GET /api/auth/roles`

### 8.2 Admin
- `GET /api/admin/staff`
- `POST /api/admin/staff`
- `PUT /api/admin/staff/{id}/password`
- `POST /api/admin/staff/sync-doctors`

### 8.3 Doctors Roster
- `GET /api/doctors`
- `GET /api/doctors/{id}`
- `POST /api/doctors`
- `PUT /api/doctors/{id}`
- `DELETE /api/doctors/{id}`

### 8.4 Appointments
- `GET /api/appointments`
- `GET /api/appointments/patient/{patientId}`
- `GET /api/appointments/doctor/{doctorId}`
- `POST /api/appointments/book`
- `PUT /api/appointments/{appointmentId}/cancel`
- `POST /api/appointments/block`
- `GET /api/appointments/available-doctors`

### 8.5 Doctor Operations
- `GET /api/doctor/medicines`
- `GET /api/doctor/profile`
- `GET /api/doctor/patient/{patientId}`
- `PUT /api/doctor/patient/{patientId}/history`
- `POST /api/doctor/prescribe`
- `GET /api/doctor/prescriptions/patient/{patientId}`

### 8.6 Pharmacy
- `GET /api/pharmacy/queue`
- `POST /api/pharmacy/dispense/{id}`

### 8.7 Patients
- `POST /api/patients/register`
- `POST /api/patients/register-valid`

### 8.8 Transaction Demo Endpoints (Learning/Validation)
- `/api/transaction-demo/**` endpoints demonstrate declarative vs manual transactions.

## 9. Transaction Management, Concurrency, and Locking

### 9.1 Core Transaction Pattern Used in Production Flow
Most important transactional logic is in pharmacy dispensing:
- Entry method: `dispenseMedicines(prescriptionId)`
- Calls transactional method with retry wrapper.
- Transactional method: `doDispenseTransactional` with `@Transactional(rollbackFor = Exception.class)`.

### 9.2 Pessimistic Locking in Dispense Flow
- `PrescriptionRepository.findByIdWithLock` uses `@Lock(PESSIMISTIC_WRITE)`.
- This is used before stock update to protect prescription row from concurrent modification.
- If lock cannot be acquired promptly, transient lock failures are retried up to 3 times with backoff.

### 9.3 Retry Behavior for Lock Conflicts
- Catches `PessimisticLockingFailureException`.
- Retries max 3 attempts.
- Wait policy: `100ms * attempt`.
- After max retries: throws failure and request returns error.

### 9.4 Rollback Guarantees
Inside `doDispenseTransactional`:
- all medicine stock checks run before final completion,
- if any medicine has insufficient stock, throws exception,
- entire transaction rolls back,
- prescription status remains unchanged,
- no partial stock deduction should remain.

### 9.5 Manual vs Declarative Transactions
Backend includes both styles:
- Declarative (`@Transactional`) in service methods.
- Programmatic (`TransactionHelper`) with explicit begin/commit/rollback.

`TransactionHelper` defaults:
- propagation: `REQUIRED`
- isolation: `READ_COMMITTED`
- optional read-only execution method
- optional custom isolation execution method

### 9.6 Concurrency Notes and Current State
- Critical concurrency handling exists for pharmacy dispense.
- Appointment booking currently uses application-level conflict checks (`findAll().stream().anyMatch(...)`).
- That means true high-contention races are not fully prevented at DB constraint level yet.
- Recommended hardening for production scale:
  1. DB unique index on `(doctor_id, appointment_time)` for active slots.
  2. Optional unique guard for `(patient_id, appointment_time)` for booked status.
  3. Convert booking to repository-level conditional insert or transactional lock-based check.

## 10. Database Model and Effective Schema

### 10.1 Entity-Level Data Model (JPA)
Main entities:
- `User` -> auth identity (username, email, BCrypt password, role, fullName)
- `Doctor` -> doctor roster record (name, specialization)
- `Patient` -> demographics + `medicalHistory` (TEXT)
- `Appointment` -> doctorId, patient FK, appointmentTime, status
- `Medicine` -> stock and expiry
- `Prescription` -> patient FK, status, createdAt
- `prescription_medicines` (via `@ElementCollection`) -> medicine_id to quantity map

### 10.2 Relationship Summary
- One Patient -> many Appointments
- One Patient -> many Prescriptions
- One Prescription -> many medicine quantity rows in `prescription_medicines`

### 10.3 Important User Table Note
In `User` entity:
- `active`, `createdAt`, `updatedAt` are marked `@Transient` currently.
- Reason: avoid schema mismatches in existing environments while migration ownership is stabilized.

### 10.4 `schema.sql` Reality
Current `schema.sql` includes only idempotent ALTER statements for app_users columns:
- add `active` if missing,
- add `created_at` if missing,
- add `updated_at` if missing.

Because `spring.jpa.hibernate.ddl-auto=validate` in PostgreSQL profile, DB schema must already align with entities.

### 10.5 Profile Configuration
- PostgreSQL profile (`application.properties`):
  - datasource `jdbc:postgresql://localhost:5432/mydb`
  - `ddl-auto=validate`
- H2 profile (`application-h2.properties`):
  - in-memory DB
  - `ddl-auto=create-drop`

## 11. Doctor User <-> Doctor Record Linking Logic
This directly addresses the "doctor can login but not visible in receptionist doctor list" class of issues.

### 11.1 Auto-Link During Staff Registration
When a user is created with role `DOCTOR`:
- backend checks if doctor record exists by username (case-insensitive),
- fallback check by full name,
- if not found, creates doctor record with specialization `General`.

### 11.2 Sync for Legacy Data
Admin endpoint `/api/admin/staff/sync-doctors`:
- scans all DOCTOR users,
- creates missing doctor records,
- returns how many records were created.

### 11.3 Self-Heal During Doctor Access
In doctor profile resolution and appointment-doctor resolution paths:
- if DOCTOR user has no matching doctor record,
- backend creates one automatically (self-heal) using username + `General`.

This ensures:
- new doctor users can log in,
- doctors appear in receptionist dropdown,
- doctor dashboard can resolve doctor context reliably.

## 12. End-to-End Workflow Walkthrough

### 12.1 Admin Creates Doctor
1. Admin creates DOCTOR user.
2. Backend creates user + doctor roster record.
3. Optional sync catches any legacy missed mappings.

### 12.2 Reception Registers and Books
1. Reception registers patient with complaint/cause.
2. Reception selects doctor from dropdown.
3. Backend prevents invalid slot conflicts.

### 12.3 Doctor Works on Assigned Patients
1. Doctor dashboard loads profile and own appointments.
2. Doctor selects patient from own list.
3. Doctor sees history and adds diagnosis notes.
4. Doctor prescribes medicine quantities.

### 12.4 Pharmacist Dispenses Safely
1. Pharmacist opens pending queue.
2. Dispense API runs locked transactional stock update.
3. On failure (insufficient stock/lock failure), transaction fails safely.

## 13. Operational Runbook

### 13.1 Backend Start
- Go to `/home/gopal/Downloads/Medico`
- Run: `./mvnw spring-boot:run`

### 13.2 Frontend Start
- Go to `/home/gopal/Downloads/medi-dfrontend`
- Run: `npm install`
- Run: `npm run dev`

### 13.3 If New Doctors Are Not Visible in Reception
1. Ensure backend is latest code and restarted.
2. Login as admin and run `Sync Existing Doctor Records`.
3. Refresh receptionist dashboard.

### 13.4 If Doctor Sees Link Warning
If warning appears:
- "Your doctor account is not linked to a doctor record..."
Do this:
1. Run admin doctor sync.
2. Confirm doctor username/fullName and doctor roster name alignment.
3. Re-login doctor account.

## 14. Quality and Stability Notes

### 14.1 What Is Strong
- Role boundaries are enforced in both UI and backend.
- Critical pharmacy flow has transaction + lock + retry.
- Admin password reset and doctor sync close major operational gaps.
- Doctor and receptionist workflows are aligned to real clinic behavior.

### 14.2 What To Improve Next (Recommended)
1. Add DB-level unique constraints for appointment concurrency hardening.
2. Add integration tests for booking conflict race conditions.
3. Replace open `register-temp` path in production.
4. Add audit trail table for admin actions and critical updates.
5. Normalize appointment status values with enum.

## 15. Client-Friendly Summary
MediCo now behaves like a practical clinic workflow:
- reception handles intake and scheduling,
- doctors only work in their own assigned context,
- pharmacists dispense from safe stock-aware queue,
- admin controls user lifecycle and support actions.

The system is now simple to use, role-safe, and technically stronger where it matters most (security, transactions, and operational recovery tools).
