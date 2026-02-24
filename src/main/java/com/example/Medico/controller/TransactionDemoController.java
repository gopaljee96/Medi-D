package com.example.Medico.controller;

import com.example.Medico.model.Doctor;
import com.example.Medico.model.Patient;
import com.example.Medico.service.PatientDoctorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Controller demonstrating manual transaction management for patient and doctor operations.
 * Shows how clients can use TransactionHelper for programmatic transaction control.
 */
@RestController
@RequestMapping("/api/transaction-demo")
public class TransactionDemoController {

    @Autowired
    private PatientDoctorService patientDoctorService;



    /**
     * Add patient using @Transactional annotation (Declarative)
     * POST /api/transaction-demo/patient/annotated
     */
    @PostMapping("/patient/annotated")
    @PreAuthorize("hasRole('ADMIN') or hasRole('DOCTOR') or hasRole('RECEPTIONIST')")
    public ResponseEntity<?> addPatientAnnotated(
            @RequestParam String name,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String address,
            @RequestParam(required = false) String medicalHistory) {
        try {
            Patient patient = patientDoctorService.addPatientWithAnnotation(
                    name, email, phone, address, medicalHistory);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Patient added successfully using @Transactional");
            response.put("patientId", patient.getId());
            response.put("patientName", patient.getName());
            response.put("transactionMethod", "Declarative (@Transactional)");

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to add patient: " + e.getMessage());
            response.put("transactionMethod", "Declarative (@Transactional)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Add multiple patients in single transaction using @Transactional
     * POST /api/transaction-demo/patients/annotated
     * Body: ["Patient1", "Patient2", "Patient3"]
     */
    @PostMapping("/patients/annotated")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> addMultiplePatientsAnnotated(@RequestBody List<String> patientNames) {
        try {
            Map<String, Object> result = patientDoctorService.addMultiplePatientsAnnotation(patientNames);
            result.put("transactionMethod", "Declarative (@Transactional)");
            result.put("explanation", "All patients added in single transaction - if any fails, all rollback");

            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Transaction failed: " + e.getMessage());
            response.put("explanation", "All changes rolled back due to exception");
            response.put("transactionMethod", "Declarative (@Transactional)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Add doctor using @Transactional annotation
     * POST /api/transaction-demo/doctor/annotated
     */
    @PostMapping("/doctor/annotated")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> addDoctorAnnotated(
            @RequestParam String name,
            @RequestParam String specialization) {
        try {
            Doctor doctor = patientDoctorService.addDoctorWithAnnotation(name, specialization);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Doctor added successfully using @Transactional");
            response.put("doctorId", doctor.getId());
            response.put("doctorName", doctor.getName());
            response.put("specialization", doctor.getSpecialization());
            response.put("transactionMethod", "Declarative (@Transactional)");

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to add doctor: " + e.getMessage());
            response.put("transactionMethod", "Declarative (@Transactional)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    // ============= MANUAL TRANSACTION EXAMPLES =============

    /**
     * Add patient using MANUAL transaction management (Programmatic)
     * POST /api/transaction-demo/patient/manual
     */
    @PostMapping("/patient/manual")
    @PreAuthorize("hasRole('ADMIN') or hasRole('DOCTOR') or hasRole('RECEPTIONIST')")
    public ResponseEntity<?> addPatientManual(
            @RequestParam String name,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) String address,
            @RequestParam(required = false) String medicalHistory) {
        try {
            Patient patient = patientDoctorService.addPatientManualTransaction(
                    name, email, phone, address, medicalHistory);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Patient added successfully using MANUAL transaction management");
            response.put("patientId", patient.getId());
            response.put("patientName", patient.getName());
            response.put("transactionMethod", "Programmatic (TransactionHelper)");
            response.put("explanation", "Transaction managed explicitly using PlatformTransactionManager");

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to add patient: " + e.getMessage());
            response.put("transactionMethod", "Programmatic (TransactionHelper)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Add multiple patients in single transaction using MANUAL management
     * POST /api/transaction-demo/patients/manual
     * Body: ["Patient1", "Patient2", "Patient3"]
     */
    @PostMapping("/patients/manual")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> addMultiplePatientsManual(@RequestBody List<String> patientNames) {
        Map<String, Object> result = null;
        try {
            result = patientDoctorService.addMultiplePatientsManualTransaction(patientNames);
            result.put("transactionMethod", "Programmatic (TransactionHelper)");
            result.put("explanation", "Manual transaction management ensures atomic operation");

            if ((Boolean) result.get("success")) {
                return ResponseEntity.status(HttpStatus.CREATED).body(result);
            } else {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(result);
            }
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Transaction error: " + e.getMessage());
            response.put("transactionMethod", "Programmatic (TransactionHelper)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Add doctor using MANUAL transaction management
     * POST /api/transaction-demo/doctor/manual
     */
    @PostMapping("/doctor/manual")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> addDoctorManual(
            @RequestParam String name,
            @RequestParam String specialization) {
        try {
            Doctor doctor = patientDoctorService.addDoctorManualTransaction(name, specialization);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Doctor added successfully using MANUAL transaction management");
            response.put("doctorId", doctor.getId());
            response.put("doctorName", doctor.getName());
            response.put("specialization", doctor.getSpecialization());
            response.put("transactionMethod", "Programmatic (TransactionHelper)");
            response.put("explanation", "Transaction managed explicitly using PlatformTransactionManager");

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to add doctor: " + e.getMessage());
            response.put("transactionMethod", "Programmatic (TransactionHelper)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Complex operation: Add doctor AND multiple patients in SINGLE transaction
     * If ANY operation fails, ENTIRE transaction rolls back
     * POST /api/transaction-demo/doctor-with-patients/manual
     */
    @PostMapping("/doctor-with-patients/manual")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> addDoctorWithPatientsManual(
            @RequestParam String doctorName,
            @RequestParam String specialization,
            @RequestBody List<String> patientNames) {

        Map<String, Object> result = null;
        try {
            result = patientDoctorService.addDoctorWithPatientsManualTransaction(
                    doctorName, specialization, patientNames);

            result.put("transactionMethod", "Programmatic (TransactionHelper)");
            result.put("explanation", "Doctor AND patients in single atomic transaction - all succeed or all fail");

            if ((Boolean) result.get("success")) {
                return ResponseEntity.status(HttpStatus.CREATED).body(result);
            } else {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(result);
            }
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Transaction failed: " + e.getMessage());
            response.put("explanation", "Entire operation rolled back - no doctor or patients added");
            response.put("transactionMethod", "Programmatic (TransactionHelper)");

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Get all patients using READ-ONLY transaction
     * GET /api/transaction-demo/patients/readonly
     */
    @GetMapping("/patients/readonly")
    @PreAuthorize("hasAnyRole('DOCTOR', 'ADMIN', 'RECEPTIONIST')")
    public ResponseEntity<?> getPatientsReadOnly() {
        try {
            List<Patient> patients = patientDoctorService.getPatientsReadOnly();

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("patients", patients);
            response.put("count", patients.size());
            response.put("transactionMethod", "Programmatic (Read-Only)");
            response.put("explanation", "Data fetched in read-only transaction - optimized for performance");

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Failed to fetch patients: " + e.getMessage());

            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
        }
    }

    /**
     * Compare transaction methods
     * GET /api/transaction-demo/comparison
     */
    @GetMapping("/comparison")
    public ResponseEntity<?> compareTransactionMethods() {
        Map<String, Object> comparison = new HashMap<>();

        comparison.put("Declarative (@Transactional)", new HashMap<String, Object>() {{
            put("implementation", "Annotation-based");
            put("control", "Automatic (Spring handles commit/rollback)");
            put("useCase", "Simple, straightforward operations");
            put("advantages", List.of(
                    "Cleaner code",
                    "Less boilerplate",
                    "Spring handles details"
            ));
            put("disadvantages", List.of(
                    "Less control",
                    "Can't adjust behavior at runtime"
            ));
        }});

        comparison.put("Programmatic (TransactionHelper)", new HashMap<String, Object>() {{
            put("implementation", "Code-based (Manual management)");
            put("control", "Explicit (Developer manages begin/commit/rollback)");
            put("useCase", "Complex operations, conditional transactions");
            put("advantages", List.of(
                    "Full control over transaction boundaries",
                    "Can change behavior at runtime",
                    "Multiple transactions in single method"
            ));
            put("disadvantages", List.of(
                    "More code",
                    "More responsibility on developer"
            ));
        }});

        return ResponseEntity.ok(comparison);
    }
}
