package com.example.Medico.dto;

import com.example.Medico.model.UserRole;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for user registration that handles UserRole enum conversion.
 * Accepts role as string and converts to enum automatically.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {

    @NotBlank(message = "Username is required")
    private String username;

    @Email(message = "Email should be valid")
    private String email;

    @NotBlank(message = "Password is required")
    private String password;

    @NotBlank(message = "Role is required")
    private String role; // Will be converted to UserRole enum

    @JsonProperty("fullName")
    private String fullName;

    /**
     * Get role as UserRole enum
     */
    public UserRole getRoleAsEnum() {
        return UserRole.fromString(this.role);
    }

    /**
     * Validate role
     */
    public boolean isValidRole() {
        try {
            UserRole.fromString(this.role);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Get role description
     */
    public String getRoleDescription() {
        return getRoleAsEnum().getDescription();
    }
}
