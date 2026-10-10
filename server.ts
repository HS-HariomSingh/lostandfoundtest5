import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

const backendDir = path.resolve(process.cwd(), "lost-and-found/backend");
const frontendDir = path.resolve(process.cwd(), "lost-and-found/frontend");
const keyPath = path.join(backendDir, "serviceAccountKey.json");
const dataFilePath = path.join(backendDir, "firestore_local.json");

let firestore: Firestore | null = null;

if (fs.existsSync(keyPath)) {
  try {
    const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    if (!getApps().length) {
      initializeApp({
        credential: cert(keyData)
      });
    }
    firestore = getFirestore();
  } catch (e) {}
}

const sessions: Record<string, any> = {};

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function getLocalDb() {
  if (fs.existsSync(dataFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(dataFilePath, "utf-8"));
    } catch (e) {}
  }
  return { students: {}, admins: {}, items: {}, item_claims: {} };
}

function saveLocalDb(data: any) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {}
}

async function seedFirestoreIfEmpty() {
  if (!firestore) return;
  try {
    const snap = await firestore.collection("students").limit(1).get();
    const local = getLocalDb();
    if (snap.empty) {
      const batch = firestore.batch();
      for (const [id, data] of Object.entries(local.students || {})) {
        batch.set(firestore.collection("students").doc(id), data);
      }
      for (const [id, data] of Object.entries(local.admins || {})) {
        batch.set(firestore.collection("admins").doc(id), data);
      }
      for (const [id, data] of Object.entries(local.items || {})) {
        batch.set(firestore.collection("items").doc(id), data);
      }
      for (const [id, data] of Object.entries(local.item_claims || {})) {
        batch.set(firestore.collection("item_claims").doc(id), data);
      }
      await batch.commit();
    } else {
      if (local.admins?.adm_001) {
        await firestore.collection("admins").doc("adm_001").set(local.admins.adm_001, { merge: true });
      }
      if (local.students?.std_101) {
        await firestore.collection("students").doc("std_101").set(local.students.std_101, { merge: true });
      }
      if (local.students?.std_102) {
        await firestore.collection("students").doc("std_102").set(local.students.std_102, { merge: true });
      }
    }
  } catch (e) {}
}

seedFirestoreIfEmpty().catch(() => {});

function getSessionUser(req: express.Request): any | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return sessions[parts[1]] || null;
}

if (process.env.BACKEND_URL) {
  const backendBase = process.env.BACKEND_URL.replace(/\/$/, "");
  app.use("/api", async (req, res, next) => {
    try {
      const targetUrl = `${backendBase}/api${req.url}`;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string" && k.toLowerCase() !== "host") {
          headers[k] = v;
        }
      }
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body)
      });
      res.status(response.status);
      const data = await response.text();
      res.send(data);
    } catch (err) {
      next();
    }
  });
}

app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    res.status(400).json({ detail: "Email and password required" });
    return;
  }
  const emailClean = String(email).trim().toLowerCase();
  const hashed = hashPassword(password);
  const targetRole = role === "admin" ? "admin" : "student";
  const collectionName = targetRole === "admin" ? "admins" : "students";

  let user: any = null;

  if (firestore) {
    try {
      const snap = await firestore.collection(collectionName).where("email", "==", emailClean).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d: any = doc.data();
          if (d.password_hash === hashed) {
            user = d;
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (!user) {
    const local = getLocalDb();
    const list = Object.values(local[collectionName] || {}) as any[];
    user = list.find((u: any) => u.email && u.email.toLowerCase() === emailClean && u.password_hash === hashed);
  }

  if (!user) {
    const errText = targetRole === "admin" ? "Invalid administrator credentials" : "Invalid student credentials";
    res.status(401).json({ detail: errText });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const safeUser = targetRole === "admin" ? {
    id: user.id,
    name: user.name,
    email: user.email,
    role: "admin",
    office_location: user.office_location,
    phone: user.phone
  } : {
    id: user.id,
    student_id: user.student_id,
    name: user.name,
    email: user.email,
    role: "student",
    department: user.department,
    phone: user.phone
  };

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
  let items: any[] = [];

  if (firestore) {
    try {
      const snap = await firestore.collection("items").get();
      items = snap.docs.map((d: any) => d.data());
    } catch (e) {
      const local = getLocalDb();
      items = Object.values(local.items || {});
    }
  } else {
    const local = getLocalDb();
    items = Object.values(local.items || {});
  }

  if (status_filter && status_filter !== "all") {
    items = items.filter((it: any) => it.status === status_filter);
  }
  if (type && type !== "all") {
    items = items.filter((it: any) => it.type === type);
  }
  if (category && category !== "all") {
    items = items.filter((it: any) => it.category === category);
  }
  if (search) {
    const searchLower = String(search).trim().toLowerCase();
    items = items.filter((it: any) => {
      const text = `${it.title || ""} ${it.description || ""} ${it.location || ""}`.toLowerCase();
      return text.includes(searchLower);
    });
  }

  items.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
  res.json({ items });
});

app.get("/api/items/:id", async (req, res) => {
  const itemId = req.params.id;
  let item: any = null;

  if (firestore) {
    try {
      const doc = await firestore.collection("items").doc(itemId).get();
      if (doc.exists) {
        item = doc.data();
      }
    } catch (e) {}
  }

  if (!item) {
    const local = getLocalDb();
    item = local.items?.[itemId];
  }

  if (!item) {
    res.status(404).json({ detail: "Item not found" });
    return;
  }
  res.json(item);
});

app.post("/api/items", async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ detail: "Authentication required" });
    return;
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
    title: String(title).trim(),
    type: itemType,
    category,
    description: String(description).trim(),
    location: String(location).trim(),
    date,
    image_url: image_url || "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80",
    status: user.role === "admin" ? "approved" : "pending",
    student_id: user.id,
    student_name: user.name,
    student_email: user.email,
    created_at: new Date().toISOString()
  };

  if (firestore) {
    try {
      await firestore.collection("items").doc(itemId).set(newItem);
    } catch (e) {}
  }

  const local = getLocalDb();
  if (!local.items) local.items = {};
  local.items[itemId] = newItem;
  saveLocalDb(local);

  res.json({ message: "Report submitted successfully", item: newItem });
});

app.get("/api/student/reports", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "student") {
    res.status(403).json({ detail: "Student access required" });
    return;
  }
  let items: any[] = [];

  if (firestore) {
    try {
      const snap = await firestore.collection("items").where("student_id", "==", user.id).get();
      items = snap.docs.map((d: any) => d.data());
    } catch (e) {
      const local = getLocalDb();
      items = (Object.values(local.items || {}) as any[]).filter((it: any) => it.student_id === user.id);
    }
  } else {
    const local = getLocalDb();
    items = (Object.values(local.items || {}) as any[]).filter((it: any) => it.student_id === user.id);
  }

  items.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
  res.json({ items });
});

app.get("/api/student/claims", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "student") {
    res.status(403).json({ detail: "Student access required" });
    return;
  }
  let claims: any[] = [];

  if (firestore) {
    try {
      const snap = await firestore.collection("item_claims").where("student_id", "==", user.id).get();
      claims = snap.docs.map((d: any) => d.data());
    } catch (e) {
      const local = getLocalDb();
      claims = (Object.values(local.item_claims || {}) as any[]).filter((c: any) => c.student_id === user.id);
    }
  } else {
    const local = getLocalDb();
    claims = (Object.values(local.item_claims || {}) as any[]).filter((c: any) => c.student_id === user.id);
  }

  claims.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
  res.json({ claims });
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

  let item: any = null;
  if (firestore) {
    try {
      const doc = await firestore.collection("items").doc(item_id).get();
      if (doc.exists) item = doc.data();
    } catch (e) {}
  }
  if (!item) {
    const local = getLocalDb();
    item = local.items?.[item_id];
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

  if (firestore) {
    try {
      await firestore.collection("item_claims").doc(claimId).set(newClaim);
    } catch (e) {}
  }

  const local = getLocalDb();
  if (!local.item_claims) local.item_claims = {};
  local.item_claims[claimId] = newClaim;
  saveLocalDb(local);

  res.json({ message: "Claim submitted successfully", claim: newClaim });
});

app.get("/api/admin/stats", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }

  let students: any[] = [];
  let items: any[] = [];
  let claims: any[] = [];

  if (firestore) {
    try {
      const [sSnap, iSnap, cSnap] = await Promise.all([
        firestore.collection("students").get(),
        firestore.collection("items").get(),
        firestore.collection("item_claims").get()
      ]);
      students = sSnap.docs.map((d: any) => d.data());
      items = iSnap.docs.map((d: any) => d.data());
      claims = cSnap.docs.map((d: any) => d.data());
    } catch (e) {
      const local = getLocalDb();
      students = Object.values(local.students || {});
      items = Object.values(local.items || {});
      claims = Object.values(local.item_claims || {});
    }
  } else {
    const local = getLocalDb();
    students = Object.values(local.students || {});
    items = Object.values(local.items || {});
    claims = Object.values(local.item_claims || {});
  }

  res.json({
    total_students: students.length,
    lost_items: items.filter((i: any) => i.type === "lost").length,
    found_items: items.filter((i: any) => i.type === "found").length,
    pending_reports: items.filter((i: any) => i.status === "pending").length,
    pending_claims: claims.filter((c: any) => c.status === "pending").length
  });
});

app.get("/api/admin/reports", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  let items: any[] = [];

  if (firestore) {
    try {
      const snap = await firestore.collection("items").get();
      items = snap.docs.map((d: any) => d.data());
    } catch (e) {
      const local = getLocalDb();
      items = Object.values(local.items || {});
    }
  } else {
    const local = getLocalDb();
    items = Object.values(local.items || {});
  }

  items.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
  res.json({ items });
});

app.put("/api/admin/reports/:id/status", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  const { status } = req.body;
  const itemId = req.params.id;

  if (firestore) {
    try {
      await firestore.collection("items").doc(itemId).update({ status });
    } catch (e) {}
  }

  const local = getLocalDb();
  if (local.items?.[itemId]) {
    local.items[itemId].status = status;
    saveLocalDb(local);
  }

  res.json({ message: `Item status updated to ${status}` });
});

app.delete("/api/admin/reports/:id", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  const itemId = req.params.id;

  if (firestore) {
    try {
      await firestore.collection("items").doc(itemId).delete();
    } catch (e) {}
  }

  const local = getLocalDb();
  if (local.items?.[itemId]) {
    delete local.items[itemId];
    saveLocalDb(local);
  }

  res.json({ message: "Report deleted successfully" });
});

app.get("/api/admin/claims", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  let claims: any[] = [];

  if (firestore) {
    try {
      const snap = await firestore.collection("item_claims").get();
      claims = snap.docs.map((d: any) => d.data());
    } catch (e) {
      const local = getLocalDb();
      claims = Object.values(local.item_claims || {});
    }
  } else {
    const local = getLocalDb();
    claims = Object.values(local.item_claims || {});
  }

  claims.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
  res.json({ claims });
});

app.put("/api/admin/claims/:id/status", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  const { status } = req.body;
  const claimId = req.params.id;

  let claimData: any = null;

  if (firestore) {
    try {
      const doc = await firestore.collection("item_claims").doc(claimId).get();
      if (doc.exists) {
        claimData = doc.data();
        await firestore.collection("item_claims").doc(claimId).update({ status });
        if (status === "approved" && claimData?.item_id) {
          await firestore.collection("items").doc(claimData.item_id).update({ status: "claimed" });
        }
      }
    } catch (e) {}
  }

  const local = getLocalDb();
  if (local.item_claims?.[claimId]) {
    local.item_claims[claimId].status = status;
    if (status === "approved" && local.item_claims[claimId].item_id && local.items?.[local.item_claims[claimId].item_id]) {
      local.items[local.item_claims[claimId].item_id].status = "claimed";
    }
    saveLocalDb(local);
  }

  res.json({ message: `Claim status updated to ${status}` });
});

app.get("/api/admin/students", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  let students: any[] = [];

  if (firestore) {
    try {
      const snap = await firestore.collection("students").get();
      students = snap.docs.map((d: any) => {
        const { password_hash, ...rest } = d.data();
        return rest;
      });
    } catch (e) {
      const local = getLocalDb();
      students = (Object.values(local.students || {}) as any[]).map((s: any) => {
        const { password_hash, ...rest } = s;
        return rest;
      });
    }
  } else {
    const local = getLocalDb();
    students = (Object.values(local.students || {}) as any[]).map((s: any) => {
      const { password_hash, ...rest } = s;
      return rest;
    });
  }

  students.sort((a: any, b: any) => (a.student_id || "").localeCompare(b.student_id || ""));
  res.json({ students });
});

app.use(express.static(frontendDir));

app.get("/items", (req, res) => {
  res.sendFile(path.join(frontendDir, "items.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(frontendDir, "login.html"));
});

app.get("/student-dashboard", (req, res) => {
  res.sendFile(path.join(frontendDir, "student-dashboard.html"));
});

app.get("/admin-dashboard", (req, res) => {
  res.sendFile(path.join(frontendDir, "admin-dashboard.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
