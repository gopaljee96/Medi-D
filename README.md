# MediCo — Role-based OPD Management Backend

[![Build](https://img.shields.io/badge/build-maven-brightgreen)](https://github.com/) [![Java](https://img.shields.io/badge/java-17-blue)](https://www.oracle.com/java/) [![Spring Boot](https://img.shields.io/badge/spring--boot-3.5.10-green)](https://spring.io/projects/spring-boot) [![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

A role-based healthcare / OPD management backend (with a Vite + React frontend) providing secure REST APIs for user/staff management, patient intake, appointment scheduling, prescriptions and pharmacy dispensing. Built for correctness, concurrency-safety and clear transactional guarantees. ⚕️

## Project Overview

MediCo is a backend-first OPD system implementing four roles (ADMIN, DOCTOR, RECEPTIONIST, PHARMACIST). Key flows: staff management, patient registration, appointment booking, prescribing, and safe medicine dispensing with transactional and locking protections.

## Features

- Role-based authentication & authorization (JWT)
- Staff and doctor roster management
- Patient registration and medical history
- Appointment booking and slot blocking
- Prescription creation and queueing
- Pharmacy dispense flow with pessimistic locking and retry
- Declarative (@Transactional) and programmatic (TransactionHelper) transaction patterns
- Concurrency hardening recommendations and scripts

## Tech Stack

- Backend: Java 17, Spring Boot 3.5.10, Spring Data JPA, Spring Security, Maven
- Database: PostgreSQL (production), H2 (dev/tests)
- Auth & Security: JWT, BCrypt
- Rate limiting: Bucket4j
- Frontend: React (Vite), Axios (separate repo: frontend/)

## System Architecture / Workflow

- Frontend (Vite + React) → Backend REST API (/api/*)
- Backend enforces role-based routes (e.g. /api/admin/** → ADMIN)
- Critical operations (dispense) use PESSIMISTIC_WRITE locks on prescription and transactional methods to ensure atomicity
- Retry wrapper handles transient lock failures with exponential backoff

## User Roles and Functionalities

- ADMIN: manage staff, reset passwords, sync doctor roster
- RECEPTIONIST: register patients, book appointments, view ledger
- DOCTOR: view own schedule/patients, add notes, create prescriptions
- PHARMACIST: view queue, dispense medicines (transactional)

## Database Design Overview

Core entities: users (app_users), doctor, patient, appointment, medicine, prescription, prescription_medicines (ElementCollection map). Important notes:
- `User.role` is a Java enum (stored as STRING)
- Appointment stores doctorId as scalar (application-enforced linkage)
- Prescription -> prescription_medicines represents medicine→quantity map
- Recommended DB constraints: unique(doctor_id, appointment_time) to avoid double-booking

## API Overview

Auth
- POST /api/auth/login
- POST /api/auth/register (ADMIN)
- POST /api/auth/register-temp (bootstrap)
- GET /api/auth/roles

Admin
- GET /api/admin/staff
- POST /api/admin/staff
- PUT /api/admin/staff/{id}/password
- POST /api/admin/staff/sync-doctors

Doctors / Appointments / Patients / Pharmacy (selected)
- GET /api/doctors, POST /api/doctors
- GET /api/appointments, POST /api/appointments/book
- POST /api/pharmacy/dispense/{id}
- GET /api/pharmacy/queue

Transaction Demo (educational)
- /api/transaction-demo/** — demonstrates @Transactional vs manual TransactionHelper

(See PROJECT_DOCUMENTATION.md / TECHNICAL_SPECIFICATION.md for full API coverage.)

## Folder Structure

- src/ — backend source (controllers, services, repositories, model)
- src/main/resources — application.properties, schema.sql, db/migration
- frontend/ — Vite + React frontend (separate app)
- pom.xml, mvnw — Maven wrapper and build

## Setup & Installation

Prerequisites
- Java 17
- Maven
- PostgreSQL (or use H2 for local testing)

Quick start (backend)
1. Configure environment variables (see next section).
2. Build: mvn clean package
3. Run: ./mvnw spring-boot:run  (or java -jar target/Medico-*.jar)

Frontend (optional)
1. cd frontend
2. npm install
3. npm run dev

## Environment Variables / Configuration

Primary config files: src/main/resources/application.properties and application-h2.properties.
Typical env vars / properties:
- SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/mydb
- SPRING_DATASOURCE_USERNAME=postgres
- SPRING_DATASOURCE_PASSWORD=secret
- JWT_SECRET=<your-jwt-secret>
- VITE_API_BASE_URL (frontend proxy) — default /api

Note: production profile uses spring.jpa.hibernate.ddl-auto=validate. Use migrations (Flyway/Liquibase) to change schema.

## Running the Project

- Backend: ./mvnw spring-boot:run (port 8080 by default)
- Frontend: npm run dev (usually port 5173) — frontend proxies /api to backend in dev mode

Seeded users (dev)
- doctor / doctor123
- receptionist / recep123
- pharmacist / pharma123

## Future Improvements

- Add DB-level unique constraints for appointment concurrency hardening
- Introduce FK-based user↔doctor linkage instead of name-matching
- Add integration tests for high-concurrency booking and dispense flows
- Expose OpenAPI/Swagger specs
- Add audit trail for critical operations

## Contributors

- Primary author: Project repository (see git history)
- Contributors: see project commit log

## License

MIT License — see LICENSE file.

---

For detailed developer notes, transaction examples, concurrency tests and operational guidance, refer to TECHNICAL_SPECIFICATION.md, PROJECT_DOCUMENTATION.md, and the frontend/ README files in the `frontend/` folder.
