package com.example.Medico.controller;

import com.example.Medico.dto.AuthResponse;
import com.example.Medico.dto.StaffSummaryDTO;
import com.example.Medico.model.User;
import com.example.Medico.repository.UserRepository;
import com.example.Medico.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

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
}
