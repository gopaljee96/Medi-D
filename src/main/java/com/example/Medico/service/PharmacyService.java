package com.example.Medico.service;

import com.example.Medico.model.Medicine;
import com.example.Medico.model.Prescription;
import com.example.Medico.repository.MedicineRepository;
import com.example.Medico.repository.PrescriptionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class PharmacyService {

    @Autowired
    private MedicineRepository medicineRepo;

    @Autowired
    private PrescriptionRepository prescriptionRepo;

    // Public wrapper implements retry logic for transient lock failures while the
    // actual update is performed in a transactional method.
    private static final int MAX_RETRIES = 3;

    @Autowired
    private org.springframework.context.ApplicationContext applicationContext;

    public void dispenseMedicines(Long prescriptionId) throws Exception {
        int attempts = 0;
        while (true) {
            try {
                // Obtain proxy bean from context to ensure transactional proxy is used
                PharmacyService proxy = applicationContext.getBean(PharmacyService.class);
                proxy.doDispenseTransactional(prescriptionId);
                return;
            } catch (org.springframework.dao.PessimisticLockingFailureException e) {
                attempts++;
                if (attempts >= MAX_RETRIES) {
                    throw new RuntimeException("Failed to acquire lock after retries: " + e.getMessage());
                }
                try {
                    Thread.sleep(100L * attempts);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry interrupted", ie);
                }
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void doDispenseTransactional(Long prescriptionId) throws Exception {

        Prescription prescription = prescriptionRepo.findByIdWithLock(prescriptionId)
            .orElseThrow(() -> new RuntimeException("Prescription not found"));

        if ("DISPENSED".equals(prescription.getStatus())) {
            throw new RuntimeException("Already dispensed!");
        }

        // ITERATE AND CHECK STOCK
        for (Map.Entry<Long, Integer> entry : prescription.getMedicineQuantities().entrySet()) {
            Long medId = entry.getKey();
            Integer qtyNeeded = entry.getValue();

            // PESSIMISTIC_WRITE lock ensures no one else edits stock while we check
            Medicine med = medicineRepo.findById(medId)
                    .orElseThrow(() -> new RuntimeException("Medicine ID " + medId + " not found"));

            if (med.getStock() < qtyNeeded) {
                // This triggers the ROLLBACK. No stock is deducted for ANY item.
                throw new RuntimeException("Transaction Failed: Insufficient stock for " + med.getName());
            }

            // If check passes, stage the update
            med.setStock(med.getStock() - qtyNeeded);
            medicineRepo.save(med);
        }

        prescription.setStatus("DISPENSED");
        prescriptionRepo.save(prescription);
    }
}