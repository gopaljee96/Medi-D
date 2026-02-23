package com.example.Medico.controller;

import com.example.Medico.dto.AuthRequest;
import com.example.Medico.dto.AuthResponse;
import com.example.Medico.dto.RegisterRequest;
import com.example.Medico.model.User;
import com.example.Medico.model.UserRole;
import com.example.Medico.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest request) {
        try {
            AuthResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthResponse(null, null, null, null, e.getMessage()));
        }
    }

    @PostMapping("/register")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest registerRequest) {
        try {
            // Validate role
            if (!registerRequest.isValidRole()) {
                Map<String, Object> error = new HashMap<>();
                error.put("success", false);
                error.put("message", "Invalid role: " + registerRequest.getRole());
                error.put("validRoles", new String[]{"ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACIST"});
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
            }

            // Create user with enum role
            User user = new User();
            user.setUsername(registerRequest.getUsername());
            user.setEmail(registerRequest.getEmail());
            user.setPassword(registerRequest.getPassword());
            user.setRole(registerRequest.getRoleAsEnum());
            user.setFullName(registerRequest.getFullName());

            AuthResponse response = authService.register(user);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(new AuthResponse(null, null, null, null, e.getMessage()));
        }
    }

    @PostMapping("/register-temp")
    public ResponseEntity<?> registerTemp(@Valid @RequestBody RegisterRequest registerRequest) {
        try {
            // Validate role
            if (!registerRequest.isValidRole()) {
                Map<String, Object> error = new HashMap<>();
                error.put("success", false);
                error.put("message", "Invalid role: " + registerRequest.getRole());
                error.put("validRoles", new String[]{"ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACIST"});
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
            }

            // Create user with enum role
            User user = new User();
            user.setUsername(registerRequest.getUsername());
            user.setEmail(registerRequest.getEmail());
            user.setPassword(registerRequest.getPassword());
            user.setRole(registerRequest.getRoleAsEnum());
            user.setFullName(registerRequest.getFullName());

            AuthResponse response = authService.register(user);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(new AuthResponse(null, null, null, null, e.getMessage()));
        }
    }

    /**
     * Get valid roles (for frontend reference)
     * GET /api/auth/roles
     */
    @GetMapping("/roles")
    public ResponseEntity<?> getValidRoles() {
        Map<String, Object> response = new HashMap<>();
        Map<String, String> roles = new HashMap<>();

        for (UserRole role : UserRole.values()) {
            roles.put(role.name(), role.getDescription());
        }

        response.put("success", true);
        response.put("roles", roles);
        response.put("message", "Available user roles in the system");

        return ResponseEntity.ok(response);
    }
}
