package com.example.Medico.repository; // <--- Corrected Package

import com.example.Medico.model.Patient;
import com.example.Medico.model.Prescription;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PrescriptionRepository extends JpaRepository<Prescription, Long> {
    List<Prescription> findByStatus(String status);
    List<Prescription> findByPatientId(Long patientId);
    List<Prescription> findByPatient(Patient patient);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Prescription p WHERE p.id = :id")
    Optional<Prescription> findByIdWithLock(Long id);
}