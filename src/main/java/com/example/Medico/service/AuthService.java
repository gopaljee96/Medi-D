package com.example.Medico.service;

import com.example.Medico.model.User;
import com.example.Medico.model.UserRole;
import com.example.Medico.model.Doctor;
import com.example.Medico.repository.DoctorRepository;
import com.example.Medico.repository.UserRepository;
import com.example.Medico.security.JwtTokenProvider;
import com.example.Medico.dto.AuthRequest;
import com.example.Medico.dto.AuthResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private DoctorRepository doctorRepository;

    public AuthResponse login(AuthRequest request) throws Exception {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new Exception("User not found with username: " + request.getUsername()));

        if (!user.getActive()) {
            throw new Exception("User account is inactive");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new Exception("Invalid credentials");
        }

        String token = tokenProvider.generateToken(user.getUsername(), user.getRole().name(), user.getFullName());

        return new AuthResponse(token, user.getUsername(), user.getRole().name(), user.getFullName(), "Login successful");
    }

    public AuthResponse register(User user) throws Exception {
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new Exception("Username already exists");
        }

        if (userRepository.existsByEmail(user.getEmail())) {
            throw new Exception("Email already exists");
        }

        // Hash password
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        user.setActive(true);

        User savedUser = userRepository.save(user);

        // Keep Doctor entity in sync with DOCTOR user accounts.
        if (savedUser.getRole() == UserRole.DOCTOR) {
            String doctorName = savedUser.getUsername();
            boolean doctorExists = doctorRepository.findByNameIgnoreCase(doctorName).isPresent();
            if (!doctorExists && savedUser.getFullName() != null && !savedUser.getFullName().isBlank()) {
                doctorExists = doctorRepository.findByNameIgnoreCase(savedUser.getFullName()).isPresent();
                if (!doctorExists) {
                    doctorName = savedUser.getFullName();
                }
            }

            if (!doctorExists) {
                Doctor doctor = new Doctor();
                doctor.setName(doctorName);
                doctor.setSpecialization("General");
                doctorRepository.save(doctor);
            }
        }

        String token = tokenProvider.generateToken(savedUser.getUsername(), savedUser.getRole().name(), savedUser.getFullName());

        return new AuthResponse(token, savedUser.getUsername(), savedUser.getRole().name(), savedUser.getFullName(), "Registration successful");
    }

    public void adminResetPassword(Long userId, String newPassword) throws Exception {
        if (newPassword == null || newPassword.isBlank()) {
            throw new Exception("New password is required");
        }
        if (newPassword.length() < 6) {
            throw new Exception("Password must be at least 6 characters");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new Exception("User not found"));

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    public int syncDoctorRecords() {
        int createdCount = 0;
        for (User user : userRepository.findAll()) {
            if (user.getRole() != UserRole.DOCTOR) {
                continue;
            }

            String doctorName = user.getUsername();
            boolean doctorExists = doctorRepository.findByNameIgnoreCase(doctorName).isPresent();
            if (!doctorExists && user.getFullName() != null && !user.getFullName().isBlank()) {
                doctorExists = doctorRepository.findByNameIgnoreCase(user.getFullName()).isPresent();
                if (!doctorExists) {
                    doctorName = user.getFullName();
                }
            }

            if (!doctorExists) {
                Doctor doctor = new Doctor();
                doctor.setName(doctorName);
                doctor.setSpecialization("General");
                doctorRepository.save(doctor);
                createdCount++;
            }
        }
        return createdCount;
    }
}
