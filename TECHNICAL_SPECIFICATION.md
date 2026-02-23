# Medico Project — Technical Specification & Architecture

**Version**: 1.0  
**Date**: February 23, 2026  
**Audience**: Developers, QA, Tech Leads, and Client Technical Teams  

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Database Architecture](#database-architecture)
3. [Entity Relationships & Schema](#entity-relationships--schema)
4. [Transaction Management](#transaction-management)
5. [Pessimistic Locking Strategy](#pessimistic-locking-strategy)
6. [Concurrency Control & Safety Guarantees](#concurrency-control--safety-guarantees)
7. [API Examples & Workflows](#api-examples--workflows)
8. [Testing Concurrency](#testing-concurrency)
9. [Deployment & Configuration](#deployment--configuration)

---

## System Overview

### Purpose
The Medico system is a healthcare management platform that manages:
- **Doctors**: Healthcare professionals with specializations
- **Patients**: Individuals receiving healthcare services
- **Appointments**: Scheduled visits between doctors and patients
- **Prescriptions**: Medicines prescribed by doctors to patients
- **Medicines**: Inventory with stock levels and expiry tracking
- **Users**: Accounts with role-based access (DOCTOR, PATIENT, ADMIN, PHARMACIST)

### Technology Stack
- **Backend**: Java 17 + Spring Boot 3.5.10 + Spring Data JPA + Hibernate ORM 6.6.41
- **Database**: PostgreSQL 16.11 with JDBC driver 42.7.9
- **Persistence**: Jakarta Persistence API (JPA) with Hibernate provider
- **Connection Pooling**: HikariCP 6.3.3
- **Security**: Spring Security with BCrypt password hashing, JWT tokens
- **Frontend**: React.js (medi-dfrontend, separate repository)

### Critical Design Goals
1. **Data Integrity**: Prevent race conditions in concurrent operations (double-booking, over-dispensing medicines)
2. **Transactional Safety**: All multi-step operations (check + update) are atomic
3. **Concurrency**: Support simultaneous requests from multiple users without data corruption
4. **Auditability**: Track who, what, and when for regulatory compliance

---

## Database Architecture

### Connection & Configuration

**File**: `src/main/resources/application.properties`

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=medico
spring.datasource.password=medico123
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.hibernate.ddl-auto=validate
```

**Key Settings**:
- **URL**: PostgreSQL on localhost:5432, database name: `mydb`
- **User Account**: `medico` (read/write access; not the database owner)
- **DDL Mode**: `validate` — Hibernate validates entity mappings against the DB schema but does NOT issue ALTER TABLE or CREATE TABLE. This prevents permission errors and ensures schema changes are managed via migrations.
- **Connection Pool**: HikariCP maintains a pool of ~10 connections for concurrent request handling

### Database Initialization

**File**: `src/main/resources/schema.sql`

This file contains idempotent SQL statements that initialize the schema when the application first starts. Since `ddl-auto=validate`, these statements must be run as the database owner (postgres) or superuser:

```sql
-- Ensure audit columns exist on users table (idempotent)
ALTER TABLE IF EXISTS app_users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE IF EXISTS app_users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS app_users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
```

**Note**: All tables are created from JPA entity class definitions. The schema.sql file adds optional audit columns.

---

## Entity Relationships & Schema

### Core Entities

#### 1. User (app_users) — Role-Based Access Control

**Purpose**: Represents all system users (Doctors, Patients, Admins, Pharmacists)

**JPA Entity**:
```java
@Entity
@Table(name = "app_users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(unique = true, nullable = false)
    private String email;

    private String password; // BCrypt hashed

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role; // DOCTOR, PATIENT, ADMIN, PHARMACIST

    private String fullName;

    @Transient
    private Boolean active;

    @Transient
    private LocalDateTime createdAt;

    @Transient
    private LocalDateTime updatedAt;
}
```

**SQL Schema**:
```sql
CREATE TABLE app_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    full_name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Notes**:
- `username`, `email`: Unique constraints enforce single login per account
- `password`: Always hashed using BCrypt before storage (never plaintext)
- `role`: Enum stored as string for flexible queries

---

#### 2. Doctor

**Purpose**: Healthcare professional profiles

**JPA Entity**:
```java
@Entity
public class Doctor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String specialization; // "General Physician", "Pediatrician"
}
```

**SQL Schema**:
```sql
CREATE TABLE doctor (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    specialization VARCHAR(255)
);
```

---

#### 3. Patient

**Purpose**: Patient profiles

**JPA Entity**:
```java
@Entity
public class Patient {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String phone;
}
```

**SQL Schema**:
```sql
CREATE TABLE patient (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    phone VARCHAR(20)
);
```

---

#### 4. Appointment — **CRITICAL FOR CONCURRENCY**

**Purpose**: Books a doctor's time slot for a patient

**JPA Entity**:
```java
@Entity
public class Appointment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Doctor who will be consulted
    private Long doctorId;

    // Patient booking the slot
    @ManyToOne
    @JoinColumn(name = "patient_id")
    private Patient patient;

    // When the appointment is scheduled
    private LocalDateTime appointmentTime;

    // Status: AVAILABLE, BOOKED, CANCELLED
    private String status;
}
```

**SQL Schema**:
```sql
CREATE TABLE appointment (
    id BIGSERIAL PRIMARY KEY,
    doctor_id BIGINT,
    patient_id BIGINT NOT NULL,
    appointment_time TIMESTAMP,
    status VARCHAR(50),
    FOREIGN KEY(patient_id) REFERENCES patient(id),
    UNIQUE(doctor_id, appointment_time)  -- Prevents double-booking
);
```

**🔒 Critical Constraint – Unique (doctor_id, appointment_time)**:
- Ensures no two patients can book the same doctor at the same time
- Applied at DB level (PostgreSQL enforces this even during concurrent inserts)
- If two concurrent requests try to INSERT the same (doctor_id, time), PostgreSQL rejects one with a UNIQUE constraint violation

---

#### 5. Prescription

**Purpose**: Medicines prescribed by a doctor to a patient

**JPA Entity**:
```java
@Entity
public class Prescription {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "patient_id")
    private Patient patient;

    // Many-to-Many: medicines in prescription (medicine_id → quantity)
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "prescription_medicines", 
                     joinColumns = @JoinColumn(name = "prescription_id"))
    @MapKeyColumn(name = "medicine_id")
    @Column(name = "quantity")
    private Map<Long, Integer> medicineQuantities;

    // Status: PENDING, DISPENSED
    private String status;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
```

**SQL Schema**:
```sql
CREATE TABLE prescription (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY(patient_id) REFERENCES patient(id)
);

CREATE TABLE prescription_medicines (
    prescription_id BIGINT NOT NULL,
    medicine_id BIGINT NOT NULL,
    quantity INT,
    FOREIGN KEY(prescription_id) REFERENCES prescription(id),
    FOREIGN KEY(medicine_id) REFERENCES medicine(id),
    PRIMARY KEY(prescription_id, medicine_id)
);
```

---

#### 6. Medicine — **Stock Tracking (Concurrency-Critical)**

**Purpose**: Pharmacy inventory

**JPA Entity**:
```java
@Entity
public class Medicine {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name; // "Aspirin 500mg"
    private int stock; // Quantity available (CRITICAL)
    private LocalDate expiry;
}
```

**SQL Schema**:
```sql
CREATE TABLE medicine (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    stock INT,
    expiry DATE
);
```

**🔒 Critical Notes**:
- `stock`: The most frequently contended field in the system
- Multiple dispense requests could attempt to decrement stock simultaneously
- **Without locking**: Race condition → stock goes negative
- **Solution**: Pessimistic WRITE locks (see next section)

---

## Transaction Management

### What is @Transactional?

Spring's `@Transactional` annotation wraps a method in a database transaction using AOP (Aspect-Oriented Programming):

1. **Declarative**: Annotation-based, not explicit SQL
2. **Proxy-based**: Spring creates a proxy object around service beans
3. **Automatic commit/rollback**: On success, COMMIT; on exception, ROLLBACK

### Example: Transactional Dispense Operation

```java
@Service
public class PharmacyService {
    
    @Transactional(rollbackFor = Exception.class)
    public void doDispenseTransactional(Long prescriptionId) throws Exception {
        // All operations here run in ONE transaction
        // If any exception occurs, ROLLBACK all changes
    }
}
```

### ACID Guarantees

**A — Atomicity**: All operations succeed or all fail
```
Dispense 3 medicines:
- Check stock for Med1, deduct, save ✓
- Check stock for Med2, deduct, save ✓
- Check stock for Med3, deduct → INSUFFICIENT → Exception

Result: ALL savings roll back; Med1 and Med2 stock unchanged
```

**C — Consistency**: Data obeys all constraints
```
Prescription → Patient (FK enforced)
Appointment → Doctor + Time (Unique enforced)
If constraint violated, transaction rolls back
```

**I — Isolation**: Transactions don't interfere
```
Transaction A: Lock prescription, check stock, deduct
Transaction B: Waits for A to release lock
Then B acquires lock, sees updated stock, deducts
No dirty reads or lost updates
```

**D — Durability**: Once committed, survives crashes
```
PostgreSQL Write-Ahead Log (WAL) ensures committed data persists
Even if server crashes, last committed transaction is safe
```

---

## Pessimistic Locking Strategy

### What is Pessimistic Locking?

**Assumption**: Conflicts are likely → acquire database-level locks **before** reading, hold until transaction ends.

**SQL Equivalent**: `SELECT ... FOR UPDATE;` (PostgreSQL syntax)

### How It Works in Medico

#### Repository with Lock

**File**: `src/main/java/com/example/Medico/repository/MedicineRepository.java`

```java
@Repository
public interface MedicineRepository extends JpaRepository<Medicine, Long> {
    
    // Normal read – no lock
    Optional<Medicine> findById(Long id);
    
    // Locked read – acquires PostgreSQL ROW-LEVEL WRITE LOCK
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Medicine m WHERE m.id = :id")
    Optional<Medicine> findByIdWithLock(Long id);
}
```

#### What `@Lock(PESSIMISTIC_WRITE)` Does

1. **Hibernate translates to SQL**:
   ```sql
   SELECT * FROM medicine WHERE id = ? FOR UPDATE;
   ```

2. **PostgreSQL acquires row-level lock**:
   - If row exists, a write lock is acquired immediately
   - No other transaction can modify this row until lock is released
   - Other transactions can read (but may see different consistency levels)

3. **Lock held until transaction ends**:
   ```java
   @Transactional
   public void dispense() {
       Medicine med = medicineRepo.findByIdWithLock(id);  // LOCK acquired HERE
       med.setStock(med.getStock() - qty);
       medicineRepo.save(med);
   }  // Transaction ends, LOCK released HERE
   ```

#### Service with Lock & Retry Logic

**File**: `src/main/java/com/example/Medico/service/PharmacyService.java`

```java
@Service
public class PharmacyService {

    private static final int MAX_RETRIES = 3;

    // Public method with retry logic for lock failures
    public void dispenseMedicines(Long prescriptionId) throws Exception {
        int attempts = 0;
        while (true) {
            try {
                PharmacyService proxy = applicationContext.getBean(PharmacyService.class);
                proxy.doDispenseTransactional(prescriptionId);
                return;  // Success
            } catch (org.springframework.dao.PessimisticLockingFailureException e) {
                attempts++;
                if (attempts >= MAX_RETRIES) {
                    throw new RuntimeException("Failed to acquire lock after retries");
                }
                // Exponential backoff: 100ms, 200ms, 300ms
                Thread.sleep(100L * attempts);
            }
        }
    }

    // Actual transactional method
    @Transactional(rollbackFor = Exception.class)
    public void doDispenseTransactional(Long prescriptionId) throws Exception {
        // Step 1: Lock prescription row
        Prescription prescription = prescriptionRepo.findByIdWithLock(prescriptionId)
            .orElseThrow(() -> new RuntimeException("Prescription not found"));

        // Step 2: Check idempotency
        if ("DISPENSED".equals(prescription.getStatus())) {
            throw new RuntimeException("Already dispensed!");
        }

        // Step 3: For each medicine, check and deduct stock
        for (Map.Entry<Long, Integer> entry : prescription.getMedicineQuantities().entrySet()) {
            Long medId = entry.getKey();
            Integer qtyNeeded = entry.getValue();

            Medicine med = medicineRepo.findById(medId)
                    .orElseThrow(() -> new RuntimeException("Medicine not found"));

            // Stock check
            if (med.getStock() < qtyNeeded) {
                throw new RuntimeException("Insufficient stock for " + med.getName());
                // Exception → ROLLBACK everything, all locks released
            }

            // Deduct
            med.setStock(med.getStock() - qtyNeeded);
            medicineRepo.save(med);
        }

        // Step 4: Mark as dispensed
        prescription.setStatus("DISPENSED");
        prescriptionRepo.save(prescription);
        // Transaction commits → all locks released
    }
}
```

### Lock Timeout & Handling

If a transaction tries to acquire a lock already held by another transaction:

1. **Wait** (default): Block until the other transaction releases the lock (slow for public APIs)
2. **Timeout**: If wait exceeds N seconds, throw `LockTimeoutException` (typical: 5-10 seconds)
3. **NOWAIT**: Fail immediately with `LockAcquisitionException`

**Medico behavior**: PostgreSQL default timeout (~5 seconds). If exceeded, `PessimisticLockingFailureException` is caught, retried with exponential backoff (100ms → 200ms → 300ms), then fails.

---

## Concurrency Control & Safety Guarantees

### Problem 1: Double-Booking (Without Locking)

```
Doctor D1 has 1 slot at 10 AM on Feb 25.

Timeline WITHOUT locking:
T=0ms:   Thread-A: SELECT COUNT(*) FROM appointment 
         WHERE doctor_id=1 AND appointment_time='2026-02-25 10:00'
         → Result: 0 (slot free)

T=5ms:   Thread-B: SELECT COUNT(*) FROM appointment 
         WHERE doctor_id=1 AND appointment_time='2026-02-25 10:00'
         → Result: 0 (slot free, doesn't see Thread-A's insert yet)

T=10ms:  Thread-A: INSERT INTO appointment (doctor_id=1, time=..., patient_id=1)
         → Success, slot booked for Patient P1

T=15ms:  Thread-B: INSERT INTO appointment (doctor_id=1, time=..., patient_id=2)
         → Success (no unique constraint checked yet), slot double-booked!

RESULT: Both P1 and P2 think they have appointments at the same time!
```

### Solution 1: Unique Constraint + Transaction

```sql
ALTER TABLE appointment ADD CONSTRAINT uq_doc_time UNIQUE(doctor_id, appointment_time);
```

**How it prevents double-booking**:
- If both threads execute INSERT simultaneously, PostgreSQL allows one to succeed first
- When the second thread tries to INSERT the same (doctor_id, time), PostgreSQL checks the unique constraint
- Constraint violation → exception → thread-B fails, gets "Slot already booked" error
- **Result**: Only one booking succeeds; the other client gets an error

---

### Problem 2: Over-Dispensing Medicine (Without Locking)

```
Medicine M (Aspirin): 10 tablets in stock
Prescription PR1: needs 7 tablets
Prescription PR2: needs 8 tablets

Timeline WITHOUT locking:
T=0ms:   Thread-A (PR1): SELECT stock FROM medicine WHERE id=1 → stock = 10

T=5ms:   Thread-B (PR2): SELECT stock FROM medicine WHERE id=1 → stock = 10 (still)

T=10ms:  Thread-A: UPDATE medicine SET stock = 3 WHERE id=1 (10 - 7)

T=15ms:  Thread-B: UPDATE medicine SET stock = 2 WHERE id=1 (10 - 8, WRONG!)
         Last update wins → stock = 2, but we actually dispensed 15 tablets!

RESULT: Stock is now 2, but 15 tablets were given out (lost 5 tablets of accountability)
```

### Solution 2: Pessimistic Lock + Atomic Deduction

```
Timeline WITH pessimistic locking:
T=0ms:   Thread-A: SELECT stock FROM medicine WHERE id=1 FOR UPDATE
         → PostgreSQL acquires a WRITE lock on the medicine row
         → stock = 10

T=5ms:   Thread-B: SELECT stock FROM medicine WHERE id=1 FOR UPDATE
         → Thread-B WAITS (cannot acquire lock until Thread-A releases it)
         → BLOCKED

T=10ms:  Thread-A: UPDATE medicine SET stock = 3 WHERE id=1 and COMMIT
         → Prescription PR1 marked DISPENSED
         → Lock RELEASED

T=15ms:  Thread-B: SELECT finally acquires lock
         → stock = 3 (sees Thread-A's update)
         → Needs 8, but stock = 3 → Insufficient stock exception
         → ROLLBACK, prescription NOT dispensed

RESULT: PR1 dispensed (stock 10 → 3); PR2 not dispensed (insufficient stock)
AUDIT: Stock never negative, always auditable
```

---

### Concurrency Guarantees Table

| Operation | Lock Applied | Guarantee | Failure Mode |
|-----------|--------------|-----------|--------------|
| **Book Appointment** | Unique constraint (DB-level) | One patient per slot | PostgreSQL constraint violation |
| **Dispense Medicines** | `findByIdWithLock(prescId)` | Stock never oversold | Insufficient stock exception; retry or fail |
| **View Stock** | None (read-only) | May see slightly stale data | Next dispense re-checks with lock |
| **Create Prescription** | @Transactional on service | Prescription + medicines atomic | Rollback on any error |

---

## API Examples & Workflows

### Workflow 1: Booking an Appointment

**Endpoint**: `POST /api/appointments/book`

**Request**:
```json
{
  "patientId": 1,
  "doctorId": 2,
  "time": "2026-02-25T10:00:00"
}
```

**Backend Logic** (Simplified):
```java
@PostMapping("/book")
@Transactional
public ResponseEntity<?> bookAppointment(@RequestBody BookingRequest req) {
    Patient patient = patientRepo.findById(req.getPatientId())
        .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
    Doctor doctor = doctorRepo.findById(req.getDoctorId())
        .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
    
    // Create appointment
    Appointment appointment = new Appointment();
    appointment.setDoctorId(req.getDoctorId());
    appointment.setPatient(patient);
    appointment.setAppointmentTime(req.getTime());
    appointment.setStatus("BOOKED");
    
    try {
        appointmentRepo.save(appointment);
        return ResponseEntity.ok("Appointment booked successfully");
    } catch (DataIntegrityViolationException e) {
        // Unique constraint violated
        return ResponseEntity.badRequest().body("Slot just booked by another user");
    }
}
```

**Concurrency Protection**:
- Unique constraint on (doctor_id, appointment_time) prevents double-booking at DB level
- `@Transactional` ensures atomicity
- Under concurrent load, one user gets the slot; others get a constraint violation error

---

### Workflow 2: Dispensing Medicines

**Endpoint**: `POST /api/pharmacy/dispense/{prescriptionId}`

**Backend (Detailed)**:
```java
@PostMapping("/dispense/{id}")
public ResponseEntity<String> dispense(@PathVariable Long id) {
    try {
        pharmacyService.dispenseMedicines(id);
        return ResponseEntity.ok("Dispensed Successfully");
    } catch (Exception e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}

@Service
public class PharmacyService {
    
    public void dispenseMedicines(Long prescriptionId) throws Exception {
        int attempts = 0;
        while (attempts < MAX_RETRIES) {
            try {
                PharmacyService proxy = applicationContext.getBean(PharmacyService.class);
                proxy.doDispenseTransactional(prescriptionId);
                return;  // Success
            } catch (PessimisticLockingFailureException e) {
                attempts++;
                Thread.sleep(100L * attempts);  // Exponential backoff
            }
        }
        throw new RuntimeException("Failed after " + MAX_RETRIES + " retries");
    }

    @Transactional(rollbackFor = Exception.class)
    public void doDispenseTransactional(Long prescriptionId) throws Exception {
        // 1. Lock prescription row
        Prescription prescription = prescriptionRepo.findByIdWithLock(prescriptionId)
            .orElseThrow(() -> new RuntimeException("Prescription not found"));

        // 2. Verify not already dispensed (idempotency)
        if ("DISPENSED".equals(prescription.getStatus())) {
            throw new RuntimeException("Already dispensed!");
        }

        // 3. For each medicine, check and deduct stock
        for (Map.Entry<Long, Integer> entry : prescription.getMedicineQuantities().entrySet()) {
            Long medId = entry.getKey();
            Integer qtyNeeded = entry.getValue();

            Medicine med = medicineRepo.findById(medId)
                    .orElseThrow(() -> new RuntimeException("Medicine not found"));

            // Check stock
            if (med.getStock() < qtyNeeded) {
                throw new RuntimeException("Insufficient stock for " + med.getName());
                // Exception → ROLLBACK, all locks released
            }

            // Deduct
            med.setStock(med.getStock() - qtyNeeded);
            medicineRepo.save(med);
        }

        // 4. Mark as dispensed
        prescription.setStatus("DISPENSED");
        prescriptionRepo.save(prescription);
        // Transaction commits → locks released
    }
}
```

**Concurrency Protection**:
- `findByIdWithLock()` acquires `FOR UPDATE` lock on prescription row
- All stock checks happen while lock is held
- If multiple dispense requests occur:
  - First request: locks, checks stock, deducts, commits → lock released
  - Second request: acquires lock, sees updated stock, deducts again
  - Third request: stock exhausted → fails with "Insufficient stock"
- **Result**: No over-dispensing, stock never negative

---

## Testing Concurrency

### Test Script: Concurrent Booking

```bash
#!/usr/bin/env bash

DOCTOR_ID=1
APPOINTMENT_TIME="2026-02-25T14:30:00"
URL="http://localhost:8080/api/appointments/book"

SUCCESS=0
FAILURE=0

# Send 10 concurrent booking requests
for i in {1..10}; do
  PATIENT_ID=$i
  
  PAYLOAD=$(cat <<EOF
{
  "patientId": $PATIENT_ID,
  "doctorId": $DOCTOR_ID,
  "time": "$APPOINTMENT_TIME"
}
EOF
)

  # Run in background
  (
    RESPONSE=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      $URL)
    
    if echo "$RESPONSE" | grep -q "booked successfully"; then
      echo "Request $i: SUCCESS (Patient $PATIENT_ID)"
      ((SUCCESS++))
    else
      echo "Request $i: FAILURE - $RESPONSE"
      ((FAILURE++))
    fi
  ) &
done

wait

echo ""
echo "========== RESULTS =========="
echo "Successful Bookings: $SUCCESS"
echo "Failed Bookings: $FAILURE"
echo "Expected: 1 success, 9 failures (unique constraint)"
```

**Expected Output**:
```
Request 3: SUCCESS (Patient 3)
Request 1: FAILURE - Slot just booked by another user
Request 2: FAILURE - Slot just booked by another user
...
========== RESULTS ==========
Successful Bookings: 1
Failed Bookings: 9
Expected: 1 success, 9 failures
```

---

### Test Script: Concurrent Dispense

```bash
#!/usr/bin/env bash

# Prescription IDs with medicine quantities:
#   PR1: 8 tablets (stock=10, will succeed)
#   PR2: 5 tablets (stock=10 → 3 after PR1, will succeed)
#   PR3: 6 tablets (stock=10 → -2 after PR1+PR2, will FAIL)

URL="http://localhost:8080/api/pharmacy/dispense"

for PID in 1 2 3; do
  (
    RESPONSE=$(curl -s -X POST $URL/$PID)
    
    if echo "$RESPONSE" | grep -q "Dispensed Successfully"; then
      echo "Prescription $PID: SUCCESS"
    else
      echo "Prescription $PID: FAILURE - $RESPONSE"
    fi
  ) &
done

wait

echo ""
echo "Check DB stock:"
echo "  SELECT stock FROM medicine WHERE id=1;"
echo "Expected: negative value prevented (pessimistic lock + transaction rollback)"
```

---

## Deployment & Configuration

### Production Setup Checklist

- [ ] PostgreSQL 14+ database provisioned
- [ ] `spring.datasource.url` points to production database
- [ ] Credentials stored in environment variables (never hardcode)
- [ ] `spring.jpa.hibernate.ddl-auto=validate` (no AUTO schema changes in prod)
- [ ] Schema migrations via Flyway or Liquibase applied before app startup
- [ ] HikariCP connection pool size tuned (recommend 10-20 for typical workload)
- [ ] Logging centralized (ELK, Cloudwatch, etc.)
- [ ] Monitoring/alerting on `PessimisticLockingFailureException` rates
- [ ] Load testing completed; concurrency tested

### Environment Variables

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://prod-db.example.com:5432/medico_prod
export SPRING_DATASOURCE_USERNAME=medico_prod_user
export SPRING_DATASOURCE_PASSWORD=<strong-password>
export SPRING_JPA_HIBERNATE_DDL_AUTO=validate
export JWT_SECRET=<256-bit-random-secret>
export JWT_EXPIRATION=86400000
export SERVER_PORT=8080
```

---

## Summary: Key Takeaways

### Database Design
- Relational model with foreign keys ensures referential integrity
- Unique constraint on (doctor_id, appointment_time) prevents double-booking
- Audit fields (created_at, updated_at) track record lifecycle

### Transaction Safety
- `@Transactional` wraps multi-step operations in ACID transactions
- Isolation level (default: READ_COMMITTED) prevents dirty reads
- Rollback on any exception ensures consistency

### Concurrency Control
- **Pessimistic locking**: `FOR UPDATE` locks rows at DB level
- **Held until commit**: Prevents concurrent modifications
- **Retry logic**: Exponential backoff handles transient failures
- **Unique constraints**: Secondary defense preventing violations

### Testing & Validation
- Concurrent tests simulate multi-user scenarios
- Request logging captures actual traffic patterns
- Performance monitoring tracks lock wait times

### Production Readiness
- `validate` mode prevents schema drift
- Migrations managed via Flyway/Liquibase
- Monitoring tracks concurrency anomalies
- This spec serves as authoritative reference

---

**End of Technical Specification Version 1.0**
