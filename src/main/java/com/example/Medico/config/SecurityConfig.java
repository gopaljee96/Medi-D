package com.example.Medico.config;

import com.example.Medico.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        // Public endpoints
                        .requestMatchers("/", "/api/auth/login", "/api/auth/register", "/api/auth/register-temp", "/api/doctors", "/api/doctor/medicines", "/error", "/h2-console/**").permitAll()
                        // Admin endpoints
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/pharmacy/**").hasRole("PHARMACIST")
                        .requestMatchers("/api/doctor/**").hasRole("DOCTOR")
                        // Admin, Receptionist, and Doctor can access appointments
                        .requestMatchers("/api/appointments/**").hasAnyRole("ADMIN", "RECEPTIONIST", "DOCTOR")
                        // Receptionist and Doctor can manage patients
                        .requestMatchers("/api/patients/**").hasAnyRole("ADMIN", "RECEPTIONIST", "DOCTOR")
                        // All other requests require authentication
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
