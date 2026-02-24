package com.example.Medico;

import com.example.Medico.model.*;
import com.example.Medico.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

@Component
public class DataLoader implements CommandLineRunner {

    private final MedicineRepository medicineRepo;
    private final PatientRepository patientRepo;
    private final PrescriptionRepository prescriptionRepo;
    private final AppointmentRepository appointmentRepo;
    private final DoctorRepository doctorRepo;
    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;

    public DataLoader(MedicineRepository medicineRepo,
                      PatientRepository patientRepo,
                      PrescriptionRepository prescriptionRepo,
                      AppointmentRepository appointmentRepo,
                      DoctorRepository doctorRepo,
                      UserRepository userRepo,
                      PasswordEncoder passwordEncoder) {
        this.medicineRepo = medicineRepo;
        this.patientRepo = patientRepo;
        this.prescriptionRepo = prescriptionRepo;
        this.appointmentRepo = appointmentRepo;
        this.doctorRepo = doctorRepo;
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
    }

    private void createUserIfMissing(String username, String email, String rawPassword, String role, String fullName) {
        if (userRepo.existsByUsername(username)) {
            return;
        }

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(rawPassword));
        user.setRole(UserRole.fromString(role));
        user.setFullName(fullName);
        user.setActive(true);
        userRepo.save(user);
    }

    @Override
    public void run(String... args) {
        System.out.println("⏳ Checking Database...");
        
        // Count existing records
        long userCount = userRepo.count();
        long doctorCount = doctorRepo.count();
        long patientCount = patientRepo.count();
        long medicineCount = medicineRepo.count();
        
        if (userCount > 0) {
            System.out.println("✅ Database already populated!");
            System.out.println("   - Users: " + userCount);
            System.out.println("   - Doctors: " + doctorCount);
            System.out.println("   - Patients: " + patientCount);
            System.out.println("   - Medicines: " + medicineCount);
            return;
        }
        
        System.out.println("⏳ Loading initial test data...");
        
        // Create default users for testing
        createUserIfMissing("admin", "admin@medico.com", "admin123", "ADMIN", "Administrator");
        createUserIfMissing("doctor1", "doctor1@medico.com", "doctor123", "DOCTOR", "Dr. Rajesh Kumar");
        createUserIfMissing("doctor2", "doctor2@medico.com", "doctor123", "DOCTOR", "Dr. Meera Iyer");
        createUserIfMissing("recep1", "recep1@medico.com", "recep123", "RECEPTIONIST", "Reception Staff");
        createUserIfMissing("pharma1", "pharma1@medico.com", "pharma123", "PHARMACIST", "Pharmacy Staff");
        System.out.println("✅ Users created!");
        
        // Create sample doctors if none exist
        if (doctorRepo.count() == 0) {
            Doctor doc1 = new Doctor();
            doc1.setName("Dr. Rajesh Kumar");
            doc1.setSpecialization("General Physician");
            doctorRepo.save(doc1);
            
            Doctor doc2 = new Doctor();
            doc2.setName("Dr. Meera Iyer");
            doc2.setSpecialization("Pediatrics");
            doctorRepo.save(doc2);
            System.out.println("✅ Doctors created!");
        }
        
        // Create sample patients if none exist
        if (patientCount == 0) {
            Patient p1 = new Patient();
            p1.setName("Munna Kumar");
            p1.setEmail("munna@example.com");
            p1.setPhone("9876543210");
            p1.setMedicalHistory("Diabetes, Penicillin allergy");
            patientRepo.save(p1);
            
            Patient p2 = new Patient();
            p2.setName("Sangeeta Sharma");
            p2.setEmail("sangeeta@example.com");
            p2.setPhone("9876543211");
            p2.setMedicalHistory("Hypertension, No allergies");
            patientRepo.save(p2);
            System.out.println("✅ Patients created!");
        }
        
        // Create sample medicines if none exist
        if (medicineCount == 0) {
            Medicine m1 = new Medicine();
            m1.setName("Aspirin");
            m1.setStock(100);
            m1.setExpiry(LocalDate.parse("2026-12-31"));
            medicineRepo.save(m1);
            
            Medicine m2 = new Medicine();
            m2.setName("Paracetamol");
            m2.setStock(150);
            m2.setExpiry(LocalDate.parse("2026-12-31"));
            medicineRepo.save(m2);
            
            Medicine m3 = new Medicine();
            m3.setName("Metformin");
            m3.setStock(80);
            m3.setExpiry(LocalDate.parse("2026-12-31"));
            medicineRepo.save(m3);
            System.out.println("✅ Medicines created!");
        }
        
        System.out.println("\n📚 Database initialization complete!");
        System.out.println("   - Total Users: " + userRepo.count());
        System.out.println("   - Total Doctors: " + doctorRepo.count());
        System.out.println("   - Total Patients: " + patientRepo.count());
        System.out.println("   - Total Medicines: " + medicineRepo.count());
        System.out.println("\n🔐 Test Credentials:");
        System.out.println("   - Admin: admin / admin123");
        System.out.println("   - Doctor: doctor1 / doctor123");
        System.out.println("   - Receptionist: recep1 / recep123");
        System.out.println("   - Pharmacist: pharma1 / pharma123");
    }
}
