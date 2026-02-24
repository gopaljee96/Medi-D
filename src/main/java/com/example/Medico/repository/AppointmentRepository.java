package com.example.Medico.repository;

import com.example.Medico.model.Appointment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, Long> {

    // Find all appointments for a specific doctor
    List<Appointment> findByDoctorId(Long doctorId);
    Page<Appointment> findByDoctorId(Long doctorId, Pageable pageable);

    // Find appointments for a specific patient
    Page<Appointment> findByPatientId(Long patientId, Pageable pageable);

    // Find available slots (Module A logic)
    List<Appointment> findByStatus(String status);
}
