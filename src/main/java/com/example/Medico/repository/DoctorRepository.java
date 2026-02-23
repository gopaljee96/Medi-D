package com.example.Medico.repository;

import com.example.Medico.model.Doctor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DoctorRepository extends JpaRepository<Doctor, Long> {
    Optional<Doctor> findByName(String name);
    Optional<Doctor> findByNameIgnoreCase(String name);
}
