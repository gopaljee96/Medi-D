package com.example.Medico.controller;

import com.example.Medico.dto.PharmacistViewDTO;
import com.example.Medico.model.Medicine;
import com.example.Medico.model.Prescription;
import com.example.Medico.repository.PrescriptionRepository;
import com.example.Medico.service.PharmacyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/pharmacy")
public class PharmacyController {

    @Autowired
    private PharmacyService pharmacyService;

    @Autowired
    private PrescriptionRepository prescriptionRepo;
    @Autowired
    private com.example.Medico.repository.MedicineRepository medicineRepo;

    // Constraint 2: Only return safe data (Privacy Firewall)
    @GetMapping("/queue")
    public List<PharmacistViewDTO> getPendingPrescriptions() {
        List<Prescription> prescriptions = prescriptionRepo.findByStatus("PENDING");
        
        return prescriptions.stream().map(p -> {
            PharmacistViewDTO dto = new PharmacistViewDTO();
            dto.setPrescriptionId(p.getId());

            // Null check is good practice in case a patient was deleted but prescription remains
            if (p.getPatient() != null) {
                dto.setPatientName(p.getPatient().getName());
            } else {
                dto.setPatientName("Unknown Patient");
            }

            // Map the medicine quantities map (ID -> Qty) to (Name -> Qty)
            if (p.getMedicineQuantities() != null) {
                java.util.Map<String, Integer> mapped = new java.util.HashMap<>();
                for (java.util.Map.Entry<Long, Integer> e : p.getMedicineQuantities().entrySet()) {
                    Long medId = e.getKey();
                    Integer qty = e.getValue();
                    String name = medicineRepo.findById(medId).map(m -> m.getName()).orElse("Medicine-" + medId);
                    mapped.put(name, qty);
                }
                dto.setMedicinesToDispense(mapped);
            }

            dto.setStatus(p.getStatus());

            // CRITICAL: We are intentionally NOT mapping p.getPatient().getHistoryBlob()
            return dto;
        }).collect(Collectors.toList());
    }

    @PostMapping("/dispense/{id}")
    public ResponseEntity<String> dispense(@PathVariable Long id) {
        try {
            pharmacyService.dispenseMedicines(id);
            return ResponseEntity.ok("Dispensed Successfully");
        } catch (Exception e) {
            // This catches the "Insufficient Stock" exception from the Service
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/cancel/{id}")
    public ResponseEntity<?> cancel(@PathVariable Long id) {
        try {
            Optional<Prescription> prescriptionOpt = prescriptionRepo.findById(id);
            if (prescriptionOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Prescription not found"));
            }

            Prescription prescription = prescriptionOpt.get();
            String currentStatus = prescription.getStatus() != null ? prescription.getStatus().toUpperCase() : "";

            if ("DISPENSED".equals(currentStatus)) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot cancel a dispensed prescription"));
            }

            if ("CANCELLED".equals(currentStatus)) {
                return ResponseEntity.ok(Map.of(
                        "message", "Prescription already cancelled",
                        "prescriptionId", id,
                        "status", "CANCELLED"
                ));
            }

            prescription.setStatus("CANCELLED");
            prescriptionRepo.save(prescription);

            return ResponseEntity.ok(Map.of(
                    "message", "Prescription cancelled successfully",
                    "prescriptionId", id,
                    "status", "CANCELLED"
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to cancel prescription: " + e.getMessage()));
        }
    }

    @PostMapping("/medicines")
    public ResponseEntity<?> addMedicineBatch(@RequestBody Map<String, Object> request) {
        try {
            String name = request.get("name") != null ? request.get("name").toString().trim() : "";
            String qtyRaw = request.get("quantity") != null ? request.get("quantity").toString() : "";
            String expiryRaw = request.get("expiry") != null ? request.get("expiry").toString().trim() : "";

            if (name.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Medicine name is required"));
            }
            if (qtyRaw.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Quantity is required"));
            }
            if (expiryRaw.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Expiry date is required"));
            }

            int quantity = Integer.parseInt(qtyRaw);
            if (quantity < 1) {
                return ResponseEntity.badRequest().body(Map.of("error", "Quantity must be at least 1"));
            }

            LocalDate expiry = LocalDate.parse(expiryRaw);

            Optional<Medicine> existing = medicineRepo.findAll().stream()
                    .filter(m ->
                            m.getName() != null &&
                            m.getName().equalsIgnoreCase(name) &&
                            expiry.equals(m.getExpiry()))
                    .findFirst();

            Medicine saved;
            String action;
            if (existing.isPresent()) {
                Medicine medicine = existing.get();
                medicine.setStock(medicine.getStock() + quantity);
                saved = medicineRepo.save(medicine);
                action = "merged";
            } else {
                Medicine medicine = new Medicine();
                medicine.setName(name);
                medicine.setStock(quantity);
                medicine.setExpiry(expiry);
                saved = medicineRepo.save(medicine);
                action = "created";
            }

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message", action.equals("merged")
                            ? "Medicine batch merged into existing stock"
                            : "Medicine batch added successfully",
                    "action", action,
                    "medicineId", saved.getId(),
                    "name", saved.getName(),
                    "stock", saved.getStock(),
                    "expiry", saved.getExpiry()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid input: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to add medicine batch: " + e.getMessage()));
        }
    }
}
