# MediCo Frontend (Vite + React + JSX)

Professional OPD frontend connected to the Medico Spring Boot backend.

## Run

1. Start backend (Medico) on `http://localhost:8080`.
2. Start frontend:

```bash
npm install
npm run dev
```

Frontend runs on Vite (usually `http://localhost:5173`) and proxies `/api/*` to backend `http://localhost:8080` in dev mode.

## Login Credentials (Seeded in backend)

- Doctor: `doctor` / `doctor123`
- Receptionist: `receptionist` / `recep123`
- Pharmacist: `pharmacist` / `pharma123`

## Supported Role Flows

- Doctor:
  - View medicines
  - View patient history by patient id (from appointments)
  - Create prescription
  - Block appointment slot
- Receptionist:
  - Register patient
  - Book appointment
  - View appointment ledger
- Pharmacist:
  - View prescription queue
  - Dispense medicines

## API Base URL

Default frontend API base is `/api`.

If you need direct backend URL (non-proxy environment), set:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
```

For changing Vite proxy target in dev, set:

```bash
VITE_API_PROXY_TARGET=http://localhost:8080
```
