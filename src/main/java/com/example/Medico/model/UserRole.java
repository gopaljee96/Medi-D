package com.example.Medico.model;


public enum UserRole {
    ADMIN("Administrator - Full system access"),
    DOCTOR("Doctor - Can view patients, write prescriptions"),
    RECEPTIONIST("Receptionist - Can book appointments"),
    PHARMACIST("Pharmacist - Can dispense medicines");

    private final String description;

    UserRole(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    /**
     * Convert string to UserRole enum
     */
    public static UserRole fromString(String role) {
        if (role == null) {
            return null;
        }
        try {
            return UserRole.valueOf(role.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid role: " + role);
        }
    }

    /**
     * Check if role has permission
     */
    public boolean hasPermission(String permission) {
        switch (this) {
            case ADMIN:
                return true; // Admin has all permissions
            case DOCTOR:
                return permission.matches("(VIEW_PATIENT|WRITE_PRESCRIPTION|MANAGE_APPOINTMENT)");
            case RECEPTIONIST:
                return permission.matches("(BOOK_APPOINTMENT|VIEW_SCHEDULE)");
            case PHARMACIST:
                return permission.matches("(DISPENSE_MEDICINE|VIEW_INVENTORY)");
            default:
                return false;
        }
    }
}
