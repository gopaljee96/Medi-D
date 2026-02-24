package com.example.Medico.controller;

import com.example.Medico.dto.AuthResponse;
import com.example.Medico.dto.StaffSummaryDTO;
import com.example.Medico.model.User;
import com.example.Medico.model.Medicine;
import com.example.Medico.model.Patient;
import com.example.Medico.model.Appointment;
import com.example.Medico.repository.UserRepository;
import com.example.Medico.repository.MedicineRepository;
import com.example.Medico.repository.PatientRepository;
import com.example.Medico.repository.AppointmentRepository;
import com.example.Medico.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MedicineRepository medicineRepository;

    @Autowired
    private PatientRepository patientRepository;

    @Autowired
    private AppointmentRepository appointmentRepository;

    @GetMapping("/staff")
    public List<StaffSummaryDTO> getStaff() {
        return userRepository.findAll().stream()
                .map(user -> new StaffSummaryDTO(
                        user.getId(),
                        user.getUsername(),
                        user.getEmail(),
                        user.getRole().name(),
                        user.getFullName(),
                        user.getActive() == null || user.getActive()
                ))
                .toList();
    }

    @PostMapping("/staff")
    public ResponseEntity<AuthResponse> createStaff(@Valid @RequestBody User user) {
        try {
            AuthResponse response = authService.register(user);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(new AuthResponse(null, null, null, null, e.getMessage()));
        }
    }

    @PutMapping("/staff/{id}/password")
    public ResponseEntity<?> resetUserPassword(@PathVariable Long id, @RequestBody Map<String, String> request) {
        try {
            String newPassword = request.get("newPassword");
            authService.adminResetPassword(id, newPassword);
            return ResponseEntity.ok(Map.of(
                    "message", "Password updated successfully",
                    "userId", id
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/staff/sync-doctors")
    public ResponseEntity<?> syncDoctorRecords() {
        int created = authService.syncDoctorRecords();
        return ResponseEntity.ok(Map.of(
                "message", "Doctor records sync completed",
                "created", created
        ));
    }

    // ===== MEDICINES MANAGEMENT =====
    @GetMapping("/medicines")
    public ResponseEntity<?> getMedicines() {
        try {
            List<Medicine> medicines = medicineRepository.findAll();
            return ResponseEntity.ok(Map.of(
                    "medicines", medicines,
                    "count", medicines.size()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch medicines"));
        }
    }

    @PostMapping("/medicines")
    public ResponseEntity<?> createMedicine(@RequestBody Map<String, Object> request) {
        try {
            String name = request.get("name").toString();
            Integer stock = Integer.parseInt(request.get("stock").toString());
            String expiry = request.get("expiry").toString();

            if (name.trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Medicine name cannot be empty"));
            }

            Medicine medicine = new Medicine();
            medicine.setName(name);
            medicine.setStock(stock);
            medicine.setExpiry(java.time.LocalDate.parse(expiry));

            Medicine saved = medicineRepository.save(medicine);

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message", "Medicine created successfully",
                    "medicineId", saved.getId(),
                    "name", saved.getName()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to create medicine: " + e.getMessage()));
        }
    }

    @PutMapping("/medicines/{id}")
    public ResponseEntity<?> updateMedicine(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        try {
            Optional<Medicine> medicineOpt = medicineRepository.findById(id);
            if (medicineOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Medicine not found"));
            }

            Medicine medicine = medicineOpt.get();
            if (request.containsKey("name")) {
                medicine.setName(request.get("name").toString());
            }
            if (request.containsKey("stock")) {
                medicine.setStock(Integer.parseInt(request.get("stock").toString()));
            }
            if (request.containsKey("expiry")) {
                medicine.setExpiry(java.time.LocalDate.parse(request.get("expiry").toString()));
            }

            Medicine saved = medicineRepository.save(medicine);
            return ResponseEntity.ok(Map.of(
                    "message", "Medicine updated successfully",
                    "medicineId", saved.getId(),
                    "name", saved.getName()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to update medicine: " + e.getMessage()));
        }
    }

    @DeleteMapping("/medicines/{id}")
    public ResponseEntity<?> deleteMedicine(@PathVariable Long id) {
        try {
            Optional<Medicine> medicineOpt = medicineRepository.findById(id);
            if (medicineOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Medicine not found"));
            }

            medicineRepository.deleteById(id);
            return ResponseEntity.ok(Map.of(
                    "message", "Medicine deleted successfully",
                    "medicineId", id
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to delete medicine: " + e.getMessage()));
        }
    }

    // ===== PATIENTS MANAGEMENT =====
    @GetMapping("/patients")
    public ResponseEntity<?> getPatients() {
        try {
            List<Patient> patients = patientRepository.findAll();
            return ResponseEntity.ok(Map.of(
                    "patients", patients,
                    "count", patients.size()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch patients"));
        }
    }

    @PostMapping("/patients")
    public ResponseEntity<?> createPatient(@RequestBody Map<String, Object> request) {
        try {
            String name = request.get("name").toString();

            if (name.trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Patient name cannot be empty"));
            }

            Patient patient = new Patient();
            patient.setName(name);
            if (request.containsKey("email")) {
                patient.setEmail(request.get("email").toString());
            }
            if (request.containsKey("phone")) {
                patient.setPhone(request.get("phone").toString());
            }
            if (request.containsKey("medicalHistory")) {
                patient.setMedicalHistory(request.get("medicalHistory").toString());
            }

            Patient saved = patientRepository.save(patient);

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message", "Patient created successfully",
                    "patientId", saved.getId(),
                    "name", saved.getName()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to create patient: " + e.getMessage()));
        }
    }

    @PutMapping("/patients/{id}")
    public ResponseEntity<?> updatePatient(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        try {
            Optional<Patient> patientOpt = patientRepository.findById(id);
            if (patientOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Patient not found"));
            }

            Patient patient = patientOpt.get();
            if (request.containsKey("name")) {
                patient.setName(request.get("name").toString());
            }
            if (request.containsKey("email")) {
                patient.setEmail(request.get("email").toString());
            }
            if (request.containsKey("phone")) {
                patient.setPhone(request.get("phone").toString());
            }
            if (request.containsKey("medicalHistory")) {
                patient.setMedicalHistory(request.get("medicalHistory").toString());
            }

            Patient saved = patientRepository.save(patient);
            return ResponseEntity.ok(Map.of(
                    "message", "Patient updated successfully",
                    "patientId", saved.getId(),
                    "name", saved.getName()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to update patient: " + e.getMessage()));
        }
    }

    @DeleteMapping("/patients/{id}")
    public ResponseEntity<?> deletePatient(@PathVariable Long id) {
        try {
            Optional<Patient> patientOpt = patientRepository.findById(id);
            if (patientOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Patient not found"));
            }

            patientRepository.deleteById(id);
            return ResponseEntity.ok(Map.of(
                    "message", "Patient deleted successfully",
                    "patientId", id
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to delete patient: " + e.getMessage()));
        }
    }

    // ===== APPOINTMENTS MANAGEMENT =====
    @GetMapping("/appointments")
    public ResponseEntity<?> getAppointments() {
        try {
            List<Appointment> appointments = appointmentRepository.findAll();
            return ResponseEntity.ok(Map.of(
                    "appointments", appointments,
                    "count", appointments.size()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch appointments"));
        }
    }
}
