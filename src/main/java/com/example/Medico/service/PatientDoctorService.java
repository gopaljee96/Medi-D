package com.example.Medico.service;

import com.example.Medico.model.Doctor;
import com.example.Medico.model.Patient;
import com.example.Medico.repository.DoctorRepository;
import com.example.Medico.repository.PatientRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Service demonstrating both @Transactional (declarative) and manual (programmatic) 
 * transaction management.
 * 
 * Shows how to add patients and doctors with transaction control.
 */
@Service
public class PatientDoctorService {

    @Autowired
    private PatientRepository patientRepository;

    @Autowired
    private DoctorRepository doctorRepository;

    @Autowired
    private TransactionHelper transactionHelper;

    // ============= USING @Transactional ANNOTATION (Declarative) =============

    /**
     * Add patient using @Transactional annotation
     */
    @Transactional(rollbackFor = Exception.class)
    public Patient addPatientWithAnnotation(String name, String email, String phone, String address, String medicalHistory) throws Exception {
        Patient patient = new Patient();
        patient.setName(name);
        patient.setEmail(email);
        patient.setPhone(phone);
        patient.setAddress(address);
        patient.setMedicalHistory(medicalHistory);
        patient.setCreatedAt(LocalDateTime.now());

        // If any exception occurs here, transaction will rollback
        return patientRepository.save(patient);
    }

    /**
     * Add multiple patients in single transaction using @Transactional
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> addMultiplePatientsAnnotation(java.util.List<String> patientNames) throws Exception {
        Map<String, Object> result = new HashMap<>();
        int count = 0;

        try {
            for (String name : patientNames) {
                if (name == null || name.trim().isEmpty()) {
                    throw new IllegalArgumentException("Patient name cannot be empty");
                }

                Patient patient = new Patient();
                patient.setName(name);
                patient.setCreatedAt(LocalDateTime.now());
                patientRepository.save(patient);
                count++;
            }

            result.put("success", true);
            result.put("message", count + " patients added successfully");
            result.put("count", count);
            return result;
        } catch (Exception e) {
            // Exception will trigger rollback - no patients added if any fails
            result.put("success", false);
            result.put("message", "Failed to add patients: " + e.getMessage());
            result.put("count", 0);
            throw e;
        }
    }

    /**
     * Add doctor using @Transactional annotation
     */
    @Transactional(rollbackFor = Exception.class)
    public Doctor addDoctorWithAnnotation(String name, String specialization) throws Exception {
        Doctor doctor = new Doctor();
        doctor.setName(name);
        doctor.setSpecialization(specialization);

        // If any exception occurs here, transaction will rollback
        return doctorRepository.save(doctor);
    }

    // ============= USING MANUAL TRANSACTION MANAGEMENT (Programmatic) =============

    /**
     * Add patient using MANUAL transaction management
     * This gives client explicit control over transaction boundaries
     */
    public Patient addPatientManualTransaction(String name, String email, String phone, String address, String medicalHistory) throws Exception {
        return transactionHelper.executeInTransaction(() -> {
            Patient patient = new Patient();
            patient.setName(name);
            patient.setEmail(email);
            patient.setPhone(phone);
            patient.setAddress(address);
            patient.setMedicalHistory(medicalHistory);
            patient.setCreatedAt(LocalDateTime.now());

            // Save within transaction
            return patientRepository.save(patient);
        });
    }

    /**
     * Add multiple patients using MANUAL transaction management
     * All succeed or all fail - atomic operation
     */
    public Map<String, Object> addMultiplePatientsManualTransaction(java.util.List<String> patientNames) throws Exception {
        Map<String, Object> result = new HashMap<>();

        try {
            transactionHelper.executeInTransactionVoid(() -> {
                int count = 0;
                for (String name : patientNames) {
                    if (name == null || name.trim().isEmpty()) {
                        throw new IllegalArgumentException("Patient name cannot be empty");
                    }

                    Patient patient = new Patient();
                    patient.setName(name);
                    patient.setCreatedAt(LocalDateTime.now());
                    patientRepository.save(patient);
                    count++;
                }
            });

            result.put("success", true);
            result.put("message", patientNames.size() + " patients added successfully");
            result.put("count", patientNames.size());
        } catch (Exception e) {
            // Rollback happened automatically
            result.put("success", false);
            result.put("message", "Failed to add patients (rolled back): " + e.getMessage());
            result.put("count", 0);
        }

        return result;
    }

    /**
     * Add doctor using MANUAL transaction management
     */
    public Doctor addDoctorManualTransaction(String name, String specialization) throws Exception {
        return transactionHelper.executeInTransaction(() -> {
            Doctor doctor = new Doctor();
            doctor.setName(name);
            doctor.setSpecialization(specialization);

            // Save within transaction
            return doctorRepository.save(doctor);
        });
    }

    /**
     * Complex operation: Add doctor AND multiple patients in SINGLE transaction
     * If any operation fails, entire transaction rolls back
     */
    public Map<String, Object> addDoctorWithPatientsManualTransaction(
            String doctorName, String specialization, java.util.List<String> patientNames) throws Exception {

        Map<String, Object> result = new HashMap<>();

        try {
            // Execute both operations in single transaction
            transactionHelper.executeInTransactionVoid(() -> {
                // Add doctor
                Doctor doctor = new Doctor();
                doctor.setName(doctorName);
                doctor.setSpecialization(specialization);
                Doctor savedDoctor = doctorRepository.save(doctor);

                // Add patients
                int patientCount = 0;
                for (String patientName : patientNames) {
                    if (patientName == null || patientName.trim().isEmpty()) {
                        throw new IllegalArgumentException("Patient name cannot be empty");
                    }

                    Patient patient = new Patient();
                    patient.setName(patientName);
                    patient.setCreatedAt(LocalDateTime.now());
                    patientRepository.save(patient);
                    patientCount++;
                }

                // If we reach here, all operations succeeded
            });

            result.put("success", true);
            result.put("message", "Doctor: " + doctorName + " and " + patientNames.size() + " patients added successfully");
            result.put("doctorName", doctorName);
            result.put("patientCount", patientNames.size());

        } catch (Exception e) {
            // Entire transaction rolled back - doctor NOT added if patient fails
            result.put("success", false);
            result.put("message", "Failed (transaction rolled back): " + e.getMessage());
            result.put("doctorName", null);
            result.put("patientCount", 0);
        }

        return result;
    }

    /**
     * Read-only transaction for fetching patients
     */
    public java.util.List<Patient> getPatientsReadOnly() throws Exception {
        return transactionHelper.executeInReadOnlyTransaction(() -> {
            return patientRepository.findAll();
        });
    }

    /**
     * Example showing transaction with specific isolation level
     */
    public Patient addPatientWithIsolationLevel(String name, String email) throws Exception {
        return transactionHelper.executeInTransaction(
                () -> {
                    Patient patient = new Patient();
                    patient.setName(name);
                    patient.setEmail(email);
                    patient.setCreatedAt(LocalDateTime.now());
                    return patientRepository.save(patient);
                },
                org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED
        );
    }
}
