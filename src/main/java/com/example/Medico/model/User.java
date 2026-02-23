package com.example.Medico.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import jakarta.persistence.Transient;

@Entity
@Table(name = "app_users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Username is required")
    @Column(unique = true, nullable = false)
    private String username;

    @Email(message = "Email should be valid")
    @Column(unique = true, nullable = false)
    private String email;

    @NotBlank(message = "Password is required")
    private String password; // This will be hashed with BCrypt

    // Store the role using Enum for type safety
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    // Full name (for display)
    private String fullName;

    // Account status (transient for now to avoid schema mismatches)
    @Transient
    private Boolean active = true;

    // Keep transient until DB migration ownership is fixed on existing environments.
    @Transient
    private LocalDateTime createdAt = LocalDateTime.now();

    @Transient
    private LocalDateTime updatedAt = LocalDateTime.now();
}
