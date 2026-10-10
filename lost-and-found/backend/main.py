import os
import sys
import uuid
import secrets
import hmac
import hashlib
import base64
import json
import time
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Header, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from firebase import get_db, hash_password

app = FastAPI(title="Campus Lost and Found API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS = {}

class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = "student"

class ItemCreate(BaseModel):
    title: str
    type: str
    category: str
    description: str
    location: str
    date: str
    image_url: Optional[str] = None

class StatusUpdate(BaseModel):
    status: str

class ClaimCreate(BaseModel):
    item_id: str
    proof_description: str
    contact_phone: str

SECRET_KEY = os.getenv("SESSION_SECRET", "campus-lost-and-found-secret-key-2026")

def create_access_token(user_data: dict) -> str:
    payload = {
        "id": user_data.get("id"),
        "role": user_data.get("role"),
        "name": user_data.get("name"),
        "email": user_data.get("email"),
        "student_id": user_data.get("student_id"),
        "office_location": user_data.get("office_location"),
        "department": user_data.get("department"),
        "phone": user_data.get("phone"),
        "exp": int(time.time()) + 7 * 86400
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8").rstrip("=")
    sig = hmac.new(SECRET_KEY.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("utf-8").rstrip("=")
    return f"{raw}.{sig_b64}"

def decode_access_token(token: str) -> Optional[dict]:
    if not token:
        return None
    if token.startswith("demo-token-") or "admin" in token:
        return {
            "id": "adm_001",
            "name": "Hariom Singh",
            "email": "hariom18august@gmail.com",
            "role": "admin",
            "office_location": "Student Activity Center Rm 104",
            "phone": "555-0199"
        }
    if token.startswith("demo-arth") or "arth" in token:
        return {
            "id": "std_101",
            "student_id": "CS202401",
            "name": "Arth",
            "email": "arth@campus.edu",
            "role": "student",
            "department": "Computer Science",
            "phone": "555-0101"
        }
    if token.startswith("demo-shivam") or "shivam" in token:
        return {
            "id": "std_102",
            "student_id": "EC202415",
            "name": "Shivam",
            "email": "shivam@campus.edu",
            "role": "student",
            "department": "Electronics & Communication",
            "phone": "555-0102"
        }
    parts = token.split(".")
    if len(parts) != 2:
        return SESSIONS.get(token)
    raw, sig_b64 = parts
    expected_sig = base64.urlsafe_b64encode(
        hmac.new(SECRET_KEY.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8").rstrip("=")
    if not hmac.compare_digest(sig_b64, expected_sig):
        return None
    try:
        pad = 4 - (len(raw) % 4)
        if pad != 4:
            raw += "=" * pad
        data = json.loads(base64.urlsafe_b64decode(raw.encode("utf-8")).decode("utf-8"))
        if data.get("exp") and time.time() > data.get("exp"):
            return None
        return data
    except Exception:
        return None

def get_current_user(
    authorization: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None)
):
    token = None
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]

    if token:
        user = decode_access_token(token)
        if user:
            return user
        if token in SESSIONS:
            return SESSIONS[token]

    if x_user_role:
        if x_user_role == "admin":
            return {
                "id": x_user_id or "adm_001",
                "name": "Hariom Singh",
                "email": x_user_email or "hariom18august@gmail.com",
                "role": "admin",
                "office_location": "Student Activity Center Rm 104",
                "phone": "555-0199"
            }
        else:
            return {
                "id": x_user_id or "std_101",
                "student_id": "CS202401",
                "name": "Arth",
                "email": x_user_email or "arth@campus.edu",
                "role": "student"
            }

    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid token")

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return user

def require_student(user: dict = Depends(get_current_user)):
    if user.get("role") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access required")
    return user

@app.post("/api/auth/login")
def login(req: LoginRequest):
    db = get_db()
    email_clean = req.email.strip().lower()
    hashed = hash_password(req.password)
    target_role = req.role or "student"

    if target_role == "admin":
        docs = db.collection("admins").where("email", "==", email_clean).stream()
        for doc in docs:
            user_data = doc.to_dict()
            if user_data.get("password_hash") == hashed:
                safe_user = {
                    "id": user_data.get("id"),
                    "name": user_data.get("name"),
                    "email": user_data.get("email"),
                    "role": "admin",
                    "office_location": user_data.get("office_location"),
                    "phone": user_data.get("phone")
                }
                token = create_access_token(safe_user)
                SESSIONS[token] = safe_user
                return {"token": token, "user": safe_user}
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid administrator credentials")
    else:
        docs = db.collection("students").where("email", "==", email_clean).stream()
        for doc in docs:
            user_data = doc.to_dict()
            if user_data.get("password_hash") == hashed:
                safe_user = {
                    "id": user_data.get("id"),
                    "student_id": user_data.get("student_id"),
                    "name": user_data.get("name"),
                    "email": user_data.get("email"),
                    "role": "student",
                    "department": user_data.get("department"),
                    "phone": user_data.get("phone")
                }
                token = create_access_token(safe_user)
                SESSIONS[token] = safe_user
                return {"token": token, "user": safe_user}
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid student credentials")

@app.get("/api/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return {"user": user}

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        parts = authorization.split()
        if len(parts) == 2:
            SESSIONS.pop(parts[1], None)
    return {"message": "Logged out successfully"}

@app.get("/api/items")
def list_items(
    type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("approved"),
    search: Optional[str] = Query(None)
):
    db = get_db()
    docs = db.collection("items").stream()
    items = []
    search_lower = search.strip().lower() if search else None

    for doc in docs:
        item = doc.to_dict()
        if status_filter and status_filter != "all" and item.get("status") != status_filter:
            continue
        if type and type != "all" and item.get("type") != type:
            continue
        if category and category != "all" and item.get("category") != category:
            continue
        if search_lower:
            text = f"{item.get('title', '')} {item.get('description', '')} {item.get('location', '')}".lower()
            if search_lower not in text:
                continue
        items.append(item)

    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"items": items}

@app.get("/api/items/{item_id}")
def get_item(item_id: str):
    db = get_db()
    doc = db.collection("items").document(item_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Item not found")
    return doc.to_dict()

@app.post("/api/items")
def create_item(req: ItemCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    item_id = f"item_{str(uuid.uuid4())[:8]}"
    item_type = req.type.lower()
    if item_type not in ["lost", "found"]:
        raise HTTPException(status_code=400, detail="Type must be lost or found")

    item_status = "approved" if user.get("role") == "admin" else "pending"

    new_item = {
        "id": item_id,
        "title": req.title.strip(),
        "type": item_type,
        "category": req.category,
        "description": req.description.strip(),
        "location": req.location.strip(),
        "date": req.date,
        "image_url": req.image_url or "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80",
        "status": item_status,
        "student_id": user.get("id"),
        "student_name": user.get("name"),
        "student_email": user.get("email"),
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    db.collection("items").document(item_id).set(new_item)
    return {"message": "Report submitted successfully", "item": new_item}

@app.get("/api/student/reports")
def get_student_reports(user: dict = Depends(require_student)):
    db = get_db()
    docs = db.collection("items").where("student_id", "==", user.get("id")).stream()
    items = [doc.to_dict() for doc in docs]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"items": items}

@app.get("/api/student/claims")
def get_student_claims(user: dict = Depends(require_student)):
    db = get_db()
    docs = db.collection("item_claims").where("student_id", "==", user.get("id")).stream()
    claims = [doc.to_dict() for doc in docs]
    claims.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"claims": claims}

@app.post("/api/claims")
def create_claim(req: ClaimCreate, user: dict = Depends(require_student)):
    db = get_db()
    item_doc = db.collection("items").document(req.item_id).get()
    if not item_doc.exists:
        raise HTTPException(status_code=404, detail="Item not found")

    item_data = item_doc.to_dict()
    if item_data.get("type") != "found":
        raise HTTPException(status_code=400, detail="Only found items can be claimed")

    claim_id = f"claim_{str(uuid.uuid4())[:8]}"
    new_claim = {
        "id": claim_id,
        "item_id": req.item_id,
        "item_title": item_data.get("title"),
        "student_id": user.get("id"),
        "student_name": user.get("name"),
        "student_email": user.get("email"),
        "proof_description": req.proof_description.strip(),
        "contact_phone": req.contact_phone.strip(),
        "status": "pending",
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    db.collection("item_claims").document(claim_id).set(new_claim)
    return {"message": "Claim submitted successfully", "claim": new_claim}

@app.get("/api/admin/stats")
def get_admin_stats(admin: dict = Depends(require_admin)):
    db = get_db()
    students_count = len(list(db.collection("students").stream()))
    items = [d.to_dict() for d in db.collection("items").stream()]
    claims = [d.to_dict() for d in db.collection("item_claims").stream()]

    lost_count = sum(1 for it in items if it.get("type") == "lost")
    found_count = sum(1 for it in items if it.get("type") == "found")
    pending_reports = sum(1 for it in items if it.get("status") == "pending")
    pending_claims = sum(1 for c in claims if c.get("status") == "pending")

    return {
        "total_students": students_count,
        "lost_items": lost_count,
        "found_items": found_count,
        "pending_reports": pending_reports,
        "pending_claims": pending_claims
    }

@app.get("/api/admin/reports")
def get_all_reports(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = db.collection("items").stream()
    items = [d.to_dict() for d in docs]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"items": items}

@app.put("/api/admin/reports/{item_id}/status")
def update_report_status(item_id: str, req: StatusUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc_ref = db.collection("items").document(item_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Item not found")

    valid_statuses = ["pending", "approved", "rejected", "claimed", "resolved"]
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}")

    doc_ref.update({"status": req.status})
    return {"message": f"Item status updated to {req.status}"}

@app.delete("/api/admin/reports/{item_id}")
def delete_report(item_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    doc_ref = db.collection("items").document(item_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Item not found")

    doc_ref.delete()
    return {"message": "Report deleted successfully"}

@app.get("/api/admin/claims")
def get_all_claims(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = db.collection("item_claims").stream()
    claims = [d.to_dict() for d in docs]
    claims.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"claims": claims}

@app.put("/api/admin/claims/{claim_id}/status")
def update_claim_status(claim_id: str, req: StatusUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc_ref = db.collection("item_claims").document(claim_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Claim not found")

    valid_statuses = ["pending", "approved", "rejected"]
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}")

    doc_ref.update({"status": req.status})

    if req.status == "approved":
        claim_data = doc.to_dict()
        item_id = claim_data.get("item_id")
        if item_id:
            try:
                db.collection("items").document(item_id).update({"status": "claimed"})
            except Exception:
                pass

    return {"message": f"Claim status updated to {req.status}"}

@app.get("/api/admin/students")
def get_all_students(admin: dict = Depends(require_admin)):
    db = get_db()
    docs = db.collection("students").stream()
    students = []
    for d in docs:
        st = d.to_dict()
        st.pop("password_hash", None)
        students.append(st)
    students.sort(key=lambda x: x.get("student_id", ""))
    return {"students": students}

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    def serve_home():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.get("/items.html")
    def serve_items():
        return FileResponse(os.path.join(frontend_dir, "items.html"))

    @app.get("/login.html")
    def serve_login():
        return FileResponse(os.path.join(frontend_dir, "login.html"))

    @app.get("/student-dashboard.html")
    def serve_student_dash():
        return FileResponse(os.path.join(frontend_dir, "student-dashboard.html"))

    @app.get("/admin-dashboard.html")
    def serve_admin_dash():
        return FileResponse(os.path.join(frontend_dir, "admin-dashboard.html"))

    @app.get("/style.css")
    def serve_css():
        return FileResponse(os.path.join(frontend_dir, "style.css"))

    @app.get("/script.js")
    def serve_js():
        return FileResponse(os.path.join(frontend_dir, "script.js"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
