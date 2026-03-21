const setStatus = (form, message, isError = false) => {
  const status = form.querySelector(".form-status");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.style.color = isError ? "#9b2c2c" : "#1f4d42";
};

const staffLoginForm = document.getElementById("staff-login-form");
const staffLoginSubmitButton = document.getElementById("staff-login-submit-button");
const staffLoginPrimaryStep = document.getElementById("staff-login-primary-step");
const staffLoginCodeStep = document.getElementById("staff-login-code-step");
const trustedBrowserNote = document.getElementById("trusted-browser-note");
const rememberDeviceCheckboxLabel = staffLoginForm?.querySelector(".auth-checkbox");
const rememberDeviceCheckbox = staffLoginForm?.querySelector('input[name="rememberDevice"]');

const updateTrustedBrowserUi = (trusted) => {
  if (trustedBrowserNote) {
    trustedBrowserNote.hidden = !trusted;
  }
  if (rememberDeviceCheckboxLabel) {
    rememberDeviceCheckboxLabel.hidden = trusted;
  }
  if (rememberDeviceCheckbox) {
    rememberDeviceCheckbox.checked = trusted ? false : rememberDeviceCheckbox.checked;
  }
};

const checkTrustedBrowserStatus = async () => {
  if (!staffLoginForm) {
    return;
  }

  const emailInput = staffLoginForm.querySelector('input[name="email"]');
  const email = String(emailInput?.value || "").trim().toLowerCase();

  if (!email) {
    updateTrustedBrowserUi(false);
    return;
  }

  try {
    const response = await fetch(`/api/staff-trusted-status?email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error("Could not load trusted status");
    }
    const payload = await response.json();
    updateTrustedBrowserUi(Boolean(payload.trusted));
  } catch {
    updateTrustedBrowserUi(false);
  }
};

const staffLoginEmailInput = staffLoginForm?.querySelector('input[name="email"]');

staffLoginEmailInput?.addEventListener("input", () => {
  window.clearTimeout(window.__trustedStatusTimer);
  window.__trustedStatusTimer = window.setTimeout(checkTrustedBrowserStatus, 250);
});

staffLoginEmailInput?.addEventListener("change", checkTrustedBrowserStatus);
staffLoginEmailInput?.addEventListener("blur", checkTrustedBrowserStatus);

const scheduleTrustedBrowserChecks = () => {
  checkTrustedBrowserStatus();
  [150, 500, 1200].forEach((delay) => {
    window.setTimeout(checkTrustedBrowserStatus, delay);
  });
};

scheduleTrustedBrowserChecks();
window.addEventListener("load", scheduleTrustedBrowserChecks);

staffLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(staffLoginForm);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const code = String(formData.get("code") || "").trim();
  const challengeToken = String(formData.get("challengeToken") || "").trim();
  const rememberDevice = String(formData.get("rememberDevice") || "") === "true";
  const isTwoFactorStep = Boolean(challengeToken);
  setStatus(staffLoginForm, isTwoFactorStep ? "Verifying code..." : "Checking credentials...");

  try {
    const response = await fetch(isTwoFactorStep ? "/api/staff-verify" : "/api/staff-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        isTwoFactorStep
          ? { challengeToken, code, rememberDevice }
          : { email, password }
      ),
    });

    if (!response.ok) {
      throw new Error("Login failed");
    }

    const payload = await response.json();

    if (!isTwoFactorStep && payload.requiresTwoFactor) {
      if (staffLoginPrimaryStep) {
        staffLoginPrimaryStep.hidden = true;
      }
      if (staffLoginCodeStep) {
        staffLoginCodeStep.hidden = false;
      }
      const challengeInput = staffLoginForm.querySelector('input[name="challengeToken"]');
      if (challengeInput) {
        challengeInput.value = payload.challengeToken || "";
      }
      const codeInput = staffLoginForm.querySelector('input[name="code"]');
      if (codeInput) {
        codeInput.focus();
      }
      if (staffLoginSubmitButton) {
        staffLoginSubmitButton.textContent = "Verify and sign in";
      }
      const localPreviewNote = payload.debugCode ? ` Local preview code: ${payload.debugCode}` : "";
      setStatus(staffLoginForm, `Verification code sent.${localPreviewNote}`);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "staff-portal.html";
    window.location.href = next;
  } catch {
    setStatus(
      staffLoginForm,
      isTwoFactorStep
        ? "Invalid or expired verification code. Try again."
        : "Incorrect staff email or password. Try again.",
      true
    );
  }
});

const logoutButton = document.getElementById("staff-logout-button");
const logoutAllButton = document.getElementById("staff-logout-all-button");

logoutButton?.addEventListener("click", async () => {
  try {
    await fetch("/api/staff-logout", { method: "POST" });
  } catch {
    // Ignore and continue redirecting.
  }

  window.location.href = "staff-login.html";
});

logoutAllButton?.addEventListener("click", async () => {
  try {
    await fetch("/api/staff-logout-all", { method: "POST" });
  } catch {
    // Ignore and continue redirecting.
  }

  window.location.href = "staff-login.html";
});

const leadForms = document.querySelectorAll(".lead-form");

leadForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector("button");
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    setStatus(form, "Saving your project brief...");

    if (button) {
      button.disabled = true;
      button.textContent = "Sending";
    }

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Lead submission failed");
      }

      window.location.href = "thanks.html";
    } catch (error) {
      const bookCallSection = document.getElementById("book-call");
      const isPublicStaticMode =
        window.location.protocol.startsWith("http") &&
        !window.location.hostname.includes("localhost") &&
        !window.location.hostname.includes("127.0.0.1");

      if (isPublicStaticMode && bookCallSection) {
        setStatus(form, "Thanks. Your details are noted on your device for now. Book your call below.");
        if (button) {
          button.disabled = false;
          button.textContent = "Send details";
        }
        try {
          window.localStorage.setItem(
            "clientBriefDraft",
            JSON.stringify({
              name: payload.name || "",
              email: payload.email || "",
              company: payload.company || "",
              projectType: payload.projectType || "",
              goal: payload.goal || "",
              style: payload.style || "",
              message: payload.message || "",
              savedAt: new Date().toISOString(),
            })
          );
        } catch {
          // Ignore storage failures on static deploys.
        }
        bookCallSection.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      setStatus(form, "Something went wrong. Please try again.", true);
      if (button) {
        button.disabled = false;
        button.textContent = "Send details";
      }
    }
  });
});

const calendlyPlaceholder = document.getElementById("calendly-placeholder");

if (calendlyPlaceholder) {
  const calendlyUrl = calendlyPlaceholder.dataset.calendlyUrl;
  const calendlyLink = document.getElementById("calendly-link");

  if (calendlyLink) {
    if (calendlyUrl) {
      calendlyLink.href = calendlyUrl;
      calendlyLink.textContent = "Book via Calendly";
    } else {
      calendlyLink.href = "#";
      calendlyLink.textContent = "Add Calendly URL later";
      calendlyLink.addEventListener("click", (event) => {
        event.preventDefault();
      });
    }
  }
}

const leadsList = document.getElementById("leads-list");
const leadsListNew = document.getElementById("leads-list-new");
const leadsListReview = document.getElementById("leads-list-review");
const leadsListConfirmed = document.getElementById("leads-list-confirmed");
const leadsListActive = document.getElementById("leads-list-active");
const leadsListClosed = document.getElementById("leads-list-closed");
const leadsListArchived = document.getElementById("leads-list-archived");
const customersList = document.getElementById("customers-list");
const leadSearchInput = document.getElementById("lead-search-input");
const leadStageFilter = document.getElementById("lead-stage-filter");
const leadSortSelect = document.getElementById("lead-sort-select");
const pipelineColumns = Array.from(document.querySelectorAll(".pipeline-column[data-pipeline-status]"));
let draggedLeadId = null;
let draggedFromStatus = null;
let suppressLeadCardClick = false;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Unknown";
  }
};

const getLeadStage = (lead) => {
  if (lead.pipelineStatus === "active_client") {
    return {
      label: "Active client",
      tone: "active",
      summary: "This lead has moved forward and is now an active client in the pipeline.",
      nextAction: "Focus on delivery, proposal follow-through, and any next implementation steps.",
      readiness: "Converted. The conversation has moved beyond lead review and into active work.",
    };
  }

  if (lead.pipelineStatus === "closed") {
    return {
      label: "Closed",
      tone: "closed",
      summary: "This lead has been closed out and is no longer active in the current sales flow.",
      nextAction: "Keep the record for reference or archive it when you no longer need it in the main pipeline.",
      readiness: "Complete. This lead is no longer waiting on staff action.",
    };
  }

  if (lead.pipelineStatus === "archived") {
    return {
      label: "Archived",
      tone: "archived",
      summary: "This lead has been archived and moved out of the active workflow.",
      nextAction: "Keep it for records or delete it if it is just old test data you no longer need.",
      readiness: "Inactive. This record is no longer part of the working pipeline.",
    };
  }

  if (lead.pipelineStatus === "confirmed") {
    return {
      label: "Call confirmed",
      tone: "confirmed",
      summary: "The proposed call time has been accepted and this lead is ready for the meeting.",
      nextAction: "Review the proposal notes, email draft, and prep points before the call starts.",
      readiness: "High. The lead has a confirmed time and the prep workspace is already available.",
    };
  }

  if (lead.pipelineStatus === "review") {
    return {
      label: "Needs schedule review",
      tone: "review",
      summary: "The client submitted a preferred time, but staff still needs to confirm whether it works.",
      nextAction: "Review the request, decide if the proposed time works, and accept it if you are ready to lock in the call.",
      readiness: "Medium. The brief is in, but the call is not confirmed yet.",
    };
  }

  if (lead.pipelineStatus === "new") {
    return {
      label: "New lead",
      tone: "new",
      summary: "The project brief came in, but there is no confirmed meeting time yet.",
      nextAction: "Review the brief, follow up if needed, and guide the lead toward a booked strategy call.",
      readiness: "Early stage. Strong enough to review, but not ready for a real meeting yet.",
    };
  }

  if (lead.meetingAccepted) {
    return {
      label: "Call confirmed",
      tone: "confirmed",
      summary: "The proposed call time has been accepted and this lead is ready for the meeting.",
      nextAction: "Review the proposal notes, email draft, and prep points before the call starts.",
      readiness: "High. The lead has a confirmed time and the prep workspace is already available.",
    };
  }

  if (lead.preferredTime) {
    return {
      label: "Needs schedule review",
      tone: "review",
      summary: "The client submitted a preferred time, but staff still needs to confirm whether it works.",
      nextAction: "Review the request, decide if the proposed time works, and accept it if you are ready to lock in the call.",
      readiness: "Medium. The brief is in, but the call is not confirmed yet.",
    };
  }

  return {
    label: "New lead",
    tone: "new",
    summary: "The project brief came in, but there is no confirmed meeting time yet.",
    nextAction: "Review the brief, follow up if needed, and guide the lead toward a booked strategy call.",
    readiness: "Early stage. Strong enough to review, but not ready for a real meeting yet.",
  };
};

const stageBadge = (stage) => `<span class="status-badge status-badge-${stage.tone}">${escapeHtml(stage.label)}</span>`;

const stageOptions = [
  { value: "new", label: "New" },
  { value: "review", label: "Needs Review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "active_client", label: "Active Client" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

const renderLeadCard = (lead) => {
  const stage = getLeadStage(lead);
  const pipelineStatus = lead.pipelineStatus || "new";
  return `
    <article class="summary-card lead-card-shell">
      <button
        class="lead-card-button"
        type="button"
        draggable="true"
        data-lead-id="${escapeHtml(lead.id)}"
        data-pipeline-status="${escapeHtml(pipelineStatus)}"
      >
        <div class="lead-card-top">
          ${stageBadge(stage)}
        </div>
        <h3>${escapeHtml(lead.company || "Untitled company")}</h3>
        <p><strong>Name:</strong> ${escapeHtml(lead.name || "Unknown")}</p>
        <p><strong>Email:</strong> ${escapeHtml(lead.email || "Unknown")}</p>
        <p><strong>Project:</strong> ${escapeHtml(lead.projectType || "Unknown")}</p>
        <p><strong>Status:</strong> ${escapeHtml(stage.label)}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(formatDate(lead.submittedAt))}</p>
        <p><strong>Next step:</strong> ${escapeHtml(stage.nextAction)}</p>
      </button>
      <div class="lead-card-mobile-actions">
        <label class="lead-mobile-label">
          <span>Move lead</span>
          <select class="lead-mobile-stage-select" data-lead-id="${escapeHtml(lead.id)}">
            ${stageOptions
              .map(
                (option) => `
                  <option value="${escapeHtml(option.value)}"${option.value === pipelineStatus ? " selected" : ""}>
                    ${escapeHtml(option.label)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>
      </div>
    </article>
  `;
};

const setPipelineColumn = (element, leads, emptyTitle, emptyCopy) => {
  if (!element) {
    return;
  }

  if (!leads.length) {
    element.innerHTML = `
      <article class="summary-card pipeline-empty">
        <h3>${escapeHtml(emptyTitle)}</h3>
        <p>${escapeHtml(emptyCopy)}</p>
      </article>
    `;
    return;
  }

  element.innerHTML = leads.map((lead) => renderLeadCard(lead)).join("");
};

const updatePipelineMetrics = (leads) => {
  const visibleLeads = getVisibleLeads(leads);
  const total = Array.isArray(visibleLeads) ? visibleLeads.length : 0;
  const confirmed = Array.isArray(visibleLeads)
    ? visibleLeads.filter((lead) => getStageTone(lead) === "confirmed").length
    : 0;
  const pending = Math.max(0, total - confirmed);

  const totalNode = document.getElementById("pipeline-total");
  const pendingNode = document.getElementById("pipeline-pending");
  const confirmedNode = document.getElementById("pipeline-confirmed");

  if (totalNode) {
    totalNode.textContent = `${total} active lead${total === 1 ? "" : "s"}`;
  }
  if (pendingNode) {
    pendingNode.textContent = `${pending} awaiting action`;
  }
  if (confirmedNode) {
    confirmedNode.textContent = `${confirmed} confirmed`;
  }
};

const renderCustomers = (customers) => {
  if (!customersList) {
    return;
  }

  if (!Array.isArray(customers) || !customers.length) {
    customersList.innerHTML = `
      <article class="summary-card">
        <h3>No customers yet</h3>
        <p>Move a lead into Active Client and it will appear here automatically.</p>
      </article>
    `;
    return;
  }

  const totalNode = document.getElementById("customers-total");
  const revenueNode = document.getElementById("customers-revenue");
  const activeBillingNode = document.getElementById("customers-active-billing");
  const totalRevenue = customers.reduce((sum, customer) => sum + (Number(customer.monthlyFee) || 0), 0);
  const activeBillingCount = customers.filter((customer) => customer.billingStatus === "active").length;

  if (totalNode) {
    totalNode.textContent = `${customers.length} client${customers.length === 1 ? "" : "s"}`;
  }
  if (revenueNode) {
    revenueNode.textContent = `$${totalRevenue}/mo`;
  }
  if (activeBillingNode) {
    activeBillingNode.textContent = `${activeBillingCount} active`;
  }

  customersList.innerHTML = customers
    .slice()
    .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime())
    .map(
      (customer) => `
        <article class="summary-card">
          <h3>${escapeHtml(customer.company || "Untitled customer")}</h3>
          <p><strong>Billing:</strong> <span class="status-badge status-badge-${escapeHtml(customer.billingStatus || "active")}">${escapeHtml(customer.billingStatus || "active")}</span></p>
          <p><strong>Name:</strong> ${escapeHtml(customer.name || "Unknown")}</p>
          <p><strong>Email:</strong> ${escapeHtml(customer.email || "Unknown")}</p>
          <p><strong>Project:</strong> ${escapeHtml(customer.projectType || "Unknown")}</p>
          <p><strong>Goal:</strong> ${escapeHtml(customer.goal || "Not set")}</p>
          <p><strong>Start date:</strong> ${escapeHtml(customer.startDate || "Not set")}</p>
          <p><strong>Last paid:</strong> ${escapeHtml(customer.lastPaidDate || "Not set")}</p>
          <p><strong>Next invoice:</strong> ${escapeHtml(customer.nextInvoiceDate || "Not set")}</p>
          <form class="customer-form" data-customer-id="${escapeHtml(customer.id)}">
            <label>
              Monthly fee
              <input type="number" name="monthlyFee" min="50" max="1000" step="1" value="${escapeHtml(customer.monthlyFee || 99)}" />
            </label>
            <label>
              Billing status
              <select name="billingStatus">
                <option value="active"${customer.billingStatus === "active" ? " selected" : ""}>Active</option>
                <option value="paused"${customer.billingStatus === "paused" ? " selected" : ""}>Paused</option>
                <option value="pending"${customer.billingStatus === "pending" ? " selected" : ""}>Pending</option>
                <option value="canceled"${customer.billingStatus === "canceled" ? " selected" : ""}>Canceled</option>
              </select>
            </label>
            <label>
              Start date
              <input type="date" name="startDate" value="${escapeHtml(customer.startDate || "")}" />
            </label>
            <label>
              Last paid date
              <input type="date" name="lastPaidDate" value="${escapeHtml(customer.lastPaidDate || "")}" />
            </label>
            <label>
              Next invoice date
              <input type="date" name="nextInvoiceDate" value="${escapeHtml(customer.nextInvoiceDate || "")}" />
            </label>
            <label>
              Internal note
              <textarea name="note" rows="3" placeholder="Add customer notes, billing context, or next steps."></textarea>
            </label>
            <div class="contact-actions">
              <button class="button button-primary" type="submit">Save customer</button>
            </div>
            <p class="form-status" aria-live="polite"></p>
          </form>
          <p><strong>Latest note:</strong> ${escapeHtml(customer.internalNotes?.[0]?.body || "No internal notes yet.")}</p>
        </article>
      `
    )
    .join("");

  customersList.querySelectorAll(".customer-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const customerId = form.dataset.customerId;
      const formData = new FormData(form);
      const payload = {
        monthlyFee: Number(formData.get("monthlyFee")),
        billingStatus: String(formData.get("billingStatus") || ""),
        startDate: String(formData.get("startDate") || ""),
        lastPaidDate: String(formData.get("lastPaidDate") || ""),
        nextInvoiceDate: String(formData.get("nextInvoiceDate") || ""),
        note: String(formData.get("note") || "").trim(),
      };

      setStatus(form, "Saving customer details...");

      try {
        const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Failed to save customer");
        }

        const customersResponse = await fetch("/api/customers");
        if (!customersResponse.ok) {
          throw new Error("Failed to refresh customers");
        }

        const customersData = await customersResponse.json();
        renderCustomers(Array.isArray(customersData) ? customersData : []);
      } catch {
        setStatus(form, "Could not save customer details. Try again.", true);
      }
    });
  });
};

const buildMockup = (lead) => {
  const company = lead.company || "this business";
  const goal = lead.goal || "building a clearer website presence";
  const projectType = lead.projectType || "website project";
  const style = lead.style || "modern and trustworthy";

  return {
    title: `Starter mockup direction for ${company}.`,
    hero: `Create a homepage hero that quickly explains ${company}'s offer and reinforces the goal of ${goal.toLowerCase()}.`,
    pages: `Recommended structure: home, services, about, contact, testimonials, plus a dedicated page for the ${projectType.toLowerCase()}.`,
    style: `Visual direction: ${style}. Pair that with trust-building sections, clearer calls to action, and stronger proof points.`,
  };
};

const buildProposal = (lead) => {
  const company = lead.company || "this business";
  const name = lead.name || "the client";
  const goal = lead.goal || "improve online clarity";
  const style = lead.style || "modern and trustworthy";
  const projectType = lead.projectType || "website project";
  const message = lead.message || "The client wants a stronger digital presence.";

  return {
    headline: `${company} should have a website that makes the offer clear and turns more visitors into conversations.`,
    subcopy: `This ${projectType.toLowerCase()} should be designed around ${goal.toLowerCase()}, with a ${style.toLowerCase()} presentation that helps ${company} feel more established from the first few seconds.`,
    cta: `Primary CTA recommendation: push visitors toward booking, calling, requesting a quote, or taking the clearest next action for ${company}.`,
    sections:
      "Suggested order: hero, credibility snapshot, core services, project/gallery proof, why choose this business, testimonials or trust signals, strong contact CTA.",
    proof:
      "Prioritize trust elements like project photos, service highlights, client outcomes, social proof, and a simple explanation of the process.",
    angle: `Sales angle: frame the site as the tool that helps ${company} look more credible, explain the offer faster, and support ${goal.toLowerCase()}.`,
    package: `Recommended starting package: ${projectType} with homepage strategy, core page structure, mobile-friendly design, and a stronger conversion path.`,
    why: `${name} is already signaling that the business needs a better first impression and a clearer way to turn interest into action. The site should solve that before anything more advanced is added.`,
    nextStep: `Best next step: confirm the scope on the call, align on the visual direction (${style.toLowerCase()}), and decide what pages or features are essential for launch first.`,
    internalNote: `Client note: ${message}`,
  };
};

const buildEmailDraft = (lead) => {
  const company = lead.company || "your business";
  const name = lead.name || "there";
  const goal = lead.goal || "improve your site direction";
  const projectType = lead.projectType || "website project";
  const proposal = buildProposal(lead);

  return {
    subject: `Mockup direction for ${company}`,
    greeting: `Hi ${name},`,
    intro: `Thanks again for reaching out about the ${projectType.toLowerCase()} for ${company}. Based on what you shared, I pulled together an initial direction for how the site could be positioned.`,
    direction: proposal.headline,
    summaryPoints: [
      `Main goal: ${goal}`,
      `Recommended visual direction: ${lead.style || "Modern and trustworthy"}`,
      `Suggested structure: hero, services, proof, why choose you, and a strong contact CTA`,
    ],
    closing: `If this direction feels aligned, the next step would be to confirm scope, prioritize the essential pages, and move into the first design pass.`,
    signoff: "Plipit",
  };
};

const buildProposalPreview = (lead) => {
  const company = lead.company || "this business";
  const projectType = lead.projectType || "website project";
  const goal = lead.goal || "improve clarity and conversion";
  const style = lead.style || "modern and trustworthy";
  const lowerProjectType = projectType.toLowerCase();
  const lowerGoal = goal.toLowerCase();
  const companyText = `${company} ${projectType} ${goal} ${lead.message || ""} ${lead.style || ""}`.toLowerCase();
  const localServiceKeywords = ["pool", "landscape", "gardening", "garden", "cleaning", "pressure washing", "detailing", "roofing", "plumbing", "electrical", "dental"];
  const isLocalService = localServiceKeywords.some((keyword) => companyText.includes(keyword));
  const monthlyPlan = {
    name: "Simple Website Partner Plan",
    price: "$99/mo",
    copy: "One simple monthly plan that includes the website itself, hosting, light updates, support, and the first version of the site built into the package.",
  };

  const depositLine = "Suggested payment structure: keep it simple. No large upfront build fee for now, just the $99 monthly plan so the offer is easy to understand and easy to say yes to.";

  const kickoffLine = "Kickoff should stay focused: clarify the homepage message, the essential service pages, and the fastest clean version of the site to launch first.";

  const addonOptions = isLocalService
    ? [
        "Extra location or service page after launch: priced separately if needed later.",
        "Lead form or quote request upgrade once the base site starts converting.",
        "Photo gallery or proof section expansion after initial launch.",
      ]
    : [
        "Additional pages or more advanced workflows can be scoped later once the base monthly package proves out.",
        "Booking, intake, or automation layers can be added as a second phase once results are established.",
        "Copywriting and conversion refinements can be layered in over time instead of overbuilding day one.",
      ];

  const nextSteps = [
    "Confirm the simple monthly package and what must be included at launch.",
    "Approve the kickoff window and the first version of the sitemap.",
    "Align on the first draft direction so design and copy can begin.",
  ];

  return {
    stageHeadline: `${company} needs a ${style.toLowerCase()} web presence that supports ${goal.toLowerCase()}.`,
    stageCopy: `This draft is meant to guide the live conversation around what the site should communicate first, what should be included at launch, and how the project can move forward without overcomplicating the first version.`,
    highlight: `Lead with a ${lowerProjectType} that makes the offer easier to understand, builds trust faster, and gives visitors a clearer path to take action.`,
    scopeTitle: `Recommended ${lowerProjectType} scope for ${company}.`,
    deliverables: `Homepage direction, key page structure, mobile-friendly design approach, stronger calls to action, and messaging that supports ${lowerGoal}.`,
    timeline: "Recommended timeline: discovery and structure first, then design direction, then build and final revisions.",
    action: "Best next step: confirm priorities from the call, align on pages and functionality, then move into the first design phase.",
    fit: `This scope fits because the project is clearly centered on ${lowerGoal} and needs a more polished presentation with a ${style.toLowerCase()} feel.`,
    addons:
      "Keep the starting package simple for niche service companies. Add anything more advanced later only after the first version is live and working.",
    followup:
      "Follow-up angle: reinforce clarity, trust, and conversion. Position the project as the fastest way to make the business easier to understand and easier to contact.",
    monthlyPlan,
    investmentSummary: `Starting point: ${monthlyPlan.name} at ${monthlyPlan.price}. Keep the offer simple while you target niche service businesses and build proof that the model works.`,
    timelineSummary:
      "A realistic path is strategy first, then visual direction, then build. Keep the first version tight so the client can launch quickly and start seeing results.",
    callGuidance: "On the call, keep the offer simple. Position this as a straightforward $99 monthly website plan for local service businesses that need a clean online presence without a large upfront cost.",
    retainerSummary: `Monthly plan: ${monthlyPlan.name} at ${monthlyPlan.price}. This keeps the offer approachable for businesses like gardening, landscaping, pool service, and similar niche operators.`,
    smallBusinessNote:
      "For companies like gardening, landscaping, pool service, cleaning, detailing, and similar local operators, a simple low monthly price is easier to understand and easier to say yes to.",
    retainerTiming:
      "Lead with the monthly model from the start instead of pitching a big upfront build. That keeps the sales conversation lighter while you are still building your reputation.",
    depositLine,
    kickoffLine,
    addonOptions,
    nextSteps,
    sendReadySummary: `If ${company} wants to move forward, the clearest next move is to approve the monthly package, confirm the kickoff window, and start building the first version of the site.`,
  };
};

let cachedLeads = [];

const getStageTone = (lead) => getLeadStage(lead).tone;

const getVisibleLeads = (leads) => {
  const searchTerm = String(leadSearchInput?.value || "")
    .trim()
    .toLowerCase();
  const stageFilter = String(leadStageFilter?.value || "all");
  const sortValue = String(leadSortSelect?.value || "newest");

  let nextLeads = Array.isArray(leads) ? leads.slice() : [];

  if (searchTerm) {
    nextLeads = nextLeads.filter((lead) => {
      const haystack = [
        lead.company,
        lead.name,
        lead.email,
        lead.projectType,
        lead.goal,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  if (stageFilter !== "all") {
    nextLeads = nextLeads.filter((lead) => {
      const tone = getStageTone(lead);
      if (stageFilter === "open") {
        return tone !== "closed" && tone !== "archived";
      }
      if (stageFilter === "active") {
        return tone === "active";
      }
      return tone === stageFilter;
    });
  }

  nextLeads.sort((left, right) => {
    if (sortValue === "oldest") {
      return new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
    }

    if (sortValue === "company") {
      return String(left.company || "").localeCompare(String(right.company || ""));
    }

    if (sortValue === "status") {
      return getLeadStage(left).label.localeCompare(getLeadStage(right).label);
    }

    return new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime();
  });

  return nextLeads;
};

const renderLeadList = (leads) => {
  if (!leadsList) {
    return;
  }

  const visibleLeads = getVisibleLeads(leads);

  if (!Array.isArray(visibleLeads) || visibleLeads.length === 0) {
    setPipelineColumn(
      leadsListNew,
      [],
      "No matching leads",
      "Try a different search, filter, or sort to widen the board again."
    );
    setPipelineColumn(
      leadsListReview,
      [],
      "Nothing waiting",
      "No matching leads are currently sitting in review."
    );
    setPipelineColumn(
      leadsListConfirmed,
      [],
      "Nothing confirmed",
      "No matching leads currently have a confirmed call."
    );
    setPipelineColumn(leadsListActive, [], "No active clients", "No matching leads are active clients right now.");
    setPipelineColumn(leadsListClosed, [], "No closed leads", "No matching leads are in the closed lane.");
    setPipelineColumn(leadsListArchived, [], "Nothing archived", "No matching leads are in the archived lane.");
    ["pipeline-new-count","pipeline-review-count","pipeline-confirmed-count","pipeline-active-count","pipeline-closed-count","pipeline-archived-count"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) {
        node.textContent = "0";
      }
    });
    return;
  }

  const orderedLeads = visibleLeads;
  const newLeads = orderedLeads.filter((lead) => getLeadStage(lead).tone === "new");
  const reviewLeads = orderedLeads.filter((lead) => getLeadStage(lead).tone === "review");
  const confirmedLeads = orderedLeads.filter((lead) => getLeadStage(lead).tone === "confirmed");
  const activeLeads = orderedLeads.filter((lead) => getLeadStage(lead).tone === "active");
  const closedLeads = orderedLeads.filter((lead) => getLeadStage(lead).tone === "closed");
  const archivedLeads = orderedLeads.filter((lead) => getLeadStage(lead).tone === "archived");

  setPipelineColumn(
    leadsListNew,
    newLeads,
    "No brand-new leads",
    "Fresh submissions without a scheduled call will appear here."
  );
  setPipelineColumn(
    leadsListReview,
    reviewLeads,
    "Nothing waiting on review",
    "Leads with submitted time requests will appear here."
  );
  setPipelineColumn(
    leadsListConfirmed,
    confirmedLeads,
    "No confirmed calls yet",
    "Accepted and call-ready leads will appear here."
  );
  setPipelineColumn(
    leadsListActive,
    activeLeads,
    "No active clients yet",
    "Leads you decide to move forward with will appear here."
  );
  setPipelineColumn(
    leadsListClosed,
    closedLeads,
    "No closed leads yet",
    "Leads you close out without ongoing action will appear here."
  );
  setPipelineColumn(
    leadsListArchived,
    archivedLeads,
    "Nothing archived yet",
    "Archived or old records will appear here."
  );

  const newCount = document.getElementById("pipeline-new-count");
  const reviewCount = document.getElementById("pipeline-review-count");
  const confirmedCount = document.getElementById("pipeline-confirmed-count");
  const activeCount = document.getElementById("pipeline-active-count");
  const closedCount = document.getElementById("pipeline-closed-count");
  const archivedCount = document.getElementById("pipeline-archived-count");

  if (newCount) {
    newCount.textContent = String(newLeads.length);
  }
  if (reviewCount) {
    reviewCount.textContent = String(reviewLeads.length);
  }
  if (confirmedCount) {
    confirmedCount.textContent = String(confirmedLeads.length);
  }
  if (activeCount) {
    activeCount.textContent = String(activeLeads.length);
  }
  if (closedCount) {
    closedCount.textContent = String(closedLeads.length);
  }
  if (archivedCount) {
    archivedCount.textContent = String(archivedLeads.length);
  }

  leadsList.querySelectorAll(".lead-card-button").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      draggedLeadId = button.dataset.leadId || null;
      draggedFromStatus = button.dataset.pipelineStatus || null;
      suppressLeadCardClick = true;
      button.classList.add("lead-card-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedLeadId || "");
      }
    });

    button.addEventListener("dragend", () => {
      button.classList.remove("lead-card-dragging");
      draggedLeadId = null;
      draggedFromStatus = null;
      pipelineColumns.forEach((column) => column.classList.remove("pipeline-column-active"));
      window.setTimeout(() => {
        suppressLeadCardClick = false;
      }, 0);
    });

    button.addEventListener("click", () => {
      if (suppressLeadCardClick) {
        return;
      }
      window.location.href = `lead.html?id=${encodeURIComponent(button.dataset.leadId)}`;
    });
  });

  leadsList.querySelectorAll(".lead-mobile-stage-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const leadId = select.dataset.leadId;
      const nextStatus = select.value;
      const previousLeads = cachedLeads.slice();

      if (!leadId || !nextStatus) {
        return;
      }

      cachedLeads = cachedLeads.map((lead) =>
        String(lead.id) === String(leadId) ? { ...lead, pipelineStatus: nextStatus } : lead
      );
      updatePipelineMetrics(cachedLeads);
      renderLeadList(cachedLeads);

      try {
        const updatedLead = await updateLeadPipelineStatus(leadId, nextStatus);
        cachedLeads = cachedLeads.map((lead) =>
          String(lead.id) === String(updatedLead.id) ? updatedLead : lead
        );
        updatePipelineMetrics(cachedLeads);
        renderLeadList(cachedLeads);
      } catch {
        cachedLeads = previousLeads;
        updatePipelineMetrics(cachedLeads);
        renderLeadList(cachedLeads);
      }
    });
  });
};

const attachPipelineDragTargets = () => {
  pipelineColumns.forEach((column) => {
    const nextStatus = column.dataset.pipelineStatus;

    column.addEventListener("dragover", (event) => {
      if (!draggedLeadId || !nextStatus) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = draggedFromStatus === nextStatus ? "none" : "move";
      }
      column.classList.add("pipeline-column-active");
    });

    column.addEventListener("dragleave", (event) => {
      if (!column.contains(event.relatedTarget)) {
        column.classList.remove("pipeline-column-active");
      }
    });

    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("pipeline-column-active");

      if (!draggedLeadId || !nextStatus || draggedFromStatus === nextStatus) {
        return;
      }

      const previousLeads = cachedLeads.slice();
      cachedLeads = cachedLeads.map((lead) =>
        String(lead.id) === String(draggedLeadId) ? { ...lead, pipelineStatus: nextStatus } : lead
      );
      updatePipelineMetrics(cachedLeads);
      renderLeadList(cachedLeads);

      try {
        const updatedLead = await updateLeadPipelineStatus(draggedLeadId, nextStatus);
        cachedLeads = cachedLeads.map((lead) =>
          String(lead.id) === String(updatedLead.id) ? updatedLead : lead
        );
        updatePipelineMetrics(cachedLeads);
        renderLeadList(cachedLeads);
      } catch {
        cachedLeads = previousLeads;
        updatePipelineMetrics(cachedLeads);
        renderLeadList(cachedLeads);
      }
    });
  });
};

attachPipelineDragTargets();

if (leadsList) {
  fetch("/api/leads")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load leads");
      }

      return response.json();
    })
    .then((leads) => {
      cachedLeads = Array.isArray(leads) ? leads : [];
      updatePipelineMetrics(cachedLeads);
      renderLeadList(cachedLeads);
    })
    .catch(() => {
      leadsList.innerHTML = `
        <article class="summary-card">
          <h3>Could not load leads</h3>
          <p>Make sure the local server is running before opening this page.</p>
        </article>
      `;
    });
}

if (customersList) {
  fetch("/api/customers")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load customers");
      }

      return response.json();
    })
    .then((customers) => {
      renderCustomers(Array.isArray(customers) ? customers : []);
    })
    .catch(() => {
      customersList.innerHTML = `
        <article class="summary-card">
          <h3>Could not load customers</h3>
          <p>Make sure the local server is running and at least one lead has been moved to Active Client.</p>
        </article>
      `;
    });
}

[leadSearchInput, leadStageFilter, leadSortSelect].forEach((control) => {
  control?.addEventListener("input", () => {
    updatePipelineMetrics(getVisibleLeads(cachedLeads));
    renderLeadList(cachedLeads);
  });
  control?.addEventListener("change", () => {
    updatePipelineMetrics(getVisibleLeads(cachedLeads));
    renderLeadList(cachedLeads);
  });
});

const acceptButton = document.getElementById("accept-time-button");
const markActiveButton = document.getElementById("mark-active-button");
const markClosedButton = document.getElementById("mark-closed-button");
const archiveLeadButton = document.getElementById("archive-lead-button");
const deleteLeadButton = document.getElementById("delete-lead-button");
const leadNoteForm = document.getElementById("lead-note-form");
const leadNoteInput = document.getElementById("lead-note-input");

const updateLeadActionButtons = (lead) => {
  if (!markActiveButton || !markClosedButton || !archiveLeadButton || !deleteLeadButton) {
    return;
  }

  const stage = getLeadStage(lead);
  markActiveButton.hidden = stage.tone === "active" || stage.tone === "archived";
  markClosedButton.hidden = stage.tone === "closed" || stage.tone === "archived";
  archiveLeadButton.hidden = stage.tone === "archived";
  deleteLeadButton.hidden = stage.tone !== "archived";
};

const setLeadActionStatus = (message, isError = false) => {
  const status = document.getElementById("lead-action-status");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.style.color = isError ? "#9b2c2c" : "#1f4d42";
};

const applyLeadStageToDetail = (lead) => {
  const stage = getLeadStage(lead);
  const stageBadgeNode = document.getElementById("lead-stage-badge");
  document.getElementById("metric-status").textContent = stage.label;
  document.getElementById("pipeline-stage-copy").textContent = stage.summary;
  document.getElementById("pipeline-next-action").textContent = stage.nextAction;
  document.getElementById("pipeline-readiness").textContent = stage.readiness;
  document.getElementById("schedule-status-copy").textContent = lead.meetingAccepted
    ? "The call is confirmed. Later this is where Zoom and calendar details can plug in."
    : `Review the requested time and accept it if it works.`;
  if (stageBadgeNode) {
    stageBadgeNode.textContent = stage.label;
    stageBadgeNode.className = `status-badge status-badge-${stage.tone}`;
  }
  updateLeadActionButtons(lead);
};

const renderLeadNotes = (lead) => {
  const notesList = document.getElementById("lead-notes-list");
  if (!notesList) {
    return;
  }

  const notes = Array.isArray(lead.internalNotes) ? lead.internalNotes : [];
  if (!notes.length) {
    notesList.innerHTML = `
      <article class="summary-card">
        <h3>No notes yet</h3>
        <p>Add internal notes here so you and your partner keep context on the lead.</p>
      </article>
    `;
    return;
  }

  notesList.innerHTML = notes
    .map(
      (note) => `
        <article class="summary-card">
          <h3>${escapeHtml(formatDate(note.createdAt))}</h3>
          <p>${escapeHtml(note.body || "")}</p>
        </article>
      `
    )
    .join("");
};

const renderLeadActivity = (lead) => {
  const activityList = document.getElementById("lead-activity-list");
  if (!activityList) {
    return;
  }

  const activity = Array.isArray(lead.activityLog) ? lead.activityLog : [];
  if (!activity.length) {
    activityList.innerHTML = `
      <article class="summary-card">
        <h3>No activity yet</h3>
        <p>Important lead events will show up here as the record changes.</p>
      </article>
    `;
    return;
  }

  activityList.innerHTML = activity
    .map(
      (entry) => `
        <article class="summary-card">
          <h3>${escapeHtml(entry.message || "Lead updated")}</h3>
          <p><strong>When:</strong> ${escapeHtml(formatDate(entry.createdAt))}</p>
          <p><strong>Type:</strong> ${escapeHtml(String(entry.type || "update").replaceAll("_", " "))}</p>
        </article>
      `
    )
    .join("");
};

const updateLeadPipelineStatus = async (leadId, status) => {
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error("Failed to update lead");
  }

  const payload = await response.json();
  return payload.lead;
};

markActiveButton?.addEventListener("click", async () => {
  const leadId = markActiveButton.dataset.leadId;
  if (!leadId) {
    return;
  }

  setLeadActionStatus("Marking as active client...");
  try {
    const lead = await updateLeadPipelineStatus(leadId, "active_client");
    applyLeadStageToDetail(lead);
    setLeadActionStatus("Lead moved to Active Client.");
  } catch {
    setLeadActionStatus("Could not update that lead. Try again.", true);
  }
});

markClosedButton?.addEventListener("click", async () => {
  const leadId = markClosedButton.dataset.leadId;
  if (!leadId) {
    return;
  }

  setLeadActionStatus("Marking as closed...");
  try {
    const lead = await updateLeadPipelineStatus(leadId, "closed");
    applyLeadStageToDetail(lead);
    setLeadActionStatus("Lead marked as Closed.");
  } catch {
    setLeadActionStatus("Could not update that lead. Try again.", true);
  }
});

archiveLeadButton?.addEventListener("click", async () => {
  const leadId = archiveLeadButton.dataset.leadId;
  if (!leadId) {
    return;
  }

  setLeadActionStatus("Archiving lead...");
  try {
    const lead = await updateLeadPipelineStatus(leadId, "archived");
    applyLeadStageToDetail(lead);
    setLeadActionStatus("Lead archived.");
  } catch {
    setLeadActionStatus("Could not archive that lead. Try again.", true);
  }
});

deleteLeadButton?.addEventListener("click", async () => {
  const leadId = deleteLeadButton.dataset.leadId;
  if (!leadId) {
    return;
  }

  setLeadActionStatus("Deleting archived lead...");
  try {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete lead");
    }

    window.location.href = "leads.html";
  } catch {
    setLeadActionStatus("Could not delete that lead. Only archived leads can be deleted.", true);
  }
});

acceptButton?.addEventListener("click", async () => {
  if (!acceptButton.dataset.leadId) {
    return;
  }

  const acceptStatus = document.getElementById("accept-status");
  acceptButton.disabled = true;
  acceptButton.textContent = "Accepting";
  acceptStatus.textContent = "Saving acceptance...";
  acceptStatus.style.color = "#1f4d42";

  try {
    const result = await fetch(`/api/leads/${encodeURIComponent(acceptButton.dataset.leadId)}/accept`, {
      method: "POST",
    });

    if (!result.ok) {
      throw new Error("Failed to accept");
    }

    const payload = await result.json();
    cachedLeads = cachedLeads.map((lead) =>
      String(lead.id) === String(payload.lead.id) ? payload.lead : lead
    );
    document.getElementById("metric-status").textContent = "Time accepted";
    document.getElementById("schedule-status-copy").textContent =
      "The proposed time has been accepted. Later this is where Zoom and email confirmation can plug in.";
    acceptButton.textContent = "Time accepted";
    acceptButton.disabled = true;
    acceptStatus.textContent =
      "Preferred time accepted. Later this can trigger Zoom link creation and email confirmation.";
  } catch {
    acceptButton.disabled = false;
    acceptButton.textContent = "Accept proposed time";
    acceptStatus.textContent = "Could not save that action. Try again.";
    acceptStatus.style.color = "#9b2c2c";
  }
});

const populateLeadDetailPage = async () => {
  const title = document.getElementById("lead-detail-title");
  if (!title) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const leadId = params.get("id");

  if (!leadId) {
    title.textContent = "No lead selected.";
    document.getElementById("lead-detail-copy").textContent =
      "Go back to the leads page and open a lead to view the full workspace.";
    return;
  }

  try {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}`);
    if (!response.ok) {
      throw new Error("Lead not found");
    }

    const lead = await response.json();
    const mockup = buildMockup(lead);
    const proposal = buildProposal(lead);
    const stage = getLeadStage(lead);

    document.getElementById("lead-detail-title").textContent = mockup.title;
    document.getElementById("lead-detail-copy").textContent =
      "This workspace combines the raw client brief, mockup direction, homepage copy ideas, proposal notes, and scheduling actions.";
    document.getElementById("metric-project").textContent = lead.projectType || "Unknown";
    document.getElementById("metric-time").textContent = lead.preferredTime || "Not specified";
    applyLeadStageToDetail(lead);

    document.getElementById("lead-brief").innerHTML = `
      <article class="summary-card">
        <h3>${escapeHtml(lead.company || "Untitled company")}</h3>
        <p><strong>Name:</strong> ${escapeHtml(lead.name || "Unknown")}</p>
        <p><strong>Email:</strong> ${escapeHtml(lead.email || "Unknown")}</p>
        <p><strong>Project type:</strong> ${escapeHtml(lead.projectType || "Unknown")}</p>
        <p><strong>Main goal:</strong> ${escapeHtml(lead.goal || "Unknown")}</p>
      </article>
      <article class="summary-card">
        <h3>Client preferences</h3>
        <p><strong>Style:</strong> ${escapeHtml(lead.style || "Not specified")}</p>
        <p><strong>Preferred time:</strong> ${escapeHtml(lead.preferredTime || "Not specified")}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(formatDate(lead.submittedAt))}</p>
        <p><strong>Meeting status:</strong> ${escapeHtml(stage.label)}</p>
      </article>
      <article class="summary-card">
        <h3>Full message</h3>
        <p>${escapeHtml(lead.message || "No message left.")}</p>
      </article>
    `;

    document.getElementById("mockup-title").textContent = mockup.title;
    document.getElementById("mockup-hero").textContent = mockup.hero;
    document.getElementById("mockup-pages").textContent = mockup.pages;
    document.getElementById("mockup-style").textContent = mockup.style;

    document.getElementById("draft-headline").textContent = proposal.headline;
    document.getElementById("draft-subcopy").textContent = proposal.subcopy;
    document.getElementById("draft-cta").textContent = proposal.cta;
    document.getElementById("proposal-sections").textContent = proposal.sections;
    document.getElementById("proposal-proof").textContent = proposal.proof;
    document.getElementById("proposal-angle").textContent = proposal.angle;
    document.getElementById("proposal-package").textContent = proposal.package;
    document.getElementById("proposal-why").textContent = proposal.why;
    document.getElementById("proposal-next-step").textContent = proposal.nextStep;

    document.getElementById("schedule-time").textContent = lead.preferredTime
      ? `Preferred time: ${lead.preferredTime}`
      : "No preferred time submitted yet.";
    document.getElementById("schedule-status-copy").textContent = lead.meetingAccepted
      ? "The call is confirmed. Later this is where Zoom and calendar details can plug in."
      : `Review the requested time and accept it if it works. Internal note: ${proposal.internalNote}`;
    renderLeadNotes(lead);
    renderLeadActivity(lead);

    const emailPreviewLink = document.getElementById("email-preview-link");
    if (emailPreviewLink) {
      emailPreviewLink.href = `email-preview.html?id=${encodeURIComponent(lead.id)}`;
    }

    const proposalPreviewLink = document.getElementById("proposal-preview-link");
    if (proposalPreviewLink) {
      proposalPreviewLink.href = `proposal-preview.html?id=${encodeURIComponent(lead.id)}`;
    }

    acceptButton.dataset.leadId = String(lead.id);
    if (markActiveButton) {
      markActiveButton.dataset.leadId = String(lead.id);
    }
    if (markClosedButton) {
      markClosedButton.dataset.leadId = String(lead.id);
    }
    if (archiveLeadButton) {
      archiveLeadButton.dataset.leadId = String(lead.id);
    }
    if (deleteLeadButton) {
      deleteLeadButton.dataset.leadId = String(lead.id);
    }
    updateLeadActionButtons(lead);

    if (lead.meetingAccepted) {
      acceptButton.textContent = "Time accepted";
      acceptButton.disabled = true;
      document.getElementById("accept-status").textContent =
        "This lead already has an accepted meeting time.";
    }
  } catch {
    title.textContent = "Lead not found.";
    document.getElementById("lead-detail-copy").textContent =
      "Go back to the leads page and choose another lead.";
  }
};

populateLeadDetailPage();

leadNoteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const leadId = new URLSearchParams(window.location.search).get("id");
  const note = String(leadNoteInput?.value || "").trim();
  const statusNode = document.getElementById("lead-note-status");
  const submitButton = document.getElementById("lead-note-submit");

  if (!leadId || !note) {
    if (statusNode) {
      statusNode.textContent = "Add a note before saving.";
      statusNode.style.color = "#9b2c2c";
    }
    return;
  }

  if (statusNode) {
    statusNode.textContent = "Saving note...";
    statusNode.style.color = "#1f4d42";
  }
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    });

    if (!response.ok) {
      throw new Error("Failed to save note");
    }

    const payload = await response.json();
    renderLeadNotes(payload.lead);
    renderLeadActivity(payload.lead);
    if (leadNoteInput) {
      leadNoteInput.value = "";
    }
    if (statusNode) {
      statusNode.textContent = "Note saved.";
      statusNode.style.color = "#1f4d42";
    }
  } catch {
    if (statusNode) {
      statusNode.textContent = "Could not save the note. Try again.";
      statusNode.style.color = "#9b2c2c";
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

const populateEmailPreviewPage = async () => {
  const title = document.getElementById("email-preview-title");
  if (!title) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const leadId = params.get("id");

  if (!leadId) {
    title.textContent = "No lead selected for preview.";
    document.getElementById("email-preview-subtitle").textContent =
      "Open a lead first, then use the email preview button from that workspace.";
    return;
  }

  try {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}`);
    if (!response.ok) {
      throw new Error("Lead not found");
    }

    const lead = await response.json();
    const draft = buildEmailDraft(lead);

    document.getElementById("email-preview-title").textContent = `Draft follow-up for ${lead.company || "this lead"}.`;
    document.getElementById("email-preview-subtitle").textContent =
      "This is a mock follow-up email based on the client brief and generated site direction.";
    document.getElementById("email-preview-back").href = `lead.html?id=${encodeURIComponent(lead.id)}`;
    document.getElementById("email-to").textContent = lead.email || "No client email";
    document.getElementById("email-subject").textContent = draft.subject;
    document.getElementById("email-body").innerHTML = `
      <p class="email-line">${escapeHtml(draft.greeting)}</p>
      <p class="email-line">${escapeHtml(draft.intro)}</p>
      <div class="email-callout">
        <p class="email-line">${escapeHtml(draft.direction)}</p>
      </div>
      <div class="email-list-block">
        <p class="email-list-title">Recommended direction</p>
        <ul class="email-list">
          ${draft.summaryPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
        </ul>
      </div>
      <p class="email-line">${escapeHtml(draft.closing)}</p>
      <p class="email-signoff">Best,<br />${escapeHtml(draft.signoff)}</p>
    `;
  } catch {
    title.textContent = "Could not load email draft preview.";
    document.getElementById("email-preview-subtitle").textContent =
      "Go back to the leads page and reopen the lead you want to preview.";
  }
};

populateEmailPreviewPage();

const populateProposalPreviewPage = async () => {
  const title = document.getElementById("proposal-preview-title");
  if (!title) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const leadId = params.get("id");

  if (!leadId) {
    title.textContent = "No lead selected for proposal preview.";
    document.getElementById("proposal-preview-subtitle").textContent =
      "Open a lead first, then use the proposal preview button from that workspace.";
    return;
  }

  try {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}`);
    if (!response.ok) {
      throw new Error("Lead not found");
    }

    const lead = await response.json();
    const preview = buildProposalPreview(lead);

    document.getElementById("proposal-preview-title").textContent = `Proposal draft for ${lead.company || "this lead"}.`;
    document.getElementById("proposal-preview-subtitle").textContent =
      "This preview turns the raw lead into a cleaner project recommendation you can build on after the call.";
    document.getElementById("proposal-stage-headline").textContent = preview.stageHeadline;
    document.getElementById("proposal-stage-copy").textContent = preview.stageCopy;
    document.getElementById("proposal-stage-highlight").textContent = preview.highlight;
    document.getElementById("proposal-preview-back").href = `lead.html?id=${encodeURIComponent(lead.id)}`;
    document.getElementById("proposal-client").textContent = lead.company || "Unknown client";
    document.getElementById("proposal-project-type").textContent = lead.projectType || "Unknown project";
    document.getElementById("proposal-goal").textContent = lead.goal || "Unknown goal";
    document.getElementById("proposal-scope-title").textContent = preview.scopeTitle;
    document.getElementById("proposal-deliverables").textContent = preview.deliverables;
    document.getElementById("proposal-timeline").textContent = preview.timeline;
    document.getElementById("proposal-action").textContent = preview.action;
    document.getElementById("proposal-monthly-plan-name").textContent = preview.monthlyPlan.name;
    document.getElementById("proposal-monthly-plan-price").textContent = preview.monthlyPlan.price;
    document.getElementById("proposal-monthly-plan-copy").textContent = preview.monthlyPlan.copy;
    document.getElementById("proposal-investment-summary").textContent = preview.investmentSummary;
    document.getElementById("proposal-timeline-summary").textContent = preview.timelineSummary;
    document.getElementById("proposal-call-guidance").textContent = preview.callGuidance;
    document.getElementById("proposal-retainer-summary").textContent = preview.retainerSummary;
    document.getElementById("proposal-small-business-note").textContent = preview.smallBusinessNote;
    document.getElementById("proposal-retainer-timing").textContent = preview.retainerTiming;
    document.getElementById("proposal-fit").textContent = preview.fit;
    document.getElementById("proposal-addons").textContent = preview.addons;
    document.getElementById("proposal-followup").textContent = preview.followup;
    document.getElementById("proposal-deposit-line").textContent = preview.depositLine;
    document.getElementById("proposal-kickoff-line").textContent = preview.kickoffLine;
    document.getElementById("proposal-send-ready-summary").textContent = preview.sendReadySummary;
    document.getElementById("proposal-addon-grid").innerHTML = preview.addonOptions
      .map(
        (item) => `
          <article class="summary-card">
            <h3>Optional add-on</h3>
            <p>${escapeHtml(item)}</p>
          </article>
        `
      )
      .join("");
    document.getElementById("proposal-next-steps-list").innerHTML = preview.nextSteps
      .map((step) => `<li>${escapeHtml(step)}</li>`)
      .join("");
  } catch {
    title.textContent = "Could not load proposal preview.";
    document.getElementById("proposal-preview-subtitle").textContent =
      "Go back to the leads page and reopen the lead you want to preview.";
  }
};

populateProposalPreviewPage();
