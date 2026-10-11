# Campus Lost and Found System

A lightweight, production-ready Lost and Found portal built for colleges and universities. Students can report lost or found items, search belongings, and claim verified items. Administrators manage approvals, reviews, and student records.

---

## 1. Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (zero frontend frameworks)
- **Backend:** Node.js Express & TypeScript / Python FastAPI
- **Database:** Aiven MySQL (Cloud Relational Database) & MySQL Workbench 8.0+
- **Authentication:** Token-based session authentication with SHA-256 password hashing
- **Communication:** REST APIs using standard `fetch()`

---

## 2. Normalized Relational Database Schema

The database follows a normalized relational structure:

### 1. `DEPARTMENT`
- `department_id` (VARCHAR(64), Primary Key)
- `department_name` (VARCHAR(150), Candidate Key - UNIQUE)

### 2. `CATEGORY`
- `category_id` (VARCHAR(64), Primary Key)
- `category_name` (VARCHAR(100), Candidate Key - UNIQUE)

### 3. `LOCATION`
- `location_id` (VARCHAR(64), Primary Key)
- `location_name` (VARCHAR(255), Candidate Key - UNIQUE)

### 4. `STUDENT`
- `student_id` (VARCHAR(64), Primary Key)
- `roll_no` (VARCHAR(64), Candidate Key - UNIQUE)
- `name` (VARCHAR(255))
- `email` (VARCHAR(255), Candidate Key - UNIQUE)
- `password_hash` (VARCHAR(255))
- `phone` (VARCHAR(32))
- `department_id` (VARCHAR(64), Foreign Key → `DEPARTMENT(department_id)`)

### 5. `ADMIN`
- `admin_id` (VARCHAR(64), Primary Key)
- `staff_code` (VARCHAR(64), Candidate Key - UNIQUE)
- `name` (VARCHAR(255))
- `email` (VARCHAR(255), Candidate Key - UNIQUE)
- `password_hash` (VARCHAR(255))
- `office_location` (VARCHAR(255))
- `phone` (VARCHAR(32))

### 6. `ITEM`
- `item_id` (VARCHAR(64), Primary Key)
- `title` (VARCHAR(255))
- `item_type` (ENUM('lost', 'found'))
- `description` (TEXT)
- `event_date` (VARCHAR(32))
- `image_url` (VARCHAR(2048))
- `status` (ENUM('pending', 'approved', 'rejected', 'claimed', 'resolved'))
- `category_id` (VARCHAR(64), Foreign Key → `CATEGORY(category_id)`)
- `location_id` (VARCHAR(64), Foreign Key → `LOCATION(location_id)`)
- `reported_by` (VARCHAR(64), Foreign Key → `STUDENT(student_id)`)
- `reviewed_by` (VARCHAR(64), Foreign Key → `ADMIN(admin_id)`, Nullable)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### 7. `CLAIM`
- `claim_id` (VARCHAR(64), Primary Key)
- `proof_description` (TEXT)
- `contact_phone` (VARCHAR(32))
- `status` (ENUM('pending', 'approved', 'rejected'))
- `item_id` (VARCHAR(64), Foreign Key → `ITEM(item_id)`)
- `student_id` (VARCHAR(64), Foreign Key → `STUDENT(student_id)`)
- `reviewed_by` (VARCHAR(64), Foreign Key → `ADMIN(admin_id)`, Nullable)
- **Composite Candidate Key:** `(item_id, student_id)`, enforced by `UNIQUE` constraint.

### 8. `ITEM_STATUS_LOG`
- `log_id` (VARCHAR(64), Primary Key)
- `old_status` (VARCHAR(32), Nullable)
- `new_status` (VARCHAR(32))
- `changed_at` (TIMESTAMP)
- `item_id` (VARCHAR(64), Foreign Key → `ITEM(item_id)`)

---

## 3. Connecting to Aiven MySQL & MySQL Workbench

1. **Aiven Cloud Connection:**
   Configure environment variables in `.env`:
   ```bash
   AIVEN_MYSQL_HOST="YOUR_AIVEN_HOST.aivencloud.com"
   AIVEN_MYSQL_PORT="14526"
   AIVEN_MYSQL_USER="avnadmin"
   AIVEN_MYSQL_PASSWORD="YOUR_AIVEN_PASSWORD"
   AIVEN_MYSQL_DATABASE="defaultdb"
   AIVEN_MYSQL_URL="mysql://avnadmin:YOUR_PASSWORD@YOUR_AIVEN_HOST:14526/defaultdb?ssl-mode=REQUIRED"
   ```

2. **MySQL Workbench Connection:**
   - Hostname: `YOUR_AIVEN_HOST.aivencloud.com`
   - Port: `14526`
   - Username: `avnadmin`
   - Password: `YOUR_AIVEN_PASSWORD`
   - Default Schema: `defaultdb`
   - SSL: Require
   - Open and execute `database/schema_defaultdb.sql` or `database/schema.sql`.

---

## 4. Seed Test Credentials

- **Admin Login:**
  - Email: `hariom18august@gmail.com`
  - Password: `admin123` (or `admin`)
  - Role: Administrator

- **Student Login:**
  - Email: `arth@campus.edu` (Roll No: `CS202401`)
  - Password: `password123`
  - Role: Student
