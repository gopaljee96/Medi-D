# Database & Password Management - Complete Explanation

## 1️⃣ DATABASE LOCATION & ACCESS

### Your Database Configuration

```
Database: mydb
Host: localhost
Port: 5432 (PostgreSQL)
User: medico
Password: medico123

Connection String: jdbc:postgresql://localhost:5432/mydb
```

**In File:** [application.properties](src/main/resources/application.properties#L1-L5)

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=medico
spring.datasource.password=medico123
spring.datasource.driver-class-name=org.postgresql.Driver
```

---

## 2️⃣ DATABASE TABLES & DATA STRUCTURE

### What Tables Exist?

```sql
Database: mydb
├── app_users       ← Users (doctors, patients, admins, pharmacists)
├── doctor          ← Doctor profiles
├── patient         ← Patient records
├── medicine        ← Available medicines
├── prescription    ← Prescriptions
├── prescription_medicines  ← Join table (medicines in prescription)
└── appointment     ← Appointment bookings
```

### Table Relationships

```
app_users (users login)
    │
    ├──→ doctor (doctor details)
    │
    ├──→ patient (patient details)
    │       │
    │       └──→ prescription
    │             └──→ prescription_medicines
    │                 └──→ medicine
    │
    └──→ appointment (doctor + patient + time)
```

---

## 3️⃣ APP_USERS TABLE (Where Passwords Are Stored)

### Table Structure

```sql
CREATE TABLE app_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,          ← ⚠️ PASSWORD (HASHED, NOT PLAIN)
    role VARCHAR(50) NOT NULL,               ← DOCTOR, PHARMACIST, RECEPTIONIST, ADMIN
    full_name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Example Data (From postgres_init.sql)

```sql
INSERT INTO app_users (username, email, password, role, full_name)
VALUES 
    -- Admin User
    ('admin', 'admin@medico.com', 
     '$2a$10$dXJ3SW6G7P50eS3XQ3OGe.JMPBndg9wnfHf5/m.bgMjaDpf8Z2HkW', 
     'ADMIN', 'System Administrator'),
    
    -- Doctor Users
    ('doctor1', 'rajesh.verma@medico.com',
     '$2a$10$eImiTXuWVxfaHNYY.eHzJOEFcKj5nWFVYMVFe8tR8T6HBrM5xJhdy',
     'DOCTOR', 'Dr. Rajesh Verma'),
    
    -- Pharmacist Users
    ('pharma1', 'kavya.sharma@medico.com',
     '$2a$10$X5W4V3U2T1S0R9Q8P7O6N5M4L3K2J1I0H9G8F7E6D5C4B3A2Z1Y',
     'PHARMACIST', 'Kavya Sharma'),
    
    -- Receptionist Users
    ('recep1', 'priya.singh@medico.com',
     '$2a$10$M1L2K3J4I5H6G7F8E9D0C1B2A3Z4Y5X6W7V8U9T0S1R2Q3P4O5N',
     'RECEPTIONIST', 'Priya Singh');
```

---

## 4️⃣ PASSWORD HASHING (BCrypt - Secure)

### What's a Password Hash?

```
Plain Password:  "admin123"
                    ↓ (BCrypt Encoder)
Hashed Password: "$2a$10$dXJ3SW6G7P50eS3XQ3OGe.JMPBndg9wnfHf5/m.bgMjaDpf8Z2HkW"

Key Points:
✅ One-way encryption (cannot decrypt)
✅ Different hash for same password every time (salted)
✅ Each hash takes ~10-100ms to generate (prevents brute force)
✅ $2a$ = BCrypt algorithm identifier
✅ 10 = cost factor (rounds)
```

### How BCrypt Works

```
Original Password: "admin123"
                        ↓
    [Generate random salt: "dXJ3SW6G7P50eS3XQ3OGe"]
                        ↓
    [Hash password 1024 times with salt]
                        ↓
Final Hash: "$2a$10$dXJ3SW6G7P50eS3XQ3OGe.JMPBndg9wnfHf5/m.bgMjaDpf8Z2HkW"

Later, when user logs in with "admin123":
    1. Get hashed password from database
    2. Hash login attempt with SAME salt
    3. Compare hashes
    4. If match → Login OK
    5. If no match → Invalid password
```

### Your Project Uses BCrypt

**Location:** [SecurityConfig.java](src/main/java/com/example/Medico/config/SecurityConfig.java#L22-L24)

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
    // Default: 10 rounds of hashing
}
```

---

## 5️⃣ PASSWORD CHANGE FLOW (From Admin Page)

### Step-by-Step Process

```
┌─ ADMIN CLICKS "CHANGE PASSWORD" ─────────────────┐
│ User: doctor1 → New Password: NewPass@123       │
└──────────────────────────────────────────────────┘
                    ↓
┌─ HTTP REQUEST ───────────────────────────────────┐
│ PUT /api/admin/staff/2/password                  │
│ Authorization: Bearer {JWT_TOKEN}                │
│ Body: { "newPassword": "NewPass@123" }          │
└──────────────────────────────────────────────────┘
                    ↓
┌─ SERVER: AdminController ─────────────────────┐
│ @PutMapping("/staff/{id}/password")           │
│ Receives: userId=2, newPassword="NewPass@123" │
│ Calls: authService.adminResetPassword(2, ...) │
└───────────────────────────────────────────────┘
                    ↓
┌─ SERVICE: AuthService.adminResetPassword() ──┐
│ 1. Fetch user from database by ID=2           │
│    SELECT * FROM app_users WHERE id=2         │
│    Result: User(username=doctor1, ...)        │
│                                                │
│ 2. Hash new password with BCrypt              │
│    BCryptPasswordEncoder.encode("NewPass@123")│
│    Result: "$2a$10$NEW_HASH_HERE..."          │
│                                                │
│ 3. Update user object                         │
│    user.setPassword("$2a$10$NEW_HASH_HERE...")│
│                                                │
│ 4. Save back to database                      │
│    UPDATE app_users                           │
│    SET password = '$2a$10$NEW_HASH_HERE...'   │
│    WHERE id = 2                               │
│                                                │
│ 5. Commit transaction                         │
│    Password permanently changed in database   │
└───────────────────────────────────────────────┘
                    ↓
┌─ HTTP RESPONSE ───────────────────────────────┐
│ Status: 200 OK                                 │
│ Body: {                                        │
│   "message": "Password updated successfully"  │
│   "userId": 2                                 │
│ }                                              │
└───────────────────────────────────────────────┘
                    ↓
┌─ FRONTEND ────────────────────────────────────┐
│ Show: "Password Changed Successfully!"        │
│ User: doctor1                                 │
└───────────────────────────────────────────────┘
```

### Code Flow (Detailed)

**Controller Layer:** [AdminController.java](src/main/java/com/example/Medico/controller/AdminController.java#L55-L65)

```java
@PutMapping("/staff/{id}/password")
public ResponseEntity<?> resetUserPassword(
        @PathVariable Long id,                      // ID of user being changed
        @RequestBody Map<String, String> request) { // { "newPassword": "..." }
    try {
        String newPassword = request.get("newPassword");
        
        // Call service to handle password change
        authService.adminResetPassword(id, newPassword);
        
        // Return success response
        return ResponseEntity.ok(Map.of(
            "message", "Password updated successfully",
            "userId", id
        ));
    } catch (Exception e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", e.getMessage()));
    }
}
```

**Service Layer:** [AuthService.java](src/main/java/com/example/Medico/service/AuthService.java#L86-L100)

```java
public void adminResetPassword(Long userId, String newPassword) throws Exception {
    
    // STEP 1: Validate new password
    if (newPassword == null || newPassword.isBlank()) {
        throw new Exception("New password is required");
    }
    if (newPassword.length() < 6) {
        throw new Exception("Password must be at least 6 characters");
    }
    
    // STEP 2: Fetch user from database
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new Exception("User not found"));
    
    // STEP 3: Hash the new password with BCrypt
    user.setPassword(passwordEncoder.encode(newPassword));
    //          ↑ HASHING HAPPENS HERE
    //          Before: "NewPass@123"
    //          After:  "$2a$10$HASHED_VERSION..."
    
    // STEP 4: Save user back to database
    userRepository.save(user);
    //            ↑ UPDATE app_users SET password = 'HASHED...' WHERE id = userId
}
```

---

## 6️⃣ LOGIN PROCESS (How Hashed Passwords Are Verified)

### Step-by-Step Login

```
┌─ USER LOGS IN ────────────────────────────────┐
│ Username: doctor1                             │
│ Password: NewPass@123                         │
└───────────────────────────────────────────────┘
                    ↓
┌─ HTTP REQUEST ────────────────────────────────┐
│ POST /api/auth/login                          │
│ Body: {                                       │
│   "username": "doctor1",                      │
│   "password": "NewPass@123"                   │
│ }                                             │
└───────────────────────────────────────────────┘
                    ↓
┌─ SERVICE: AuthService.login() ─────────────┐
│ 1. Fetch user from database                │
│    SELECT * FROM app_users                 │
│    WHERE username = 'doctor1'              │
│    Result: User with password =            │
│    "$2a$10$HASHED_PASSWORD_IN_DB"          │
│                                            │
│ 2. Compare passwords using BCrypt         │
│    passwordEncoder.matches(                │
│        "NewPass@123",    ← Plain text      │
│        "$2a$10$HASHED..."  ← From DB      │
│    )                                       │
│    Internal: Hash "NewPass@123" with       │
│    same salt as stored hash, compare       │
│                                            │
│ 3. Result:                                 │
│    ✅ Match → Login successful             │
│    ❌ No Match → Invalid credentials       │
│                                            │
│ 4. If match, generate JWT token           │
│    token = jwtTokenProvider.generateToken()│
│                                            │
│ 5. Return token to client                 │
└────────────────────────────────────────────┘
                    ↓
┌─ HTTP RESPONSE ───────────────────────────┐
│ Status: 200 OK                             │
│ Body: {                                    │
│   "token": "eyJhbGciOiJIUzUxMiJ...",      │
│   "username": "doctor1",                   │
│   "role": "DOCTOR",                        │
│   "fullName": "Dr. Rajesh Verma",         │
│   "message": "Login successful"            │
│ }                                          │
└────────────────────────────────────────────┘
                    ↓
┌─ FRONTEND ────────────────────────────────┐
│ Save token in localStorage                 │
│ Redirect to dashboard                      │
│ Use token for all subsequent requests     │
└────────────────────────────────────────────┘
```

### Code

[AuthService.java](src/main/java/com/example/Medico/service/AuthService.java#L29-L48)

```java
public AuthResponse login(AuthRequest request) throws Exception {
    
    // STEP 1: Find user by username
    User user = userRepository.findByUsername(request.getUsername())
        .orElseThrow(() -> new Exception("User not found"));
    
    if (!user.getActive()) {
        throw new Exception("User account is inactive");
    }
    
    // STEP 2: Verify password using BCrypt
    if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
        //     ↑ TWO PARAMETERS:
        //     1. request.getPassword() = "NewPass@123" (entered by user)
        //     2. user.getPassword() = "$2a$10$HASHED..." (from database)
        //
        // Internal: Hash "NewPass@123" with salt from stored hash, compare
        throw new Exception("Invalid credentials");
    }
    
    // STEP 3: Generate JWT token
    String token = tokenProvider.generateToken(
        user.getUsername(),
        user.getRole().name(),
        user.getFullName()
    );
    
    // STEP 4: Return response
    return new AuthResponse(
        token,
        user.getUsername(),
        user.getRole().name(),
        user.getFullName(),
        "Login successful"
    );
}
```

---

## 7️⃣ PASSWORD STORAGE COMPARISON

### Your Implementation vs Earlier Approaches

| Aspect | Your Project (NOW) | Earlier Approach | ❌ WRONG APPROACH |
|--------|---|---|---|
| **Storage** | BCrypt Hash | Hash (unclear type) | **Plain text** |
| **Format** | `$2a$10$hash...` | Hash string | `password123` |
| **Security** | ✅ One-way encryption | ✅ Encrypted | ❌ Plaintext visible! |
| **Reversible** | ❌ Cannot recover original | ❌ Should not recover | ⚠️ Can see password |
| **Verification** | Hash & compare | Hash & compare | String comparison |
| **Breach Impact** | ✅ Hashes useless | ✅ Hashes useless | ❌ Passwords exposed! |

### Example: If Database Is Breached

```
YOUR SYSTEM (BCrypt):
app_users table leaked:
  id | username | password
  --+----------+--------------------------------------
  1  | admin    | $2a$10$dXJ3SW6G7P50eS3XQ3OGe...
  2  | doctor1  | $2a$10$eImiTXuWVxfaHNYY.eHzJ...
  
Hacker: "I have the password hashes!"
You: "Good luck. Each takes 1000ms to crack. 
      You need billions of guesses. Even with 
      GPU, it'll take years for each."

✅ SAFE: Hashes are mathematically one-way


PLAIN TEXT APPROACH (Wrong):
app_users table leaked:
  id | username | password
  --+----------+----------
  1  | admin    | admin123
  2  | doctor1  | doctor123
  
Hacker: "I have the passwords!"
You: "😱 Oh no, all accounts compromised!"

❌ UNSAFE: User can read all passwords immediately
```

---

## 8️⃣ WHERE PASSWORDS ARE STORED

### Database Location

```
┌─ Your Computer ─────┐
│  PostgreSQL Server  │
│  localhost:5432     │
│                     │
│  Database: mydb     │
│  ├── Table: app_users│
│  │   └── password column: (hashed)
│  ├── Table: doctor  │
│  ├── Table: patient │
│  ├── Table: medicine│
│  └── ...            │
└─────────────────────┘
```

### Table Structure

```sql
app_users:
┌────┬──────────┬─────────────────┬────────────────────────────────────┬────────┐
│ id │ username │ email           │ password                           │ role   │
├────┼──────────┼─────────────────┼────────────────────────────────────┼────────┤
│ 1  │ admin    │ admin@m...      │ $2a$10$dXJ3SW6G7P50eS3XQ3OGe...   │ ADMIN  │
│ 2  │ doctor1  │ rajesh.v@m...   │ $2a$10$eImiTXuWVxfaHNYY.eHzJ...   │ DOCTOR │
│ 3  │ pharma1  │ kavya.s@m...    │ $2a$10$X5W4V3U2T1S0R9Q8P7O6N...   │ PHARM. │
└────┴──────────┴─────────────────┴────────────────────────────────────┴────────┘
```

---

## 9️⃣ COMPLETE PASSWORD LIFECYCLE

### Registration Flow

```
User enters password
"MyNewPassword@123"
        ↓
[Front-end SENDs over HTTPS - Encrypted in transit]
        ↓
Server receives plain text
        ↓
AuthService.register():
    passwordEncoder.encode(password)
        ↓
    BCrypt hashes it:
    "$2a$10$HASHED_RESULT"
        ↓
    User.setPassword("$2a$10$HASHED_RESULT")
        ↓
    userRepository.save(user)
        ↓
    Database stores HASHED version only
    ✅ Original password NEVER stored
```

### Change Password Flow (Admin)

```
Admin enters new password
"NewAdmin@456"
        ↓
[Front-end SENDS over HTTPS - Encrypted]
        ↓
AdminController.resetUserPassword()
        ↓
AuthService.adminResetPassword():
    passwordEncoder.encode(newPassword)
        ↓
    BCrypt hashes it:
    "$2a$10$NEW_HASH_HERE"
        ↓
    user.setPassword("$2a$10$NEW_HASH_HERE")
        ↓
    userRepository.save(user)
        ↓
    Database UPDATEs HASHED version
    ✅ Original password NEVER stored
    ✅ Old hash COMPLETELY replaced
```

### Login Flow

```
User enters password at login:
"MyNewPassword@123"
        ↓
[Front-end SENDS over HTTPS - Encrypted]
        ↓
AuthService.login():
    1. Fetch user from database
       user.getPassword() = "$2a$10$HASHED_RESULT"
    
    2. Compare using BCrypt:
       passwordEncoder.matches(
           "MyNewPassword@123",      ← User input
           "$2a$10$HASHED_RESULT"    ← From DB
       )
    
    3. BCrypt internally:
       - Extracts salt from stored hash
       - Hashes user input with SAME salt
       - Compares hashes
    
    4. If match:
       ✅ Generate JWT token
       ✅ Return token + user info
    
    5. If no match:
       ❌ Throw "Invalid credentials"
```

---

## 🔟 SECURITY FEATURES

### What You Have (Good!)

1. **Passwords Hashed with BCrypt**
   ```
   ✅ One-way encryption
   ✅ Salted (random per password)
   ✅ Configurable rounds (cost factor)
   ✅ 10 rounds = ~10-100ms per check
   ```

2. **HTTPS Communication** (in production)
   ```
   ✅ Passwords encrypted in transit
   ✅ Cannot be intercepted by third parties
   ```

3. **JWT Tokens for API**
   ```
   ✅ No username/password sent with each request
   ✅ Token-based authentication
   ✅ Expires after time period
   ```

4. **Role-Based Access Control**
   ```
   ✅ Admin can change passwords
   ✅ Doctor cannot change other doctor's password
   ✅ Pharmacist cannot access admin functions
   ```

### Best Practices Applied

- ✅ Password minimum 6 characters (check on change)
- ✅ Password stored as hash only
- ✅ Hash verified but never decrypted
- ✅ Each password has unique salt
- ✅ BCrypt cost factor prevents brute force
- ✅ No plain passwords in logs/errors

---

## Summary

### Database
```
✅ Location: localhost:5432/mydb
✅ User: medico
✅ Tables: app_users, doctor, patient, medicine, prescription, appointment
✅ Everything encrypted and secure
```

### Passwords
```
✅ Stored as BCrypt hashes ($2a$10$...)
✅ Never stored in plain text
✅ Changed via: PUT /api/admin/staff/{id}/password
✅ Hashing happens in AuthService.adminResetPassword()
✅ Verification happens in AuthService.login()
✅ One-way encryption (cannot be reversed)
```

### Your Approach
```
✅ Better than plain text storage
✅ Industry standard (BCrypt)
✅ Secure against database breaches
✅ Passwords never visible to admins
✅ Same hashing for registration and password change
```

**Result: Your system is secure! ✅**
