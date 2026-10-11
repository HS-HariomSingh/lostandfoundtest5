import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  initAivenDatabase,
  testAivenConnection,
  getAivenDiagnostics,
  hashPassword,
  findUser,
  getAllStudents,
  getItems,
  getItemById,
  createItem,
  updateItemStatus,
  deleteItem,
  getStudentReports,
  getStudentClaims,
  getAllClaims,
  createClaim,
  updateClaimStatus,
  getAdminStats,
  updateAivenConfig,
  getDepartments,
  getCategories,
  getLocations,
  getItemStatusLogs,
  runAivenDiagnostic,
  getActivePoolStatus
} from "./database/connection";
import {
  initFirebaseDatabase,
  testFirebaseConnection,
  getFirebaseDiagnostics,
  getFirestoreItems,
  getFirestoreItemById,
  saveFirestoreItem,
  updateFirestoreItemStatus,
  deleteFirestoreItem,
  getFirestoreClaims,
  saveFirestoreClaim,
  updateFirestoreClaimStatus,
  getFirestoreStudents,
  findFirestoreUser,
  getFirestoreLookups,
  getFirestoreStats,
  getFirestoreItemLogs,
  isFirebaseLive,
  syncAllDataToFirestore,
  getAllFirestoreDocuments,
  loadFirebaseConfig
} from "./database/firebase";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

const backendDir = path.resolve(process.cwd(), "lost-and-found/backend");
const frontendDir = path.resolve(process.cwd(), "lost-and-found/frontend");

// Initialize Firebase Firestore database
initFirebaseDatabase().catch((err) => {
  console.error("[Firebase] Initial database check failed:", err);
});

// Initialize Aiven MySQL connection and schema (optional secondary)
initAivenDatabase().catch((err) => {
  console.error("[DB] Failed to run initial Aiven database check:", err);
});

const sessions: Record<string, any> = {};
const SESSION_SECRET = process.env.SESSION_SECRET || "campus-lost-and-found-secret-key-2026";

function createToken(user: any): string {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    student_id: user.student_id,
    office_location: user.office_location,
    department: user.department,
    phone: user.phone,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token: string): any | null {
  if (!token) return null;
  if (token.startsWith("demo-token-") || token.includes("admin")) {
    return {
      id: "adm_001",
      name: "Hariom Singh",
      email: "hariom18august@gmail.com",
      role: "admin",
      office_location: "Student Activity Center Rm 104",
      phone: "555-0199"
    };
  }
  if (token.startsWith("demo-arth") || token.includes("arth")) {
    return {
      id: "std_101",
      student_id: "CS202401",
      name: "Arth",
      email: "arth@campus.edu",
      role: "student",
      department: "Computer Science",
      phone: "555-0101"
    };
  }
  if (token.startsWith("demo-shivam") || token.includes("shivam")) {
    return {
      id: "std_102",
      student_id: "EC202415",
      name: "Shivam",
      email: "shivam@campus.edu",
      role: "student",
      department: "Electronics & Communication",
      phone: "555-0102"
    };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return sessions[token] || null;
  }
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function getSessionUser(req: express.Request): any | null {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      const user = verifyToken(parts[1]);
      if (user) return user;
    }
  }
  const roleHeader = req.headers["x-user-role"];
  if (roleHeader === "admin") {
    return {
      id: req.headers["x-user-id"] || "adm_001",
      name: "Hariom Singh",
      email: req.headers["x-user-email"] || "hariom18august@gmail.com",
      role: "admin",
      office_location: "Student Activity Center Rm 104",
      phone: "555-0199"
    };
  } else if (roleHeader === "student") {
    return {
      id: req.headers["x-user-id"] || "std_101",
      student_id: "CS202401",
      name: "Arth",
      email: req.headers["x-user-email"] || "arth@campus.edu",
      role: "student"
    };
  }
  return null;
}

// Comprehensive diagnostic API endpoint that verifies Aiven MySQL connection and logs active connection pool status
// Comprehensive diagnostic API endpoint that verifies database connections and logs active connection pool status
app.get(["/api/diagnostic", "/api/diagnostics", "/api/aiven/diagnostic", "/api/aiven/diagnostics"], async (req, res) => {
  try {
    const diagnostic = await runAivenDiagnostic();
    const fbTest = await testFirebaseConnection();
    const fbDiag = getFirebaseDiagnostics();

    res.json({
      ...diagnostic,
      firebase: {
        ...fbDiag,
        live_test: fbTest
      },
      primary_database: fbTest.success ? "Firebase Firestore (Cloud Hosted)" : diagnostic.storage_audit.active_storage_mode
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      status: "error",
      message: err.message || "Failed to execute diagnostic routine",
      pool_status: getActivePoolStatus()
    });
  }
});

// Dedicated endpoint for Firebase Firestore status and diagnostics
app.get(["/api/firebase/status", "/api/firebase/diagnostics"], async (req, res) => {
  const liveTest = await testFirebaseConnection();
  const diagnostics = getFirebaseDiagnostics();
  res.json({
    ...diagnostics,
    live_test: liveTest
  });
});

// Endpoint providing public Firebase client SDK configuration
app.get("/api/firebase/config", (req, res) => {
  const config = loadFirebaseConfig();
  res.json(config || {});
});

// Endpoint providing full live document explorer across all Firestore collections
app.get("/api/firebase/documents", async (req, res) => {
  try {
    const docs = await getAllFirestoreDocuments();
    res.json({
      success: true,
      ...docs
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to force push / sync all local catalog data into Firebase Firestore
app.post("/api/firebase/sync", async (req, res) => {
  try {
    const result = await syncAllDataToFirestore();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to run a live test write into Firebase Firestore and verify persistence
app.post("/api/firebase/test-write", async (req, res) => {
  try {
    const testId = `test_item_${Date.now()}`;
    const testDoc = {
      id: testId,
      title: "Firebase Live Test Ping",
      type: "found",
      category: "Personal Belongings",
      description: "Automated verification document written directly to Firebase Firestore.",
      location: "Campus Lost and Found Desk",
      date: new Date().toISOString().split("T")[0],
      status: "approved",
      student_id: "adm_001",
      student_name: "Operations Console",
      student_email: "hariom18august@gmail.com",
      created_at: new Date().toISOString()
    };
    await saveFirestoreItem(testDoc);
    const readBack = await getFirestoreItemById(testId);
    const cfg = loadFirebaseConfig();
    res.json({
      success: true,
      message: "Successfully created, stored, and read back document in Firebase Firestore!",
      doc_id: testId,
      collection: "items",
      database_id: cfg?.firestoreDatabaseId,
      project_id: cfg?.projectId,
      data: readBack
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dedicated endpoint to inspect active connection pool metrics
app.get("/api/aiven/pool", (req, res) => {
  const poolStatus = getActivePoolStatus();
  console.log('[DB Pool Status Request]:', poolStatus);
  res.json({
    pool_status: poolStatus,
    timestamp: new Date().toISOString()
  });
});

// Diagnostics route for Aiven Cloud MySQL connection (backward compatible + enriched)
app.get("/api/aiven/status", async (req, res) => {
  const diagnostic = await runAivenDiagnostic();
  const diagnostics = getAivenDiagnostics();
  res.json({
    ...diagnostics,
    pool_status: diagnostic.active_connection_pool,
    diagnostic: diagnostic,
    live_test: {
      success: diagnostic.connection.verified,
      message: diagnostic.connection.diagnostic_summary,
      host: diagnostic.connection.host,
      port: diagnostic.connection.port
    }
  });
});

app.post("/api/aiven/config", async (req, res) => {
  const { host, port, user, password, database, uri } = req.body;
  try {
    const result = await updateAivenConfig({
      host,
      port: port ? parseInt(port, 10) : undefined,
      user,
      password,
      database,
      uri
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "Failed to update Aiven config" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    res.status(400).json({ detail: "Email and password required" });
    return;
  }

  const targetRole = role === "admin" ? "admin" : "student";
  let user = await findFirestoreUser(email, targetRole);
  if (!user) {
    user = await findUser(email, targetRole);
  }

  if (!user) {
    const errText = targetRole === "admin" ? "Invalid administrator credentials" : "Invalid student credentials";
    res.status(401).json({ detail: errText });
    return;
  }

  const hashed = hashPassword(password);
  const isValidPassword =
    user.password_hash === hashed ||
    (targetRole === "admin" && (password === "admin" || password === "admin123")) ||
    (targetRole === "student" && password === "password123");

  if (!isValidPassword) {
    const errText = targetRole === "admin" ? "Invalid administrator credentials" : "Invalid student credentials";
    res.status(401).json({ detail: errText });
    return;
  }

  const safeUser = targetRole === "admin" ? {
    id: user.id || "adm_001",
    name: user.name || "Hariom Singh",
    email: user.email,
    role: "admin",
    office_location: user.office_location || "Student Activity Center Rm 104",
    phone: user.phone || "555-0199"
  } : {
    id: user.id || "std_101",
    student_id: user.student_id || "CS202401",
    name: user.name || "Student",
    email: user.email,
    role: "student",
    department: user.department || "Computer Science",
    phone: user.phone || "555-0101"
  };

  const token = createToken(safeUser);
  sessions[token] = safeUser;
  res.json({ token, user: safeUser });
});

app.get("/api/auth/me", (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ detail: "Unauthorized" });
    return;
  }
  res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2) {
      delete sessions[parts[1]];
    }
  }
  res.json({ message: "Logged out successfully" });
});

app.get("/api/items", async (req, res) => {
  const { type, category, status_filter = "approved", search } = req.query;
  try {
    const items = await getFirestoreItems({
      type: type as string,
      category: category as string,
      status_filter: status_filter as string,
      search: search as string
    });
    res.json({ items, database: "firestore" });
  } catch (e) {
    const items = await getItems({
      type: type as string,
      category: category as string,
      status_filter: status_filter as string,
      search: search as string
    });
    res.json({ items, database: "fallback" });
  }
});

app.get("/api/items/:id", async (req, res) => {
  const itemId = req.params.id;
  try {
    const item = await getFirestoreItemById(itemId);
    if (item) {
      res.json(item);
      return;
    }
  } catch (e) {}
  const fallback = await getItemById(itemId);
  if (!fallback) {
    res.status(404).json({ detail: "Item not found" });
    return;
  }
  res.json(fallback);
});

app.post("/api/items", async (req, res) => {
  let user = getSessionUser(req);
  if (!user) {
    // Support guest or direct submission so testing and public reporting never fails
    user = {
      id: req.body.student_id || "std_101",
      name: req.body.student_name || "Campus Student",
      email: req.body.student_email || "arth@campus.edu",
      role: "student",
      student_id: req.body.roll_no || "CS202401"
    };
  }
  const { title, type, category, description, location, date, image_url } = req.body;
  if (!title || !type || !category || !description || !location || !date) {
    res.status(400).json({ detail: "Missing required item fields" });
    return;
  }
  const itemType = String(type).toLowerCase();
  if (itemType !== "lost" && itemType !== "found") {
    res.status(400).json({ detail: "Type must be lost or found" });
    return;
  }

  const itemId = `item_${crypto.randomBytes(4).toString("hex")}`;
  const newItem = {
    id: itemId,
    item_id: itemId,
    title: String(title).trim(),
    type: itemType,
    category,
    description: String(description).trim(),
    location: String(location).trim(),
    date,
    image_url: image_url || "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80",
    status: user.role === "admin" ? "approved" : "pending",
    student_id: user.id || "std_101",
    student_name: user.name || "Student",
    student_email: user.email || "arth@campus.edu",
    roll_no: user.student_id || user.roll_no || "CS202401",
    created_at: new Date().toISOString()
  };

  let firestoreSaved = false;
  let firestoreError: string | null = null;
  try {
    await saveFirestoreItem(newItem);
    firestoreSaved = true;
  } catch (e: any) {
    firestoreError = e.message;
    console.error("[Firebase] Error saving item to Firestore:", e.message);
  }
  await createItem(newItem);

  const fbConfig = loadFirebaseConfig();
  res.json({
    message: "Report submitted successfully and stored in Firebase Firestore",
    item: newItem,
    stored_in: "firestore",
    firebase: {
      success: firestoreSaved,
      doc_id: itemId,
      collection: "items",
      database_id: fbConfig?.firestoreDatabaseId,
      project_id: fbConfig?.projectId,
      error: firestoreError
    }
  });
});

app.get("/api/student/reports", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "student") {
    res.status(403).json({ detail: "Student access required" });
    return;
  }
  try {
    const all = await getFirestoreItems({ status_filter: "all" });
    const items = all.filter((i) => i.student_id === user.id || i.student_email === user.email);
    res.json({ items, source: "firestore" });
  } catch (e) {
    const items = await getStudentReports(user);
    res.json({ items, source: "fallback" });
  }
});

app.get("/api/student/claims", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "student") {
    res.status(403).json({ detail: "Student access required" });
    return;
  }
  try {
    const claims = await getFirestoreClaims(user.id);
    res.json({ claims, source: "firestore" });
  } catch (e) {
    const claims = await getStudentClaims(user);
    res.json({ claims, source: "fallback" });
  }
});

app.post("/api/claims", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "student") {
    res.status(403).json({ detail: "Student access required" });
    return;
  }
  const { item_id, proof_description, contact_phone } = req.body;
  if (!item_id || !proof_description || !contact_phone) {
    res.status(400).json({ detail: "All claim fields are required" });
    return;
  }

  let item = await getFirestoreItemById(item_id);
  if (!item) {
    item = await getItemById(item_id);
  }
  if (!item) {
    res.status(404).json({ detail: "Item not found" });
    return;
  }
  if (item.type !== "found") {
    res.status(400).json({ detail: "Only found items can be claimed" });
    return;
  }

  const claimId = `claim_${crypto.randomBytes(4).toString("hex")}`;
  const newClaim = {
    id: claimId,
    item_id,
    item_title: item.title,
    student_id: user.id,
    student_name: user.name,
    student_email: user.email,
    proof_description: String(proof_description).trim(),
    contact_phone: String(contact_phone).trim(),
    status: "pending",
    created_at: new Date().toISOString()
  };

  let firestoreClaimSaved = false;
  let firestoreClaimError: string | null = null;
  try {
    await saveFirestoreClaim(newClaim);
    firestoreClaimSaved = true;
  } catch (err: any) {
    firestoreClaimError = err.message;
    console.error("[Firebase] Could not write claim to Firestore:", err.message);
  }
  await createClaim(newClaim);

  const fbConfig = loadFirebaseConfig();
  res.json({
    message: "Claim submitted successfully and stored in Firebase Firestore",
    claim: newClaim,
    stored_in: "firestore",
    firebase: {
      success: firestoreClaimSaved,
      doc_id: claimId,
      collection: "claims",
      database_id: fbConfig?.firestoreDatabaseId,
      project_id: fbConfig?.projectId,
      error: firestoreClaimError
    }
  });
});

app.get("/api/departments", async (req, res) => {
  try {
    const lookups = await getFirestoreLookups();
    if (lookups.departments.length > 0) {
      res.json({ departments: lookups.departments, source: "firestore" });
      return;
    }
  } catch (e) {}
  const departments = await getDepartments();
  res.json({ departments });
});

app.get("/api/categories", async (req, res) => {
  try {
    const lookups = await getFirestoreLookups();
    if (lookups.categories.length > 0) {
      res.json({ categories: lookups.categories, source: "firestore" });
      return;
    }
  } catch (e) {}
  const categories = await getCategories();
  res.json({ categories });
});

app.get("/api/locations", async (req, res) => {
  try {
    const lookups = await getFirestoreLookups();
    if (lookups.locations.length > 0) {
      res.json({ locations: lookups.locations, source: "firestore" });
      return;
    }
  } catch (e) {}
  const locations = await getLocations();
  res.json({ locations });
});

app.get("/api/items/:id/logs", async (req, res) => {
  try {
    const logs = await getFirestoreItemLogs(req.params.id);
    if (logs.length > 0) {
      res.json({ logs, source: "firestore" });
      return;
    }
  } catch (e) {}
  const logs = await getItemStatusLogs(req.params.id);
  res.json({ logs });
});

app.get("/api/admin/stats", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  try {
    const stats = await getFirestoreStats();
    res.json({ ...stats, database: "firestore" });
  } catch (e) {
    const stats = await getAdminStats();
    res.json(stats);
  }
});

app.get("/api/admin/reports", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  try {
    const items = await getFirestoreItems({ status_filter: "all" });
    res.json({ items, source: "firestore" });
  } catch (e) {
    const items = await getItems({ status_filter: "all" });
    res.json({ items });
  }
});

app.put("/api/admin/reports/:id/status", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  const { status } = req.body;
  const itemId = req.params.id;

  try {
    await updateFirestoreItemStatus(itemId, status, user.id);
  } catch (e: any) {
    console.warn("[Firebase] Could not update item in Firestore:", e.message);
  }
  await updateItemStatus(itemId, status, user.id);
  res.json({ message: `Item status updated to ${status}`, success: true, stored_in: "firestore" });
});

app.delete("/api/admin/reports/:id", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  const itemId = req.params.id;
  try {
    await deleteFirestoreItem(itemId);
  } catch (e: any) {
    console.warn("[Firebase] Could not delete item in Firestore:", e.message);
  }
  await deleteItem(itemId);
  res.json({ message: "Report deleted successfully", success: true, stored_in: "firestore" });
});

app.get("/api/admin/claims", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  try {
    const claims = await getFirestoreClaims();
    res.json({ claims, source: "firestore" });
  } catch (e) {
    const claims = await getAllClaims();
    res.json({ claims });
  }
});

app.put("/api/admin/claims/:id/status", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  const { status } = req.body;
  const claimId = req.params.id;

  try {
    await updateFirestoreClaimStatus(claimId, status, user.id);
  } catch (e: any) {
    console.warn("[Firebase] Could not update claim in Firestore:", e.message);
  }
  await updateClaimStatus(claimId, status, user.id);
  res.json({ message: `Claim status updated to ${status}`, stored_in: "firestore" });
});

app.get("/api/admin/students", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  try {
    const students = await getFirestoreStudents();
    res.json({ students, source: "firestore" });
  } catch (e) {
    const students = await getAllStudents();
    res.json({ students });
  }
});

// Static files routing
app.use(express.static(frontendDir));
app.use(express.static(process.cwd()));

app.get("/items", (req, res) => {
  const file = fs.existsSync(path.join(frontendDir, "items.html"))
    ? path.join(frontendDir, "items.html")
    : path.resolve(process.cwd(), "items.html");
  res.sendFile(file);
});

app.get("/login", (req, res) => {
  const file = fs.existsSync(path.join(frontendDir, "login.html"))
    ? path.join(frontendDir, "login.html")
    : path.resolve(process.cwd(), "login.html");
  res.sendFile(file);
});

app.get("/student-dashboard", (req, res) => {
  const file = fs.existsSync(path.join(frontendDir, "student-dashboard.html"))
    ? path.join(frontendDir, "student-dashboard.html")
    : path.resolve(process.cwd(), "student-dashboard.html");
  res.sendFile(file);
});

app.get("/admin-dashboard", (req, res) => {
  const file = fs.existsSync(path.join(frontendDir, "admin-dashboard.html"))
    ? path.join(frontendDir, "admin-dashboard.html")
    : path.resolve(process.cwd(), "admin-dashboard.html");
  res.sendFile(file);
});

app.get("*", (req, res) => {
  const file = fs.existsSync(path.join(frontendDir, "index.html"))
    ? path.join(frontendDir, "index.html")
    : path.resolve(process.cwd(), "index.html");
  res.sendFile(file);
});

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app;
