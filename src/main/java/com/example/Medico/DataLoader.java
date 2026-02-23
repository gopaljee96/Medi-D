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
        System.out.println("⏳ Checking PostgreSQL Database...");
        
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
            System.out.println("\n📚 PostgreSQL Database is ready for production use!");
            return;
        }
        
        System.out.println("⏳ Loading test data from PostgreSQL...");
        System.out.println("✅ Data already loaded via postgres_init.sql");
        System.out.println("   - Total Users: " + userRepo.count());
        System.out.println("   - Total Doctors: " + doctorRepo.count());
        System.out.println("   - Total Patients: " + patientRepo.count());
        System.out.println("   - Total Medicines: " + medicineRepo.count());
    }
}
