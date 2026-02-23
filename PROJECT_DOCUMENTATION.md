# Medico — Project & Database Documentation

Last updated: 2026-02-22

This document summarizes the runtime configuration, database schema, locking and transactional behaviour, and recommended steps to test concurrency and reproduce request duplication.

---

## 1) Runtime configuration
- Application properties: `src/main/resources/application.properties` controls DB connection and Hibernate DDL mode.
- Important: `spring.jpa.hibernate.ddl-auto` should be `validate` in production-like environments to avoid Hibernate issuing DDL when the DB user is not the owner. Use migrations (Flyway/Liquibase) to make schema changes instead of `update`.

## 2) Database schema (current important objects)
- Table: `users`
  - Columns of interest (expected): `id`, `email`, `password`, `roles`, `active` (boolean), `created_at` (timestamp), `updated_at` (timestamp), `full_name`.
  - Note: `src/main/resources/schema.sql` includes idempotent ALTER statements that add `active`, `created_at`, and `updated_at` if missing.

- Table: `appointment`
  - Each appointment links to a doctor (foreign key column `doctor_id`) and has `appointment_time` and `status`.
  - Important: ensure a unique constraint exists for (doctor_id, appointment_time) to prevent double booking.

- Table: `prescription`
  - Contains `id`, `patient_id`, `status` (e.g., PENDING, DISPENSED), and a JSON/map of medicine quantities (implementation-specific).

- Table: `medicine`
  - Contains `id`, `name`, `stock`, `expiry_date` etc.

Note: Entity source code in `src/main/java/com/example/Medico/model` is the authoritative mapping for JPA. The DDL must match these mappings.

## 3) Pessimistic locking & transactions: how we implemented
- Repositories may expose locked lookups using JPA's `@Lock(LockModeType.PESSIMISTIC_WRITE)` and `@Query(...)` to fetch rows with a DB-level write lock.
- Example uses:
  - `MedicineRepository.findByIdWithLock(id)` — acquires PESSIMISTIC_WRITE on the medicine row when checking/updating stock.
  - `PrescriptionRepository.findByIdWithLock(id)` — should be used to lock the prescription row during dispense.
  - `DoctorRepository.findByIdWithLock(id)` and `AppointmentRepository.findBookedByDoctorAndTimeWithLock(...)` — used to make booking atomic.
- Services performing multi-row checks/updates should run in a single `@Transactional` method so locks are held for the transaction duration and rollback is automatic on exceptions.

## 4) Why duplicate API requests happen (common causes)
- Frontend: React Dev mode's `StrictMode` double-invokes some lifecycle methods (e.g., mounting effects) causing double fetches in development builds. Also duplicate event handlers, double-clicks, or submitting forms twice due to lack of debounce can cause two requests.
- Network/browser: Extensions or tooling can replay requests; CORS preflight only issues an OPTIONS request (not duplicate POST/GET), so duplicates are usually client-side.
- Backend: misconfigured reverse proxies, load balancers, or controller code that forwards/forwards again (rare).

## 5) How to observe duplicate requests (quick steps)
1. Start the Spring Boot application and watch logs. The project contains a request-logging filter at `src/main/java/com/example/Medico/config/RequestLoggingFilter.java` which logs request arrival and response with duration.
2. Open the browser DevTools Network tab and observe duplicates. Compare timestamps in server logs with the network timeline — matching identical timestamps confirms duplicates.

## 6) Safe changes to harden the backend
- Make key endpoints idempotent where feasible (e.g., dispense operation should be safe to call twice — only the first should transition status from PENDING -> DISPENSED and deduct stock).
- Add DB constraints:
  - Unique constraint for appointment booking: `ALTER TABLE appointment ADD CONSTRAINT uq_doctor_time UNIQUE (doctor_id, appointment_time);`
  - Use `CHECK` or foreign key constraints for data integrity.
- Add repository-level `@Lock(PESSIMISTIC_WRITE)` lookups and perform the operation inside `@Transactional` service methods.

## 7) How to apply DB fixes (recommended)
1. As DB owner or postgres superuser run `schema.sql` or the following commands:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE appointment ADD CONSTRAINT IF NOT EXISTS uq_doctor_time UNIQUE (doctor_id, appointment_time);
```
2. Alternatively, create a Flyway migration file (see `src/main/resources/db/migration` using Flyway) and run migrations during deployment.

## 8) Concurrency test scripts (example)
- Concurrent booking test (Bash, 20 parallel requests):
```bash
#!/usr/bin/env bash
URL="http://localhost:8080/api/appointments/book"
DATA='{"patientId":1,"doctorId":2,"time":"2026-02-25T10:00:00"}'
for i in {1..20}; do
  (curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "$DATA" $URL) &
done
wait
```
- Concurrent dispense test (10 parallel requests):
```bash
#!/usr/bin/env bash
URL="http://localhost:8080/api/pharmacy/dispense/123"
for i in {1..10}; do
  (curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL) &
done
wait
```

Check the server logs from the `RequestLoggingFilter` and service logs to verify only one successful transition occurs for the booking/dispense.
