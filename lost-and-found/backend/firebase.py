import os
import json
import uuid
import hashlib
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    HAS_FIREBASE = True
except ImportError:
    HAS_FIREBASE = False

DATA_FILE = os.path.join(os.path.dirname(__file__), "firestore_local.json")

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

INITIAL_STUDENTS = [
    {
        "id": "std_101",
        "student_id": "CS202401",
        "name": "Arth",
        "email": "arth@campus.edu",
        "password_hash": hash_password("password123"),
        "department": "Computer Science",
        "phone": "555-0101",
        "role": "student",
        "created_at": "2026-10-01T09:00:00Z"
    },
    {
        "id": "std_102",
        "student_id": "EC202415",
        "name": "Shivam",
        "email": "shivam@campus.edu",
        "password_hash": hash_password("password123"),
        "department": "Electronics & Communication",
        "phone": "555-0102",
        "role": "student",
        "created_at": "2026-10-02T10:15:00Z"
    },
    {
        "id": "std_103",
        "student_id": "ME202432",
        "name": "Marcus Johnson",
        "email": "marcus.j@campus.edu",
        "password_hash": hash_password("password123"),
        "department": "Mechanical Engineering",
        "phone": "555-0103",
        "role": "student",
        "created_at": "2026-10-03T11:30:00Z"
    },
    {
        "id": "std_104",
        "student_id": "BT202409",
        "name": "Elena Rodriguez",
        "email": "elena.r@campus.edu",
        "password_hash": hash_password("password123"),
        "department": "Biotechnology",
        "phone": "555-0104",
        "role": "student",
        "created_at": "2026-10-04T08:45:00Z"
    },
    {
        "id": "std_105",
        "student_id": "BA202450",
        "name": "David Kim",
        "email": "david.kim@campus.edu",
        "password_hash": hash_password("password123"),
        "department": "Business Administration",
        "phone": "555-0105",
        "role": "student",
        "created_at": "2026-10-05T14:20:00Z"
    }
]

INITIAL_ADMINS = [
    {
        "id": "adm_001",
        "admin_id": "ADM202401",
        "name": "Hariom Singh",
        "email": "hariom18august@gmail.com",
        "password_hash": hash_password("admin123"),
        "office_location": "Student Activity Center Rm 104",
        "phone": "555-0199",
        "role": "admin",
        "created_at": "2026-09-01T08:00:00Z"
    }
]

INITIAL_ITEMS = [
    {
        "id": "item_1",
        "title": "MacBook Air M2 Silver",
        "type": "lost",
        "category": "Electronics",
        "description": "Silver MacBook Air in a dark grey protective felt sleeve with campus computer club stickers on lid.",
        "location": "Main Campus Library 2nd Floor Study Room B",
        "date": "2026-10-06",
        "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80",
        "status": "approved",
        "student_id": "std_101",
        "student_name": "Arth",
        "student_email": "arth@campus.edu",
        "created_at": "2026-10-06T14:30:00Z"
    },
    {
        "id": "item_2",
        "title": "Brown Leather Bi-fold Wallet",
        "type": "found",
        "category": "Personal Belongings",
        "description": "Brown leather wallet containing student transit pass and library card. Turned into dining hall counter.",
        "location": "Campus Dining Hall West Entrance",
        "date": "2026-10-07",
        "image_url": "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=600&q=80",
        "status": "approved",
        "student_id": "std_102",
        "student_name": "Shivam",
        "student_email": "shivam@campus.edu",
        "created_at": "2026-10-07T11:15:00Z"
    },
    {
        "id": "item_3",
        "title": "TI-84 Plus CE Graphing Calculator",
        "type": "lost",
        "category": "Study Materials",
        "description": "Black TI-84 Plus CE graphing calculator with cobalt blue sliding cover. Initials MJ on the battery compartment.",
        "location": "Engineering Hall Room 302",
        "date": "2026-10-08",
        "image_url": "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?auto=format&fit=crop&w=600&q=80",
        "status": "approved",
        "student_id": "std_103",
        "student_name": "Marcus Johnson",
        "student_email": "marcus.j@campus.edu",
        "created_at": "2026-10-08T09:20:00Z"
    },
    {
        "id": "item_4",
        "title": "Hydro Flask Water Bottle 32oz",
        "type": "found",
        "category": "Accessories",
        "description": "Cobalt blue stainless steel bottle with yellow hiking club sticker on side. Found left on bleachers.",
        "location": "Athletics Complex Bleachers",
        "date": "2026-10-08",
        "image_url": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80",
        "status": "approved",
        "student_id": "std_104",
        "student_name": "Elena Rodriguez",
        "student_email": "elena.r@campus.edu",
        "created_at": "2026-10-08T16:45:00Z"
    },
    {
        "id": "item_5",
        "title": "Wireless Noise-Cancelling Headphones",
        "type": "found",
        "category": "Electronics",
        "description": "Matte black over-ear Bluetooth headphones stored inside a black zippered EVA hard case.",
        "location": "Student Union Lounge 1st Floor",
        "date": "2026-10-09",
        "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
        "status": "pending",
        "student_id": "std_105",
        "student_name": "David Kim",
        "student_email": "david.kim@campus.edu",
        "created_at": "2026-10-09T08:10:00Z"
    }
]

INITIAL_CLAIMS = [
    {
        "id": "claim_1",
        "item_id": "item_2",
        "item_title": "Brown Leather Bi-fold Wallet",
        "student_id": "std_103",
        "student_name": "Marcus Johnson",
        "student_email": "marcus.j@campus.edu",
        "proof_description": "Contains student card ending in 2432 and an emergency transit card in the left flap.",
        "contact_phone": "555-0103",
        "status": "pending",
        "created_at": "2026-10-08T14:00:00Z"
    }
]

class LocalDocSnapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        if self._data is None:
            return None
        return dict(self._data)

class LocalDocRef:
    def __init__(self, collection_ref, doc_id):
        self.collection_ref = collection_ref
        self.id = doc_id

    def get(self):
        data = self.collection_ref.db._get_doc(self.collection_ref.name, self.id)
        return LocalDocSnapshot(self.id, data)

    def set(self, data, merge=False):
        self.collection_ref.db._set_doc(self.collection_ref.name, self.id, data, merge=merge)

    def update(self, data):
        self.collection_ref.db._update_doc(self.collection_ref.name, self.id, data)

    def delete(self):
        self.collection_ref.db._delete_doc(self.collection_ref.name, self.id)

class LocalQuery:
    def __init__(self, collection_ref, filters=None):
        self.collection_ref = collection_ref
        self.filters = filters or []

    def where(self, field, op, val):
        new_filters = list(self.filters)
        new_filters.append((field, op, val))
        return LocalQuery(self.collection_ref, new_filters)

    def stream(self):
        all_docs = self.collection_ref.db._get_collection(self.collection_ref.name)
        results = []
        for doc_id, doc_data in all_docs.items():
            matches = True
            for field, op, val in self.filters:
                doc_val = doc_data.get(field)
                if op == "==" and doc_val != val:
                    matches = False
                    break
                elif op == "!=" and doc_val == val:
                    matches = False
                    break
                elif op == ">" and not (doc_val is not None and doc_val > val):
                    matches = False
                    break
                elif op == "<" and not (doc_val is not None and doc_val < val):
                    matches = False
                    break
                elif op == "in" and (doc_val not in val if isinstance(val, (list, tuple, set)) else False):
                    matches = False
                    break
            if matches:
                results.append(LocalDocSnapshot(doc_id, doc_data))
        return results

class LocalCollectionRef:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def document(self, doc_id=None):
        if not doc_id:
            doc_id = str(uuid.uuid4())
        return LocalDocRef(self, doc_id)

    def where(self, field, op, val):
        return LocalQuery(self, [(field, op, val)])

    def stream(self):
        return LocalQuery(self).stream()

    def add(self, data):
        doc_id = str(uuid.uuid4())
        doc_ref = self.document(doc_id)
        doc_ref.set(data)
        return None, doc_ref

class LocalFirestoreDB:
    def __init__(self, filepath=DATA_FILE):
        self.filepath = filepath
        self.data = {
            "students": {},
            "admins": {},
            "items": {},
            "item_claims": {}
        }
        self._load_or_seed()

    def _load_or_seed(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                return
            except Exception:
                pass

        for s in INITIAL_STUDENTS:
            self.data["students"][s["id"]] = dict(s)
        for a in INITIAL_ADMINS:
            self.data["admins"][a["id"]] = dict(a)
        for it in INITIAL_ITEMS:
            self.data["items"][it["id"]] = dict(it)
        for c in INITIAL_CLAIMS:
            self.data["item_claims"][c["id"]] = dict(c)

        self._save()

    def _save(self):
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2)
        except Exception:
            pass

    def _get_collection(self, coll_name):
        return self.data.get(coll_name, {})

    def _get_doc(self, coll_name, doc_id):
        return self.data.get(coll_name, {}).get(doc_id)

    def _set_doc(self, coll_name, doc_id, doc_data, merge=False):
        if coll_name not in self.data:
            self.data[coll_name] = {}
        if merge and doc_id in self.data[coll_name]:
            self.data[coll_name][doc_id].update(doc_data)
        else:
            self.data[coll_name][doc_id] = dict(doc_data)
        self._save()

    def _update_doc(self, coll_name, doc_id, doc_data):
        if coll_name in self.data and doc_id in self.data[coll_name]:
            self.data[coll_name][doc_id].update(doc_data)
            self._save()
        else:
            raise KeyError(f"Document {doc_id} not found")

    def _delete_doc(self, coll_name, doc_id):
        if coll_name in self.data and doc_id in self.data[coll_name]:
            del self.data[coll_name][doc_id]
            self._save()

    def collection(self, name):
        return LocalCollectionRef(self, name)

_db_instance = None

def get_db():
    global _db_instance
    if _db_instance is not None:
        return _db_instance

    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        default_key = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        if os.path.exists(default_key):
            cred_path = default_key
    elif not os.path.isabs(cred_path):
        candidate = os.path.join(os.path.dirname(__file__), cred_path)
        if os.path.exists(candidate):
            cred_path = candidate

    database_id = os.getenv("FIRESTORE_DATABASE_ID")

    config_paths = [
        os.path.join(os.path.dirname(__file__), "firebase-applet-config.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "firebase-applet-config.json"),
        os.path.abspath("firebase-applet-config.json")
    ]
    for cp in config_paths:
        if os.path.exists(cp):
            try:
                with open(cp, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    if not database_id and cfg.get("firestoreDatabaseId"):
                        database_id = cfg.get("firestoreDatabaseId")
            except Exception:
                pass

    if HAS_FIREBASE and cred_path and os.path.exists(cred_path):
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            if database_id:
                _db_instance = firestore.client(database=database_id)
            else:
                _db_instance = firestore.client()
            _seed_firestore_if_empty(_db_instance)
            return _db_instance
        except Exception:
            pass

    _db_instance = LocalFirestoreDB()
    return _db_instance

def _seed_firestore_if_empty(client):
    try:
        students = list(client.collection("students").limit(1).stream())
        if not students:
            for s in INITIAL_STUDENTS:
                client.collection("students").document(s["id"]).set(s)
            for a in INITIAL_ADMINS:
                client.collection("admins").document(a["id"]).set(a)
            for it in INITIAL_ITEMS:
                client.collection("items").document(it["id"]).set(it)
            for c in INITIAL_CLAIMS:
                client.collection("item_claims").document(c["id"]).set(c)
    except Exception:
        pass
