import os
import json
import uuid
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    import pymysql
    import pymysql.cursors
    HAS_PYMYSQL = True
except ImportError:
    HAS_PYMYSQL = False

LOCAL_DATA_FILE = os.path.join(os.path.dirname(__file__), "local_db.json")

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def map_table(col: str) -> str:
    m = {
        "students": "student",
        "items": "item",
        "admins": "admin",
        "item_claims": "claim",
        "claims": "claim",
        "status_logs": "item_status_log"
    }
    return m.get(col.lower(), col.lower())

def map_pk(table: str) -> str:
    m = {
        "student": "student_id",
        "admin": "admin_id",
        "item": "item_id",
        "claim": "claim_id",
        "department": "department_id",
        "category": "category_id",
        "location": "location_id",
        "item_status_log": "log_id"
    }
    return m.get(table, "id")

class DocumentSnapshot:
    def __init__(self, doc_id: str, data: Optional[Dict[str, Any]] = None, exists: bool = True):
        self.id = doc_id
        self._data = data or {}
        self.exists = exists

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._data)

class DocumentReference:
    def __init__(self, collection_name: str, doc_id: str, client: "AivenMySQLClient"):
        self.collection_name = collection_name
        self.id = doc_id
        self.client = client

    def get(self) -> DocumentSnapshot:
        return self.client.get_document(self.collection_name, self.id)

    def set(self, data: Dict[str, Any], merge: bool = False):
        self.client.set_document(self.collection_name, self.id, data, merge)

    def update(self, data: Dict[str, Any]):
        self.client.update_document(self.collection_name, self.id, data)

    def delete(self):
        self.client.delete_document(self.collection_name, self.id)

class QueryProxy:
    def __init__(self, collection_name: str, client: "AivenMySQLClient"):
        self.collection_name = collection_name
        self.client = client
        self.filters: List[tuple] = []
        self._limit: Optional[int] = None

    def where(self, field: str, op: str, value: Any) -> "QueryProxy":
        self.filters.append((field, op, value))
        return self

    def limit(self, count: int) -> "QueryProxy":
        self._limit = count
        return self

    def stream(self) -> List[DocumentSnapshot]:
        return self.client.query_documents(self.collection_name, self.filters, self._limit)

    def get(self) -> List[DocumentSnapshot]:
        return self.stream()

class CollectionReference(QueryProxy):
    def document(self, doc_id: Optional[str] = None) -> DocumentReference:
        if not doc_id:
            table = map_table(self.collection_name)
            doc_id = f"{table}_{uuid.uuid4().hex[:8]}"
        return DocumentReference(self.collection_name, doc_id, self.client)

    def add(self, data: Dict[str, Any]) -> tuple:
        table = map_table(self.collection_name)
        pk = map_pk(table)
        doc_id = data.get(pk) or data.get("id") or f"{table}_{uuid.uuid4().hex[:8]}"
        ref = self.document(doc_id)
        ref.set(data)
        return ref, None

class AivenMySQLClient:
    def __init__(self):
        self.host = os.getenv("AIVEN_MYSQL_HOST", "mysql-3b22f65e-hariom18august-b043.h.aivencloud.com")
        self.port = int(os.getenv("AIVEN_MYSQL_PORT", "14526"))
        self.user = os.getenv("AIVEN_MYSQL_USER", "avnadmin")
        self.password = os.getenv("AIVEN_MYSQL_PASSWORD", "")
        self.database = os.getenv("AIVEN_MYSQL_DATABASE", "defaultdb")

    def collection(self, name: str) -> CollectionReference:
        return CollectionReference(name, self)

    def _get_connection(self):
        if not HAS_PYMYSQL or not self.password:
            return None
        try:
            return pymysql.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                database=self.database,
                cursorclass=pymysql.cursors.DictCursor,
                ssl={"ssl": True},
                connect_timeout=3
            )
        except Exception:
            return None

    def _load_local_data(self) -> Dict[str, Any]:
        try:
            with open(LOCAL_DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_local_data(self, data: Dict[str, Any]):
        try:
            with open(LOCAL_DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def get_document(self, col: str, doc_id: str) -> DocumentSnapshot:
        table = map_table(col)
        pk = map_pk(table)
        conn = self._get_connection()
        if conn:
            try:
                with conn.cursor() as cursor:
                    cursor.execute(f"SELECT * FROM `{table}` WHERE `{pk}` = %s LIMIT 1", (doc_id,))
                    row = cursor.fetchone()
                    if row:
                        row["id"] = row.get(pk)
                        return DocumentSnapshot(doc_id, row, True)
            except Exception:
                pass
            finally:
                conn.close()

        data = self._load_local_data()
        items = data.get(table, data.get(col, {}))
        if doc_id in items:
            it = dict(items[doc_id])
            it["id"] = it.get(pk, doc_id)
            return DocumentSnapshot(doc_id, it, True)
        for k, v in items.items():
            if k == doc_id or v.get(pk) == doc_id or str(v.get("id", "")).lower() == doc_id.lower():
                it = dict(v)
                it["id"] = it.get(pk, k)
                return DocumentSnapshot(k, it, True)
        return DocumentSnapshot(doc_id, None, False)

    def set_document(self, col: str, doc_id: str, doc_data: Dict[str, Any], merge: bool = False):
        table = map_table(col)
        pk = map_pk(table)
        doc_data[pk] = doc_id
        doc_data["id"] = doc_id

        conn = self._get_connection()
        if conn:
            try:
                with conn.cursor() as cursor:
                    cols = [c for c in doc_data.keys() if c != "id" or pk == "id"]
                    placeholders = ", ".join(["%s"] * len(cols))
                    cols_str = ", ".join([f"`{c}`" for c in cols])
                    updates = ", ".join([f"`{c}`=VALUES(`{c}`)" for c in cols if c != pk])
                    sql = f"INSERT INTO `{table}` ({cols_str}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {updates}"
                    cursor.execute(sql, tuple([doc_data[c] for c in cols]))
                conn.commit()
            except Exception:
                pass
            finally:
                conn.close()

        data = self._load_local_data()
        col_dict = data.setdefault(table, {})
        if merge and doc_id in col_dict:
            col_dict[doc_id].update(doc_data)
        else:
            col_dict[doc_id] = doc_data
        self._save_local_data(data)

    def update_document(self, col: str, doc_id: str, updates: Dict[str, Any]):
        table = map_table(col)
        pk = map_pk(table)
        conn = self._get_connection()
        if conn:
            try:
                with conn.cursor() as cursor:
                    set_parts = [f"`{k}` = %s" for k in updates.keys()]
                    sql = f"UPDATE `{table}` SET {', '.join(set_parts)} WHERE `{pk}` = %s"
                    cursor.execute(sql, tuple(updates.values()) + (doc_id,))
                conn.commit()
            except Exception:
                pass
            finally:
                conn.close()

        data = self._load_local_data()
        col_dict = data.setdefault(table, {})
        target_k = None
        if doc_id in col_dict:
            target_k = doc_id
        else:
            for k, v in col_dict.items():
                if k == doc_id or v.get(pk) == doc_id or str(v.get("id", "")).lower() == doc_id.lower():
                    target_k = k
                    break
        if target_k:
            col_dict[target_k].update(updates)
            self._save_local_data(data)

    def delete_document(self, col: str, doc_id: str):
        table = map_table(col)
        pk = map_pk(table)
        conn = self._get_connection()
        if conn:
            try:
                with conn.cursor() as cursor:
                    cursor.execute(f"DELETE FROM `{table}` WHERE `{pk}` = %s", (doc_id,))
                conn.commit()
            except Exception:
                pass
            finally:
                conn.close()

        data = self._load_local_data()
        col_dict = data.setdefault(table, {})
        target_k = None
        if doc_id in col_dict:
            target_k = doc_id
        else:
            for k, v in col_dict.items():
                if k == doc_id or v.get(pk) == doc_id or str(v.get("id", "")).lower() == doc_id.lower():
                    target_k = k
                    break
        if target_k:
            del col_dict[target_k]
            self._save_local_data(data)

    def query_documents(self, col: str, filters: List[tuple], limit: Optional[int] = None) -> List[DocumentSnapshot]:
        table = map_table(col)
        pk = map_pk(table)
        conn = self._get_connection()
        if conn:
            try:
                with conn.cursor() as cursor:
                    sql = f"SELECT * FROM `{table}` WHERE 1=1"
                    params = []
                    for f_field, f_op, f_val in filters:
                        field_mapped = f_field
                        if f_field == "id":
                            field_mapped = pk
                        sql_op = "=" if f_op == "==" else f_op
                        sql += f" AND `{field_mapped}` {sql_op} %s"
                        params.append(f_val)
                    if limit:
                        sql += f" LIMIT {int(limit)}"
                    cursor.execute(sql, tuple(params))
                    rows = cursor.fetchall()
                    res = []
                    for r in rows:
                        r["id"] = r.get(pk)
                        res.append(DocumentSnapshot(r.get(pk, ""), r, True))
                    return res
            except Exception:
                pass
            finally:
                conn.close()

        data = self._load_local_data()
        items = list(data.get(table, data.get(col, {})).values())
        results = []
        for it in items:
            match = True
            for f_field, f_op, f_val in filters:
                v = it.get(f_field)
                if f_field == "id":
                    v = it.get(pk, v)
                if f_op == "==":
                    if str(v).lower() != str(f_val).lower():
                        match = False
                        break
            if match:
                row_copy = dict(it)
                row_copy["id"] = row_copy.get(pk, row_copy.get("id", ""))
                results.append(DocumentSnapshot(row_copy["id"], row_copy, True))
                if limit and len(results) >= limit:
                    break
        return results

db_instance = AivenMySQLClient()

def get_db():
    return db_instance
