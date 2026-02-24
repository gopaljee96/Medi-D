# Manual Transaction Management - Complete Explanation

## Overview
Your project has **TWO approaches** for handling transactions:
1. **@Transactional** (Declarative) - Automatic, annotation-based
2. **TransactionHelper** (Programmatic/Manual) - Explicit, code-based

---

## 1️⃣ DECLARATIVE APPROACH: @Transactional

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│ Method Call with @Transactional Annotation                     │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Spring Proxy Intercepts Call (Spring AOP)                      │
│ (Before method execution)                                       │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BEGIN TRANSACTION:                                              │
│ - Acquire database connection from pool                         │
│ - Set isolation level (default: READ_COMMITTED)                │
│ - Start transaction on database                                │
│ - Lock mechanisms ready                                         │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Execute Your Method Code                                        │
│ - All database operations happen in this transaction            │
│ - Locks are held throughout execution                           │
│ - Changes are NOT yet written to database                       │
└─────────────────────────────────────────────────────────────────┘
              ↓
         ┌─────────────────┐
         │  Did Exception  │
         │   Occur?        │
         └─────────────────┘
              / \
          YES/   \NO
            /     \
           ↓       ↓
    ┌──────────┐  ┌──────────────┐
    │ ROLLBACK │  │    COMMIT    │
    │Undo all  │  │ Write all    │
    │changes   │  │ changes to DB│
    │Return to │  │Return result │
    │original  │  │to caller     │
    │state     │  │              │
    └──────────┘  └──────────────┘
         ↓              ↓
    Exception      Return value
    Re-thrown      returned
```

### Example in Your Code

```java
// File: PharmacyService.java
@Transactional(rollbackFor = Exception.class)
public void doDispenseTransactional(Long prescriptionId) throws Exception {
    
    // STEP 1: Get prescription with PESSIMISTIC_WRITE lock
    // This locks the entire prescription row
    Prescription prescription = prescriptionRepo.findByIdWithLock(prescriptionId)
        .orElseThrow(() -> new RuntimeException("Prescription not found"));
    
    if ("DISPENSED".equals(prescription.getStatus())) {
        // STEP 2: If already dispensed, throw exception
        // Spring automatically ROLLS BACK the entire transaction
        throw new RuntimeException("Already dispensed!");
    }
    
    // STEP 3: Check each medicine stock
    for (Map.Entry<Long, Integer> entry : prescription.getMedicineQuantities().entrySet()) {
        Long medId = entry.getKey();
        Integer qtyNeeded = entry.getValue();
        
        Medicine med = medicineRepo.findById(medId)
            .orElseThrow(() -> new RuntimeException("Medicine ID " + medId + " not found"));
        
        if (med.getStock() < qtyNeeded) {
            // STEP 4: If ANY medicine is out of stock
            // Spring automatically ROLLS BACK - NO medicine stocks are deducted
            throw new RuntimeException("Insufficient stock for " + med.getName());
        }
        
        // STEP 5: Update medicine stock
        med.setStock(med.getStock() - qtyNeeded);
        medicineRepo.save(med);  // NOT yet written to DB
    }
    
    // STEP 6: Mark prescription as dispensed
    prescription.setStatus("DISPENSED");
    prescriptionRepo.save(prescription);  // NOT yet written to DB
    
    // STEP 7: Method completes successfully
    // Spring automatically COMMITS transaction
    // ALL changes (prescription + all medicines) written to DB together
}
```

### Real-World Scenario

**Scenario:** Patient needs 5 units of Medicine-A and 3 units of Medicine-B

**Database State Before:**
```
Prescription: ID=1, Status=PENDING
Medicine-A: Stock=10
Medicine-B: Stock=2  ← INSUFFICIENT FOR 3 UNITS
```

**Execution Flow:**

```
1. dispenseMedicines(prescriptionId=1) called
   ↓
2. Spring begins @Transactional
   ↓
3. Prescription locked: ID=1, Status=PENDING
   ↓
4. Check Medicine-A: Need 5, Have 10 ✅ Stock NOW 5 (queued for save)
   ↓
5. Check Medicine-B: Need 3, Have 2 ❌ EXCEPTION!
   ↓
6. Spring catches exception → ROLLBACK
   - Medicine-A stock change UNDONE (back to 10)
   - Prescription status change UNDONE (back to PENDING)
   - Database state UNCHANGED
   ↓
7. Exception thrown to caller
}
```

**Result:**
- ❌ Neither medicine was dispensed
- 📦 Database remains consistent
- **ATOMICITY guaranteed:** All-or-nothing operation

---

## 2️⃣ PROGRAMMATIC APPROACH: TransactionHelper (Manual)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Call: transactionHelper.executeInTransaction(lambda)            │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ TransactionHelper.executeInTransaction() Method:                │
│                                                                  │
│ 1. Create DefaultTransactionDefinition                          │
│    - Set PROPAGATION_REQUIRED                                   │
│    - Set ISOLATION_READ_COMMITTED                               │
│    - Set name "ManualTransaction"                               │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Get Transaction Status:                                      │
│    transactionManager.getTransaction(def)                       │
│    - Acquire DB connection                                      │
│    - BEGIN TRANSACTION on database                              │
│    - Return TransactionStatus object                            │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Execute User's Lambda Code:                                  │
│    operation.execute()                                          │
│    - Your business logic runs here                              │
│    - Database operations queued                                 │
└─────────────────────────────────────────────────────────────────┘
              ↓
         ┌─────────────────┐
         │  Exception?     │
         └─────────────────┘
              / \
          YES/   \NO
            /     \
           ↓       ↓
    ┌──────────────────┐  ┌─────────────────┐
    │ 4a. ROLLBACK:    │  │ 4b. COMMIT:     │
    │ if (!status      │  │ transactionMgr  │
    │   .isCompleted())│  │   .commit(status)
    │   transactionMgr │  │ - Write changes │
    │   .rollback(…)   │  │ - Release locks │
    │ Undo changes     │  │ - Return result │
    │ Release locks    │  │                 │
    │ Throw exception  │  │                 │
    └──────────────────┘  └─────────────────┘
         ↓                      ↓
    Caller gets error      Caller gets result
```

### TransactionHelper Code

```java
// File: src/main/java/com/example/Medico/service/TransactionHelper.java

@Service
public class TransactionHelper {

    @Autowired
    private PlatformTransactionManager transactionManager;

    // ============ METHOD 1: Basic Transaction ============
    public <T> T executeInTransaction(TransactionalOperation<T> operation) throws Exception {
        
        // STEP 1: Define transaction parameters
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName("ManualTransaction");
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        def.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        
        // STEP 2: Begin transaction on database
        TransactionStatus status = transactionManager.getTransaction(def);
        
        try {
            // STEP 3: Execute the operation (your code)
            T result = operation.execute();
            
            // STEP 4: If successful, COMMIT
            transactionManager.commit(status);
            return result;
            
        } catch (Exception e) {
            // STEP 5: If exception, ROLLBACK
            if (!status.isCompleted()) {
                transactionManager.rollback(status);
            }
            throw new RuntimeException("Transaction failed: " + e.getMessage(), e);
        }
    }

    // ============ METHOD 2: Void Operation ============
    public void executeInTransactionVoid(VoidTransactionalOperation operation) throws Exception {
        executeInTransaction(() -> {
            operation.execute();
            return null;  // No return value
        });
    }

    // ============ METHOD 3: Read-Only Transaction ============
    public <T> T executeInReadOnlyTransaction(TransactionalOperation<T> operation) throws Exception {
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName("ReadOnlyTransaction");
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        def.setReadOnly(true);  // ← Only difference: read-only flag
        
        TransactionStatus status = transactionManager.getTransaction(def);
        try {
            T result = operation.execute();
            transactionManager.commit(status);
            return result;
        } catch (Exception e) {
            if (!status.isCompleted()) {
                transactionManager.rollback(status);
            }
            throw new RuntimeException("Read-only transaction failed: " + e.getMessage(), e);
        }
    }

    // ============ METHOD 4: Custom Isolation Level ============
    public <T> T executeInTransaction(TransactionalOperation<T> operation, int isolationLevel) throws Exception {
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName("ManualTransaction");
        def.setIsolationLevel(isolationLevel);  // ← Custom level
        
        // ... rest is same as METHOD 1
    }
}
```

### Example Usage in Your Code

```java
// File: src/main/java/com/example/Medico/service/PatientDoctorService.java

@Service
public class PatientDoctorService {
    
    @Autowired
    private PatientRepository patientRepository;
    
    @Autowired
    private DoctorRepository doctorRepository;
    
    @Autowired
    private TransactionHelper transactionHelper;
    
    // Example 1: Simple Patient Addition
    public Patient addPatientManualTransaction(String name, String phone) throws Exception {
        return transactionHelper.executeInTransaction(() -> {
            Patient patient = new Patient();
            patient.setName(name);
            patient.setPhone(phone);
            patient.setHistoryBlob("New patient registered manually");
            
            // Save to database (queued)
            return patientRepository.save(patient);
            
            // When lambda returns, transaction commits
        });
    }
    
    // Example 2: Complex Atomic Operation (Doctor + Patients)
    public Map<String, Object> addDoctorWithPatientsManualTransaction(
            String doctorName, String specialization, List<String> patientNames) 
            throws Exception {
        
        return transactionHelper.executeInTransaction(() -> {
            // Create doctor
            Doctor doctor = new Doctor();
            doctor.setName(doctorName);
            doctor.setSpecialization(specialization);
            Doctor savedDoctor = doctorRepository.save(doctor);  // Queued
            
            // Create multiple patients
            int patientCount = 0;
            for (String patName : patientNames) {
                Patient patient = new Patient();
                patient.setName(patName);
                patient.setHistoryBlob("Patient of Dr. " + doctorName);
                patientRepository.save(patient);  // Queued
                patientCount++;
            }
            
            // Return result
            Map<String, Object> result = new HashMap<>();
            result.put("doctorId", savedDoctor.getId());
            result.put("doctorName", savedDoctor.getName());
            result.put("patientsAdded", patientCount);
            return result;
            
            // If ANY save fails, ENTIRE transaction rolls back
            // Either ALL (doctor + patients) succeed, or NONE
        });
    }
    
    // Example 3: Read-Only Query
    public List<Patient> getPatientsReadOnly() throws Exception {
        return transactionHelper.executeInReadOnlyTransaction(() -> {
            return patientRepository.findAll();
            // Transaction marked as read-only
            // Database can optimize query execution
        });
    }
}
```

---

## 3️⃣ KEY DIFFERENCES: @Transactional vs Manual TransactionHelper

| Aspect | @Transactional (Declarative) | TransactionHelper (Programmatic) |
|--------|------------------------------|----------------------------------|
| **Location** | Java annotation on method | Called within method code |
| **Control** | Automatic (Spring) | Explicit (Developer) |
| **Visibility** | Implicit - hidden in annotation | Obvious - visible in code |
| **Configuration** | At compile time | At runtime (can be dynamic) |
| **Use Case** | Simple, straightforward operations | Complex, conditional transactions |
| **Code Structure** | Clean, less boilerplate | More verbose, full control |
| **Transaction Boundaries** | Entire method wrapped | Only the lambda block wrapped |
| **Flexibility** | Low - all-or-nothing | High - can have multiple blocks |
| **Learning Curve** | Easy - just add @annotation | Steeper - need to understand flow |
| **Performance** | Slight overhead (Spring AOP) | Slight overhead (method calls) |

### Code Comparison

**@Transactional:**
```java
@Transactional(rollbackFor = Exception.class)
public void addPatient(String name) throws Exception {
    Patient patient = new Patient();
    patient.setName(name);
    patientRepository.save(patient);
    // If exception here → Spring rolls back automatically
}
```

**TransactionHelper (Manual):**
```java
public void addPatient(String name) throws Exception {
    transactionHelper.executeInTransactionVoid(() -> {
        Patient patient = new Patient();
        patient.setName(name);
        patientRepository.save(patient);
        // If exception here → TransactionHelper rolls back automatically
    });
}
```

**Result:** Same behavior, different syntax!

---

## 4️⃣ COMPLETE FLOW: PharmacyService Dispense Example

### WHERE Manual TransactionHelper is Used

```java
// File: PharmacyService.java

public void dispenseMedicines(Long prescriptionId) throws Exception {
    int attempts = 0;
    while (true) {
        try {
            // ← Manual retry logic OUTSIDE transaction
            PharmacyService proxy = applicationContext.getBean(PharmacyService.class);
            proxy.doDispenseTransactional(prescriptionId);  // Call transactional method
            return;  // Success
            
        } catch (PessimisticLockingFailureException e) {
            // ← Lock failed, retry with exponential backoff
            attempts++;
            if (attempts >= MAX_RETRIES) {
                throw new RuntimeException("Failed after retries");
            }
            // Wait 100ms, 200ms, 300ms before retry
            Thread.sleep(100L * attempts);
        }
    }
}

@Transactional(rollbackFor = Exception.class)
public void doDispenseTransactional(Long prescriptionId) throws Exception {
    // ← THIS IS @Transactional, not manual!
    // But demonstrates the pattern
    
    // LOCK prescription
    Prescription prescription = prescriptionRepo.findByIdWithLock(prescriptionId)
        .orElseThrow(() -> new RuntimeException("Prescription not found"));
    
    // CHECK & UPDATE
    for (Map.Entry<Long, Integer> entry : prescription.getMedicineQuantities().entrySet()) {
        Medicine med = medicineRepo.findById(entry.getKey()).orElseThrow();
        if (med.getStock() < entry.getValue()) {
            throw new RuntimeException("Insufficient stock");
        }
        med.setStock(med.getStock() - entry.getValue());
        medicineRepo.save(med);
    }
    
    // MARK DISPENSED
    prescription.setStatus("DISPENSED");
    prescriptionRepo.save(prescription);
}
```

### Complete Step-by-Step Execution

```
POST /api/pharmacy/dispense/1
    ↓
[1] dispenseMedicines(prescriptionId=1) called
    - NO transaction yet
    - Initialize attempts = 0
    ↓
[2] ATTEMPT 1:
    - Get PharmacyService proxy (with @Transactional support)
    - Call proxy.doDispenseTransactional(1)
    ↓
[3] @Transactional BEGINS
    - Spring starts transaction
    - Acquire DB connection
    ↓
[4] findByIdWithLock(1)
    - Lock Prescription #1: Status=PENDING
    - No one else can read/modify it
    ↓
[5] Check Stock:
    - Medicine-A: Need 5, Have 10 ✅
      → Update: Stock = 5 (QUEUED)
    - Medicine-B: Need 3, Have 3 ✅
      → Update: Stock = 0 (QUEUED)
    ↓
[6] Mark Dispensed:
    - prescription.setStatus("DISPENSED")
    - prescriptionRepository.save() (QUEUED)
    ↓
[7] Method Completes Successfully
    ↓
[8] @Transactional COMMITS
    - ATOMIC COMMIT: All queued operations execute together
    - Releases locks
    - Returns to dispenseMedicines()
    ↓
[9] Return to caller
    - HTTP 200 OK
    - "Dispensed Successfully"
```

### What Happens With Lock Exception

```
POST /api/pharmacy/dispense/1
    ↓
[1] dispenseMedicines(prescriptionId=1)
    - another request already locked Prescription #1
    - attempts = 0
    ↓
[2] ATTEMPT 1:
    - @Transactional begins
    - findByIdWithLock(1) BLOCKS
    - Waits for other lock to release (up to timeout)
    - Timeout → PessimisticLockingFailureException ❌
    ↓
[3] Catch block executes:
    - attempts++ (now 1)
    - Thread.sleep(100ms)  ← Wait and retry
    ↓
[4] ATTEMPT 2: (after 100ms wait)
    - @Transactional begins (NEW transaction)
    - findByIdWithLock(1) tries again
    - Still locked by other request
    - Timeout → Exception ❌
    ↓
[5] Catch block executes:
    - attempts++ (now 2)
    - Thread.sleep(200ms)  ← Longer wait
    ↓
[6] ATTEMPT 3: (after 300ms total wait)
    - @Transactional begins (THIRD transaction)
    - findByIdWithLock(1) succeeds
    - ✅ Lock acquired, proceed with dispense
    ↓
[7] Dispense succeeds
    - Return to caller
    - HTTP 200 OK
```

---

## 5️⃣ WHERE IS TransactionHelper USED IN YOUR PROJECT?

### Current Usage

**✅ Implemented:**
1. **TransactionHelper.java** - Service for manual transactions (full code)
2. **PharmacyService.java** - Uses @Transactional + retry logic
3. **PatientDoctorService.java** - Examples of both patterns
4. **TransactionDemoController.java** - REST endpoints showcasing patterns

**Alternative/Example Code:**
- Not directly used in production endpoints yet
- Available as a library for future complex operations

### Real Production Use (Your PharmacyService)

The **PharmacyService** demonstrates a hybrid approach:
- **Outer layer:** Retry logic (manual loop)
- **Inner layer:** @Transactional (Spring-managed)

```
Retry Loop (Manual Control)
    │
    ├─ Attempt 1: @Transactional block
    │   └─ If PessimisticLockingFailureException → Retry
    │
    ├─ Attempt 2: @Transactional block
    │   └─ If PessimisticLockingFailureException → Retry
    │
    └─ Attempt 3: @Transactional block
        └─ Success or max retries exceeded
```

---

## 6️⃣ WHEN TO USE EACH APPROACH

### Use @Transactional When:
✅ Operations are straightforward
✅ No need for dynamic control
✅ Single method manages entire operation
✅ Want clean, readable code with minimal boilerplate

**Example:**
```java
@Transactional
public void createOrder(OrderRequest request) {
    Order order = new Order();
    // ... set fields ...
    orderRepository.save(order);
    
    for (Item item : request.getItems()) {
        item.setOrder(order);
        itemRepository.save(item);
    }
}
```

### Use Manual TransactionHelper When:
✅ Need explicit control over transaction boundaries
✅ Multiple transactions in single method
✅ Runtime-based transaction decisions
✅ Want to demonstrate transaction mechanics (learning)
✅ Conditional commit/rollback logic needed

**Example:**
```java
public void complexOperation() throws Exception {
    // Transaction 1: Read-only
    List<items> = transactionHelper.executeInReadOnlyTransaction(() -> {
        return itemRepository.findAll();
    });
    
    // Non-transactional logic here
    List<items> filtered = items.stream().filter(...).collect(...);
    
    // Transaction 2: Write
    transactionHelper.executeInTransaction(() -> {
        for (Item item : filtered) {
            itemRepository.save(item);
        }
    });
}
```

---

## 7️⃣ HOW LOCKS & TRANSACTIONS WORK TOGETHER

### Pessimistic Locking Timeline

```
Thread A (Doctor dispensing Rx #1)     |  Thread B (Another request)
─────────────────────────────────────────────────────────────────
dispenseMedicines() called              |
  ↓                                     |
  @Transactional BEGINS ════════════════|
  ↓                                     |
  SELECT * FROM prescriptions           |
  WHERE id=1 FOR UPDATE ✅              |
  (LOCK acquired)                       |  dispenseMedicines() called
  ↓                                     |   ↓
  [Reading prescription]                |   @Transactional BEGINS
  ↓                                     |    ↓
  [Processing medicines]                |    SELECT * FROM prescriptions
  ↓                                     |    WHERE id=1 FOR UPDATE ❌
  [Checking stock]                      |    (BLOCKED - waiting for lock!)
  ↓                                     |    [Thread B Waits...]
  UPDATE medicines                      |
  SET stock = stock - qty               |
  ↓                                     |
  UPDATE prescriptions                  |
  SET status='DISPENSED'                |
  ↓                                     |
  COMMIT ═══════════════════════════════|
  (LOCK released) ═══════════════════════|
  ↓                                     |    [Lock acquired!]
                                        |    SELECT * FROM prescriptions
                                        |    WHERE id=1 FOR UPDATE ✅
                                        |    ↓
                                        |    [Read: Status=DISPENSED]
                                        |    ↓
                                        |    Throw: "Already dispensed!"
                                        |    ↓
                                        |    ROLLBACK
                                        |    (No changes)
                                        |    ↓
                                        |    Return error to caller
```

---

## Summary Table

| Concept | @Transactional | Manual TransactionHelper |
|---------|---|---|
| **How Started** | Spring proxy interceptor | Explicit method call |
| **Commit Trigger** | Method return (no exception) | developer calls `commit()` via try-finally |
| **Rollback Trigger** | Exception matching rollbackFor pattern | Exception in catch block |
| **Lock Duration** | Entire method execution | Only lambda block execution |
| **Config** | Annotation on method | Parameters in DefaultTransactionDefinition |
| **Typical Use** | 90% of cases (simple) | 10% of cases (complex/conditional) |

---

## In Your Project

**Primary Pattern:** @Transactional in PharmacyService + Retry Loop
```
Why this works:
- Simple to understand
- Spring handles transaction details
- Retry loop adds custom resilience
- Perfect balance of control and simplicity
```

**Available But Not Used:** TransactionHelper
```
Why included:
- Educational (shows how it works under the hood)
- Future flexibility if needed
- Demonstrates Spring internals
- Reference implementation for complex scenarios
```

Both are valid! Your project chose the right pattern for its needs. 🎯
