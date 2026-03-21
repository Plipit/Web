const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { promisify } = require("util");

const ROOT = __dirname;
const LOCAL_ENV_FILE = path.join(ROOT, ".env");

const loadEnvFile = () => {
  if (!fs.existsSync(LOCAL_ENV_FILE)) {
    return;
  }

  const content = fs.readFileSync(LOCAL_ENV_FILE, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, "$1");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
};

loadEnvFile();

const PORT = process.env.PORT || 8000;
const DATA_DIR = path.join(ROOT, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const OUTBOX_DIR = path.join(DATA_DIR, "email-outbox");
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || "elmosbankacc@gmail.com";
const STAFF_EMAILS = (process.env.STAFF_EMAILS || process.env.STAFF_EMAIL || "staff@example.com")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const STAFF_PASSWORD_HASH = process.env.STAFF_PASSWORD_HASH || "";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || "changeme123";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const TRUSTED_DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_BODY_SIZE = 16 * 1024;
const TWO_FACTOR_TTL_MS = 1000 * 60 * 10;
const TRUSTED_DEVICE_SECRET =
  process.env.TRUSTED_DEVICE_SECRET || STAFF_PASSWORD_HASH || process.env.SMTP_PASS || "local-trusted-device-secret";
const loginRateLimitStore = new Map();
const leadRateLimitStore = new Map();
const staffSessions = new Map();
const staffChallenges = new Map();
let trustedDeviceVersion = 1;
const STAFF_ROUTES = new Set([
  "/staff-portal.html",
  "/contact.html",
  "/leads.html",
  "/lead.html",
  "/customers.html",
  "/email-preview.html",
  "/proposal-preview.html",
]);
const scryptAsync = promisify(crypto.scrypt);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const getPipelineStatus = (lead) => {
  if (lead.pipelineStatus) {
    return lead.pipelineStatus;
  }

  if (lead.meetingAccepted) {
    return "confirmed";
  }

  if (lead.preferredTime) {
    return "review";
  }

  return "new";
};

const ensureStorage = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(OUTBOX_DIR)) {
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  }

  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, "[]\n");
  }

  if (!fs.existsSync(CUSTOMERS_FILE)) {
    fs.writeFileSync(CUSTOMERS_FILE, "[]\n");
  }
};

const readLeads = () => {
  ensureStorage();
  return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8")).map((lead) => ({
    ...lead,
    pipelineStatus: getPipelineStatus(lead),
    internalNotes: Array.isArray(lead.internalNotes) ? lead.internalNotes : [],
    activityLog: Array.isArray(lead.activityLog) ? lead.activityLog : [],
  }));
};

const writeLeads = (leads) => {
  ensureStorage();
  fs.writeFileSync(LEADS_FILE, `${JSON.stringify(leads, null, 2)}\n`);
};

const readCustomers = () => {
  ensureStorage();
  return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, "utf8")).map((customer) => ({
    monthlyFee: 99,
    billingStatus: "active",
    internalNotes: [],
    startDate: "",
    lastPaidDate: "",
    nextInvoiceDate: "",
    ...customer,
  }));
};

const writeCustomers = (customers) => {
  ensureStorage();
  fs.writeFileSync(CUSTOMERS_FILE, `${JSON.stringify(customers, null, 2)}\n`);
};

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of staffSessions.entries()) {
    if (!session || now - session.createdAt > SESSION_TTL_MS) {
      staffSessions.delete(token);
    }
  }
};

const cleanupExpiredChallenges = () => {
  const now = Date.now();
  for (const [token, challenge] of staffChallenges.entries()) {
    if (!challenge || now > challenge.expiresAt) {
      staffChallenges.delete(token);
    }
  }
};

const getClientIp = (request) => {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown";
};

const applyRateLimit = (store, key, options) => {
  const now = Date.now();
  const { windowMs, maxRequests } = options;
  const bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }

  return null;
};

const clearRateLimitStore = (store) => {
  const now = Date.now();
  for (const [key, bucket] of store.entries()) {
    if (!bucket || now > bucket.resetAt) {
      store.delete(key);
    }
  }
};

const parseJsonBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    request.on("error", () => {
      reject(new Error("Request error"));
    });
  });

const normalizeText = (value, maxLength) => String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateLeadPayload = (payload) => {
  const cleaned = {
    name: normalizeText(payload.name, 80),
    email: normalizeText(payload.email, 120).toLowerCase(),
    company: normalizeText(payload.company, 120),
    projectType: normalizeText(payload.projectType, 80),
    goal: normalizeText(payload.goal, 200),
    style: normalizeText(payload.style, 120),
    preferredTime: normalizeText(payload.preferredTime, 120),
    message: normalizeText(payload.message, 1500),
  };

  if (!cleaned.name || !cleaned.email || !cleaned.company || !cleaned.projectType || !cleaned.goal) {
    return { ok: false, error: "Missing required fields" };
  }

  if (!isValidEmail(cleaned.email)) {
    return { ok: false, error: "Invalid email address" };
  }

  return { ok: true, cleaned };
};

const isSameOriginRequest = (request) => {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === request.headers.host;
  } catch {
    return false;
  }
};

const verifyPasswordHash = async (password, storedHash) => {
  if (!storedHash || !storedHash.startsWith("scrypt:")) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 4) {
    return false;
  }

  const [, saltHex, keyHex, costString] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const cost = Number(costString) || 16384;
  const derivedKey = await scryptAsync(password, salt, expectedKey.length, { N: cost, r: 8, p: 1 });

  if (derivedKey.length !== expectedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expectedKey);
};

const isValidStaffPassword = async (password) => {
  if (typeof password !== "string" || !password) {
    return false;
  }

  if (STAFF_PASSWORD_HASH) {
    return verifyPasswordHash(password, STAFF_PASSWORD_HASH);
  }

  return password === STAFF_PASSWORD;
};

const isValidStaffLogin = async (email, password) => {
  if (typeof email !== "string" || !email) {
    return false;
  }

  const normalizedEmail = normalizeText(email, 120).toLowerCase();
  if (!isValidEmail(normalizedEmail) || !STAFF_EMAILS.includes(normalizedEmail)) {
    return false;
  }

  return isValidStaffPassword(password);
};

const appendLeadActivity = (lead, type, message, meta = {}) => {
  if (!Array.isArray(lead.activityLog)) {
    lead.activityLog = [];
  }

  lead.activityLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt: new Date().toISOString(),
    ...meta,
  });
};

const appendCustomerActivity = (customer, type, message) => {
  if (!Array.isArray(customer.activityLog)) {
    customer.activityLog = [];
  }

  customer.activityLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt: new Date().toISOString(),
  });
};

const upsertCustomerFromLead = (lead) => {
  const customers = readCustomers();
  const existing = customers.find((customer) => String(customer.leadId) === String(lead.id));
  const timestamp = new Date().toISOString();

  if (existing) {
    existing.name = lead.name || existing.name;
    existing.company = lead.company || existing.company;
    existing.email = lead.email || existing.email;
    existing.projectType = lead.projectType || existing.projectType;
    existing.goal = lead.goal || existing.goal;
    existing.style = lead.style || existing.style;
    existing.leadStatus = lead.pipelineStatus || getPipelineStatus(lead);
    existing.updatedAt = timestamp;
    existing.billingStatus = existing.billingStatus || "active";
    existing.monthlyFee = Number(existing.monthlyFee) || 99;
    existing.startDate = existing.startDate || timestamp.slice(0, 10);
    existing.lastPaidDate = existing.lastPaidDate || "";
    existing.nextInvoiceDate = existing.nextInvoiceDate || "";
    appendCustomerActivity(existing, "customer_synced", "Customer record refreshed from lead activity.");
  } else {
    customers.unshift({
      id: `customer-${lead.id}`,
      leadId: lead.id,
      name: lead.name || "",
      company: lead.company || "",
      email: lead.email || "",
      projectType: lead.projectType || "",
      goal: lead.goal || "",
      style: lead.style || "",
      monthlyFee: 99,
      billingStatus: "active",
      startDate: timestamp.slice(0, 10),
      lastPaidDate: "",
      nextInvoiceDate: "",
      leadStatus: lead.pipelineStatus || getPipelineStatus(lead),
      createdAt: timestamp,
      updatedAt: timestamp,
      internalNotes: [],
      activityLog: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "customer_created",
          message: "Customer record created from an active client lead.",
          createdAt: timestamp,
        },
      ],
    });
  }

  writeCustomers(customers);
};

const syncCustomersFromActiveLeads = () => {
  const leads = readLeads();
  const activeLeads = leads.filter((lead) => getPipelineStatus(lead) === "active_client");
  if (!activeLeads.length) {
    return;
  }

  activeLeads.forEach((lead) => {
    upsertCustomerFromLead(lead);
  });
};

const createTransporter = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: process.env.SMTP_SERVICE || "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const writeEmailDraft = (message) => {
  ensureStorage();
  const filename = `${Date.now()}-${message.type}-${Math.random().toString(36).slice(2, 8)}.json`;
  fs.writeFileSync(path.join(OUTBOX_DIR, filename), `${JSON.stringify(message, null, 2)}\n`);
};

const buildLeadEmail = (lead) => ({
  type: "new-lead",
  to: NOTIFICATION_EMAIL,
  subject: `New lead: ${lead.company || "Untitled company"}`,
  text: [
    "A new project brief was submitted.",
    "",
    `Company: ${lead.company || "Unknown"}`,
    `Name: ${lead.name || "Unknown"}`,
    `Email: ${lead.email || "Unknown"}`,
    `Project type: ${lead.projectType || "Unknown"}`,
    `Goal: ${lead.goal || "Unknown"}`,
    `Style: ${lead.style || "Not specified"}`,
    `Preferred time: ${lead.preferredTime || "Not specified"}`,
    `Submitted: ${lead.submittedAt}`,
    "",
    "Message:",
    lead.message || "No message left.",
  ].join("\n"),
});

const buildStaffTwoFactorEmail = (email, code) => ({
  type: "staff-2fa",
  to: email,
  subject: `${process.env.BUSINESS_NAME || "Agency Starter"} staff verification code`,
  text: [
    "A staff sign-in attempt needs verification.",
    "",
    `Your one-time code: ${code}`,
    "",
    "This code expires in 10 minutes.",
    "If this was not you, ignore this message and rotate your password.",
  ].join("\n"),
});

const buildAcceptanceEmails = (lead) => {
  const businessMessage = {
    type: "meeting-accepted-business",
    to: NOTIFICATION_EMAIL,
    subject: `Meeting accepted: ${lead.company || "Untitled company"}`,
    text: [
      "A lead's proposed meeting time was accepted.",
      "",
      `Company: ${lead.company || "Unknown"}`,
      `Name: ${lead.name || "Unknown"}`,
      `Client email: ${lead.email || "Unknown"}`,
      `Preferred time: ${lead.preferredTime || "Not specified"}`,
      `Accepted at: ${lead.acceptedAt || new Date().toISOString()}`,
      "",
      "Later this is where the Zoom link and calendar details will be inserted.",
    ].join("\n"),
  };

  const clientMessage = {
    type: "meeting-accepted-client",
    to: lead.email || NOTIFICATION_EMAIL,
    subject: `Your strategy call request with ${process.env.BUSINESS_NAME || "our team"}`,
    text: [
      `Hi ${lead.name || "there"},`,
      "",
      "Thanks for reaching out. We accepted your proposed meeting time request.",
      `Requested time: ${lead.preferredTime || "To be confirmed"}`,
      "",
      "We will follow up with full meeting details soon.",
      "Later this is where the Zoom link and calendar invite can be added automatically.",
    ].join("\n"),
  };

  return [businessMessage, clientMessage];
};

const sendEmailNotification = async (message) => {
  const transporter = createTransporter();

  if (!transporter) {
    writeEmailDraft({
      ...message,
      mode: "draft",
      createdAt: new Date().toISOString(),
      note: "SMTP credentials are not configured yet, so this email was saved locally instead of being sent.",
    });
    return { delivered: false, mode: "draft" };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });

  return { delivered: true, mode: "smtp" };
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
  });
  response.end(JSON.stringify(payload));
};

const parseCookies = (request) => {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  return header.split(";").reduce((cookies, part) => {
    const [key, ...rest] = part.trim().split("=");
    cookies[key] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
};

const signTrustedDevice = (email, expiresAt, version = trustedDeviceVersion) =>
  crypto
    .createHmac("sha256", TRUSTED_DEVICE_SECRET)
    .update(`${email}:${expiresAt}:${version}`)
    .digest("hex");

const serializeTrustedDeviceCookie = (email) => {
  const expiresAt = Date.now() + TRUSTED_DEVICE_TTL_MS;
  const signature = signTrustedDevice(email, expiresAt, trustedDeviceVersion);
  const payload = Buffer.from(`${email}:${expiresAt}:${trustedDeviceVersion}:${signature}`, "utf8").toString("base64url");

  return `staff_trusted_2fa=${payload}; HttpOnly; Path=/; Max-Age=${Math.floor(
    TRUSTED_DEVICE_TTL_MS / 1000
  )}; SameSite=Strict${IS_PRODUCTION ? "; Secure" : ""}`;
};

const clearTrustedDeviceCookie = () =>
  `staff_trusted_2fa=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${IS_PRODUCTION ? "; Secure" : ""}`;

const hasTrustedDevice = (request, email) => {
  const cookies = parseCookies(request);
  const payload = cookies.staff_trusted_2fa;

  if (!payload || !email) {
    return false;
  }

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const [trustedEmail, expiresAtRaw, versionRaw, signature] = decoded.split(":");
    const expiresAt = Number(expiresAtRaw);
    const version = Number(versionRaw);

    if (!trustedEmail || !signature || !Number.isFinite(expiresAt) || !Number.isFinite(version) || Date.now() > expiresAt) {
      return false;
    }

    if (trustedEmail !== email) {
      return false;
    }

    if (version !== trustedDeviceVersion) {
      return false;
    }

    const expectedSignature = signTrustedDevice(trustedEmail, expiresAt, version);
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
};

const getStaffSession = (request) => {
  cleanupExpiredSessions();
  const cookies = parseCookies(request);
  const token = cookies.staff_session;
  if (!token) {
    return null;
  }

  return staffSessions.get(token) || null;
};

const isStaffAuthenticated = (request) => Boolean(getStaffSession(request));

const redirectToStaffLogin = (request, response) => {
  const next = encodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname + new URL(request.url, `http://${request.headers.host}`).search);
  response.writeHead(302, {
    Location: `/staff-login.html?next=${next}`,
  });
  response.end();
};

const serveFile = (requestPath, response, method) => {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(method === "HEAD" ? undefined : data);
  });
};

const server = http.createServer((request, response) => {
  clearRateLimitStore(loginRateLimitStore);
  clearRateLimitStore(leadRateLimitStore);
  cleanupExpiredChallenges();
  const url = new URL(request.url, `http://${request.headers.host}`);

  if ((request.method === "GET" || request.method === "HEAD") && STAFF_ROUTES.has(url.pathname) && !isStaffAuthenticated(request)) {
    redirectToStaffLogin(request, response);
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/staff-session") {
    sendJson(response, 200, { authenticated: isStaffAuthenticated(request) });
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/staff-trusted-status") {
    const email = normalizeText(url.searchParams.get("email"), 120).toLowerCase();
    sendJson(response, 200, {
      ok: true,
      trusted: isValidEmail(email) && STAFF_EMAILS.includes(email) ? hasTrustedDevice(request, email) : false,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/staff-login") {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const retryAfter = applyRateLimit(loginRateLimitStore, getClientIp(request), {
      windowMs: 1000 * 60 * 10,
      maxRequests: 8,
    });
    if (retryAfter) {
      response.writeHead(429, {
        "Content-Type": MIME_TYPES[".json"],
        "Retry-After": String(retryAfter),
      });
      response.end(JSON.stringify({ ok: false, error: "Too many login attempts" }));
      return;
    }

    parseJsonBody(request)
      .then(async (payload) => {
        const email = normalizeText(payload.email, 120).toLowerCase();
        const password = normalizeText(payload.password, 200);
        const isValid = await isValidStaffLogin(email, password);
        if (!isValid) {
          sendJson(response, 401, { ok: false, error: "Invalid staff credentials" });
          return;
        }

        if (hasTrustedDevice(request, email)) {
          const token = crypto.randomBytes(24).toString("hex");
          staffSessions.set(token, {
            createdAt: Date.now(),
            email,
            twoFactorVerifiedAt: Date.now(),
            trustedDevice: true,
          });
          response.writeHead(200, {
            "Content-Type": MIME_TYPES[".json"],
            "Set-Cookie": `staff_session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(
              SESSION_TTL_MS / 1000
            )}; SameSite=Strict${IS_PRODUCTION ? "; Secure" : ""}`,
            "Cache-Control": "no-store",
          });
          response.end(JSON.stringify({ ok: true, trustedDevice: true }));
          return;
        }

        const challengeToken = crypto.randomBytes(24).toString("hex");
        const code = String(Math.floor(100000 + Math.random() * 900000));
        staffChallenges.set(challengeToken, {
          email,
          code,
          createdAt: Date.now(),
          expiresAt: Date.now() + TWO_FACTOR_TTL_MS,
          attempts: 0,
        });

        try {
          const delivery = await sendEmailNotification(buildStaffTwoFactorEmail(email, code));
          sendJson(response, 200, {
            ok: true,
            requiresTwoFactor: true,
            challengeToken,
            delivery,
            ...(delivery.mode === "draft" && !IS_PRODUCTION ? { debugCode: code } : {}),
          });
        } catch {
          staffChallenges.delete(challengeToken);
          sendJson(response, 500, { ok: false, error: "Could not send verification code" });
        }
      })
      .catch((error) => {
        const statusCode = error.message === "Body too large" ? 413 : 400;
        sendJson(response, statusCode, { ok: false, error: "Invalid request body" });
      });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/staff-verify") {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const retryAfter = applyRateLimit(loginRateLimitStore, `${getClientIp(request)}:verify`, {
      windowMs: 1000 * 60 * 10,
      maxRequests: 12,
    });
    if (retryAfter) {
      response.writeHead(429, {
        "Content-Type": MIME_TYPES[".json"],
        "Retry-After": String(retryAfter),
      });
      response.end(JSON.stringify({ ok: false, error: "Too many verification attempts" }));
      return;
    }

    parseJsonBody(request)
      .then((payload) => {
        const challengeToken = normalizeText(payload.challengeToken, 120);
        const code = normalizeText(payload.code, 12);
        const rememberDevice = payload.rememberDevice === true || payload.rememberDevice === "true";
        const challenge = staffChallenges.get(challengeToken);

        if (!challenge || Date.now() > challenge.expiresAt) {
          staffChallenges.delete(challengeToken);
          sendJson(response, 401, { ok: false, error: "Verification code expired" });
          return;
        }

        challenge.attempts += 1;
        if (challenge.attempts > 5) {
          staffChallenges.delete(challengeToken);
          sendJson(response, 401, { ok: false, error: "Too many code attempts" });
          return;
        }

        if (challenge.code !== code) {
          sendJson(response, 401, { ok: false, error: "Invalid verification code" });
          return;
        }

        staffChallenges.delete(challengeToken);
        const token = crypto.randomBytes(24).toString("hex");
        staffSessions.set(token, {
          createdAt: Date.now(),
          email: challenge.email,
          twoFactorVerifiedAt: Date.now(),
        });
        const cookies = [
          `staff_session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(
            SESSION_TTL_MS / 1000
          )}; SameSite=Strict${IS_PRODUCTION ? "; Secure" : ""}`,
        ];
        if (rememberDevice) {
          cookies.push(serializeTrustedDeviceCookie(challenge.email));
        }
        response.writeHead(200, {
          "Content-Type": MIME_TYPES[".json"],
          "Set-Cookie": cookies,
          "Cache-Control": "no-store",
        });
        response.end(JSON.stringify({ ok: true }));
      })
      .catch((error) => {
        const statusCode = error.message === "Body too large" ? 413 : 400;
        sendJson(response, statusCode, { ok: false, error: "Invalid request body" });
      });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/staff-logout") {
    const cookies = parseCookies(request);
    if (cookies.staff_session) {
      staffSessions.delete(cookies.staff_session);
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[".json"],
      "Set-Cookie": "staff_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/staff-logout-all") {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const cookies = parseCookies(request);
    if (cookies.staff_session) {
      staffSessions.delete(cookies.staff_session);
    }
    staffSessions.clear();
    trustedDeviceVersion += 1;

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[".json"],
      "Set-Cookie": [
        "staff_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
        clearTrustedDeviceCookie(),
      ],
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/leads") {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    sendJson(response, 200, readLeads());
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/customers") {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    syncCustomersFromActiveLeads();
    sendJson(response, 200, readCustomers());
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/api/customers/")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const customerId = url.pathname.split("/")[3];
    const customer = readCustomers().find((entry) => String(entry.id) === String(customerId));

    if (!customer) {
      sendJson(response, 404, { ok: false, error: "Customer not found" });
      return;
    }

    sendJson(response, 200, customer);
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/api/leads/")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    const leadId = url.pathname.split("/")[3];
    const lead = readLeads().find((entry) => String(entry.id) === String(leadId));

    if (!lead) {
      sendJson(response, 404, { ok: false, error: "Lead not found" });
      return;
    }

    sendJson(response, 200, lead);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/leads") {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const retryAfter = applyRateLimit(leadRateLimitStore, getClientIp(request), {
      windowMs: 1000 * 60 * 15,
      maxRequests: 10,
    });
    if (retryAfter) {
      response.writeHead(429, {
        "Content-Type": MIME_TYPES[".json"],
        "Retry-After": String(retryAfter),
      });
      response.end(JSON.stringify({ ok: false, error: "Too many submissions" }));
      return;
    }

    parseJsonBody(request)
      .then((payload) => {
        const validation = validateLeadPayload(payload);
        if (!validation.ok) {
          sendJson(response, 400, { ok: false, error: validation.error });
          return;
        }

        const leads = readLeads();
        const newLead = {
          id: Date.now(),
          ...validation.cleaned,
          pipelineStatus: "new",
          internalNotes: [],
          activityLog: [],
          submittedAt: new Date().toISOString(),
        };
        appendLeadActivity(newLead, "created", "Lead submitted through the client intake form.");

        leads.push(newLead);
        writeLeads(leads);

        sendEmailNotification(buildLeadEmail(newLead))
          .then((emailResult) => {
            sendJson(response, 201, { ok: true, email: emailResult });
          })
          .catch(() => {
            sendJson(response, 201, {
              ok: true,
              email: { delivered: false, mode: "error" },
            });
          });
      })
      .catch((error) => {
        const statusCode = error.message === "Body too large" ? 413 : 400;
        sendJson(response, statusCode, { ok: false, error: "Invalid request body" });
      });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/leads/") && url.pathname.endsWith("/accept")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }
    const parts = url.pathname.split("/");
    const leadId = parts[3];
    const leads = readLeads();
    const lead = leads.find((entry) => String(entry.id) === String(leadId));

    if (!lead) {
      sendJson(response, 404, { ok: false, error: "Lead not found" });
      return;
    }

    lead.meetingAccepted = true;
    lead.pipelineStatus = "confirmed";
    lead.acceptedAt = new Date().toISOString();
    appendLeadActivity(lead, "meeting_confirmed", "Preferred meeting time accepted by staff.");
    writeLeads(leads);

    Promise.all(buildAcceptanceEmails(lead).map((message) => sendEmailNotification(message)))
      .then((emailResults) => {
        sendJson(response, 200, { ok: true, lead, email: emailResults });
      })
      .catch(() => {
        sendJson(response, 200, {
          ok: true,
          lead,
          email: [{ delivered: false, mode: "error" }],
        });
      });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/leads/") && url.pathname.endsWith("/status")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const parts = url.pathname.split("/");
    const leadId = parts[3];
    const leads = readLeads();
    const lead = leads.find((entry) => String(entry.id) === String(leadId));

    if (!lead) {
      sendJson(response, 404, { ok: false, error: "Lead not found" });
      return;
    }

    parseJsonBody(request)
      .then((payload) => {
        const nextStatus = normalizeText(payload.status, 40);
        const allowedStatuses = new Set(["new", "review", "confirmed", "active_client", "closed", "archived"]);

        if (!allowedStatuses.has(nextStatus)) {
          sendJson(response, 400, { ok: false, error: "Invalid lead status" });
          return;
        }

        const previousStatus = getPipelineStatus(lead);
        lead.pipelineStatus = nextStatus;
        lead.updatedAt = new Date().toISOString();
        if (nextStatus === "confirmed") {
          lead.meetingAccepted = true;
          lead.acceptedAt = lead.acceptedAt || new Date().toISOString();
        }
        appendLeadActivity(
          lead,
          "status_changed",
          `Lead moved from ${previousStatus.replaceAll("_", " ")} to ${nextStatus.replaceAll("_", " ")}.`
        );

        writeLeads(leads);
        if (nextStatus === "active_client") {
          upsertCustomerFromLead(lead);
        }
        sendJson(response, 200, { ok: true, lead });
      })
      .catch((error) => {
        const statusCode = error.message === "Body too large" ? 413 : 400;
        sendJson(response, statusCode, { ok: false, error: "Invalid request body" });
      });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/customers/")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const customerId = url.pathname.split("/")[3];
    const customers = readCustomers();
    const customer = customers.find((entry) => String(entry.id) === String(customerId));

    if (!customer) {
      sendJson(response, 404, { ok: false, error: "Customer not found" });
      return;
    }

    parseJsonBody(request)
      .then((payload) => {
        const monthlyFee = Number(payload.monthlyFee);
        const billingStatus = normalizeText(payload.billingStatus, 40) || customer.billingStatus;
        const startDate = normalizeText(payload.startDate, 40);
        const lastPaidDate = normalizeText(payload.lastPaidDate, 40);
        const nextInvoiceDate = normalizeText(payload.nextInvoiceDate, 40);
        const note = normalizeText(payload.note, 1500);

        if (Number.isFinite(monthlyFee) && monthlyFee > 0) {
          customer.monthlyFee = monthlyFee;
        }

        customer.billingStatus = billingStatus;
        customer.startDate = startDate || customer.startDate;
        customer.lastPaidDate = lastPaidDate;
        customer.nextInvoiceDate = nextInvoiceDate;
        customer.updatedAt = new Date().toISOString();

        if (note) {
          if (!Array.isArray(customer.internalNotes)) {
            customer.internalNotes = [];
          }
          customer.internalNotes.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            body: note,
            createdAt: new Date().toISOString(),
          });
          appendCustomerActivity(customer, "note_added", "Customer note added.");
        } else {
          appendCustomerActivity(customer, "customer_updated", "Customer billing details updated.");
        }

        writeCustomers(customers);
        sendJson(response, 200, { ok: true, customer });
      })
      .catch((error) => {
        const statusCode = error.message === "Body too large" ? 413 : 400;
        sendJson(response, statusCode, { ok: false, error: "Invalid request body" });
      });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/leads/") && url.pathname.endsWith("/notes")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const parts = url.pathname.split("/");
    const leadId = parts[3];
    const leads = readLeads();
    const lead = leads.find((entry) => String(entry.id) === String(leadId));

    if (!lead) {
      sendJson(response, 404, { ok: false, error: "Lead not found" });
      return;
    }

    parseJsonBody(request)
      .then((payload) => {
        const note = normalizeText(payload.note, 1500);
        if (!note) {
          sendJson(response, 400, { ok: false, error: "Note cannot be empty" });
          return;
        }

        if (!Array.isArray(lead.internalNotes)) {
          lead.internalNotes = [];
        }

        const noteEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          body: note,
          createdAt: new Date().toISOString(),
        };

        lead.internalNotes.unshift(noteEntry);
        lead.updatedAt = new Date().toISOString();
        appendLeadActivity(lead, "note_added", "Internal note added to the lead.");
        writeLeads(leads);
        sendJson(response, 200, { ok: true, lead, note: noteEntry });
      })
      .catch((error) => {
        const statusCode = error.message === "Body too large" ? 413 : 400;
        sendJson(response, statusCode, { ok: false, error: "Invalid request body" });
      });
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/leads/")) {
    if (!isStaffAuthenticated(request)) {
      sendJson(response, 401, { ok: false, error: "Unauthorized" });
      return;
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    const parts = url.pathname.split("/");
    const leadId = parts[3];
    const leads = readLeads();
    const leadIndex = leads.findIndex((entry) => String(entry.id) === String(leadId));

    if (leadIndex === -1) {
      sendJson(response, 404, { ok: false, error: "Lead not found" });
      return;
    }

    if (getPipelineStatus(leads[leadIndex]) !== "archived") {
      sendJson(response, 400, { ok: false, error: "Only archived leads can be deleted" });
      return;
    }

    const [deletedLead] = leads.splice(leadIndex, 1);
    writeLeads(leads);
    sendJson(response, 200, { ok: true, lead: deletedLead });
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveFile(url.pathname, response, request.method);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
});

ensureStorage();

if (STAFF_EMAILS.length === 1 && STAFF_EMAILS[0] === "staff@example.com") {
  console.warn("Warning: using the default staff email. Set STAFF_EMAIL or STAFF_EMAILS before deploying.");
}

if (!STAFF_PASSWORD_HASH && STAFF_PASSWORD === "changeme123") {
  console.warn("Warning: using the default staff password. Set STAFF_PASSWORD_HASH before deploying.");
}

server.listen(PORT, () => {
  console.log(`Agency starter running at http://localhost:${PORT}`);
});
