import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Firestore,
  Timestamp
} from "firebase/firestore";
import fs from "fs";
import path from "path";

let dbInstance: Firestore | null = null;
let firebaseConfig: any = null;
let isConnected = false;
let lastCheckTime = 0;
let lastError: string | null = null;

export function loadFirebaseConfig() {
  if (firebaseConfig) return firebaseConfig;
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return firebaseConfig;
    } catch (e: any) {
      console.error("[Firebase] Error reading config:", e.message);
    }
  }
  return null;
}

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance;
  const config = loadFirebaseConfig();
  if (!config) {
    throw new Error("firebase-applet-config.json not found or invalid");
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  dbInstance = getFirestore(app, config.firestoreDatabaseId);
  return dbInstance;
}

export async function testFirebaseConnection(): Promise<{
  success: boolean;
  message: string;
  projectId?: string;
  databaseId?: string;
  latency_ms?: number;
}> {
  const t0 = Date.now();
  try {
    const config = loadFirebaseConfig();
    if (!config) {
      return { success: false, message: "No firebase-applet-config.json found" };
    }
    const db = getFirebaseDb();
    // Test read on items collection
    const testDoc = await getDoc(doc(db, "items", "item_test_123"));
    isConnected = true;
    lastError = null;
    lastCheckTime = Date.now();
    return {
      success: true,
      message: "Connected to Firebase Firestore successfully",
      projectId: config.projectId,
      databaseId: config.firestoreDatabaseId,
      latency_ms: Date.now() - t0
    };
  } catch (err: any) {
    isConnected = false;
    lastError = err.message || String(err);
    lastCheckTime = Date.now();
    return {
      success: false,
      message: `Firebase Firestore unreachable: ${lastError}`,
      latency_ms: Date.now() - t0
    };
  }
}

export function isFirebaseLive(): boolean {
  return isConnected;
}

export function getFirebaseDiagnostics() {
  const config = loadFirebaseConfig();
  return {
    connected: isConnected,
    provider: "Firebase Firestore",
    projectId: config?.projectId || "unknown",
    databaseId: config?.firestoreDatabaseId || "(default)",
    lastChecked: lastCheckTime ? new Date(lastCheckTime).toISOString() : null,
    lastError: lastError
  };
}

export async function initFirebaseDatabase(): Promise<void> {
  console.log("[Firebase] Initializing Firebase Firestore database...");
  try {
    const test = await testFirebaseConnection();
    if (!test.success) {
      console.warn("[Firebase] Warning: Initial test connection had error:", test.message);
    } else {
      console.log(`[Firebase] ✅ Connected to Firestore (${test.projectId} / ${test.databaseId})`);
    }

    const db = getFirebaseDb();
    const localDbPath = path.resolve(process.cwd(), "database", "local_db.json");
    if (!fs.existsSync(localDbPath)) return;

    const localData = JSON.parse(fs.readFileSync(localDbPath, "utf-8"));

    // Check if categories are already in Firestore
    const catSnap = await getDocs(collection(db, "categories"));
    if (catSnap.empty) {
      console.log("[Firebase] Seeding initial data from local catalog into Firestore...");

      // Seed categories
      for (const [id, cat] of Object.entries(localData.category || {})) {
        await setDoc(doc(db, "categories", id), cat as any, { merge: true });
      }

      // Seed locations
      for (const [id, loc] of Object.entries(localData.location || {})) {
        await setDoc(doc(db, "locations", id), loc as any, { merge: true });
      }

      // Seed departments
      for (const [id, dept] of Object.entries(localData.department || {})) {
        await setDoc(doc(db, "departments", id), dept as any, { merge: true });
      }

      // Seed students
      for (const [id, std] of Object.entries(localData.student || {})) {
        await setDoc(doc(db, "students", id), std as any, { merge: true });
      }

      // Seed admins
      for (const [id, adm] of Object.entries(localData.admin || {})) {
        await setDoc(doc(db, "admins", id), adm as any, { merge: true });
      }

      // Seed items
      for (const [id, itm] of Object.entries(localData.item || {})) {
        await setDoc(doc(db, "items", id), itm as any, { merge: true });
      }

      // Seed claims
      for (const [id, clm] of Object.entries(localData.claim || {})) {
        await setDoc(doc(db, "claims", id), clm as any, { merge: true });
      }

      console.log("[Firebase] ✅ Initial data successfully seeded into Firestore!");
    } else {
      console.log(`[Firebase] Firestore already contains collections (${catSnap.size} categories found).`);
    }
  } catch (err: any) {
    console.error("[Firebase] Initialization error:", err.message);
  }
}

// ==================== FIRESTORE DATA ACCESS METHODS ====================

export async function getFirestoreItems(filter?: {
  type?: string;
  category?: string;
  status_filter?: string;
  search?: string;
}): Promise<any[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, "items"));
    let items: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      items.push({
        ...data,
        id: data.id || data.item_id || d.id
      });
    });

    if (filter) {
      if (filter.type && filter.type !== "all") {
        items = items.filter((i) => i.type === filter.type);
      }
      if (filter.category && filter.category !== "all") {
        items = items.filter((i) => (i.category || i.category_name) === filter.category);
      }
      if (filter.status_filter && filter.status_filter !== "all") {
        items = items.filter((i) => i.status === filter.status_filter);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        items = items.filter((i) =>
          (i.title || "").toLowerCase().includes(q) ||
          (i.description || "").toLowerCase().includes(q) ||
          (i.location || "").toLowerCase().includes(q)
        );
      }
    }

    // Sort by created_at or date descending
    items.sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());
    return items;
  } catch (e: any) {
    console.error("[Firebase] getFirestoreItems error:", e.message);
    throw e;
  }
}

export async function getFirestoreItemById(id: string): Promise<any | null> {
  try {
    const db = getFirebaseDb();
    const itemDoc = await getDoc(doc(db, "items", id));
    if (itemDoc.exists()) {
      const data = itemDoc.data();
      return { ...data, id: data.id || itemDoc.id };
    }
    return null;
  } catch (e: any) {
    console.error("[Firebase] getFirestoreItemById error:", e.message);
    throw e;
  }
}

export async function saveFirestoreItem(item: any): Promise<any> {
  try {
    const db = getFirebaseDb();
    const itemId = item.id || `item_${Date.now()}`;
    const cleanItem = {
      ...item,
      id: itemId,
      item_id: itemId,
      updated_at: new Date().toISOString()
    };
    await setDoc(doc(db, "items", itemId), cleanItem, { merge: true });

    // Also write to item_status_logs
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(doc(db, "item_status_logs", logId), {
      log_id: logId,
      item_id: itemId,
      old_status: null,
      new_status: cleanItem.status || "pending",
      changed_by: cleanItem.student_id || "student",
      changed_at: new Date().toISOString()
    });

    return cleanItem;
  } catch (e: any) {
    console.error("[Firebase] saveFirestoreItem error:", e.message);
    throw e;
  }
}

export async function updateFirestoreItemStatus(id: string, newStatus: string, adminId?: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    const itemRef = doc(db, "items", id);
    const existing = await getDoc(itemRef);
    const oldStatus = existing.exists() ? existing.data().status : "pending";

    await updateDoc(itemRef, {
      status: newStatus,
      reviewed_by: adminId || "adm_001",
      updated_at: new Date().toISOString()
    });

    // Write to item_status_logs
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(doc(db, "item_status_logs", logId), {
      log_id: logId,
      item_id: id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: adminId || "adm_001",
      changed_at: new Date().toISOString()
    });

    return true;
  } catch (e: any) {
    console.error("[Firebase] updateFirestoreItemStatus error:", e.message);
    throw e;
  }
}

export async function deleteFirestoreItem(id: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    await deleteDoc(doc(db, "items", id));
    return true;
  } catch (e: any) {
    console.error("[Firebase] deleteFirestoreItem error:", e.message);
    throw e;
  }
}

export async function getFirestoreClaims(studentId?: string): Promise<any[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, "claims"));
    let claims: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      claims.push({
        ...data,
        id: data.id || data.claim_id || d.id
      });
    });

    if (studentId) {
      claims = claims.filter((c) => c.student_id === studentId);
    }
    claims.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return claims;
  } catch (e: any) {
    console.error("[Firebase] getFirestoreClaims error:", e.message);
    throw e;
  }
}

export async function saveFirestoreClaim(claim: any): Promise<any> {
  try {
    const db = getFirebaseDb();
    const claimId = claim.id || `clm_${Date.now()}`;
    const cleanClaim = {
      ...claim,
      id: claimId,
      claim_id: claimId,
      created_at: claim.created_at || new Date().toISOString()
    };
    await setDoc(doc(db, "claims", claimId), cleanClaim, { merge: true });
    return cleanClaim;
  } catch (e: any) {
    console.error("[Firebase] saveFirestoreClaim error:", e.message);
    throw e;
  }
}

export async function updateFirestoreClaimStatus(id: string, newStatus: string, adminId?: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    const claimRef = doc(db, "claims", id);
    const claimSnap = await getDoc(claimRef);

    await updateDoc(claimRef, {
      status: newStatus,
      reviewed_by: adminId || "adm_001",
      updated_at: new Date().toISOString()
    });

    if (claimSnap.exists() && newStatus === "approved") {
      const claimData = claimSnap.data();
      if (claimData.item_id) {
        await updateDoc(doc(db, "items", claimData.item_id), {
          status: "resolved",
          reviewed_by: adminId || "adm_001",
          updated_at: new Date().toISOString()
        });
      }
    }
    return true;
  } catch (e: any) {
    console.error("[Firebase] updateFirestoreClaimStatus error:", e.message);
    throw e;
  }
}

export async function getFirestoreStudents(): Promise<any[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, "students"));
    const students: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      students.push({
        id: data.id || data.student_id || d.id,
        student_id: data.student_id || data.roll_no || d.id,
        name: data.name,
        email: data.email,
        department: data.department || "General",
        phone: data.phone || "N/A"
      });
    });
    return students;
  } catch (e: any) {
    console.error("[Firebase] getFirestoreStudents error:", e.message);
    throw e;
  }
}

export async function findFirestoreUser(email: string, role: string): Promise<any | null> {
  try {
    const db = getFirebaseDb();
    const collName = role === "admin" ? "admins" : "students";
    const snap = await getDocs(collection(db, collName));
    let found: any = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
        found = { ...data, id: data.id || d.id };
      }
    });
    return found;
  } catch (e: any) {
    console.error("[Firebase] findFirestoreUser error:", e.message);
    return null;
  }
}

export async function getFirestoreLookups(): Promise<{
  departments: any[];
  categories: any[];
  locations: any[];
}> {
  try {
    const db = getFirebaseDb();
    const [deptSnap, catSnap, locSnap] = await Promise.all([
      getDocs(collection(db, "departments")),
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "locations"))
    ]);

    const departments: any[] = [];
    deptSnap.forEach((d) => departments.push(d.data()));

    const categories: any[] = [];
    catSnap.forEach((d) => categories.push(d.data()));

    const locations: any[] = [];
    locSnap.forEach((d) => locations.push(d.data()));

    return { departments, categories, locations };
  } catch (e: any) {
    console.error("[Firebase] getFirestoreLookups error:", e.message);
    return { departments: [], categories: [], locations: [] };
  }
}

export async function getFirestoreStats(): Promise<any> {
  try {
    const items = await getFirestoreItems({ status_filter: "all" });
    const claims = await getFirestoreClaims();
    const students = await getFirestoreStudents();

    const pending = items.filter((i) => i.status === "pending").length;
    const approved = items.filter((i) => i.status === "approved").length;
    const resolved = items.filter((i) => i.status === "resolved").length;

    return {
      total_items: items.length,
      pending_reports: pending,
      approved_reports: approved,
      resolved_reports: resolved,
      total_claims: claims.length,
      pending_claims: claims.filter((c) => c.status === "pending").length,
      approved_claims: claims.filter((c) => c.status === "approved").length,
      total_students: students.length
    };
  } catch (e: any) {
    console.error("[Firebase] getFirestoreStats error:", e.message);
    throw e;
  }
}

export async function getFirestoreItemLogs(itemId: string): Promise<any[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, "item_status_logs"));
    const logs: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.item_id === itemId) {
        logs.push(data);
      }
    });
    logs.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
    return logs;
  } catch (e: any) {
    console.error("[Firebase] getFirestoreItemLogs error:", e.message);
    return [];
  }
}
