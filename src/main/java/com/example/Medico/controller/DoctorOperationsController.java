package com.example.Medico.controller;

import com.example.Medico.model.Doctor;
import com.example.Medico.model.Medicine;
import com.example.Medico.model.Patient;
import com.example.Medico.model.Prescription;
import com.example.Medico.model.User;
import com.example.Medico.repository.DoctorRepository;
import com.example.Medico.repository.MedicineRepository;
import com.example.Medico.repository.PatientRepository;
import com.example.Medico.repository.PrescriptionRepository;
import com.example.Medico.repository.UserRepository;
import com.example.Medico.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Controller for Doctor-specific operations
 * Routes: /api/doctor/**
 * Requires: DOCTOR role (or equivalent)
 */
@RestController
@RequestMapping("/api/doctor")
public class DoctorOperationsController {

    @Autowired
    private MedicineRepository medicineRepository;

    @Autowired
    private PatientRepository patientRepository;

    @Autowired
    private PrescriptionRepository prescriptionRepository;

    @Autowired
    private DoctorRepository doctorRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    /**
     * GET /api/doctor/medicines
     * List all available medicines with stock information
     * Public endpoint (no auth required for browsing)
     */
    @GetMapping("/medicines")
    public ResponseEntity<?> getAllMedicines() {
        try {
            List<Medicine> medicines = medicineRepository.findAll();
            Map<String, Object> response = new HashMap<>();
            response.put("medicines", medicines);
            response.put("count", medicines.size());
            response.put("timestamp", LocalDate.now());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch medicines", "details", e.getMessage()));
        }
    }

    /**
     * GET /api/doctor/patient/{patientId}
     * Get patient details including medical history
     * Requires: DOCTOR role
     */
    @GetMapping("/patient/{patientId}")
    @PreAuthorize("hasRole('DOCTOR')")
    public ResponseEntity<?> getPatientDetails(@PathVariable Long patientId) {
        try {
            Optional<Patient> patient = patientRepository.findById(patientId);
            if (patient.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Patient not found with ID: " + patientId));
            }

            Patient p = patient.get();
            Map<String, Object> response = new HashMap<>();
            response.put("patientId", p.getId());
            response.put("name", p.getName());
            response.put("email", p.getEmail());
            response.put("phone", p.getPhone());
            response.put("address", p.getAddress());
            response.put("medicalHistory", p.getMedicalHistory() != null ? p.getMedicalHistory() : "No history recorded");
            response.put("createdAt", p.getCreatedAt());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch patient details", "details", e.getMessage()));
        }
    }

    /**
     * POST /api/doctor/prescribe
     * Create a new prescription for a patient with selected medicines
     * Requires: DOCTOR role
     * 
     * Request Body:
     * {
     *   "patientId": 1,
     *   "medicines": {
     *     "1": 10,  // medicineId: quantity
     *     "2": 5
     *   }
     * }
     */
    @PostMapping("/prescribe")
    @PreAuthorize("hasRole('DOCTOR')")
    public ResponseEntity<?> createPrescription(
            @RequestBody Map<String, Object> request,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        try {
            // Extract patient ID
            Object patientObj = request.get("patientId");
            if (patientObj == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "patientId is required"));
            }

            Long patientId = Long.parseLong(patientObj.toString());

            // Validate patient exists
            Optional<Patient> patientOpt = patientRepository.findById(patientId);
            if (patientOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Patient not found with ID: " + patientId));
            }

            // Extract medicines map
            @SuppressWarnings("unchecked")
            Map<String, Object> medicinesMap = (Map<String, Object>) request.get("medicines");
            if (medicinesMap == null || medicinesMap.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "medicines object with quantities is required"));
            }

            // Validate all medicines exist and have sufficient stock
            Map<Long, Integer> validMedicines = new HashMap<>();
            for (Map.Entry<String, Object> entry : medicinesMap.entrySet()) {
                try {
                    Long medicineId = Long.parseLong(entry.getKey());
                    Integer quantity = Integer.parseInt(entry.getValue().toString());

                    Optional<Medicine> medOpt = medicineRepository.findById(medicineId);
                    if (medOpt.isEmpty()) {
                        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                                .body(Map.of("error", "Medicine not found with ID: " + medicineId));
                    }

                    Medicine medicine = medOpt.get();
                    if (medicine.getStock() < quantity) {
                        return ResponseEntity.badRequest()
                                .body(Map.of("error", "Insufficient stock for medicine: " + medicine.getName() +
                                        " (available: " + medicine.getStock() + ", requested: " + quantity + ")"));
                    }

                    validMedicines.put(medicineId, quantity);
                } catch (NumberFormatException e) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Invalid medicine ID or quantity format"));
                }
            }

            // Create prescription
            Prescription prescription = new Prescription();
            prescription.setPatient(patientOpt.get());
            prescription.setMedicineQuantities(validMedicines);
            prescription.setStatus("PENDING");

            Prescription savedPrescription = prescriptionRepository.save(prescription);

            Map<String, Object> response = new HashMap<>();
            response.put("prescriptionId", savedPrescription.getId());
            response.put("patientId", savedPrescription.getPatient().getId());
            response.put("patientName", savedPrescription.getPatient().getName());
            response.put("medicines", savedPrescription.getMedicineQuantities());
            response.put("status", savedPrescription.getStatus());
            response.put("createdAt", savedPrescription.getCreatedAt());
            response.put("message", "Prescription created successfully");

            return ResponseEntity.status(HttpStatus.CREATED).body(response);

        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to create prescription", "details", e.getMessage()));
        }
    }

    /**
     * GET /api/doctor/prescriptions/patient/{patientId}
     * View all prescriptions for a specific patient
     * Requires: DOCTOR role
     */
    @GetMapping("/prescriptions/patient/{patientId}")
    @PreAuthorize("hasRole('DOCTOR')")
    public ResponseEntity<?> getPatientPrescriptions(@PathVariable Long patientId) {
        try {
            Optional<Patient> patientOpt = patientRepository.findById(patientId);
            if (patientOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Patient not found with ID: " + patientId));
            }

            List<Prescription> prescriptions = prescriptionRepository.findByPatient(patientOpt.get());

            Map<String, Object> response = new HashMap<>();
            response.put("patientId", patientId);
            response.put("patientName", patientOpt.get().getName());
            response.put("prescriptions", prescriptions);
            response.put("count", prescriptions.size());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch prescriptions", "details", e.getMessage()));
        }
    }

    /**
     * GET /api/doctor/profile
     * Get current doctor's profile information
     * Requires: DOCTOR role (extracted from JWT token)
     */
    @GetMapping("/profile")
    @PreAuthorize("hasRole('DOCTOR')")
    public ResponseEntity<?> getDoctorProfile(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Bearer token required in Authorization header"));
            }

            String token = authHeader.substring(7);
            String username = jwtTokenProvider.getUsernameFromToken(token);

            Optional<User> userOpt = userRepository.findByUsername(username);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "User not found"));
            }

            User user = userOpt.get();
            Optional<Doctor> doctorOpt = doctorRepository.findByNameIgnoreCase(user.getUsername());
            if (doctorOpt.isEmpty() && user.getFullName() != null && !user.getFullName().isBlank()) {
                doctorOpt = doctorRepository.findByNameIgnoreCase(user.getFullName());
            }
            if (doctorOpt.isEmpty()) {
                // Self-heal legacy data: ensure each DOCTOR user has a doctor record.
                Doctor doctor = new Doctor();
                doctor.setName(user.getUsername());
                doctor.setSpecialization("General");
                doctorOpt = Optional.of(doctorRepository.save(doctor));
            }

            Map<String, Object> response = new HashMap<>();
            response.put("userId", user.getId());
            response.put("username", user.getUsername());
            response.put("email", user.getEmail());
            response.put("role", user.getRole());

            if (doctorOpt.isPresent()) {
                Doctor doctor = doctorOpt.get();
                response.put("doctorId", doctor.getId());
                response.put("doctorName", doctor.getName());
                response.put("specialization", doctor.getSpecialization());
            }

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch doctor profile", "details", e.getMessage()));
        }
    }

    /**
     * PUT /api/doctor/patient/{patientId}/history
     * Append doctor notes/diagnosis to patient's medical history.
     * Requires: DOCTOR role
     */
    @PutMapping("/patient/{patientId}/history")
    @PreAuthorize("hasRole('DOCTOR')")
    public ResponseEntity<?> updatePatientHistory(
            @PathVariable Long patientId,
            @RequestBody Map<String, Object> request) {
        try {
            Optional<Patient> patientOpt = patientRepository.findById(patientId);
            if (patientOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Patient not found with ID: " + patientId));
            }

            String note = request.get("note") != null ? request.get("note").toString().trim() : "";
            if (note.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "History note is required"));
            }

            Patient patient = patientOpt.get();
            String existingHistory = patient.getMedicalHistory() != null ? patient.getMedicalHistory().trim() : "";
            String timestamp = LocalDateTime.now().toString();
            String entry = "[" + timestamp + "] Doctor Note: " + note;
            String updatedHistory = existingHistory.isEmpty() ? entry : existingHistory + "\n" + entry;

            patient.setMedicalHistory(updatedHistory);
            patientRepository.save(patient);

            return ResponseEntity.ok(Map.of(
                    "message", "Patient history updated successfully",
                    "patientId", patient.getId(),
                    "medicalHistory", updatedHistory
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to update patient history", "details", e.getMessage()));
        }
    }
}
