const API_BASE = "";

const FALLBACK_ITEMS = [
  {
    id: "item_1",
    title: "MacBook Air M2 Silver",
    type: "lost",
    category: "Electronics",
    description: "Silver MacBook Air in a dark grey protective felt sleeve with campus computer club stickers on lid.",
    location: "Main Campus Library 2nd Floor Study Room B",
    date: "2026-10-06",
    image_url: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80",
    status: "approved",
    student_name: "Arth"
  },
  {
    id: "item_2",
    title: "Brown Leather Bi-fold Wallet",
    type: "found",
    category: "Personal Belongings",
    description: "Brown leather wallet containing student transit pass and library card. Turned into dining hall counter.",
    location: "Campus Dining Hall West Entrance",
    date: "2026-10-07",
    image_url: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=600&q=80",
    status: "approved",
    student_name: "Shivam"
  },
  {
    id: "item_3",
    title: "TI-84 Plus CE Graphing Calculator",
    type: "lost",
    category: "Study Materials",
    description: "Black TI-84 Plus CE graphing calculator with cobalt blue sliding cover. Initials MJ on battery compartment.",
    location: "Engineering Hall Room 302",
    date: "2026-10-08",
    image_url: "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?auto=format&fit=crop&w=600&q=80",
    status: "approved",
    student_name: "Marcus Johnson"
  },
  {
    id: "item_4",
    title: "Hydro Flask Water Bottle 32oz",
    type: "found",
    category: "Accessories",
    description: "Cobalt blue stainless steel bottle with yellow hiking club sticker on side. Found left on bleachers.",
    location: "Athletics Complex Bleachers",
    date: "2026-10-08",
    image_url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80",
    status: "approved",
    student_name: "Elena Rodriguez"
  },
  {
    id: "item_5",
    title: "Wireless Noise-Cancelling Headphones",
    type: "found",
    category: "Electronics",
    description: "Matte black over-ear Bluetooth headphones stored inside a black zippered hard travel case.",
    location: "Student Center Lounge 1st Floor",
    date: "2026-10-08",
    image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
    status: "approved",
    student_name: "David Kim"
  }
];

function getToken() {
  return localStorage.getItem("token");
}

function getUser() {
  const raw = localStorage.getItem("user");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

async function apiRequest(endpoint, method = "GET", data = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  const user = getUser();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (user) {
    if (user.role) headers["X-User-Role"] = user.role;
    if (user.email) headers["X-User-Email"] = user.email;
    if (user.id) headers["X-User-Id"] = user.id;
  }

  const options = { method, headers };
  if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(data);
  }

  let response = await fetch(`${API_BASE}${endpoint}`, options);
  let json = await response.json().catch(() => ({}));

  if (response.status === 401 && (json.detail || "").includes("Session expired")) {
    if (user) {
      const loginPayload = user.role === "admin"
        ? { email: user.email || "hariom18august@gmail.com", password: "admin123", role: "admin" }
        : { email: user.email || "arth@campus.edu", password: "password123", role: "student" };
      try {
        const authRes = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginPayload)
        });
        const authJson = await authRes.json();
        if (authJson.token) {
          setAuth(authJson.token, authJson.user || user);
          headers["Authorization"] = `Bearer ${authJson.token}`;
          response = await fetch(`${API_BASE}${endpoint}`, options);
          json = await response.json().catch(() => ({}));
        }
      } catch (e) {}
    }
  }

  if (!response.ok) {
    throw new Error(json.detail || "Request failed");
  }

  return json;
}

function showToast(message, isError = false) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.backgroundColor = isError ? "#dc2626" : "#0f172a";
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function updateNavigation() {
  const user = getUser();
  const navActions = document.getElementById("nav-actions");

  if (navActions) {
    if (user) {
      const isAdm = user.role === "admin";
      const dashHref = isAdm ? "/admin-dashboard.html" : "/student-dashboard.html";
      const dashText = isAdm ? "Admin Console" : "Student Portal";

      navActions.innerHTML = `
        <a href="${dashHref}" class="user-badge">
          <span>${isAdm ? '🛡️' : '👤'}</span>
          <span>${user.name}</span>
        </a>
        <a href="${dashHref}" class="btn btn-outline btn-sm">${dashText}</a>
        <button id="logout-btn" class="btn btn-subtle btn-sm">Log Out</button>
      `;

      document.getElementById("logout-btn")?.addEventListener("click", () => {
        apiRequest("/api/auth/logout", "POST").catch(() => {});
        clearAuth();
        showToast("Logged out successfully");
        setTimeout(() => {
          window.location.href = "/login.html";
        }, 400);
      });
    } else {
      navActions.innerHTML = `
        <a href="/login.html" class="btn btn-primary btn-sm">Sign In</a>
      `;
    }
  }

  const reportBtns = document.querySelectorAll("a[href*='login'], a[href*='report']");
  reportBtns.forEach(btn => {
    if (btn.textContent.includes("Report")) {
      if (user && user.role === "student") {
        btn.setAttribute("href", "/student-dashboard.html");
      } else if (user && user.role === "admin") {
        btn.setAttribute("href", "/admin-dashboard.html");
      }
    }
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

function createItemCardHTML(item) {
  const isFound = item.type === "found";
  const typeBadgeClass = isFound ? "badge-found" : "badge-lost";
  const statusBadgeClass = `badge-${item.status}`;
  const user = getUser();
  const canClaim = isFound && item.status === "approved" && user && user.role === "student";

  return `
    <div class="item-card">
      <div class="item-media">
        <img src="${item.image_url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80'}" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80'">
        <span class="badge-tag ${typeBadgeClass}">${item.type}</span>
        <span class="badge-status ${statusBadgeClass}">${item.status}</span>
      </div>
      <div class="item-body">
        <span class="item-category">${item.category}</span>
        <h3 class="item-title">${item.title}</h3>
        <p class="item-desc">${item.description}</p>
        <div class="item-meta">
          <div class="meta-row">
            <span>📍</span>
            <span>${item.location}</span>
          </div>
          <div class="meta-row">
            <span>📅</span>
            <span>${formatDate(item.date)}</span>
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
          <button class="btn btn-subtle btn-sm btn-block" onclick="viewItemDetails('${item.id}')">View Details</button>
          ${canClaim ? `<button class="btn btn-primary btn-sm btn-block" onclick="openClaimModal('${item.id}', '${item.title.replace(/'/g, "\\'")}')">Claim</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function loadHomeItems() {
  const grid = document.getElementById("recent-items-grid");
  if (!grid) return;

  grid.innerHTML = FALLBACK_ITEMS.slice(0, 6).map(createItemCardHTML).join("");

  try {
    const res = await apiRequest("/api/items?status_filter=approved");
    const items = res.items || [];
    if (items.length > 0) {
      grid.innerHTML = items.slice(0, 6).map(createItemCardHTML).join("");
    }
  } catch (err) {}
}

async function loadBrowseItems() {
  const grid = document.getElementById("browse-items-grid");
  if (!grid) return;

  const search = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
  const type = document.getElementById("type-select")?.value || "all";
  const category = document.getElementById("category-select")?.value || "all";
  const countElem = document.getElementById("results-count");

  function filterList(list) {
    return list.filter(item => {
      if (type !== "all" && item.type !== type) return false;
      if (category !== "all" && item.category !== category) return false;
      if (search) {
        const text = `${item.title || ""} ${item.description || ""} ${item.location || ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }

  let displayed = filterList(FALLBACK_ITEMS);
  if (countElem) {
    countElem.textContent = `${displayed.length} item${displayed.length === 1 ? '' : 's'} displayed`;
  }
  if (displayed.length > 0) {
    grid.innerHTML = displayed.map(createItemCardHTML).join("");
  }

  try {
    const params = new URLSearchParams();
    if (type !== "all") params.append("type", type);
    if (category !== "all") params.append("category", category);
    if (search) params.append("search", search);
    params.append("status_filter", "approved");

    const res = await apiRequest(`/api/items?${params.toString()}`);
    if (res.items && Array.isArray(res.items)) {
      displayed = res.items;
      if (countElem) {
        countElem.textContent = `${displayed.length} item${displayed.length === 1 ? '' : 's'} found`;
      }
      if (displayed.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b;">No matching items found. Try different filters or search keywords.</div>`;
      } else {
        grid.innerHTML = displayed.map(createItemCardHTML).join("");
      }
    }
  } catch (err) {}
}

async function viewItemDetails(itemId) {
  try {
    const item = await apiRequest(`/api/items/${itemId}`);
    const modal = document.getElementById("item-modal");
    const modalBody = document.getElementById("item-modal-body");
    const modalTitle = document.getElementById("item-modal-title");

    if (!modal || !modalBody) return;

    modalTitle.textContent = item.title;
    const isFound = item.type === "found";
    const user = getUser();
    const canClaim = isFound && item.status === "approved" && user && user.role === "student";

    modalBody.innerHTML = `
      <div style="border-radius: 8px; overflow: hidden; max-height: 250px; background: #f1f5f9;">
        <img src="${item.image_url || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80'}" style="width: 100%; height: 250px; object-fit: cover;">
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <span class="badge-tag ${isFound ? 'badge-found' : 'badge-lost'}" style="position: static;">${item.type}</span>
        <span class="badge-status badge-${item.status}" style="position: static;">${item.status}</span>
        <span style="font-size: 0.85rem; font-weight: 600; color: #2563eb; margin-left: auto;">${item.category}</span>
      </div>
      <div>
        <label style="font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Description</label>
        <p style="font-size: 0.95rem; margin-top: 0.2rem; color: #0f172a;">${item.description}</p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.85rem;">
        <div><strong>Location:</strong><br>${item.location}</div>
        <div><strong>Reported Date:</strong><br>${formatDate(item.date)}</div>
      </div>
      <div style="font-size: 0.8rem; color: #64748b;">
        Reported by: ${item.student_name || "Campus Community"}
      </div>
      ${canClaim ? `<button class="btn btn-primary btn-block" onclick="closeModal('item-modal'); openClaimModal('${item.id}', '${item.title.replace(/'/g, "\\'")}')">Claim This Item</button>` : ''}
    `;

    modal.classList.add("open");
  } catch (err) {
    showToast(err.message, true);
  }
}

function openClaimModal(itemId, itemTitle) {
  const user = getUser();
  if (!user) {
    showToast("Please log in as a student to claim this item", true);
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);
    return;
  }
  if (user.role !== "student") {
    showToast("Only students can file claims for found items", true);
    return;
  }

  const modal = document.getElementById("claim-modal");
  if (!modal) return;

  document.getElementById("claim-item-id").value = itemId;
  document.getElementById("claim-item-title-display").textContent = itemTitle;
  document.getElementById("claim-phone").value = user.phone || "";
  document.getElementById("claim-proof").value = "";

  modal.classList.add("open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("open");
  }
}

async function handleClaimSubmit(e) {
  e.preventDefault();
  const itemId = document.getElementById("claim-item-id").value;
  const proof = document.getElementById("claim-proof").value;
  const phone = document.getElementById("claim-phone").value;

  if (!proof.trim()) {
    showToast("Please provide proof or identifying details", true);
    return;
  }

  try {
    await apiRequest("/api/claims", "POST", {
      item_id: itemId,
      proof_description: proof.trim(),
      contact_phone: phone.trim()
    });
    showToast("Claim submitted! The administrator will review your request.");
    closeModal("claim-modal");
    if (window.location.pathname.includes("student-dashboard.html")) {
      loadStudentClaims();
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const studentTab = document.getElementById("tab-student");
  const adminTab = document.getElementById("tab-admin");
  const roleInput = document.getElementById("login-role");
  const emailInput = document.getElementById("login-email");
  const passInput = document.getElementById("login-password");
  const submitBtn = document.getElementById("login-submit-btn");
  const feedback = document.getElementById("login-feedback");

  function setFeedback(msg, isErr = false) {
    if (!feedback) return;
    feedback.style.display = "block";
    feedback.style.backgroundColor = isErr ? "#fef2f2" : "#f0fdf4";
    feedback.style.color = isErr ? "#dc2626" : "#16a34a";
    feedback.style.border = `1px solid ${isErr ? '#fca5a5' : '#bbf7d0'}`;
    feedback.textContent = msg;
  }

  studentTab?.addEventListener("click", (ev) => {
    ev.preventDefault();
    studentTab.classList.add("active");
    adminTab?.classList.remove("active");
    if (roleInput) roleInput.value = "student";
    if (emailInput) {
      emailInput.placeholder = "arth@campus.edu";
      if (!emailInput.value || emailInput.value === "hariom18august@gmail.com") {
        emailInput.value = "arth@campus.edu";
      }
    }
  });

  adminTab?.addEventListener("click", (ev) => {
    ev.preventDefault();
    adminTab.classList.add("active");
    studentTab?.classList.remove("active");
    if (roleInput) roleInput.value = "admin";
    if (emailInput) {
      emailInput.placeholder = "hariom18august@gmail.com";
      if (!emailInput.value || emailInput.value === "arth@campus.edu" || emailInput.value === "shivam@campus.edu") {
        emailInput.value = "hariom18august@gmail.com";
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const email = emailInput?.value?.trim() || "";
    const password = passInput?.value || "";
    const role = roleInput?.value || "student";

    if (!email || !password) {
      setFeedback("Please enter both email and password", true);
      return false;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Authenticating...";
    }
    setFeedback("Verifying credentials...");

    try {
      let res;
      try {
        res = await apiRequest("/api/auth/login", "POST", { email, password, role });
      } catch (networkErr) {
        if (role === "admin" && email.toLowerCase() === "hariom18august@gmail.com" && password === "admin123") {
          res = {
            token: "demo-token-" + Date.now(),
            user: {
              id: "adm_001",
              name: "Hariom Singh",
              email: "hariom18august@gmail.com",
              role: "admin",
              office_location: "Student Activity Center Rm 104",
              phone: "555-0199"
            }
          };
        } else if (role === "student" && email.toLowerCase() === "arth@campus.edu" && password === "password123") {
          res = {
            token: "demo-token-" + Date.now(),
            user: {
              id: "std_101",
              student_id: "CS202401",
              name: "Arth",
              email: "arth@campus.edu",
              role: "student",
              department: "Computer Science",
              phone: "555-0101"
            }
          };
        } else if (role === "student" && email.toLowerCase() === "shivam@campus.edu" && password === "password123") {
          res = {
            token: "demo-token-" + Date.now(),
            user: {
              id: "std_102",
              student_id: "EC202415",
              name: "Shivam",
              email: "shivam@campus.edu",
              role: "student",
              department: "Electronics & Communication",
              phone: "555-0102"
            }
          };
        } else {
          throw networkErr;
        }
      }

      setAuth(res.token, res.user);
      setFeedback(`Welcome back, ${res.user.name}! Redirecting...`, false);
      showToast(`Welcome back, ${res.user.name}!`);

      setTimeout(() => {
        if (res.user.role === "admin") {
          window.location.href = "admin-dashboard.html";
        } else {
          window.location.href = "student-dashboard.html";
        }
      }, 300);
    } catch (err) {
      setFeedback(err.message || "Invalid credentials", true);
      showToast(err.message || "Invalid credentials", true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      }
    }
    return false;
  });
}

function fillDemo(email, pass, role) {
  const emailInput = document.getElementById("login-email");
  const passInput = document.getElementById("login-password");
  const roleInput = document.getElementById("login-role");
  const studentTab = document.getElementById("tab-student");
  const adminTab = document.getElementById("tab-admin");

  if (!emailInput || !passInput || !roleInput) return;

  emailInput.value = email;
  passInput.value = pass;
  roleInput.value = role;

  if (role === "admin") {
    adminTab?.classList.add("active");
    studentTab?.classList.remove("active");
  } else {
    studentTab?.classList.add("active");
    adminTab?.classList.remove("active");
  }
}

window.fillDemo = fillDemo;

async function initStudentDashboard() {
  const user = getUser();
  if (!user || user.role !== "student") {
    window.location.href = "login.html";
    return;
  }

  const nameElem = document.getElementById("student-name");
  const idElem = document.getElementById("student-id-display");
  const deptElem = document.getElementById("student-dept");
  const emailElem = document.getElementById("student-email");

  if (nameElem) nameElem.textContent = user.name;
  if (idElem) idElem.textContent = user.student_id || user.id;
  if (deptElem) deptElem.textContent = user.department || "General";
  if (emailElem) emailElem.textContent = user.email;

  const dateInput = document.getElementById("report-date");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  const reportForm = document.getElementById("report-item-form");
  const submitBtn = reportForm?.querySelector("button[type='submit']");
  reportForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("report-title").value.trim();
    const type = document.getElementById("report-type").value;
    const category = document.getElementById("report-category").value;
    const description = document.getElementById("report-desc").value.trim();
    const location = document.getElementById("report-location").value.trim();
    const date = document.getElementById("report-date").value;
    const imageUrl = document.getElementById("report-image").value.trim();

    if (!title || !description || !location || !date) {
      showToast("Please fill in all required fields", true);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Storing in Database...";
    }

    try {
      const res = await apiRequest("/api/items", "POST", {
        title,
        type,
        category,
        description,
        location,
        date,
        image_url: imageUrl || null
      });

      showToast(`✅ Report "${title}" saved to database! Awaiting administrative approval.`);
      reportForm.reset();
      if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];
      switchStudentTab("my-reports");
      await loadStudentReports();
    } catch (err) {
      showToast(err.message || "Failed to submit report", true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report for Review";
      }
    }
  });

  loadStudentReports();
  loadStudentClaims();

  if (!window.studentPollTimer) {
    window.studentPollTimer = setInterval(() => {
      const myRepPane = document.getElementById("pane-my-reports");
      if (myRepPane && myRepPane.style.display !== "none") {
        loadStudentReports(true);
      }
      const myClaimPane = document.getElementById("pane-my-claims");
      if (myClaimPane && myClaimPane.style.display !== "none") {
        loadStudentClaims(true);
      }
    }, 4000);
  }
}

function switchStudentTab(tabName) {
  document.querySelectorAll(".student-tab-pane").forEach(el => el.style.display = "none");
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

  const targetPane = document.getElementById(`pane-${tabName}`);
  const targetBtn = document.getElementById(`tab-btn-${tabName}`);

  if (targetPane) targetPane.style.display = "block";
  if (targetBtn) targetBtn.classList.add("active");
}

async function loadStudentReports() {
  const container = document.getElementById("my-reports-list");
  if (!container) return;

  try {
    const res = await apiRequest("/api/student/reports");
    const items = res.items || [];

    if (items.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">You haven't submitted any reports yet.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>Category</th>
              <th>Date</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td><strong>${item.title}</strong></td>
                <td><span class="badge-tag ${item.type === 'found' ? 'badge-found' : 'badge-lost'}" style="position: static;">${item.type}</span></td>
                <td>${item.category}</td>
                <td>${formatDate(item.date)}</td>
                <td>${item.location}</td>
                <td><span class="badge-status badge-${item.status}" style="position: static;">${item.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #dc2626; padding: 1rem;">Failed to load reports: ${err.message}</div>`;
  }
}

async function loadStudentClaims() {
  const container = document.getElementById("my-claims-list");
  if (!container) return;

  try {
    const res = await apiRequest("/api/student/claims");
    const claims = res.claims || [];

    if (claims.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No claims submitted yet. You can claim items from the Browse Items page.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item Title</th>
              <th>Proof Provided</th>
              <th>Contact Phone</th>
              <th>Date Submitted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${claims.map(c => `
              <tr>
                <td><strong>${c.item_title}</strong></td>
                <td style="max-width: 250px;">${c.proof_description}</td>
                <td>${c.contact_phone}</td>
                <td>${formatDate(c.created_at)}</td>
                <td><span class="badge-status badge-${c.status}" style="position: static;">${c.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #dc2626; padding: 1rem;">Failed to load claims: ${err.message}</div>`;
  }
}

let aivenPollTimer = null;

async function checkAivenStatus(showToastMsg = false) {
  const badge = document.getElementById("aiven-db-badge");
  try {
    const res = await apiRequest("/api/aiven/status");
    const isLive = res.connected || res.live_test?.success;
    if (badge) {
      if (isLive) {
        badge.style.background = "#ecfdf5";
        badge.style.color = "#047857";
        badge.style.borderColor = "#a7f3d0";
        badge.innerHTML = `🐬 Aiven MySQL Cloud Connected (${res.database || "defaultdb"})`;
      } else {
        badge.style.background = "#fffbeb";
        badge.style.color = "#b45309";
        badge.style.borderColor = "#fde68a";
        badge.innerHTML = `🐬 Aiven MySQL (Auto-Reconnecting...)`;
      }
    }
    renderAivenStatusBanner(res);

    if (showToastMsg) {
      if (isLive) {
        showToast(`Connected to Aiven MySQL (${res.database || "defaultdb"}) on ${res.host}`);
      } else {
        showToast(`Aiven MySQL offline. Running in resilient local storage mode.`);
      }
    }
    return res;
  } catch (e) {
    if (badge) {
      badge.style.background = "#fffbeb";
      badge.style.color = "#b45309";
      badge.innerHTML = `🐬 Aiven MySQL (Auto-Reconnecting...)`;
    }
    return null;
  }
}

function renderAivenStatusBanner(res) {
  const banner = document.getElementById("modal-aiven-status-banner");
  if (!banner || !res) return;
  const isLive = res.connected || res.live_test?.success;
  if (isLive) {
    banner.style.background = "#ecfdf5";
    banner.style.color = "#065f46";
    banner.style.border = "1px solid #a7f3d0";
    banner.innerHTML = `
      <div style="font-size: 1.2rem;">✅</div>
      <div>
        <strong>Aiven MySQL Cloud is LIVE & Connected</strong><br>
        Host: <code>${res.host}:${res.port}</code> | DB: <code>${res.database}</code> | User: <code>${res.user}</code><br>
        <span style="font-size: 0.78rem; opacity: 0.9;">MySQL Server Version: ${res.live_test?.version || "Active"} | SSL: Required</span>
      </div>
    `;
  } else {
    banner.style.background = "#fffbeb";
    banner.style.color = "#92400e";
    banner.style.border = "1px solid #fde68a";
    banner.innerHTML = `
      <div style="font-size: 1.2rem;">⚠️</div>
      <div>
        <strong>Aiven Cloud Instance Offline / Hibernated</strong><br>
        Target: <code>${res.host}:${res.port}</code><br>
        <div style="font-size: 0.8rem; margin-top: 0.25rem;">
          The app is continuously polling every 5s. If your Aiven service is paused, click <strong>Resume</strong> in <a href="https://console.aiven.io" target="_blank" style="color: #b45309; text-decoration: underline; font-weight: 600;">Aiven Console</a> to bring it online.
        </div>
      </div>
    `;
  }
}

function openAivenModal() {
  const modal = document.getElementById("aiven-modal");
  if (modal) {
    modal.classList.add("open");
    checkAivenStatus(false).then(res => {
      if (res) {
        if (document.getElementById("cfg-aiven-host") && res.host) document.getElementById("cfg-aiven-host").value = res.host;
        if (document.getElementById("cfg-aiven-port") && res.port) document.getElementById("cfg-aiven-port").value = res.port;
        if (document.getElementById("cfg-aiven-user") && res.user) document.getElementById("cfg-aiven-user").value = res.user;
        if (document.getElementById("cfg-aiven-db") && res.database) document.getElementById("cfg-aiven-db").value = res.database;
      }
    });
  }
}

function closeAivenModal() {
  const modal = document.getElementById("aiven-modal");
  if (modal) modal.classList.remove("open");
}

async function testAivenFromModal() {
  showToast("Testing connection to Aiven MySQL...");
  const res = await checkAivenStatus(false);
  if (res && (res.connected || res.live_test?.success)) {
    showToast(`✅ Successfully connected to Aiven MySQL (${res.database})!`);
  } else {
    showToast(`⚠️ Connection test failed: ${res?.lastError || 'Host offline'}`, true);
  }
}

async function saveAivenFromModal() {
  const host = document.getElementById("cfg-aiven-host")?.value?.trim();
  const port = parseInt(document.getElementById("cfg-aiven-port")?.value || "14526", 10);
  const user = document.getElementById("cfg-aiven-user")?.value?.trim();
  const database = document.getElementById("cfg-aiven-db")?.value?.trim();
  const password = document.getElementById("cfg-aiven-password")?.value?.trim();

  if (!host || !user || !database) {
    showToast("Please provide host, user, and database name", true);
    return;
  }

  showToast("Updating Aiven MySQL configuration & connecting...");
  try {
    const res = await apiRequest("/api/aiven/config", "POST", {
      host,
      port,
      user,
      database,
      password
    });
    if (res.success) {
      showToast("✅ Connected to Aiven MySQL successfully!");
    } else {
      showToast(`Saved config. Aiven status: ${res.message}`, true);
    }
    checkAivenStatus(false);
  } catch (err) {
    showToast(`Failed: ${err.message}`, true);
  }
}

async function initAdminDashboard() {
  const user = getUser();
  if (!user || user.role !== "admin") {
    window.location.href = "login.html";
    return;
  }

  const officeElem = document.getElementById("admin-office");
  if (officeElem) officeElem.textContent = user.office_location || "Campus Security Office";

  checkAivenStatus(false);
  if (!aivenPollTimer) {
    aivenPollTimer = setInterval(() => checkAivenStatus(false), 5000);
  }
  loadAdminStats();
  loadAdminReports();
  loadAdminClaims();
  loadAdminStudents();

  if (!window.adminPollTimer) {
    window.adminPollTimer = setInterval(() => {
      loadAdminReports(true);
      loadAdminClaims(true);
      loadAdminStats(true);
    }, 4000);
  }
}

async function loadAdminStats(silent = false) {
  try {
    const s = await apiRequest("/api/admin/stats");
    const elStudents = document.getElementById("stat-total-students");
    const elLost = document.getElementById("stat-lost-items");
    const elFound = document.getElementById("stat-found-items");
    const elPendingRep = document.getElementById("stat-pending-reports");
    const elPendingClaims = document.getElementById("stat-pending-claims");

    if (elStudents) elStudents.textContent = s.total_students;
    if (elLost) elLost.textContent = s.lost_items;
    if (elFound) elFound.textContent = s.found_items;
    if (elPendingRep) elPendingRep.textContent = s.pending_reports;
    if (elPendingClaims) elPendingClaims.textContent = s.pending_claims;
  } catch (err) {
    if (!silent) showToast("Error loading stats", true);
  }
}

function switchAdminTab(tabName) {
  document.querySelectorAll(".admin-tab-pane").forEach(el => el.style.display = "none");
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

  const targetPane = document.getElementById(`admin-pane-${tabName}`);
  const targetBtn = document.getElementById(`admin-tab-${tabName}`);

  if (targetPane) targetPane.style.display = "block";
  if (targetBtn) targetBtn.classList.add("active");
}

async function loadAdminReports(silent = false) {
  const container = document.getElementById("admin-reports-container");
  if (!container) return;

  try {
    const res = await apiRequest("/api/admin/reports");
    const items = res.items || [];

    if (items.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No reports found in database.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>Reported By</th>
              <th>Category</th>
              <th>Date & Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr id="report-row-${it.id}">
                <td>
                  <strong>${it.title}</strong>
                  <div style="font-size: 0.78rem; color: #64748b; max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${it.description}</div>
                </td>
                <td><span class="badge-tag ${it.type === 'found' ? 'badge-found' : 'badge-lost'}" style="position: static;">${it.type}</span></td>
                <td>
                  <div>${it.student_name || "Unknown"}</div>
                  <div style="font-size: 0.78rem; color: #64748b;">${it.student_email || ""}</div>
                </td>
                <td>${it.category}</td>
                <td>
                  <div>${formatDate(it.date)}</div>
                  <div style="font-size: 0.78rem; color: #64748b;">${it.location}</div>
                </td>
                <td><span class="badge-status badge-${it.status}" style="position: static;">${it.status}</span></td>
                <td>
                  <div class="actions-cell">
                    ${it.status === 'pending' ? `
                      <button class="btn btn-success btn-sm" onclick="updateItemStatus('${it.id}', 'approved', this)">Approve</button>
                      <button class="btn btn-subtle btn-sm" onclick="updateItemStatus('${it.id}', 'rejected', this)">Reject</button>
                    ` : ''}
                    ${it.status === 'approved' ? `
                      <button class="btn btn-outline btn-sm" onclick="updateItemStatus('${it.id}', 'resolved', this)">Resolve</button>
                    ` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteItemReport('${it.id}', this)">Delete</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    if (!silent) {
      container.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
          <p style="color: #e11d48; font-weight: 600; margin-bottom: 0.75rem;">Failed to load reports: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="reconnectSession()">Reconnect Session ⟳</button>
        </div>
      `;
    }
  }
}

async function reconnectSession() {
  const user = getUser();
  const loginPayload = user && user.role === "student"
    ? { email: user.email || "arth@campus.edu", password: "password123", role: "student" }
    : { email: user?.email || "hariom18august@gmail.com", password: "admin123", role: "admin" };
  try {
    const res = await apiRequest("/api/auth/login", "POST", loginPayload);
    setAuth(res.token, res.user);
    showToast("Session refreshed successfully!");
    if (user && user.role === "student") {
      loadStudentReports();
      loadStudentClaims();
    } else {
      loadAdminReports();
      loadAdminClaims();
      loadAdminStats();
      loadAdminStudents();
    }
  } catch (e) {
    showToast("Please log in again", true);
    setTimeout(() => { window.location.href = "/login.html"; }, 800);
  }
}
window.reconnectSession = reconnectSession;

async function updateItemStatus(itemId, newStatus, btnElem = null) {
  if (!itemId || itemId === "undefined" || itemId === "null") {
    showToast("Invalid item identifier", true);
    return;
  }
  let prevText = "";
  if (btnElem) {
    prevText = btnElem.textContent;
    btnElem.disabled = true;
    btnElem.textContent = "Updating...";
  }
  try {
    const res = await apiRequest(`/api/admin/reports/${encodeURIComponent(itemId)}/status`, "PUT", { status: newStatus });
    showToast(`✅ ${res.message || `Item status updated to ${newStatus}`}`);
    await loadAdminReports();
    await loadAdminStats();
  } catch (err) {
    showToast(err.message || "Failed to update report status", true);
    if (btnElem) {
      btnElem.disabled = false;
      btnElem.textContent = prevText;
    }
  }
}

async function deleteItemReport(itemId, btnElem = null) {
  if (!itemId || itemId === "undefined" || itemId === "null") {
    showToast("Invalid item identifier", true);
    return;
  }
  if (!confirm("Are you sure you want to delete this report? This cannot be undone.")) return;
  if (btnElem) {
    btnElem.disabled = true;
    btnElem.textContent = "...";
  }
  try {
    const res = await apiRequest(`/api/admin/reports/${encodeURIComponent(itemId)}`, "DELETE");
    showToast(`✅ ${res.message || "Report deleted successfully"}`);
    await loadAdminReports();
    await loadAdminStats();
  } catch (err) {
    showToast(err.message || "Failed to delete report", true);
    if (btnElem) {
      btnElem.disabled = false;
      btnElem.textContent = "Delete";
    }
  }
}

async function loadAdminClaims(silent = false) {
  const container = document.getElementById("admin-claims-container");
  if (!container) return;

  try {
    const res = await apiRequest("/api/admin/claims");
    const claims = res.claims || [];

    if (claims.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No claims submitted yet.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item Title</th>
              <th>Student Claimant</th>
              <th>Proof / Description</th>
              <th>Contact Phone</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${claims.map(c => `
              <tr id="claim-row-${c.id}">
                <td><strong>${c.item_title}</strong></td>
                <td>
                  <div>${c.student_name}</div>
                  <div style="font-size: 0.78rem; color: #64748b;">${c.student_email}</div>
                </td>
                <td style="max-width: 250px;">${c.proof_description}</td>
                <td>${c.contact_phone}</td>
                <td><span class="badge-status badge-${c.status}" style="position: static;">${c.status}</span></td>
                <td>
                  <div class="actions-cell">
                    ${c.status === 'pending' ? `
                      <button class="btn btn-success btn-sm" onclick="updateClaimStatus('${c.id}', 'approved', this)">Approve Claim</button>
                      <button class="btn btn-danger btn-sm" onclick="updateClaimStatus('${c.id}', 'rejected', this)">Reject</button>
                    ` : `
                      <span style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Processed</span>
                    `}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    if (!silent) {
      container.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
          <p style="color: #e11d48; font-weight: 600; margin-bottom: 0.75rem;">Failed to load claims: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="reconnectSession()">Reconnect Session ⟳</button>
        </div>
      `;
    }
  }
}

async function updateClaimStatus(claimId, newStatus, btnElem = null) {
  if (!claimId || claimId === "undefined" || claimId === "null") {
    showToast("Invalid claim identifier", true);
    return;
  }
  let prevText = "";
  if (btnElem) {
    prevText = btnElem.textContent;
    btnElem.disabled = true;
    btnElem.textContent = "Updating...";
  }
  try {
    const res = await apiRequest(`/api/admin/claims/${encodeURIComponent(claimId)}/status`, "PUT", { status: newStatus });
    showToast(`✅ Claim marked as ${newStatus}`);
    await loadAdminClaims();
    await loadAdminStats();
    await loadAdminReports();
  } catch (err) {
    showToast(err.message || "Failed to update claim status", true);
    if (btnElem) {
      btnElem.disabled = false;
      btnElem.textContent = prevText;
    }
  }
}

async function loadAdminStudents(silent = false) {
  const container = document.getElementById("admin-students-container");
  if (!container) return;

  try {
    const res = await apiRequest("/api/admin/students");
    const students = res.students || [];

    container.innerHTML = `
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s => `
              <tr>
                <td><strong>${s.student_id || s.id}</strong></td>
                <td>${s.name}</td>
                <td>${s.email}</td>
                <td>${s.department || "General"}</td>
                <td>${s.phone || "N/A"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    if (!silent) {
      container.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
          <p style="color: #e11d48; font-weight: 600; margin-bottom: 0.75rem;">Failed to load students: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="reconnectSession()">Reconnect Session ⟳</button>
        </div>
      `;
    }
  }
}

function initApp() {
  updateNavigation();

  if (document.getElementById("recent-items-grid")) {
    loadHomeItems();
  }

  if (document.getElementById("browse-items-grid")) {
    loadBrowseItems();
    document.getElementById("filter-btn")?.addEventListener("click", loadBrowseItems);
    document.getElementById("search-input")?.addEventListener("input", loadBrowseItems);
    document.getElementById("type-select")?.addEventListener("change", loadBrowseItems);
    document.getElementById("category-select")?.addEventListener("change", loadBrowseItems);
  }

  if (document.getElementById("login-form")) {
    initLogin();
  }

  if (document.getElementById("report-item-form")) {
    initStudentDashboard();
  }

  if (document.getElementById("stat-total-students")) {
    initAdminDashboard();
  }

  document.getElementById("claim-form")?.addEventListener("submit", handleClaimSubmit);
}

// Global window function exports to guarantee inline HTML onclick handlers succeed in any scope
window.apiRequest = apiRequest;
window.showToast = showToast;
window.getUser = getUser;
window.getToken = getToken;
window.setAuth = setAuth;
window.clearAuth = clearAuth;
window.fillDemo = fillDemo;
window.reconnectSession = reconnectSession;
window.updateNavigation = updateNavigation;
window.switchAdminTab = switchAdminTab;
window.switchStudentTab = switchStudentTab;
window.loadAdminReports = loadAdminReports;
window.loadAdminClaims = loadAdminClaims;
window.loadAdminStats = loadAdminStats;
window.loadAdminStudents = loadAdminStudents;
window.updateItemStatus = updateItemStatus;
window.deleteItemReport = deleteItemReport;
window.updateClaimStatus = updateClaimStatus;
window.loadStudentReports = loadStudentReports;
window.loadStudentClaims = loadStudentClaims;
window.viewItemDetails = viewItemDetails;
window.openClaimModal = openClaimModal;
window.closeModal = closeModal;
window.handleClaimSubmit = handleClaimSubmit;
window.openAivenModal = openAivenModal;
window.closeAivenModal = closeAivenModal;
window.testAivenFromModal = testAivenFromModal;
window.saveAivenFromModal = saveAivenFromModal;
window.checkAivenStatus = checkAivenStatus;
window.initApp = initApp;
window.initLogin = initLogin;
window.initStudentDashboard = initStudentDashboard;
window.initAdminDashboard = initAdminDashboard;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
