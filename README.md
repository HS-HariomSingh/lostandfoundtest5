# Campus Lost and Found System

A lightweight, production-ready Lost and Found portal built for colleges and universities. Students can report lost or found items, search belongings, and claim verified items. Administrators manage approvals, reviews, and student records.

---

## 1. Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (zero frontend frameworks)
- **Backend:** Python FastAPI
- **Database:** Firebase Cloud Firestore
- **Authentication:** Token-based session authentication with SHA-256 password hashing
- **Communication:** REST APIs using standard `fetch()`

---

## 2. Project Structure

```text
lost-and-found/
├── backend/
│   ├── main.py
│   ├── firebase.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── items.html
│   ├── login.html
│   ├── student-dashboard.html
│   ├── admin-dashboard.html
│   ├── style.css
│   └── script.js
├── firestore.rules
└── README.md
```

---

## 3. Database Schema (Firestore Collections)

1. **`students`**
   - `id` (string): Student unique document identifier
   - `student_id` (string): College Roll / ID Number (e.g., `CS202401`)
   - `name` (string): Full student name
   - `email` (string): Campus student email
   - `password_hash` (string): SHA-256 encrypted password
   - `department` (string): Department / major
   - `phone` (string): Contact number
   - `role` (string): `student`

2. **`admins`**
   - `id` (string): Administrator document identifier
   - `admin_id` (string): Administrative staff ID
   - `name` (string): Office or Officer Name
   - `email` (string): Administrator official email
   - `password_hash` (string): SHA-256 encrypted password
   - `office_location` (string): Campus office room / building
   - `phone` (string): Department phone extension
   - `role` (string): `admin`

3. **`items`**
   - `id` (string): Unique item report identifier
   - `title` (string): Item headline/name
   - `type` (string): `lost` or `found`
   - `category` (string): `Electronics`, `Personal Belongings`, `Study Materials`, `Accessories`, etc.
   - `description` (string): Identifying details, marks, and content
   - `location` (string): Campus location where lost or found
   - `date` (string): YYYY-MM-DD
   - `image_url` (string): Optional image link
   - `status` (string): `pending`, `approved`, `rejected`, `claimed`, `resolved`
   - `student_id` (string): Submitting student document ID
   - `student_name` (string): Submitting student name
   - `student_email` (string): Submitting student email
   - `created_at` (string): ISO timestamp

4. **`item_claims`**
   - `id` (string): Claim document identifier
   - `item_id` (string): Reference to the claimed item document
   - `item_title` (string): Title of claimed item
   - `student_id` (string): Reference to claiming student
   - `student_name` (string): Claiming student full name
   - `student_email` (string): Claiming student email
   - `proof_description` (string): Distinguishing proof and verification details
   - `contact_phone` (string): Claimant contact number
   - `status` (string): `pending`, `approved`, `rejected`
   - `created_at` (string): ISO timestamp

---

## 4. Setup and Installation

### Prerequisites

- Python 3.10+
- Modern Web Browser

### Step 1: Clone or Enter the Project Directory

```bash
cd lost-and-found
```

### Step 2: Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 3: Firebase Configuration

Firebase Cloud Firestore has been provisioned for this application:
- **Firebase Project ID**: `yttriferous-magpie-sthv3`
- **Firestore Database ID**: `ai-studio-campuslostandfou-d3183e1e-21f7-4954-bec9-b65ef0c84c1d`
- **Region**: `asia-south1`

To connect the Python backend directly to your live cloud project:
1. In the [Firebase Console](https://console.firebase.google.com/project/yttriferous-magpie-sthv3), navigate to **Project Settings > Service accounts**.
2. Click **Generate new private key** and download the JSON file.
3. Save the file to `lost-and-found/backend/serviceAccountKey.json`.
4. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
5. Ensure `.env` includes:
   ```ini
   FIREBASE_SERVICE_ACCOUNT_KEY=serviceAccountKey.json
   FIREBASE_PROJECT_ID=yttriferous-magpie-sthv3
   FIRESTORE_DATABASE_ID=ai-studio-campuslostandfou-d3183e1e-21f7-4954-bec9-b65ef0c84c1d
   ```

*Note: If running without an external key, the system automatically runs with the identical Firestore collection data schema locally.*

### Step 4: Run the FastAPI Backend Server

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API documentation will be available at `http://localhost:8000/docs`.

### Step 5: Open the Frontend

You can view the frontend by opening `frontend/index.html` directly in any web browser, or via any static file server:

```bash
cd frontend
python3 -m http.server 3000
```

FastAPI also serves the frontend automatically at `http://localhost:8000/`.

---

## 5. Demo Credentials

### Pre-loaded Students

| Email | Password | Name | Department |
| :--- | :--- | :--- | :--- |
| `arth@campus.edu` | `password123` | Arth | Computer Science |
| `shivam@campus.edu` | `password123` | Shivam | Electronics & Comm. |
| `marcus.j@campus.edu` | `password123` | Marcus Johnson | Mechanical Engineering |
| `elena.r@campus.edu` | `password123` | Elena Rodriguez | Biotechnology |
| `david.kim@campus.edu` | `password123` | David Kim | Business Admin |

### Pre-loaded Administrator

| Email | Password | Name | Office |
| :--- | :--- | :--- | :--- |
| `hariom18august@gmail.com` | `admin123` | Hariom Singh | Student Activity Center Rm 104 |

---

## 6. API Reference

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Public | Student and admin login |
| `/api/auth/me` | `GET` | Authenticated | Retrieve current session user |
| `/api/auth/logout` | `POST` | Authenticated | Invalidate authentication session |
| `/api/items` | `GET` | Public | List, search, and filter items |
| `/api/items/{id}` | `GET` | Public | Get single item details |
| `/api/items` | `POST` | Authenticated | Submit lost or found item report |
| `/api/student/reports` | `GET` | Student | List reports by authenticated student |
| `/api/student/claims` | `GET` | Student | List claims by authenticated student |
| `/api/claims` | `POST` | Student | Submit claim on a found item |
| `/api/admin/stats` | `GET` | Admin | Dashboard summary counters |
| `/api/admin/reports` | `GET` | Admin | View all submitted reports |
| `/api/admin/reports/{id}/status` | `PUT` | Admin | Approve, reject, or resolve report |
| `/api/admin/reports/{id}` | `DELETE` | Admin | Delete inappropriate report |
| `/api/admin/claims` | `GET` | Admin | View all submitted claims |
| `/api/admin/claims/{id}/status` | `PUT` | Admin | Approve or reject claim |
| `/api/admin/students` | `GET` | Admin | List all registered students |
