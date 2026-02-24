# Quick Reference: Manual Transaction vs @Transactional

## 1-Minute Overview

### @Transactional (Declarative)
```
@Transactional                           ← Add annotation
public void method() {                   
    repo.save(entity);    ← QUEUED       
    repo.save(entity2);   ← QUEUED       
}                                         ← Auto COMMIT or ROLLBACK
```

### Manual TransactionHelper (Programmatic)
```
transactionHelper.executeInTransaction(() -> {   ← BEGIN manually
    repo.save(entity);    ← QUEUED               
    repo.save(entity2);   ← QUEUED               
    return result;                              
});                                              ← Auto COMMIT or ROLLBACK
```

**Both do the SAME thing - different syntax!**

---

## Visual Comparison

```
                @Transactional                    TransactionHelper
                ──────────────                    ─────────────────

Code Style:     Declarative                       Programmatic
                (annotation)                      (explicit call)

Entry:          Method call                       Lambda call inside method
                ┌──────────┐                      
                │@Transact.│                      executeInTransaction(
                │method()  │                        () → { ... }
                └──────────┘                      )

Control:        Automatic (Spring)                Manual (Developer)
                - Spring creates proxy           - You call transactionHelper
                - Spring intercepts calls        - You pass lambda

Visibility:     Hidden in annotation             Obvious in code
                Easy to miss!                    Hard to miss!

Setup:          Just add @annotation             Inject TransactionHelper
                                                 Wrap in lambda

Rollback:       If method throws                 If lambda throws
                If matches rollbackFor           If caught in TransactionHelper

Use Cases:      ✅ Simple operations            ✅ Complex operations
                ✅ Single action                ✅ Multiple transactions
                ✅ Standard flow                ✅ Conditional logic
```

---

## Real Code Side-by-Side

### Scenario: Dispense Medicine

```java
/* ============ @Transactional Version ============ */

@Transactional(rollbackFor = Exception.class)
public void dispenseMedicine(Long prescriptionId) {
    // Get prescription with lock
    Prescription rx = prescriptionRepo.findByIdWithLock(prescriptionId)
        .orElseThrow(() -> new RuntimeException("Not found"));
    
    // Check & update
    for (Medicine med : rx.getMedicines()) {
        if (med.getStock() < rx.getQuantity(med.getId())) {
            throw new RuntimeException("Insufficient stock");  ← Auto rollback
        }
        med.setStock(med.getStock() - rx.getQuantity(med.getId()));
        medicineRepo.save(med);
    }
    
    // Mark dispensed
    rx.setStatus("DISPENSED");
    prescriptionRepo.save(rx);
}  ← Auto commit if no exception


/* ============ Manual TransactionHelper Version ============ */

public void dispenseMedicine(Long prescriptionId) throws Exception {
    transactionHelper.executeInTransaction(() -> {
        // Get prescription with lock
        Prescription rx = prescriptionRepo.findByIdWithLock(prescriptionId)
            .orElseThrow(() -> new RuntimeException("Not found"));
        
        // Check & update
        for (Medicine med : rx.getMedicines()) {
            if (med.getStock() < rx.getQuantity(med.getId())) {
                throw new RuntimeException("Insufficient stock");  ← Auto rollback
            }
            med.setStock(med.getStock() - rx.getQuantity(med.getId()));
            medicineRepo.save(med);
        }
        
        // Mark dispensed
        rx.setStatus("DISPENSED");
        prescriptionRepo.save(rx);
        
        return null;  ← Return value
    });  ← Auto commit if no exception
}
```

**Result:** IDENTICAL behavior! Same atomicity, same rollback, same locks!

---

## WHERE Each Is Used In Your Project

### @Transactional (Active)
```
📁 PharmacyService.java
   └─ doDispenseTransactional() → Uses @Transactional ✅

📁 AppointmentController.java
   └─ Multiple endpoints → Spring Data JPA handles transactions

📁 DoctorController.java
   └─ Medical operations → @Transactional decorator

📁 AdminController.java
   └─ Admin operations → @Transactional secured
```

### TransactionHelper (Available/Example)
```
📁 TransactionHelper.java
   └─ Complete implementation → Not actively used in production

📁 PatientDoctorService.java
   └─ Comparison examples → Shows both patterns

📁 TransactionDemoController.java
   └─ Demo endpoints → Educational purposes

✅ Created but optional - Your project chose @Transactional for production
```

---

## Key Insight: Your PharmacyService Pattern

Your code uses a **HYBRID approach**:

```java
public void dispenseMedicines(Long prescriptionId) throws Exception {
    int attempts = 0;
    while (true) {  ← ❶ MANUAL RETRY LOOP (not transactional)
        try {
            PharmacyService proxy = applicationContext.getBean(PharmacyService.class);
            proxy.doDispenseTransactional(prescriptionId);  ← ❷ Calls @Transactional method
            return;
        } catch (PessimisticLockingFailureException e) {
            attempts++;
            if (attempts >= MAX_RETRIES) throw new RuntimeException(...);
            Thread.sleep(100L * attempts);  ← ❸ Retry with exponential backoff
        }
    }
}

@Transactional(rollbackFor = Exception.class)
public void doDispenseTransactional(Long prescriptionId) throws Exception {
    // ← ❹ Spring-managed transaction
    // ... actual dispense logic ...
}
```

### Why This is Smart:

| Layer | Purpose | Who Controls |
|-------|---------|---|
| **Outer:** Retry loop | Handle temporary lock conflicts | Developer (manual) |
| **Inner:** @Transactional | Atomicity + rollback | Spring (automatic) |

**Benefits:**
- ✅ Resilient to momentary lock waits
- ✅ Automatic rollback on errors
- ✅ Clean separation of concerns
- ✅ Exponential backoff prevents thundering herd

---

## When Lock Exception Occurs

```
Thread A Dispenses Rx#1          Thread B Also Tries Rx#1
─────────────────────────────    ──────────────────────
Lock Rx#1 ✅                      
Process Medicine A               Try to Lock Rx#1
Process Medicine B               ❌ DENIED (Thread A has it)
...                              [Wait...]
...                              [Wait...]
Commit ─────────────────────────►  Lock acquired ✅
Release lock                       PessimisticLockingFailureException?
                                   Nope! Lock released by A
                                   Read: Status = DISPENSED
                                   Throw: Already dispensed!
```

---

## The 3 Transaction Rules in Your Project

### 1️⃣ Rule: All Database Operations Are Transactional
```
✅ Every repository.save() happens in a transaction
✅ Every repository.update() happens in a transaction
✅ Even if you don't explicitly declare @Transactional
   (Spring Data JPA handles it automatically for simple queries)
```

### 2️⃣ Rule: Multi-Step Operations Need Explicit Transactions
```
❌ DON'T DO:
   for (Medicine med : medicines) {
       medicineRepo.save(med);  ← Each SEPARATE transaction!
   }
   
✅ DO THIS:
   @Transactional
   public void updateMedicines(List<Medicine> medicines) {
       for (Medicine med : medicines) {
           medicineRepo.save(med);  ← All in ONE transaction
       }
   }
```

### 3️⃣ Rule: Lock Conflicts Need Retry Logic
```
❌ DON'T DO:
   Prescription rx = prescriptionRepo.findByIdWithLock(id);  ← Fails if locked
   
✅ DO THIS:
   int attempts = 0;
   while (true) {
       try {
           Prescription rx = prescriptionRepo.findByIdWithLock(id);
           break;  ← Success
       } catch (PessimisticLockingFailureException e) {
           if (++attempts >= MAX_RETRIES) throw e;
           Thread.sleep(100L * attempts);  ← Retry with backoff
       }
   }
```

---

## Checklist: Understanding Transactions

- [ ] Know what @Transactional annotation does
- [ ] Know what TransactionHelper does (same thing, different style)
- [ ] Know when to use each (90% of cases: @Transactional)
- [ ] Know what happens if exception occurs (rollback)
- [ ] Know how locking interacts with transactions (locks held until commit)
- [ ] Know why retry logic is needed (transient lock failures)
- [ ] Know the difference: transactional vs atomic (atomic requires lock)

---

## Real-World Execution (Your Pharmacy Example)

```
┌─ Start ─────────────────────────────┐
│  POST /api/pharmacy/dispense/1      │
└─────────────────────────────────────┘
         ↓
   dispenseMedicines(1)        ← No transaction yet
         ↓
   ATTEMPT 1:
   ┌─────────────────────────┐
   │ @Transactional BEGINS   │
   ├─────────────────────────┤
   │ findByIdWithLock(1)     │ ← Lock acquired
   │ Check stock             │
   │ Update medicines        │
   │ Mark DISPENSED          │
   ├─────────────────────────┤
   │ COMMIT ✅               │
   │ Lock released           │
   └─────────────────────────┘
         ↓
   Return to caller
         ↓
   HTTP 200: "Dispensed Successfully"
```

vs. with lock conflict:

```
┌─ Start ─────────────────────────────┐
│  POST /api/pharmacy/dispense/1      │
└─────────────────────────────────────┘
         ↓
   dispenseMedicines(1)
         ↓
   ATTEMPT 1:
   ┌─────────────────────────┐
   │ @Transactional BEGINS   │
   ├─────────────────────────┤
   │ findByIdWithLock(1)     │ ← ❌ LOCKED by another request
   │ [WAIT 100ms...]         │
   │ TIMEOUT → Exception     │
   ├─────────────────────────┤
   │ ROLLBACK (auto)         │
   └─────────────────────────┘
         ↓
   Catch PessimisticLockingFailureException
   Sleep 100ms, retry...
         ↓
   ATTEMPT 2: [Same as above, locked again]
   Sleep 200ms, retry...
         ↓
   ATTEMPT 3:
   ┌─────────────────────────┐
   │ @Transactional BEGINS   │
   ├─────────────────────────┤
   │ findByIdWithLock(1)     │ ← ✅ Lock acquired!
   │ Check stock             │
   │ Update medicines        │
   │ Mark DISPENSED          │
   ├─────────────────────────┤
   │ COMMIT ✅               │
   └─────────────────────────┘
         ↓
   Return to caller
         ↓
   HTTP 200: "Dispensed Successfully"
```

---

## Final Answer: Your Manual Transaction Implementation

### WHAT: 2 Approaches
1. **@Transactional** (Annotation-based) - Production use
2. **TransactionHelper** (Code-based) - Available, mainly for learning

### HOW: Same Mechanism Under the Hood
```
Both use Spring's PlatformTransactionManager:
  ┌─ Begin transaction
  ├─ Execute operation
  ├─ If success → Commit
  └─ If error → Rollback
```

### WHERE: Throughout the Project
```
- PharmacyService: @Transactional + Retry Loop (best practice)
- Controllers: Spring Data JPA auto-transactions
- Services: @Transactional for atomicity
```

### WORKING: Guarantees ACID Properties
```
- Atomicity: All-or-nothing (dispense all or none)
- Consistency: Database stays valid
- Isolation: Pessimistic locks prevent conflicts
- Durability: Committed changes survive failure
```

### DIFFERENT from Manual: Same Result, Different Code
```
@Transactional          TransactionHelper
    ↓                          ↓
Annotation              Explicit Method Call
    ↓                          ↓
Spring Proxy            Developer Code
    ↓                          ↓
Auto Control            Manual Control
    ↓                          ↓
Same Atomicity          Same Atomicity
```

**You're using the best approach for each use case! ✅**
