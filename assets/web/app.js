/* Pressship Studio — WordPress 7.0 "Modern" admin theme client */

let token = document.querySelector('meta[name="pressship-token"]').content;

/* ===================================================================
 * Studio layout — resizable panels
 * =================================================================== */

const STUDIO_LAYOUT_STORAGE_KEY = "pressship.studio.layout.v1";

const STUDIO_LAYOUT_DEFAULTS = {
  files: 260,
  ai: 330,
  terminal: 190,
  checkNotes: 152
};

const STUDIO_LAYOUT_LIMITS = {
  files: { min: 180, max: 560 },
  ai: { min: 260, max: 720 },
  terminal: { min: 100, max: 600 },
  checkNotes: { min: 80, max: 520 }
};

function loadStudioLayout() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STUDIO_LAYOUT_STORAGE_KEY) : null;
    if (!raw) {
      return { ...STUDIO_LAYOUT_DEFAULTS };
    }
    const parsed = JSON.parse(raw);
    const merged = { ...STUDIO_LAYOUT_DEFAULTS };
    for (const key of Object.keys(STUDIO_LAYOUT_DEFAULTS)) {
      const value = Number(parsed?.[key]);
      if (Number.isFinite(value) && value > 0) {
        merged[key] = clampStudioLayoutValue(key, value);
      }
    }
    return merged;
  } catch {
    return { ...STUDIO_LAYOUT_DEFAULTS };
  }
}

function saveStudioLayout(layout) {
  try {
    localStorage.setItem(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

function clampStudioLayoutValue(key, value) {
  const limits = STUDIO_LAYOUT_LIMITS[key];
  if (!limits) {
    return value;
  }
  return Math.max(limits.min, Math.min(limits.max, value));
}

function applyStudioLayout(root) {
  if (!root) {
    return;
  }
  const layout = state.studio.layout ?? STUDIO_LAYOUT_DEFAULTS;
  root.style.setProperty("--studio-files-width", `${layout.files}px`);
  root.style.setProperty("--studio-ai-width", `${layout.ai}px`);
  root.style.setProperty("--studio-terminal-height", `${layout.terminal}px`);
  root.style.setProperty("--studio-check-notes-height", `${layout.checkNotes}px`);
}

function renderStudioResizer(key, orientation, options = {}) {
  const invert = options.invert === true ? "1" : "0";
  const label = options.label ?? key;
  return `<div class="studio-resizer studio-resizer-${orientation}" role="separator" aria-orientation="${orientation === "h" ? "vertical" : "horizontal"}" aria-label="Resize ${escapeAttr(label)}" tabindex="0" data-studio-resize="${escapeAttr(key)}" data-studio-resize-axis="${orientation}" data-studio-resize-invert="${invert}"></div>`;
}

/**
 * Binds resize behavior to every [data-studio-resize] handle inside the studio
 * panel. Uses the Pointer Events API with setPointerCapture so the drag is
 * routed to the handle regardless of what element the pointer ends up over —
 * this works consistently across Chromium, Firefox, and Safari.
 */
function bindStudioResizers() {
  const container = els.studio;
  if (!container) {
    return;
  }
  container.querySelectorAll("[data-studio-resize]").forEach((handle) => {
    if (handle.dataset.studioResizeBound === "1") {
      return;
    }
    handle.dataset.studioResizeBound = "1";
    handle.addEventListener("pointerdown", onStudioResizerPointerDown);
    handle.addEventListener("keydown", onStudioResizerKeydown);
  });
}

function onStudioResizerPointerDown(event) {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }
  const handle = event.currentTarget;
  const key = handle.dataset.studioResize;
  const layout = state.studio?.layout;
  if (!key || !layout) {
    return;
  }

  event.preventDefault();

  const axis = handle.dataset.studioResizeAxis;
  const invert = handle.dataset.studioResizeInvert === "1";
  const startCoord = axis === "h" ? event.clientX : event.clientY;
  const startValue = layout[key] ?? STUDIO_LAYOUT_DEFAULTS[key] ?? 0;
  const pointerId = event.pointerId;
  const root = els.studio?.querySelector(".studio-root");

  try {
    handle.setPointerCapture(pointerId);
  } catch {
    // Some environments (older Safari, automated test events) reject capture; the
    // pointermove/pointerup listeners attached directly on the handle still fire.
  }

  handle.classList.add("is-active");
  document.body.classList.add(axis === "h" ? "is-studio-resizing-h" : "is-studio-resizing-v");

  const applyDelta = (currentCoord) => {
    const rawDelta = currentCoord - startCoord;
    const delta = invert ? -rawDelta : rawDelta;
    const next = clampStudioLayoutValue(key, startValue + delta);
    if (next !== layout[key]) {
      layout[key] = next;
      applyStudioLayout(root);
      if (state.studio.editor?.layout) {
        state.studio.editor.layout();
      }
    }
  };

  const onMove = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) {
      return;
    }
    moveEvent.preventDefault();
    applyDelta(axis === "h" ? moveEvent.clientX : moveEvent.clientY);
  };

  const finish = (finishEvent) => {
    if (finishEvent && finishEvent.pointerId !== undefined && finishEvent.pointerId !== pointerId) {
      return;
    }
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    handle.removeEventListener("lostpointercapture", finish);
    try {
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
    handle.classList.remove("is-active");
    document.body.classList.remove("is-studio-resizing-h");
    document.body.classList.remove("is-studio-resizing-v");
    saveStudioLayout(layout);
    if (state.studio.editor?.layout) {
      state.studio.editor.layout();
    }
  };

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
}

function onStudioResizerKeydown(event) {
  const handle = event.currentTarget;
  const key = handle.dataset.studioResize;
  const layout = state.studio?.layout;
  if (!key || !layout) {
    return;
  }
  const axis = handle.dataset.studioResizeAxis;
  const invert = handle.dataset.studioResizeInvert === "1";
  const step = event.shiftKey ? 32 : 8;

  let direction = 0;
  if (axis === "h" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    direction = event.key === "ArrowRight" ? 1 : -1;
  } else if (axis === "v" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    direction = event.key === "ArrowDown" ? 1 : -1;
  } else {
    return;
  }

  event.preventDefault();
  const delta = (invert ? -direction : direction) * step;
  const current = layout[key] ?? STUDIO_LAYOUT_DEFAULTS[key] ?? 0;
  layout[key] = clampStudioLayoutValue(key, current + delta);
  applyStudioLayout(els.studio?.querySelector(".studio-root"));
  saveStudioLayout(layout);
  if (state.studio.editor?.layout) {
    state.studio.editor.layout();
  }
}


const state = {
  bootstrap: null,
  remote: [],
  remoteUsername: "",
  remoteLoading: true,
  remoteError: "",
  local: [],
  localLoading: true,
  localError: "",
  versionStates: new Map(),
  playgrounds: [],
  jobs: new Map(),
  jobSources: new Map(),
  studio: {
    scope: null,
    id: null,
    plugin: null,
    files: [],
    selectedFile: null,
    fileContent: "",
    draftContent: "",
    readOnly: true,
    dirty: false,
    loading: false,
    running: false,
    checking: false,
    jobId: null,
    checkJobId: null,
    checkFindings: [],
    checkSummary: null,
    checkRanAt: null,
    checkDecorations: [],
    playgroundUrl: "",
    playgroundUrls: null,
    activeTab: "editor",
    terminalOpen: true,
    collapsedFolders: new Set(),
    terminal: [],
    aiPrompt: "",
    aiJobId: null,
    aiRunning: false,
    aiStatus: "",
    aiActiveAssistant: "",
    aiMessages: [],
    aiChangedFiles: [],
    aiPatchDecorations: [],
    editor: null,
    editorKind: null,
    editorModels: [],
    layout: loadStudioLayout()
  },
  activeView: "dashboard",
  settings: null,
  settingsDirty: false,
  aiAssistance: {
    loading: false,
    detectedAt: null,
    providers: []
  },
  command: {
    open: false,
    activeIndex: 0,
    query: "",
    items: []
  }
};

const els = {
  notices: document.getElementById("notice-stack"),
  account: document.getElementById("account-info"),
  dashboard: document.getElementById("dashboard-content"),
  remote: document.getElementById("remote-content"),
  local: document.getElementById("local-content"),
  studio: document.getElementById("studio-content"),
  playgroundsSection: document.getElementById("playgrounds-section"),
  playgroundsMenu: document.getElementById("playground-menu-items"),
  jobs: document.getElementById("activity-content"),
  settings: document.getElementById("settings-content"),
  detail: document.getElementById("detail-panel"),
  jobsCounter: document.getElementById("jobs-counter"),
  command: document.getElementById("command-palette"),
  commandInput: document.getElementById("command-input"),
  commandList: document.getElementById("command-list")
};

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
let monacoPromise = null;
document.querySelectorAll("[data-kbd-mod]").forEach((node) => {
  node.textContent = isMac ? "⌘" : "Ctrl+";
});

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-button]");
  if (viewButton) {
    event.preventDefault();
    showView(viewButton.dataset.viewButton);
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) {
    return;
  }
  if (action.disabled || action.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
    return;
  }

  void runAction(action.dataset.action, action);
});

document.addEventListener("keydown", (event) => {
  if (event.target?.id === "studio-ai-prompt" && (isMac ? event.metaKey : event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void runStudioAi();
    return;
  }

  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && event.key.toLowerCase() === "k" && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if (event.key === "Escape" && state.command.open) {
    event.preventDefault();
    closeCommandPalette();
    return;
  }

  if (state.command.open) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCommandSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCommandSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommandAtCursor();
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target?.id !== "studio-ai-prompt") {
    return;
  }

  state.studio.aiPrompt = event.target.value;
  updateStudioAiControls();
});

document.addEventListener("change", (event) => {
  if (event.target?.id !== "studio-plugin-picker") {
    return;
  }

  updateStudioPickerControls();
});

els.commandInput?.addEventListener("input", () => {
  state.command.query = els.commandInput.value;
  state.command.activeIndex = 0;
  renderCommandPalette();
});

void boot();

async function boot() {
  try {
    state.bootstrap = await api("/api/bootstrap");
    refreshTokenFromBootstrap(state.bootstrap);
  } catch (error) {
    notice(`Could not load bootstrap state: ${error.message}`, "error");
    return;
  }
  state.settings = state.bootstrap.settings ?? null;
  state.playgrounds = state.bootstrap.playgrounds ?? [];
  document.body.dataset.activeView = state.activeView;
  renderAccount();
  for (const job of state.bootstrap.jobs ?? []) {
    upsertJob(job);
  }
  renderJobsCounter();
  renderJobs();
  renderSettings();
  renderDashboard();
  renderStudio();
  renderPlaygroundsMenu();
  void loadAiAssistance();
  await Promise.all([loadRemote(), loadLocal()]);
}

function renderAccount() {
  const account = state.bootstrap?.account?.username;
  els.account.classList.remove("is-loading");
  els.account.removeAttribute("aria-busy");
  els.account.innerHTML = `
    <span class="dashicons dashicons-admin-users" aria-hidden="true"></span>
    <span class="ab-account-label">
      WordPress.org <strong>${escapeHtml(account ?? "not logged in")}</strong>
    </span>
  `;
}

async function runAction(name, element) {
  try {
    switch (name) {
      case "refresh-remote":
        await loadRemote();
        notice("Refreshed remote plugins.", "info");
        return;

      case "details":
        await showDetails(element.dataset.scope, element.dataset.id);
        return;

      case "clone":
        await createJob({ type: "clone", slug: element.dataset.slug });
        showView("dashboard");
        return;

      case "studio":
        await openStudio(element.dataset.scope, element.dataset.id);
        return;

      case "studio-open-selected":
        await openSelectedStudioPlugin();
        return;

      case "studio-tab":
        switchStudioTab(element.dataset.tab);
        return;

      case "studio-file":
        await selectStudioFile(element.dataset.path);
        return;

      case "studio-toggle-folder":
        toggleStudioFolder(element.dataset.folder);
        return;

      case "studio-toggle-terminal":
        toggleStudioTerminal();
        return;

      case "studio-save":
        await saveStudioFile();
        return;

      case "studio-check":
        await runStudioCheck();
        return;

      case "studio-check-note":
        revealStudioCheckNote(Number(element.dataset.line || 1), Number(element.dataset.column || 1));
        return;

      case "studio-run":
        await runStudioPlay();
        return;

      case "studio-ai-send":
        await runStudioAi();
        return;

      case "studio-ai-change":
        await selectStudioAiChange(element.dataset.path);
        return;

      case "studio-ai-accept":
        await acceptStudioAiChange(element.dataset.path);
        return;

      case "studio-ai-reject":
        rejectStudioAiChange(element.dataset.path);
        return;

      case "studio-ai-suggestion": {
        const prompt = element.dataset.prompt ?? "";
        if (!prompt) {
          return;
        }
        state.studio.aiPrompt = prompt;
        updateStudioAiSidebar();
        const input = document.getElementById("studio-ai-prompt");
        if (input instanceof HTMLTextAreaElement) {
          input.value = prompt;
          input.focus();
          input.setSelectionRange(prompt.length, prompt.length);
        }
        updateStudioAiControls();
        return;
      }

      case "studio-ai-clear":
        state.studio.aiMessages = [];
        state.studio.aiChangedFiles = [];
        updateStudioAiSidebar();
        renderStudio();
        remountStudioEditorIfNeeded();
        return;

      case "choose-local-folder":
        await chooseLocalFolder();
        return;

      case "open-playground":
        await openPlaygroundInStudio(element.dataset.id);
        return;

      case "stop-playground":
        await stopPlayground(element.dataset.id);
        return;

      case "remove-local": {
        const confirmed =
          !state.settings?.confirmDestructiveActions ||
          confirm(
            "Remove this local plugin from Pressship Studio? Files will not be deleted."
          );
        if (confirmed) {
          await api(`/api/plugins/local/${encodeURIComponent(element.dataset.id)}`, {
            method: "DELETE"
          });
          await loadLocal();
        }
        return;
      }

      case "version-state":
        await showVersionState(element.dataset.id);
        return;

      case "bump-version":
        await api(`/api/plugins/local/${encodeURIComponent(element.dataset.id)}/bump-version`, {
          method: "POST",
          body: { bump: element.dataset.bump }
        });
        notice(`Version bumped (${element.dataset.bump}).`, "success");
        await loadLocal();
        return;

      case "dry-run-publish":
        await createJob({
          type: "dry-run-publish",
          localId: element.dataset.id,
          action: element.dataset.publishAction
        });
        showView("dashboard");
        return;

      case "confirm-publish": {
        const overview = prompt(
          "Brief overview/comment for the WordPress.org form",
          element.dataset.overview ?? ""
        );
        if (overview === null) {
          return;
        }
        await createJob({
          type: "confirm-publish",
          approvalId: element.dataset.approvalId,
          overview
        });
        showView("dashboard");
        return;
      }

      case "cancel-job":
        await api(`/api/jobs/${encodeURIComponent(element.dataset.id)}/cancel`, {
          method: "POST"
        });
        return;

      case "open-command":
        openCommandPalette();
        return;

      case "close-command":
        closeCommandPalette();
        return;

      case "close-detail":
        closeDetail();
        return;

      case "clear-finished-jobs":
        clearFinishedJobs();
        return;

      case "save-settings":
        await saveSettings();
        return;

      case "reset-settings":
        resetSettings();
        return;

      case "refresh-ai-assistance":
        await loadAiAssistance({ notify: true });
        return;

      default:
        break;
    }
  } catch (error) {
    notice(error.message, "error");
  }
}

/* ===================================================================
 * Remote plugins
 * =================================================================== */

async function loadRemote() {
  state.remoteLoading = true;
  state.remoteError = "";
  els.remote.innerHTML = loadingShell("Loading WordPress.org plugins…");
  renderDashboard();
  try {
    const result = await api("/api/plugins/remote");
    state.remote = result.plugins ?? [];
    state.remoteUsername = result.username ?? "";
    renderRemote();
  } catch (error) {
    state.remoteError = state.bootstrap?.loggedIn
      ? error.message
      : "Run pressship login in a terminal, then refresh this page.";
    els.remote.innerHTML = emptyState({
      title: "Could not load My Plugins.",
      message: state.remoteError,
      icon: "dashicons-admin-network"
    });
  } finally {
    state.remoteLoading = false;
    renderDashboard();
  }
}

function renderRemote() {
  renderDashboard();
  if (!state.studio.id) {
    renderStudio();
  }
  if (!state.remote.length) {
    els.remote.innerHTML = emptyState({
      title: "No plugins found.",
      message: "The saved WordPress.org account did not return any plugins.",
      icon: "dashicons-admin-plugins"
    });
    return;
  }

  els.remote.innerHTML = `
    <div class="ps-list-table-wrap ps-list-table-wrap-remote">
      <ul class="subsubsub ps-list-tabs">
        <li>
          <a class="current" href="#">${escapeHtml(state.remoteUsername || "account")}
            <span class="count">(${state.remote.length})</span>
          </a>
        </li>
      </ul>
      <div class="tablenav top">
        <div class="alignleft actions">
          <span class="displaying-num">${escapeHtml(`${state.remote.length} WordPress.org plugin${state.remote.length === 1 ? "" : "s"}`)}</span>
        </div>
      </div>
      <table class="wp-list-table widefat fixed striped plugins ps-list-table ps-remote-table">
        <thead>
          <tr>
            <th class="column-primary">Plugin</th>
            <th class="column-role">Role</th>
            <th class="column-installs">Active installs</th>
            <th class="column-tested">Tested up to</th>
          </tr>
        </thead>
        <tbody>
          ${state.remote.map(remoteRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function remoteRow(plugin) {
  return `
    <tr class="ps-list-table-row">
      <td class="plugin-title column-primary" data-colname="Plugin">
        <strong class="ps-table-plugin-name">
          <button type="button" data-action="details" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">${escapeHtml(plugin.name)}</button>
        </strong>
        <span class="plugin-slug">${escapeHtml(plugin.slug)}</span>
        <div class="row-actions">
          <span><button type="button" data-action="details" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">Details</button></span>
          <span class="sep">·</span>
          <span><button type="button" data-action="clone" data-slug="${escapeAttr(plugin.slug)}">Clone / update</button></span>
          <span class="sep">·</span>
          <span><button type="button" data-action="studio" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">Studio</button></span>
        </div>
      </td>
      <td class="column-role" data-colname="Role">${remoteRoleBadges(plugin.roles)}</td>
      <td class="column-installs" data-colname="Active installs"><span class="ps-table-number">${escapeHtml(plugin.activeInstalls ?? "unknown")}</span></td>
      <td class="column-tested" data-colname="Tested up to"><span class="ps-table-muted">${escapeHtml(plugin.testedWith ?? "unknown")}</span></td>
    </tr>
  `;
}

function remoteRoleBadges(roles = []) {
  const safeRoles = Array.isArray(roles) ? roles : [];
  if (!safeRoles.length) {
    return `<span class="ps-table-muted">unknown</span>`;
  }
  return `<span class="ps-role-list">${safeRoles.map((role) => `<span class="ps-role-badge">${escapeHtml(role)}</span>`).join("")}</span>`;
}

/* ===================================================================
 * Local plugins
 * =================================================================== */

async function loadLocal() {
  state.localLoading = true;
  state.localError = "";
  els.local.innerHTML = loadingShell("Loading local plugins…");
  renderDashboard();
  try {
    const result = await api("/api/plugins/local");
    state.local = result.plugins ?? [];
    const versionStates = await Promise.all(
      state.local.map((plugin) =>
        api(`/api/plugins/local/${encodeURIComponent(plugin.id)}/version-state`).catch((error) => ({
          error: error.message
        }))
      )
    );
    state.versionStates = new Map(
      state.local.map((plugin, index) => [plugin.id, versionStates[index]])
    );
    renderLocal();
  } catch (error) {
    state.localError = error.message;
    els.local.innerHTML = emptyState({
      title: "Could not load local plugins.",
      message: error.message,
      icon: "dashicons-warning"
    });
  } finally {
    state.localLoading = false;
    renderDashboard();
  }
}

function renderLocal() {
  renderDashboard();
  if (!state.studio.id) {
    renderStudio();
  }
  if (!state.local.length) {
    els.local.innerHTML = emptyState({
      title: "No local plugins yet.",
      message: "Add a path above or clone one from My Plugins to get started.",
      icon: "dashicons-download"
    });
    return;
  }

  const defaultPublish = state.settings?.defaultPublishAction ?? "auto";
  const defaultBump = state.settings?.defaultBumpLevel ?? "patch";

  els.local.innerHTML = `
    <div class="ps-list-table-wrap ps-list-table-wrap-local">
      <ul class="subsubsub ps-list-tabs">
        <li>
          <a class="current" href="#">All
            <span class="count">(${state.local.length})</span>
          </a>
        </li>
      </ul>
      <div class="tablenav top">
        <div class="alignleft actions">
          <span class="displaying-num">${escapeHtml(`${state.local.length} local plugin${state.local.length === 1 ? "" : "s"}`)}</span>
        </div>
      </div>
      <table class="wp-list-table widefat fixed striped plugins ps-list-table ps-local-table">
        <thead>
          <tr>
            <th class="column-primary">Plugin</th>
            <th class="column-version-state">Version state</th>
            <th class="column-path">Path</th>
            <th class="column-publish">Publish</th>
          </tr>
        </thead>
        <tbody>
          ${state.local
            .map((plugin) => localRow(plugin, state.versionStates.get(plugin.id), defaultPublish, defaultBump))
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function chooseLocalFolder() {
  const result = await api("/api/select-folder", { method: "POST" });
  if (!result.path) {
    return;
  }
  await api("/api/plugins/local", { method: "POST", body: { path: result.path } });
  notice("Local plugin added.", "success");
  await loadLocal();
}

async function loadPlaygrounds() {
  try {
    const result = await api("/api/playgrounds");
    state.playgrounds = result.playgrounds ?? [];
    renderPlaygroundsMenu();
    renderDashboard();
  } catch (error) {
    notice(error.message, "error");
  }
}

async function stopPlayground(id) {
  await api(`/api/playgrounds/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadPlaygrounds();
}

async function openPlaygroundInStudio(id) {
  const playground = state.playgrounds.find((item) => item.id === id);
  if (!playground) {
    notice("Playground is no longer running.", "warning");
    await loadPlaygrounds();
    return;
  }

  if (!state.studio.id || state.studio.plugin?.slug !== playground.slug) {
    const local = state.local.find((plugin) => plugin.slug === playground.slug);
    if (playground.source === "local" && local?.id) {
      await openStudio("local", local.id);
    } else if (playground.source === "wordpress.org") {
      await openStudio("remote", playground.slug);
    }
  }

  if (!state.studio.id) {
    notice("Open the plugin in Studio to view this Playground.", "warning");
    showView("studio");
    return;
  }

  state.studio.playgroundUrl = playground.url;
  state.studio.playgroundUrls = playgroundUrlsFor(playground.url);
  state.studio.activeTab = "home";
  state.studio.running = false;
  showView("studio");
  renderStudio();
  updateStudioControls();
}

function playgroundUrlsFor(baseUrl) {
  const normalized = baseUrl.replace(/\/$/, "");
  return {
    home: baseUrl,
    admin: `${normalized}/wp-admin/?pressship_auto_login=1`
  };
}

/* ===================================================================
 * Studio
 * =================================================================== */

async function openStudio(scope, id) {
  disposeStudioEditor();
  state.studio = {
    scope,
    id,
    plugin: null,
    files: [],
    selectedFile: null,
    fileContent: "",
    draftContent: "",
    readOnly: scope !== "local",
    dirty: false,
    loading: true,
    running: false,
    checking: false,
    jobId: null,
    checkJobId: null,
    checkFindings: [],
    checkSummary: null,
    checkRanAt: null,
    checkDecorations: [],
    playgroundUrl: "",
    playgroundUrls: null,
    activeTab: "editor",
    terminalOpen: true,
    collapsedFolders: new Set(),
    terminal: [`Pressship Studio opened for ${scope === "local" ? "local plugin" : "WordPress.org plugin"} ${id}.`],
    aiPrompt: "",
    aiJobId: null,
    aiRunning: false,
    aiStatus: "",
    aiActiveAssistant: "",
    aiMessages: [],
    aiChangedFiles: [],
    aiPatchDecorations: [],
    editor: null,
    editorKind: null,
    editorModels: [],
    layout: state.studio.layout ?? loadStudioLayout()
  };
  showView("studio");
  renderStudio();

  try {
    const detail = await api(`/api/plugins/${scope}/${encodeURIComponent(id)}`);
    const plugin = scope === "local" ? detail.plugin : { id, slug: id, name: detail.info?.name ?? id };
    state.studio.plugin = plugin;
    state.studio.loading = false;

    if (scope === "local") {
      const [result, checkState] = await Promise.all([
        api(`/api/plugins/local/${encodeURIComponent(id)}/files`),
        api(`/api/plugins/local/${encodeURIComponent(id)}/check-state`).catch(() => ({ state: null }))
      ]);
      state.studio.files = result.files ?? [];
      applyStudioCheckState(checkState.state);
      renderStudio();
      const initialFile = chooseInitialStudioFile(state.studio.files, plugin.slug);
      if (initialFile) {
        await selectStudioFile(initialFile.path);
      } else {
        state.studio.draftContent = "";
        remountStudioEditorIfNeeded();
      }
    } else {
      state.studio.files = [{ path: "readme.txt", name: "readme.txt", directory: "", size: detail.readme?.length ?? 0 }];
      state.studio.selectedFile = state.studio.files[0];
      state.studio.fileContent = detail.readme ?? "No hosted readme.txt could be loaded.";
      state.studio.draftContent = state.studio.fileContent;
      state.studio.readOnly = true;
      renderStudio();
      remountStudioEditorIfNeeded();
    }
  } catch (error) {
    state.studio.loading = false;
    appendStudioTerminal(error.message, "error");
    renderStudio();
  }
}

async function selectStudioFile(relativePath) {
  if (!state.studio.id || state.studio.scope !== "local" || !relativePath) {
    return;
  }
  if (state.studio.dirty && !confirm("Discard unsaved changes in the current file?")) {
    return;
  }

  state.studio.selectedFile = state.studio.files.find((file) => file.path === relativePath) ?? {
    path: relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    directory: "",
    size: 0
  };
  state.studio.fileContent = "Loading…";
  state.studio.draftContent = "Loading…";
  state.studio.dirty = false;
  state.studio.activeTab = "editor";
  renderStudio();
  remountStudioEditorIfNeeded();

  try {
    const result = await api(
      `/api/plugins/local/${encodeURIComponent(state.studio.id)}/files/content?path=${encodeURIComponent(relativePath)}`
    );
    state.studio.selectedFile = state.studio.files.find((file) => file.path === result.path) ?? state.studio.selectedFile;
    state.studio.fileContent = result.content ?? "";
    state.studio.draftContent = state.studio.fileContent;
    state.studio.dirty = false;
    renderStudio();
    remountStudioEditorIfNeeded();
  } catch (error) {
    appendStudioTerminal(error.message, "error");
    renderStudio();
  }
}

async function saveStudioFile() {
  if (state.studio.scope !== "local" || !state.studio.id || !state.studio.selectedFile) {
    return;
  }

  const content = getStudioEditorValue();
  try {
    const result = await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/files/content`, {
      method: "PUT",
      body: {
        path: state.studio.selectedFile.path,
        content
      }
    });
    if (result.checkState) {
      applyStudioCheckState(result.checkState);
    }
    state.studio.fileContent = content;
    state.studio.draftContent = content;
    state.studio.dirty = false;
    appendStudioTerminal(`Saved ${state.studio.selectedFile.path}.`, "success");
    renderStudio();
    remountStudioEditorIfNeeded();
    updateStudioControls();
  } catch (error) {
    appendStudioTerminal(error.message, "error");
  }
}

async function runStudioPlay() {
  if (!state.studio.scope || !state.studio.id) {
    notice("Choose a plugin before starting Playground.", "warning");
    return;
  }

  if (state.studio.dirty) {
    await saveStudioFile();
    if (state.studio.dirty) {
      return;
    }
  }

  state.studio.running = true;
  state.studio.playgroundUrl = "";
  state.studio.playgroundUrls = null;
  state.studio.activeTab = "home";
  state.studio.terminalOpen = true;
  appendStudioTerminal("Starting WordPress Playground…", "status");
  renderStudio();
  updateStudioControls();

  const job = await createJob({ type: "play", scope: state.studio.scope, id: state.studio.id });
  state.studio.jobId = job.id;
  updateStudioControls();
}

async function runStudioCheck() {
  if (state.studio.scope !== "local" || !state.studio.id) {
    notice("Plugin Check is available for local plugins.", "warning");
    return;
  }

  if (state.studio.dirty) {
    await saveStudioFile();
    if (state.studio.dirty) {
      return;
    }
  }

  state.studio.checking = true;
  state.studio.checkFindings = [];
  state.studio.checkSummary = null;
  state.studio.checkRanAt = null;
  state.studio.terminalOpen = true;
  appendStudioTerminal("Running WordPress.org Plugin Check…", "status");
  applyStudioCheckMarkers();
  renderStudio();
  updateStudioControls();

  const job = await createJob({ type: "check", localId: state.studio.id });
  state.studio.checkJobId = job.id;
  updateStudioControls();
}

async function runStudioAi() {
  if (state.studio.scope !== "local" || !state.studio.id) {
    notice("AI Assistance is available for local plugins.", "warning");
    return;
  }

  const assistant = selectedStudioAiAssistant();
  if (assistant === "none") {
    notice("Choose an AI assistant in Settings first.", "warning");
    showView("settings");
    return;
  }

  const provider = aiAssistanceProviders().find((item) => item.id === assistant);
  if (provider?.status === "not_installed") {
    notice(`${provider.label} is not installed or not on PATH.`, "warning");
    return;
  }

  const prompt = state.studio.aiPrompt.trim();
  if (!prompt) {
    updateStudioAiControls();
    return;
  }

  if (state.studio.aiRunning) {
    return;
  }

  if (state.studio.dirty) {
    await saveStudioFile();
    if (state.studio.dirty) {
      return;
    }
  }

  const selectedFile = state.studio.selectedFile?.path;
  state.studio.aiPrompt = "";
  state.studio.aiRunning = true;
  state.studio.aiStatus = `Starting ${assistantLabel(assistant)}.`;
  state.studio.aiActiveAssistant = assistant;
  appendStudioAiMessage("user", prompt);
  updateStudioAiSidebar();

  try {
    const job = await createJob({
      type: "ai-chat",
      localId: state.studio.id,
      assistant,
      selectedFile,
      prompt
    });
    state.studio.aiJobId = job.id;
    updateStudioAiControls();
  } catch (error) {
    state.studio.aiRunning = false;
    state.studio.aiStatus = "";
    state.studio.aiActiveAssistant = "";
    appendStudioAiMessage("system", error.message, "error");
    updateStudioAiSidebar();
    throw error;
  }
}

async function selectStudioAiChange(filePath) {
  const change = studioAiChangedFile(filePath);
  if (!change) {
    notice("That AI patch is no longer available.", "warning");
    return;
  }
  if (state.studio.dirty && !confirm("Discard unsaved changes in the current file?")) {
    return;
  }

  const existingFile = state.studio.files.find((file) => file.path === change.path);
  if (existingFile) {
    await selectStudioFile(change.path);
    return;
  }

  state.studio.selectedFile = {
    path: change.path,
    name: change.path.split("/").pop() ?? change.path,
    directory: change.path.includes("/") ? change.path.split("/").slice(0, -1).join("/") : "",
    size: 0
  };
  state.studio.fileContent = change.beforeContent ?? "";
  state.studio.draftContent = state.studio.fileContent;
  state.studio.dirty = false;
  state.studio.activeTab = "editor";
  renderStudio();
  remountStudioEditorIfNeeded();
  updateStudioAiSidebar();
}

async function acceptStudioAiChange(filePath) {
  const change = studioAiChangedFile(filePath);
  if (!change || state.studio.scope !== "local" || !state.studio.id) {
    return;
  }
  if (state.studio.dirty && state.studio.selectedFile?.path === change.path) {
    const confirmed = confirm("Accepting this AI patch will replace your unsaved edits in this editor.");
    if (!confirmed) {
      return;
    }
  }

  try {
    const result = await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/ai-changes/apply`, {
      method: "POST",
      body: {
        path: change.path,
        status: change.status,
        beforeContent: change.beforeContent,
        afterContent: change.afterContent
      }
    });
    if (result.checkState) {
      applyStudioCheckState(result.checkState);
    }
    state.studio.files = result.files ?? state.studio.files;
    removeStudioAiChangedFile(change.path);
    if (state.studio.selectedFile?.path === change.path) {
      if (change.status === "deleted") {
        const nextFile = chooseInitialStudioFile(state.studio.files, state.studio.plugin?.slug ?? "");
        state.studio.selectedFile = null;
        state.studio.fileContent = "";
        state.studio.draftContent = "";
        state.studio.dirty = false;
        if (nextFile) {
          await selectStudioFile(nextFile.path);
        }
      } else {
        state.studio.selectedFile =
          state.studio.files.find((file) => file.path === change.path) ?? state.studio.selectedFile;
        state.studio.fileContent = change.afterContent ?? "";
        state.studio.draftContent = state.studio.fileContent;
        state.studio.dirty = false;
      }
    }
    appendStudioAiMessage("system", `Accepted ${change.path}.`, "success");
    renderStudio();
    remountStudioEditorIfNeeded();
    updateStudioAiSidebar();
    updateStudioControls();
    void loadLocal();
  } catch (error) {
    appendStudioAiMessage("system", error.message, "error");
    updateStudioAiSidebar();
    notice(error.message, "error");
  }
}

function rejectStudioAiChange(filePath) {
  const change = studioAiChangedFile(filePath);
  if (!change) {
    return;
  }
  removeStudioAiChangedFile(change.path);
  if (state.studio.selectedFile?.path === change.path && !state.studio.files.some((file) => file.path === change.path)) {
    const nextFile = chooseInitialStudioFile(state.studio.files, state.studio.plugin?.slug ?? "");
    state.studio.selectedFile = null;
    state.studio.fileContent = "";
    state.studio.draftContent = "";
    state.studio.dirty = false;
    if (nextFile) {
      void selectStudioFile(nextFile.path);
    }
  }
  appendStudioAiMessage("system", `Rejected ${change.path}.`, "muted");
  renderStudio();
  remountStudioEditorIfNeeded();
  updateStudioAiSidebar();
  updateStudioControls();
}

function renderStudio() {
  if (!els.studio) {
    return;
  }
  disposeStudioEditor();

  const plugin = state.studio.plugin;
  const title = plugin?.name ?? (state.studio.id ? state.studio.id : "No plugin selected");
  const source =
    state.studio.scope === "local"
      ? plugin?.path ?? "Local plugin"
      : state.studio.scope === "remote"
        ? "WordPress.org plugin"
        : "Choose a plugin from WordPress.org or Local Library.";

  if (!state.studio.id) {
    const pickerOptions = studioPickerOptions();
    const pickerDisabled = pickerOptions.length ? "" : "disabled";
    const openDisabled = "disabled";
    const localCount = pickerOptions.filter((option) => option.scope === "local").length;
    const remoteCount = pickerOptions.filter((option) => option.scope === "remote").length;

    els.studio.innerHTML = `
      <div class="studio-root studio-empty-root">
        <div class="studio-empty-state" aria-label="Open Studio workspace">
          <section class="studio-empty-copy">
            <span class="studio-empty-kicker">
              <span class="dashicons dashicons-editor-code" aria-hidden="true"></span>
              Pressship Studio
            </span>
            <h1>Open a plugin workspace</h1>
            <p class="studio-empty-subtitle">
              Edit files, run Plugin Check, launch Playground, and ask AI for help from one local WordPress plugin workspace.
            </p>
            <div class="studio-empty-features" aria-label="Studio capabilities">
              <span><span class="dashicons dashicons-media-code" aria-hidden="true"></span>Files</span>
              <span><span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>Checks</span>
              <span><span class="dashicons dashicons-controls-play" aria-hidden="true"></span>Playground</span>
              <span><span class="dashicons dashicons-format-chat" aria-hidden="true"></span>AI</span>
            </div>
          </section>
          <section class="studio-empty-panel" aria-label="Choose a plugin">
            <header>
              <span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span>
              <span>
                <strong>Choose a plugin</strong>
                <small>${escapeHtml(`${localCount} local, ${remoteCount} WordPress.org`)}</small>
              </span>
            </header>
            <div class="studio-empty-picker">
              <select id="studio-plugin-picker" aria-label="Plugin to open in Studio" ${pickerDisabled}>
                ${renderStudioPickerOptions(pickerOptions)}
              </select>
              <button class="studio-action-button is-primary" type="button" data-action="studio-open-selected" ${openDisabled}>
                <span class="dashicons dashicons-editor-code" aria-hidden="true"></span>
                Open
              </button>
            </div>
            <p>Open a tracked plugin, or add a local project folder to start editing.</p>
            <button class="button button-secondary" type="button" data-action="choose-local-folder">
              <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
              Choose Folder
            </button>
          </section>
          <div class="studio-empty-footer">
            <span class="dashicons dashicons-lock" aria-hidden="true"></span>
            Runs locally on this machine. File edits stay in the selected plugin directory.
          </div>
        </div>
      </div>
    `;
    updateStudioPickerControls();
    updateStudioControls();
    return;
  }

  const fileList = state.studio.files.length
    ? renderStudioFileTree(buildStudioFileTree(state.studio.files))
    : `<p class="studio-muted">No editable text files found.</p>`;
  const editorTabLabel = state.studio.selectedFile?.path ?? "Editor";
  const playgroundPort = state.studio.playgroundUrl ? new URL(state.studio.playgroundUrl).port : "";

  els.studio.innerHTML = `
    <div class="studio-root${state.studio.terminalOpen ? " has-terminal" : ""}">
      <header class="studio-titlebar">
        <div class="studio-title">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(source)}</span>
        </div>
        <div class="studio-title-actions">
          <button class="studio-icon-button" type="button" data-action="studio-toggle-terminal" aria-pressed="${state.studio.terminalOpen ? "true" : "false"}" title="${state.studio.terminalOpen ? "Hide terminal" : "Show terminal"}">
            <span class="dashicons dashicons-editor-kitchensink" aria-hidden="true"></span>
            <span>Terminal</span>
          </button>
          <button class="studio-action-button" type="button" data-action="studio-save" id="studio-save-button" disabled>
            <span class="dashicons dashicons-saved" aria-hidden="true"></span>
            Save
          </button>
          <button class="studio-action-button" type="button" data-action="studio-check" id="studio-check-button" disabled>
            <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
            Check
          </button>
        </div>
      </header>
      <div class="studio-main">
        <aside class="studio-files" aria-label="Plugin files">
          <div class="studio-file-list">${fileList}</div>
        </aside>
        ${renderStudioResizer("files", "h", { label: "files panel" })}
        <section class="studio-workbench" aria-label="Studio editor">
          <div class="studio-tabs" aria-label="Studio tabs and Playground controls">
            <div class="studio-tablist" role="tablist" aria-label="Studio tabs">
              <button type="button" role="tab" aria-selected="${state.studio.activeTab === "editor" ? "true" : "false"}" class="studio-tab-button studio-editor-tab${state.studio.activeTab === "editor" ? " is-active" : ""}" data-action="studio-tab" data-tab="editor">
                <span class="dashicons ${studioFileIcon(editorTabLabel)}" aria-hidden="true"></span>
                <span>${escapeHtml(editorTabLabel)}</span>
                ${state.studio.dirty ? `<em aria-label="Unsaved changes"></em>` : ""}
              </button>
              <button type="button" role="tab" aria-selected="${state.studio.activeTab === "home" ? "true" : "false"}" class="studio-tab-button studio-preview-tab${state.studio.activeTab === "home" ? " is-active" : ""}" data-action="studio-tab" data-tab="home">
                <span class="dashicons dashicons-admin-home" aria-hidden="true"></span>
                <span>Home</span>
                ${playgroundPort ? `<small>${escapeHtml(`:${playgroundPort}`)}</small>` : ""}
              </button>
              <button type="button" role="tab" aria-selected="${state.studio.activeTab === "admin" ? "true" : "false"}" class="studio-tab-button studio-preview-tab${state.studio.activeTab === "admin" ? " is-active" : ""}" data-action="studio-tab" data-tab="admin">
                <span class="dashicons dashicons-admin-site-alt3" aria-hidden="true"></span>
                <span>WP Admin</span>
                ${state.studio.playgroundUrl ? `<small>admin/password</small>` : ""}
              </button>
            </div>
            ${renderStudioPlayButton()}
            <span class="studio-preview-state${state.studio.running ? " is-loading" : state.studio.playgroundUrl ? " is-ready" : ""}">
              <span aria-hidden="true"></span>
              ${escapeHtml(studioPreviewStateLabel())}
            </span>
            <span class="studio-tab-spacer"></span>
            <span id="studio-editor-status">${escapeHtml(studioEditorStatusLabel())}</span>
          </div>
          <div class="studio-panel-body">
            ${renderStudioPanelContent()}
          </div>
          ${
            state.studio.terminalOpen
              ? `${renderStudioResizer("terminal", "v", { invert: true, label: "terminal" })}
                <section class="studio-terminal" aria-label="Terminal">
                  <header>
                    <strong>Terminal</strong>
                    <span>${state.studio.running ? "Running" : "Ready"}</span>
                  </header>
                  <div id="studio-terminal-output" class="studio-terminal-output">
                    ${renderStudioTerminal()}
                  </div>
                </section>`
              : ""
          }
        </section>
        ${renderStudioResizer("ai", "h", { invert: true, label: "AI panel" })}
        <aside class="studio-ai" id="studio-ai" aria-label="Studio AI chat">
          ${renderStudioAiSidebar()}
        </aside>
      </div>
    </div>
  `;
  applyStudioLayout(els.studio.querySelector(".studio-root"));
  bindStudioResizers();
  updateStudioControls();
}

async function openSelectedStudioPlugin() {
  const picker = document.getElementById("studio-plugin-picker");
  const value = picker?.value ?? "";
  if (!value) {
    notice("Choose a plugin to open in Studio.", "warning");
    return;
  }

  const separator = value.indexOf(":");
  const scope = separator > 0 ? value.slice(0, separator) : "";
  const id = separator > 0 ? value.slice(separator + 1) : "";
  if (!["local", "remote"].includes(scope) || !id) {
    notice("Could not open the selected plugin.", "error");
    return;
  }

  await openStudio(scope, id);
}

function studioPickerOptions() {
  return [
    ...state.local.filter((plugin) => plugin.id).map((plugin) => ({
      scope: "local",
      id: plugin.id,
      name: plugin.name || plugin.slug || plugin.id,
      meta: plugin.slug || plugin.path || "local"
    })),
    ...state.remote.filter((plugin) => plugin.slug).map((plugin) => ({
      scope: "remote",
      id: plugin.slug,
      name: plugin.name || plugin.slug,
      meta: plugin.slug || "wordpress.org"
    }))
  ].sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
}

function renderStudioPickerOptions(options) {
  if (!options.length) {
    return `<option value="">No plugins loaded yet</option>`;
  }

  const local = options.filter((option) => option.scope === "local");
  const remote = options.filter((option) => option.scope === "remote");
  return [
    `<option value="">Select plugin…</option>`,
    local.length ? renderStudioPickerGroup("Local plugins", local) : "",
    remote.length ? renderStudioPickerGroup("WordPress.org plugins", remote) : ""
  ].join("");
}

function renderStudioPickerGroup(label, options) {
  return `
    <optgroup label="${escapeAttr(label)}">
      ${options
        .map(
          (option) =>
            `<option value="${escapeAttr(`${option.scope}:${option.id}`)}">${escapeHtml(`${option.name} — ${option.meta}`)}</option>`
        )
        .join("")}
    </optgroup>
  `;
}

function updateStudioPickerControls() {
  const picker = document.getElementById("studio-plugin-picker");
  const button = document.querySelector('[data-action="studio-open-selected"]');
  if (!button) {
    return;
  }

  button.disabled = !picker || !picker.value;
}

function renderStudioPanelContent() {
  if (state.studio.activeTab === "home" || state.studio.activeTab === "admin") {
    return `<div id="studio-preview" class="studio-preview">${renderStudioPreviewContent()}</div>`;
  }

  const hasCheckNotes = state.studio.checking || Boolean(state.studio.checkSummary);
  const hasAiPatch = Boolean(studioAiChangedFile(state.studio.selectedFile?.path));
  return `
    <div class="studio-editor-shell${hasCheckNotes ? " has-check-notes" : ""}${hasAiPatch ? " has-ai-patch" : ""}">
      <div id="studio-editor" class="studio-editor"></div>
      ${renderStudioAiEditorNotice()}
      ${hasCheckNotes ? renderStudioResizer("checkNotes", "v", { invert: true, label: "Plugin Check panel" }) : ""}
      ${renderStudioCheckNotes()}
    </div>
  `;
}

function renderStudioPlayButton() {
  const running = state.studio.running;
  const hasPlayground = Boolean(state.studio.playgroundUrl);
  return `
    <button class="studio-play-tab-button${running ? " is-loading" : ""}" type="button" data-action="studio-run" id="studio-play-button" disabled title="${escapeAttr(running ? "Starting Playground" : hasPlayground ? "Restart Playground" : "Start Playground")}">
      <span class="dashicons ${running ? "dashicons-update" : "dashicons-controls-play"}" aria-hidden="true"></span>
      <span>${escapeHtml(running ? "Starting" : hasPlayground ? "Restart" : "Play")}</span>
    </button>
  `;
}

function studioPreviewStateLabel() {
  if (state.studio.running) {
    return "Starting Playground";
  }
  if (state.studio.playgroundUrl) {
    return "Playground ready";
  }
  return "Not started";
}

function studioEditorStatusLabel() {
  if (state.studio.readOnly) {
    return "Read-only";
  }
  if (state.studio.dirty) {
    return "Unsaved";
  }
  if (studioAiChangedFile(state.studio.selectedFile?.path)) {
    return "Patch pending";
  }
  return "Saved";
}

function switchStudioTab(tab) {
  if (!["editor", "home", "admin"].includes(tab)) {
    return;
  }
  captureStudioEditorValue();
  state.studio.activeTab = tab;
  renderStudio();
  remountStudioEditorIfNeeded();
}

function toggleStudioTerminal() {
  captureStudioEditorValue();
  state.studio.terminalOpen = !state.studio.terminalOpen;
  renderStudio();
  remountStudioEditorIfNeeded();
}

function toggleStudioFolder(folderPath) {
  if (!folderPath) {
    return;
  }
  captureStudioEditorValue();
  if (state.studio.collapsedFolders.has(folderPath)) {
    state.studio.collapsedFolders.delete(folderPath);
  } else {
    state.studio.collapsedFolders.add(folderPath);
  }
  renderStudio();
  remountStudioEditorIfNeeded();
}

function buildStudioFileTree(files) {
  const root = { type: "folder", name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (isFile) {
        node.children.set(part, {
          type: "file",
          name: part,
          path: file.path,
          file
        });
        return;
      }

      if (!node.children.has(part)) {
        node.children.set(part, {
          type: "folder",
          name: part,
          path: currentPath,
          children: new Map()
        });
      }
      node = node.children.get(part);
    });
  }

  return root;
}

function renderStudioFileTree(root) {
  return `<div class="studio-tree" role="tree">${renderStudioTreeChildren(root.children, 0)}</div>`;
}

function renderStudioTreeChildren(children, depth) {
  return sortStudioTreeChildren(children).map((node) => renderStudioTreeNode(node, depth)).join("");
}

function renderStudioTreeNode(node, depth) {
  if (node.type === "folder") {
    const collapsed = state.studio.collapsedFolders.has(node.path);
    const containsCurrent = Boolean(
      state.studio.selectedFile?.path && state.studio.selectedFile.path.startsWith(`${node.path}/`)
    );
    const containsAiChange = studioAiChangedFilesForPrefix(node.path).length > 0;
    return `
      <div class="studio-tree-folder${containsCurrent ? " has-current" : ""}${containsAiChange ? " has-ai-changes" : ""}" role="treeitem" aria-expanded="${collapsed ? "false" : "true"}">
        <button type="button" class="studio-tree-row studio-tree-folder-row" data-action="studio-toggle-folder" data-folder="${escapeAttr(node.path)}" style="--depth:${depth}">
          <span class="dashicons ${collapsed ? "dashicons-arrow-right-alt2" : "dashicons-arrow-down-alt2"} studio-tree-arrow" aria-hidden="true"></span>
          <span class="dashicons ${collapsed ? "dashicons-category" : "dashicons-open-folder"} studio-tree-icon" aria-hidden="true"></span>
          <span class="studio-tree-label">${escapeHtml(node.name)}</span>
          ${containsAiChange ? `<span class="studio-tree-ai-badge" title="AI patches inside this folder">AI</span>` : ""}
        </button>
        ${collapsed ? "" : `<div role="group">${renderStudioTreeChildren(node.children, depth + 1)}</div>`}
      </div>
    `;
  }

  const current = node.path === state.studio.selectedFile?.path;
  const checkCounts = studioCheckCountsForPath(node.path);
  const aiChange = studioAiChangedFile(node.path);
  const checkBadge = checkCounts.total
    ? `<span class="studio-tree-check-badge${checkCounts.error ? " has-errors" : ""}" title="${escapeAttr(formatCheckCounts(checkCounts))}">${escapeHtml(String(checkCounts.total))}</span>`
    : "";
  const aiBadge = aiChange
    ? `<span class="studio-tree-ai-badge" title="${escapeAttr(`AI proposed ${aiChange.status} patch`)}">AI</span>`
    : "";
  return `
    <button type="button" role="treeitem" class="studio-tree-row studio-tree-file-row${current ? " is-current" : ""}${checkCounts.error ? " has-check-errors" : ""}${aiChange ? " has-ai-changes" : ""}" data-action="studio-file" data-path="${escapeAttr(node.path)}" style="--depth:${depth}">
      <span class="studio-tree-indent" aria-hidden="true"></span>
      <span class="dashicons ${studioFileIcon(node.path)} studio-tree-icon" aria-hidden="true"></span>
      <span class="studio-tree-label">${escapeHtml(node.name)}</span>
      <span class="studio-tree-badges">${aiBadge}${checkBadge}</span>
    </button>
  `;
}

function renderStudioAiSidebar() {
  const assistant = selectedStudioAiAssistant();
  const pluginPath = state.studio.scope === "local" ? state.studio.plugin?.path : "";
  const canSend = canRunStudioAi();
  const disabledReason = studioAiDisabledReason();
  const messages = renderStudioAiMessages();
  const selectedFile = state.studio.selectedFile?.path;
  const isRunning = state.studio.aiRunning;
  const statusText = isRunning ? state.studio.aiStatus || "Thinking…" : assistant === "none" ? "Disabled" : "Ready";
  const statusTone = isRunning ? "running" : assistant === "none" ? "disabled" : "ready";
  const kbdMod = isMac ? "⌘" : "Ctrl";
  const hasMessages = state.studio.aiMessages.length || state.studio.aiChangedFiles.length;

  return `
    <header class="studio-ai-header">
      <div class="studio-ai-agent">
        <span class="studio-ai-avatar" aria-hidden="true">
          <span class="dashicons dashicons-superhero-alt"></span>
        </span>
        <span class="studio-ai-agent-text">
          <strong>${escapeHtml(assistantLabel(assistant === "none" ? selectedStudioAiAssistant() : assistant))}</strong>
          <small class="studio-ai-status studio-ai-status-${escapeAttr(statusTone)}" title="${escapeAttr(statusText)}">
            <span class="studio-ai-status-dot${isRunning ? " is-running" : ""}" aria-hidden="true"></span>
            <span>${escapeHtml(statusText)}</span>
          </small>
        </span>
      </div>
      <div class="studio-ai-header-actions">
        <button class="studio-ai-icon-button" type="button" data-action="studio-ai-clear" aria-label="Clear chat" title="Clear chat" ${hasMessages ? "" : "disabled"}>
          <span class="dashicons dashicons-trash" aria-hidden="true"></span>
        </button>
      </div>
    </header>
    <div class="studio-ai-context" aria-label="Active context">
      <span class="studio-ai-context-chip" title="${escapeAttr(pluginPath || "Local plugin required")}">
        <span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span>
        ${escapeHtml(state.studio.plugin?.slug ?? state.studio.id ?? "No plugin")}
      </span>
      ${
        selectedFile
          ? `<span class="studio-ai-context-chip" title="${escapeAttr(selectedFile)}">
              <span class="dashicons ${studioFileIcon(selectedFile)}" aria-hidden="true"></span>
              ${escapeHtml(studioContextFileLabel(selectedFile))}
            </span>`
          : ""
      }
    </div>
    ${renderStudioAiChangedFiles()}
    <div id="studio-ai-messages" class="studio-ai-messages" aria-live="polite">
      ${messages}
    </div>
    <footer class="studio-ai-composer">
      ${
        disabledReason
          ? `<p class="studio-ai-state">
              <span class="dashicons dashicons-info-outline" aria-hidden="true"></span>
              <span>${escapeHtml(disabledReason)}</span>
              ${assistant === "none" ? `<button class="studio-ai-state-action" type="button" data-view-button="settings">Open Settings</button>` : ""}
            </p>`
          : ""
      }
      <div class="studio-ai-input-shell${canSend ? "" : " is-disabled"}">
        <textarea id="studio-ai-prompt" rows="2" aria-label="Message ${escapeAttr(assistantLabel(assistant))}" placeholder="${escapeAttr(studioAiPlaceholder(assistant, canSend))}" ${canSend ? "" : "disabled"}>${escapeHtml(state.studio.aiPrompt)}</textarea>
        <div class="studio-ai-input-footer">
          <span class="studio-ai-hint">
            <kbd>${escapeHtml(kbdMod)}</kbd><kbd>⏎</kbd>
            <span>to send</span>
          </span>
          <button class="studio-ai-send-button" type="button" data-action="studio-ai-send" id="studio-ai-send-button" aria-label="Send message" title="Send message" ${canSend && state.studio.aiPrompt.trim() ? "" : "disabled"}>
            <span class="dashicons ${isRunning ? "dashicons-update" : "dashicons-arrow-right-alt"}" aria-hidden="true"></span>
            <span>${escapeHtml(isRunning ? "Working" : "Send")}</span>
          </button>
        </div>
      </div>
    </footer>
  `;
}

function studioAiPlaceholder(assistant, canSend) {
  if (!canSend) {
    if (assistant === "none") return "Enable AI in Settings to start a conversation.";
    if (state.studio.scope !== "local") return "Open a local plugin to chat with AI.";
    if (state.studio.aiRunning) return "Working on your last request…";
    return "AI is unavailable.";
  }
  return `Ask ${assistantLabel(assistant)} to refactor, add a feature, or fix a check finding…`;
}

function studioContextFileLabel(path) {
  if (!path) return "";
  const parts = path.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

function studioAiSuggestions() {
  const findings = state.studio.checkFindings ?? [];
  const errorFindings = findings.filter((f) => f.severity === "error");
  const suggestions = [];

  if (errorFindings.length) {
    suggestions.push({
      icon: "dashicons-yes-alt",
      label: `Fix ${errorFindings.length} Plugin Check error${errorFindings.length === 1 ? "" : "s"}`,
      prompt: "Fix the Plugin Check errors listed in the context above. Keep changes minimal."
    });
  }

  if (state.studio.selectedFile?.path) {
    suggestions.push({
      icon: "dashicons-edit",
      label: `Refactor ${studioContextFileLabel(state.studio.selectedFile.path)}`,
      prompt: `Refactor ${state.studio.selectedFile.path} for clarity. Keep the public API the same.`
    });
  }

  suggestions.push(
    {
      icon: "dashicons-media-text",
      label: "Update readme.txt",
      prompt: "Update the readme.txt with current features, tested-up-to version, and changelog entry."
    },
    {
      icon: "dashicons-shield",
      label: "Add input sanitization",
      prompt: "Review the plugin for unsanitized inputs and missing nonce checks. Add WordPress sanitization helpers where needed."
    },
    {
      icon: "dashicons-translation",
      label: "Make strings translatable",
      prompt: "Wrap user-facing strings with WordPress i18n functions and a proper text domain."
    }
  );

  return suggestions.slice(0, 4);
}

function renderStudioAiMessages() {
  if (!state.studio.aiMessages.length && !state.studio.aiRunning) {
    const assistant = selectedStudioAiAssistant();
    const canSend = canRunStudioAi();
    const suggestions = canSend ? studioAiSuggestions() : [];
    const suggestionMarkup = suggestions.length
      ? `
          <div class="studio-ai-suggestions" aria-label="Quick prompts">
            ${suggestions
              .map(
                (suggestion) => `
                  <button class="studio-ai-suggestion" type="button" data-action="studio-ai-suggestion" data-prompt="${escapeAttr(suggestion.prompt)}">
                    <span class="dashicons ${suggestion.icon}" aria-hidden="true"></span>
                    <span>${escapeHtml(suggestion.label)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        `
      : "";

    return `
      <div class="studio-ai-empty">
        <span class="studio-ai-avatar studio-ai-avatar-lg" aria-hidden="true">
          <span class="dashicons dashicons-superhero-alt"></span>
        </span>
        <strong>${escapeHtml(canSend ? `How can ${assistantLabel(assistant)} help?` : assistantLabel(assistant))}</strong>
        <small>${escapeHtml(canSend ? "Ask anything about this plugin, or pick a starter prompt." : "Open a local plugin and select an assistant to start chatting.")}</small>
        ${suggestionMarkup}
      </div>
    `;
  }

  return `${state.studio.aiMessages
    .slice(-60)
    .map(
      (message) =>
        message.role === "system"
          ? `
            <article class="studio-ai-message studio-ai-message-system studio-ai-message-${escapeAttr(message.tone ?? "muted")}">
              <span>${escapeHtml(message.text)}</span>
            </article>
          `
          : message.role === "user"
            ? `
            <article class="studio-ai-message studio-ai-message-${escapeAttr(message.role)} studio-ai-message-${escapeAttr(message.tone ?? "muted")}">
              <span class="studio-ai-avatar" aria-hidden="true">
                <span class="dashicons dashicons-admin-users"></span>
              </span>
              <div class="studio-ai-bubble">
                <header>
                  <span>${escapeHtml(aiMessageRoleLabel(message))}</span>
                  <time>${escapeHtml(formatTime(message.createdAt))}</time>
                </header>
                <p>${escapeHtml(message.text)}</p>
              </div>
            </article>
          `
            : `
            <article class="studio-ai-message studio-ai-message-assistant studio-ai-message-${escapeAttr(message.tone ?? "muted")}">
              <span class="studio-ai-avatar" aria-hidden="true">
                <span class="dashicons dashicons-format-chat"></span>
              </span>
              <div class="studio-ai-reply">
                <header>
                  <span>${escapeHtml(aiMessageRoleLabel(message))}</span>
                  <time>${escapeHtml(formatTime(message.createdAt))}</time>
                </header>
                <p>${escapeHtml(message.text)}</p>
              </div>
            </article>
          `
    )
    .join("")}${renderStudioAiTypingIndicator()}`;
}

function renderStudioAiTypingIndicator() {
  if (!state.studio.aiRunning) {
    return "";
  }

  return `
    <article class="studio-ai-message studio-ai-message-assistant studio-ai-typing" aria-live="polite">
      <span class="studio-ai-avatar" aria-hidden="true">
        <span class="dashicons dashicons-format-chat"></span>
      </span>
      <div class="studio-ai-reply studio-ai-typing-indicator" aria-label="${escapeAttr(assistantLabel(state.studio.aiActiveAssistant || selectedStudioAiAssistant()))} is writing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </article>
  `;
}

function renderStudioAiChangedFiles() {
  const changes = state.studio.aiChangedFiles ?? [];
  if (!changes.length) {
    return "";
  }

  return `
    <section class="studio-ai-changes" aria-label="AI patch proposals">
      <header>
        <span class="dashicons dashicons-media-code" aria-hidden="true"></span>
        <strong>${escapeHtml(`${changes.length} pending patch${changes.length === 1 ? "" : "es"}`)}</strong>
      </header>
      <div class="studio-ai-change-list">
        ${changes
          .slice(-12)
          .map((change) => renderStudioAiChangeCard(change))
          .join("")}
      </div>
    </section>
  `;
}

function renderStudioAiChangeCard(change) {
  const selected = change.path === state.studio.selectedFile?.path;
  return `
    <article class="studio-ai-change-card${selected ? " is-selected" : ""}">
      <button type="button" class="studio-ai-change" data-action="studio-ai-change" data-path="${escapeAttr(change.path)}">
        <span class="dashicons ${change.status === "deleted" ? "dashicons-trash" : studioFileIcon(change.path)}" aria-hidden="true"></span>
        <span>${escapeHtml(change.path)}</span>
        <small>${escapeHtml(studioAiPatchSummary(change))}</small>
      </button>
      <div class="studio-ai-change-actions" aria-label="${escapeAttr(`Review ${change.path}`)}">
        <button type="button" class="studio-ai-change-action is-accept" data-action="studio-ai-accept" data-path="${escapeAttr(change.path)}" title="Accept patch" aria-label="${escapeAttr(`Accept patch for ${change.path}`)}">
          <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
        </button>
        <button type="button" class="studio-ai-change-action is-reject" data-action="studio-ai-reject" data-path="${escapeAttr(change.path)}" title="Reject patch" aria-label="${escapeAttr(`Reject patch for ${change.path}`)}">
          <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
        </button>
      </div>
    </article>
  `;
}

function renderStudioAiEditorNotice() {
  const change = studioAiChangedFile(state.studio.selectedFile?.path);
  if (!change) {
    return "";
  }

  return `
    <div class="studio-ai-editor-notice">
      <span class="dashicons dashicons-media-code" aria-hidden="true"></span>
      <span>AI proposed ${escapeHtml(change.status)} changes for this file.</span>
      <span class="studio-ai-editor-notice-spacer"></span>
      <button type="button" class="studio-patch-button is-accept" data-action="studio-ai-accept" data-path="${escapeAttr(change.path)}">
        <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
        Accept
      </button>
      <button type="button" class="studio-patch-button is-reject" data-action="studio-ai-reject" data-path="${escapeAttr(change.path)}">
        <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
        Reject
      </button>
    </div>
  `;
}

function renderStudioAiPatchPreview() {
  const change = studioAiChangedFile(state.studio.selectedFile?.path);
  if (!change) {
    return "";
  }
  const hunks = Array.isArray(change.hunks) && change.hunks.length
    ? change.hunks
    : buildStudioAiPatchHunks(change.beforeContent ?? "", change.afterContent ?? "");
  const shownLines = hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
  const maxLines = 220;
  let remaining = maxLines;

  return `
    <section class="studio-ai-patch" aria-label="AI patch for ${escapeAttr(change.path)}">
      <header>
        <span>
          <strong>${escapeHtml(change.path)}</strong>
          <small>${escapeHtml(studioAiPatchSummary(change))}</small>
        </span>
        <span class="studio-ai-patch-stats">
          <span class="is-add">+${escapeHtml(String(change.additions ?? countStudioAiPatchLines(hunks, "add")))}</span>
          <span class="is-delete">-${escapeHtml(String(change.deletions ?? countStudioAiPatchLines(hunks, "delete")))}</span>
        </span>
      </header>
      <div class="studio-ai-patch-body">
        ${
          hunks.length
            ? hunks
                .map((hunk) => {
                  const lines = hunk.lines.slice(0, Math.max(0, remaining));
                  remaining -= lines.length;
                  return `
                    <div class="studio-ai-patch-hunk">
                      <div class="studio-ai-patch-hunk-header">@@ -${escapeHtml(String(hunk.oldStart))},${escapeHtml(String(hunk.oldLines))} +${escapeHtml(String(hunk.newStart))},${escapeHtml(String(hunk.newLines))} @@</div>
                      ${lines.map((line) => renderStudioAiPatchLine(line)).join("")}
                    </div>
                  `;
                })
                .join("")
            : `<p class="studio-ai-patch-empty">No textual patch was produced.</p>`
        }
        ${shownLines > maxLines ? `<p class="studio-ai-patch-empty">${escapeHtml(`${shownLines - maxLines} more lines hidden`)}</p>` : ""}
      </div>
    </section>
  `;
}

function renderStudioAiPatchLine(line) {
  const prefix = line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
  return `
    <div class="studio-ai-patch-line is-${escapeAttr(line.type)}">
      <span>${escapeHtml(prefix)}</span>
      <code>${escapeHtml(line.content || " ")}</code>
    </div>
  `;
}

function formatStudioAiUnifiedPatch(change) {
  const hunks = Array.isArray(change.hunks) && change.hunks.length
    ? change.hunks
    : buildStudioAiPatchHunks(change.beforeContent ?? "", change.afterContent ?? "");
  const header = [
    `--- ${change.status === "created" ? "/dev/null" : change.path}`,
    `+++ ${change.status === "deleted" ? "/dev/null" : change.path}`
  ];
  const body = hunks.flatMap((hunk) => [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...(hunk.lines ?? []).map((line) => `${line.type === "add" ? "+" : line.type === "delete" ? "-" : " "}${line.content}`)
  ]);
  return [...header, ...body].join("\n");
}

function sortStudioTreeChildren(children) {
  return Array.from(children.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function renderStudioTerminal() {
  const lines = state.studio.terminal.length ? state.studio.terminal : ["Studio terminal ready."];
  return lines
    .slice(-250)
    .map((line) => {
      const value = typeof line === "string" ? { message: line, tone: "muted" } : line;
      return `<p class="terminal-line terminal-${escapeAttr(value.tone ?? "muted")}">${escapeHtml(value.message)}</p>`;
    })
    .join("");
}

function renderStudioCheckNotes() {
  if (state.studio.checking) {
    return `
      <aside class="studio-check-notes" aria-label="Plugin Check notes">
        <div class="studio-check-note studio-check-note-status">
          <span class="dashicons dashicons-update" aria-hidden="true"></span>
          <span>Plugin Check is running…</span>
        </div>
      </aside>
    `;
  }

  if (!state.studio.checkSummary) {
    return "";
  }

  const findings = studioFindingsForPath(state.studio.selectedFile?.path);
  if (!findings.length) {
    const total = state.studio.checkSummary.total ?? 0;
    return `
      <aside class="studio-check-notes" aria-label="Plugin Check notes">
        <div class="studio-check-note studio-check-note-${total ? "info" : "success"}">
          <span class="dashicons ${total ? "dashicons-info-outline" : "dashicons-yes-alt"}" aria-hidden="true"></span>
          <span>${escapeHtml(total ? `${formatCheckCounts(state.studio.checkSummary)} in other files.` : "Plugin Check reported no findings.")}</span>
        </div>
      </aside>
    `;
  }

  return `
    <aside class="studio-check-notes" aria-label="Plugin Check notes">
      <header>
        <strong>Plugin Check</strong>
        <span>${escapeHtml(formatCheckCounts(studioCheckCountsForPath(state.studio.selectedFile?.path)))}</span>
      </header>
      <div class="studio-check-note-list">
        ${findings
          .map((finding) => {
            const line = studioFindingLine(finding);
            return `
              <button type="button" class="studio-check-note studio-check-note-${escapeAttr(finding.severity)}" data-action="studio-check-note" data-line="${escapeAttr(line)}" data-column="${escapeAttr(studioFindingColumn(finding))}">
                <span class="studio-check-note-line">${escapeHtml(line ? `L${line}` : "File")}</span>
                <span class="studio-check-note-text">
                  <strong>${escapeHtml(finding.code ?? finding.severity)}</strong>
                  ${escapeHtml(finding.message)}
                </span>
              </button>
            `;
          })
          .join("")}
      </div>
    </aside>
  `;
}

function studioFindingsForPath(filePath) {
  const normalized = normalizeStudioCheckPath(filePath);
  if (!normalized) {
    return [];
  }
  return (state.studio.checkFindings ?? []).filter((finding) => normalizeStudioCheckPath(finding.file) === normalized);
}

function studioCheckCountsForPath(filePath) {
  const counts = { error: 0, warning: 0, info: 0, total: 0 };
  for (const finding of studioFindingsForPath(filePath)) {
    counts[finding.severity] += 1;
    counts.total += 1;
  }
  return counts;
}

function formatCheckCounts(counts) {
  const parts = [
    counts.error ? `${counts.error} error${counts.error === 1 ? "" : "s"}` : "",
    counts.warning ? `${counts.warning} warning${counts.warning === 1 ? "" : "s"}` : "",
    counts.info ? `${counts.info} info` : ""
  ].filter(Boolean);
  return parts.join(", ") || "no findings";
}

function normalizeStudioCheckPath(filePath) {
  if (!filePath) {
    return "";
  }
  const slug = state.studio.plugin?.slug ?? "";
  const normalized = String(filePath).replace(/\\/g, "/").replace(/^\/+/, "");
  return slug && normalized.startsWith(`${slug}/`) ? normalized.slice(slug.length + 1) : normalized;
}

function studioFindingLine(finding) {
  const line = Number(finding?.line);
  if (Number.isFinite(line) && line > 0) {
    return line;
  }
  return finding?.file ? 1 : 0;
}

function studioFindingColumn(finding) {
  const column = Number(finding?.column);
  return Number.isFinite(column) && column > 0 ? column : 1;
}

function renderStudioPreviewContent() {
  const targetUrl = studioActivePlaygroundUrl();
  const label = state.studio.activeTab === "admin" ? "WP Admin" : "Home";
  if (state.studio.running) {
    return `
      <div class="studio-preview-loading" aria-live="polite" aria-busy="true">
        <span class="studio-preview-spinner" aria-hidden="true">
          <span></span>
          <span></span>
        </span>
        <strong>Starting WordPress Playground</strong>
        <p>Preparing the ${escapeHtml(label)} preview for this plugin.</p>
      </div>
    `;
  }

  if (!targetUrl) {
    const isAdmin = state.studio.activeTab === "admin";
    const previewTitle = isAdmin ? "WordPress Admin" : "Plugin Site";
    const previewPath = isAdmin ? "/wp-admin/" : "/";
    const previewCopy = isAdmin
      ? "Admin opens with the prepared local WordPress account."
      : "A temporary WordPress site will load here for this plugin.";
    return `
      <div class="studio-preview-empty${isAdmin ? " is-admin" : " is-home"}">
        <div class="studio-preview-shell" aria-hidden="true">
          <div class="studio-preview-browserbar">
            <span class="studio-preview-window-dot"></span>
            <span class="studio-preview-window-dot"></span>
            <span class="studio-preview-window-dot"></span>
            <span class="studio-preview-address">127.0.0.1${escapeHtml(previewPath)}</span>
          </div>
          <div class="studio-preview-skeleton">
            ${
              isAdmin
                ? `
                  <span class="studio-preview-adminbar"></span>
                  <span class="studio-preview-adminnav"></span>
                  <span class="studio-preview-admin-title"></span>
                  <span class="studio-preview-admin-row"></span>
                  <span class="studio-preview-admin-row"></span>
                `
                : `
                  <span class="studio-preview-site-header"></span>
                  <span class="studio-preview-site-title"></span>
                  <span class="studio-preview-site-line"></span>
                  <span class="studio-preview-site-line is-short"></span>
                  <span class="studio-preview-site-button"></span>
                `
            }
          </div>
        </div>
        <div class="studio-preview-empty-copy">
          <span class="studio-preview-kicker">
            <span class="dashicons ${isAdmin ? "dashicons-admin-site-alt3" : "dashicons-admin-home"}" aria-hidden="true"></span>
            ${escapeHtml(label)}
          </span>
          <strong>${escapeHtml(previewTitle)}</strong>
          <p>${escapeHtml(previewCopy)}</p>
          <button class="studio-preview-play-button" type="button" data-action="studio-run">
            <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
            Start Playground
          </button>
        </div>
      </div>
    `;
  }

  return `<iframe title="${state.studio.activeTab === "admin" ? "WordPress Playground WP Admin" : "WordPress Playground home"}" src="${escapeAttr(targetUrl)}"></iframe>`;
}

function studioActivePlaygroundUrl() {
  if (!state.studio.playgroundUrl) {
    return "";
  }
  if (state.studio.activeTab === "admin") {
    return state.studio.playgroundUrls?.admin ?? `${state.studio.playgroundUrl.replace(/\/$/, "")}/wp-admin/?pressship_auto_login=1`;
  }
  return state.studio.playgroundUrls?.home ?? state.studio.playgroundUrl;
}

function appendStudioTerminal(message, tone = "muted") {
  state.studio.terminal.push({ message: String(message), tone });
  const output = document.getElementById("studio-terminal-output");
  if (output) {
    output.innerHTML = renderStudioTerminal();
    output.scrollTop = output.scrollHeight;
  }
}

function selectedStudioAiAssistant() {
  return state.settings?.aiAssistant ?? "none";
}

function assistantLabel(id) {
  const labels = {
    none: "AI",
    codex: "Codex",
    claude: "Claude",
    copilot: "Copilot",
    gemini: "Gemini",
    "wp-studio": "WP Studio"
  };
  return labels[id] ?? capitalize(String(id));
}

function aiMessageRoleLabel(message) {
  if (message.role === "user") return "You";
  if (message.role === "assistant") return assistantLabel(message.assistant ?? state.studio.aiActiveAssistant ?? selectedStudioAiAssistant());
  return "Studio";
}

function canRunStudioAi() {
  return (
    state.studio.scope === "local" &&
    Boolean(state.studio.id) &&
    !state.studio.loading &&
    !state.studio.aiRunning &&
    selectedStudioAiAssistant() !== "none"
  );
}

function studioAiDisabledReason() {
  if (state.studio.scope !== "local") {
    return "Open a local plugin to use AI.";
  }
  if (selectedStudioAiAssistant() === "none") {
    return "Select AI Assistance in Settings.";
  }
  if (state.studio.aiRunning) {
    return "";
  }
  return "";
}

function applyStudioCheckState(checkState) {
  if (!checkState) {
    state.studio.checkFindings = [];
    state.studio.checkSummary = null;
    state.studio.checkRanAt = null;
    return;
  }

  state.studio.checkFindings = checkState.findings ?? [];
  state.studio.checkSummary = checkState.summary ?? null;
  state.studio.checkRanAt = checkState.checkedAt ?? null;
}

function appendStudioAiMessage(role, text, tone = "muted") {
  state.studio.aiMessages.push({
    role,
    text: String(text ?? ""),
    tone,
    assistant: role === "assistant" ? state.studio.aiActiveAssistant || selectedStudioAiAssistant() : undefined,
    createdAt: new Date().toISOString()
  });
}

function appendStudioAiOutput(text, tone = "log") {
  const output = String(text ?? "");
  if (!output) {
    return;
  }

  let last = state.studio.aiMessages[state.studio.aiMessages.length - 1];
  if (!last || last.role !== "assistant") {
    appendStudioAiMessage("assistant", "", tone);
    last = state.studio.aiMessages[state.studio.aiMessages.length - 1];
  }
  last.text = `${last.text}${output}`;
  last.tone = tone === "error" ? "error" : last.tone === "status" ? "log" : last.tone;
  updateStudioAiSidebar();
}

function updateStudioAiSidebar() {
  const node = document.getElementById("studio-ai");
  if (!node) {
    return;
  }

  node.innerHTML = renderStudioAiSidebar();
  const messages = document.getElementById("studio-ai-messages");
  if (messages) {
    messages.scrollTop = messages.scrollHeight;
  }
  updateStudioAiControls();
}

function updateStudioAiControls() {
  const prompt = document.getElementById("studio-ai-prompt");
  const send = document.getElementById("studio-ai-send-button");
  const canSend = canRunStudioAi();
  if (prompt && prompt.value !== state.studio.aiPrompt) {
    prompt.value = state.studio.aiPrompt;
  }
  if (prompt) {
    prompt.disabled = !canSend;
  }
  if (send) {
    send.disabled = !canSend || !state.studio.aiPrompt.trim();
    send.innerHTML = state.studio.aiRunning
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span>`
      : `<span class="dashicons dashicons-arrow-right-alt" aria-hidden="true"></span>`;
    send.title = state.studio.aiRunning ? "Running" : "Send message";
  }
}

function studioAiChangedFile(filePath) {
  if (!filePath) {
    return undefined;
  }
  return state.studio.aiChangedFiles.find((change) => change.path === filePath);
}

function studioAiChangedFilesForPrefix(prefix) {
  const root = prefix ? `${prefix}/` : "";
  return state.studio.aiChangedFiles.filter((change) =>
    prefix ? change.path === prefix || change.path.startsWith(root) : Boolean(change.path)
  );
}

function mergeStudioAiChangedFiles(changes) {
  const existing = new Map((state.studio.aiChangedFiles ?? []).map((change) => [change.path, change]));
  for (const change of changes ?? []) {
    if (!change?.path) {
      continue;
    }
    existing.set(change.path, {
      path: change.path,
      status: change.status ?? change.type ?? "modified",
      beforeContent: typeof change.beforeContent === "string" ? change.beforeContent : undefined,
      afterContent: typeof change.afterContent === "string" ? change.afterContent : undefined,
      additions: Number.isFinite(Number(change.additions)) ? Number(change.additions) : undefined,
      deletions: Number.isFinite(Number(change.deletions)) ? Number(change.deletions) : undefined,
      hunks: Array.isArray(change.hunks) ? change.hunks : [],
      createdAt: change.createdAt ?? new Date().toISOString()
    });
  }
  state.studio.aiChangedFiles = Array.from(existing.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function removeStudioAiChangedFile(filePath) {
  state.studio.aiChangedFiles = (state.studio.aiChangedFiles ?? []).filter((change) => change.path !== filePath);
}

function studioAiPatchSummary(change) {
  const additions = Number(change.additions ?? 0);
  const deletions = Number(change.deletions ?? 0);
  const stats = additions || deletions ? ` +${additions} -${deletions}` : "";
  return `${change.status ?? "modified"}${stats}`;
}

function buildStudioAiPatchHunks(beforeContent, afterContent) {
  if (beforeContent === afterContent) {
    return [];
  }
  const beforeLines = splitStudioAiPatchLines(beforeContent);
  const afterLines = splitStudioAiPatchLines(afterContent);
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (beforeEnd >= prefix && afterEnd >= prefix && beforeLines[beforeEnd] === afterLines[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  const contextStart = Math.max(0, prefix - 3);
  const leadingContext = beforeLines.slice(contextStart, prefix);
  const removed = beforeLines.slice(prefix, beforeEnd + 1);
  const added = afterLines.slice(prefix, afterEnd + 1);
  const trailingContext = beforeLines.slice(beforeEnd + 1, Math.min(beforeLines.length, beforeEnd + 4));
  return [
    {
      oldStart: contextStart + 1,
      oldLines: leadingContext.length + removed.length + trailingContext.length,
      newStart: contextStart + 1,
      newLines: leadingContext.length + added.length + trailingContext.length,
      lines: [
        ...leadingContext.map((content) => ({ type: "context", content })),
        ...removed.map((content) => ({ type: "delete", content })),
        ...added.map((content) => ({ type: "add", content })),
        ...trailingContext.map((content) => ({ type: "context", content }))
      ]
    }
  ];
}

function splitStudioAiPatchLines(content) {
  return content ? String(content).replace(/\r\n/g, "\n").split("\n") : [];
}

function countStudioAiPatchLines(hunks, type) {
  return (hunks ?? []).reduce(
    (count, hunk) => count + (hunk.lines ?? []).filter((line) => line.type === type).length,
    0
  );
}

function handleStudioJobEvent(id, payload) {
  const isPlayJob = state.studio.jobId === id;
  const isCheckJob = state.studio.checkJobId === id;
  const isAiJob = state.studio.aiJobId === id;
  if (!isPlayJob && !isCheckJob && !isAiJob) {
    return;
  }

  if (payload.type === "status") {
    const message = payload.data?.message ?? payload.data;
    if (isAiJob) {
      state.studio.aiStatus = String(message ?? "");
      updateStudioAiSidebar();
    } else {
      appendStudioTerminal(message, "status");
    }
  } else if (payload.type === "log") {
    if (isAiJob) {
      appendStudioAiOutput(payload.data?.message ?? payload.data, "log");
      if (payload.data?.data?.changedFiles) {
        mergeStudioAiChangedFiles(payload.data.data.changedFiles);
        updateStudioAiSidebar();
        renderStudio();
        remountStudioEditorIfNeeded();
      }
    } else {
      appendStudioTerminal(payload.data?.message ?? payload.data, "log");
    }
  } else if (payload.type === "job-error" || payload.type === "error") {
    const message = payload.data?.message ?? payload.data;
    if (isAiJob) {
      state.studio.aiRunning = false;
      state.studio.aiStatus = "";
      state.studio.aiActiveAssistant = "";
      appendStudioAiMessage("system", message, "error");
    } else {
      appendStudioTerminal(message, "error");
    }
    if (isPlayJob) {
      state.studio.running = false;
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    if (isCheckJob) {
      state.studio.checking = false;
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    if (isAiJob) {
      updateStudioAiSidebar();
    }
    updateStudioControls();
  } else if (payload.type === "done") {
    if (isPlayJob) {
      state.studio.running = payload.data?.status === "running" || payload.data?.status === "queued";
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    if (isCheckJob) {
      state.studio.checking = payload.data?.status === "running" || payload.data?.status === "queued";
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    if (isAiJob) {
      state.studio.aiRunning = false;
      state.studio.aiStatus = "";
      state.studio.aiActiveAssistant = "";
      updateStudioAiSidebar();
    } else {
      appendStudioTerminal(`Job ${payload.data?.status ?? "finished"}.`, payload.data?.status === "succeeded" ? "success" : "muted");
    }
    updateStudioControls();
  }
}

function handleStudioPlaygroundResult(id, result) {
  if (state.studio.jobId !== id || !result?.url) {
    return false;
  }

  state.studio.playgroundUrl = result.url;
  state.studio.playgroundUrls = result.urls ?? {
    home: result.url,
    admin: `${result.url.replace(/\/$/, "")}/wp-admin/?pressship_auto_login=1`
  };
  state.studio.activeTab = "home";
  state.studio.running = false;
  appendStudioTerminal(`Playground ready at ${state.studio.playgroundUrls.home}.`, "success");
  appendStudioTerminal("WP Admin credentials: admin / password.", "status");
  renderStudio();
  updateStudioControls();
  return true;
}

async function handleStudioAiResult(result) {
  state.studio.aiRunning = false;
  state.studio.aiStatus = "";
  state.studio.aiActiveAssistant = "";
  mergeStudioAiChangedFiles(result.changedFiles ?? []);
  if (result.checkState) {
    applyStudioCheckState(result.checkState);
  }

  if (result.changedFiles?.length) {
    appendStudioAiMessage(
      "system",
      `${assistantLabel(result.assistant)} proposed ${result.changedFiles.length} patch${result.changedFiles.length === 1 ? "" : "es"}.`,
      "success"
    );
  } else if (!studioHasAssistantOutput()) {
    appendStudioAiMessage("system", `${assistantLabel(result.assistant)} finished without file changes.`, "muted");
  }

  updateStudioAiSidebar();
  const firstChange = result.changedFiles?.[0];
  if (firstChange?.path) {
    await selectStudioAiChange(firstChange.path);
  } else {
    renderStudio();
    remountStudioEditorIfNeeded();
  }
}

function studioHasAssistantOutput() {
  return (state.studio.aiMessages ?? []).some((message) => message.role === "assistant" && String(message.text ?? "").trim());
}

function chooseInitialStudioFile(files, slug) {
  return (
    files.find((file) => file.path === `${slug}.php`) ??
    files.find((file) => file.path.endsWith(".php")) ??
    files.find((file) => file.path.toLowerCase() === "readme.txt") ??
    files[0]
  );
}

function updateStudioControls() {
  const canRun = Boolean(state.studio.id) && !state.studio.loading && !state.studio.running;
  const canCheck =
    state.studio.scope === "local" && Boolean(state.studio.id) && !state.studio.loading && !state.studio.checking;
  const studioPlay = document.getElementById("studio-play-button");
  const studioCheck = document.getElementById("studio-check-button");
  const studioSave = document.getElementById("studio-save-button");
  if (studioPlay) {
    studioPlay.disabled = !canRun;
    studioPlay.classList.toggle("is-loading", state.studio.running);
    studioPlay.innerHTML = state.studio.running
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span><span>Starting</span>`
      : `<span class="dashicons dashicons-controls-play" aria-hidden="true"></span><span>${state.studio.playgroundUrl ? "Restart" : "Play"}</span>`;
    studioPlay.title = state.studio.running
      ? "Starting Playground"
      : state.studio.playgroundUrl
        ? "Restart Playground"
        : "Start Playground";
  }
  if (studioCheck) {
    studioCheck.disabled = !canCheck;
    studioCheck.innerHTML = state.studio.checking
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span> Checking…`
      : `<span class="dashicons dashicons-yes-alt" aria-hidden="true"></span> ${state.studio.checkSummary ? "Re-check" : "Check"}`;
  }
  if (studioSave) {
    studioSave.disabled = state.studio.readOnly || !state.studio.selectedFile || !state.studio.dirty;
  }
  updateStudioAiControls();
}

function disposeStudioEditor() {
  if (state.studio?.editor?.dispose) {
    state.studio.editor.dispose();
  }
  for (const model of state.studio?.editorModels ?? []) {
    if (model?.dispose) {
      model.dispose();
    }
  }
  state.studio.editor = null;
  state.studio.editorKind = null;
  state.studio.editorModels = [];
}

function captureStudioEditorValue() {
  if (!state.studio.editorKind) {
    return;
  }
  state.studio.draftContent = getStudioEditorValue();
  state.studio.dirty = state.studio.draftContent !== state.studio.fileContent;
}

function remountStudioEditorIfNeeded() {
  if (state.studio.activeTab === "editor") {
    void mountStudioEditor(state.studio.draftContent ?? state.studio.fileContent ?? "");
  }
}

async function mountStudioEditor(content) {
  const container = document.getElementById("studio-editor");
  if (!container) {
    return;
  }
  disposeStudioEditor();
  state.studio.editor = null;
  state.studio.editorKind = null;
  state.studio.editorModels = [];
  const aiPatch = studioAiChangedFile(state.studio.selectedFile?.path);

  try {
    const monaco = await ensureMonaco();
    container.innerHTML = "";
    if (aiPatch) {
      const originalModel = monaco.editor.createModel(
        aiPatch.beforeContent ?? content ?? "",
        languageForPath(state.studio.selectedFile?.path ?? "")
      );
      const modifiedModel = monaco.editor.createModel(
        aiPatch.afterContent ?? "",
        languageForPath(state.studio.selectedFile?.path ?? "")
      );
      state.studio.editorModels = [originalModel, modifiedModel];
      state.studio.editor = monaco.editor.createDiffEditor(container, {
        theme: "vs-dark",
        readOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        glyphMargin: true,
        fontSize: 13,
        tabSize: 2,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        renderSideBySide: true,
        originalEditable: false
      });
      state.studio.editor.setModel({
        original: originalModel,
        modified: modifiedModel
      });
      state.studio.editorKind = "monaco-diff";
      return;
    }

    state.studio.editor = monaco.editor.create(container, {
      value: content,
      language: languageForPath(state.studio.selectedFile?.path ?? ""),
      theme: "vs-dark",
      readOnly: state.studio.readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      glyphMargin: true,
      fontSize: 13,
      tabSize: 2,
      wordWrap: "on",
      scrollBeyondLastLine: false
    });
    state.studio.editorKind = "monaco";
    state.studio.editor.onDidChangeModelContent(() => {
      state.studio.draftContent = getStudioEditorValue();
      state.studio.dirty = state.studio.draftContent !== state.studio.fileContent;
      updateStudioControls();
      const status = document.getElementById("studio-editor-status");
      if (status) {
        status.textContent = studioEditorStatusLabel();
      }
    });
    applyStudioCheckMarkers();
    applyStudioAiPatchMarkers();
  } catch (error) {
    const fallbackContent = aiPatch ? formatStudioAiUnifiedPatch(aiPatch) : content;
    container.innerHTML = `<textarea id="studio-editor-fallback" class="studio-editor-fallback" spellcheck="false" ${state.studio.readOnly || aiPatch ? "readonly" : ""}>${escapeHtml(fallbackContent)}</textarea>`;
    state.studio.editor = document.getElementById("studio-editor-fallback");
    state.studio.editorKind = aiPatch ? "textarea-diff" : "textarea";
    appendStudioTerminal(`Code editor fallback loaded. ${error.message}`, "muted");
    if (!aiPatch) {
      state.studio.editor?.addEventListener("input", () => {
        state.studio.draftContent = getStudioEditorValue();
        state.studio.dirty = state.studio.draftContent !== state.studio.fileContent;
        updateStudioControls();
      });
    }
  }
}

function applyStudioCheckMarkers() {
  if (state.studio.editorKind !== "monaco" || !state.studio.editor?.getModel || !window.monaco) {
    return;
  }

  const monaco = window.monaco;
  const model = state.studio.editor.getModel();
  if (!model) {
    return;
  }

  const findings = studioFindingsForPath(state.studio.selectedFile?.path).filter((finding) => studioFindingLine(finding));
  const markers = findings.map((finding) => {
    const line = clampEditorLine(model, studioFindingLine(finding));
    const startColumn = studioFindingColumn(finding);
    const endColumn = finding.column && finding.column > 0 ? startColumn + 1 : model.getLineMaxColumn(line);
    return {
      severity: monacoSeverity(monaco, finding.severity),
      message: formatStudioFindingMessage(finding),
      code: finding.code,
      startLineNumber: line,
      startColumn,
      endLineNumber: line,
      endColumn
    };
  });
  monaco.editor.setModelMarkers(model, "pressship-plugin-check", markers);

  const decorations = findings.map((finding) => {
    const line = clampEditorLine(model, studioFindingLine(finding));
    return {
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: `pressship-check-line pressship-check-line-${finding.severity}`,
        glyphMarginClassName: `pressship-check-glyph pressship-check-glyph-${finding.severity}`,
        glyphMarginHoverMessage: { value: formatStudioFindingMarkdown(finding) },
        hoverMessage: { value: formatStudioFindingMarkdown(finding) }
      }
    };
  });
  state.studio.checkDecorations = state.studio.editor.deltaDecorations(
    Array.isArray(state.studio.checkDecorations) ? state.studio.checkDecorations : [],
    decorations
  );
}

function applyStudioAiPatchMarkers() {
  if (state.studio.editorKind !== "monaco" || !state.studio.editor?.getModel || !window.monaco) {
    return;
  }
  const change = studioAiChangedFile(state.studio.selectedFile?.path);
  const monaco = window.monaco;
  const model = state.studio.editor.getModel();
  if (!model) {
    return;
  }
  const hunks = change?.hunks?.length
    ? change.hunks
    : change
      ? buildStudioAiPatchHunks(change.beforeContent ?? "", change.afterContent ?? "")
      : [];
  const decorations = hunks.flatMap((hunk) => {
    const ranges = [];
    let oldLine = Number(hunk.oldStart) || 1;
    for (const line of hunk.lines ?? []) {
      if (line.type === "delete" || line.type === "context") {
        const lineNumber = clampEditorLine(model, oldLine);
        if (line.type === "delete") {
          ranges.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
            options: {
              isWholeLine: true,
              className: "pressship-ai-patch-line pressship-ai-patch-line-delete",
              glyphMarginClassName: "pressship-ai-patch-glyph",
              hoverMessage: { value: "**AI patch**\n\nThis line would be removed if accepted." }
            }
          });
        }
        oldLine += 1;
      } else if (line.type === "add") {
        const lineNumber = clampEditorLine(model, Math.max(1, oldLine));
        ranges.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: "pressship-ai-patch-line pressship-ai-patch-line-add",
            glyphMarginClassName: "pressship-ai-patch-glyph",
            hoverMessage: { value: "**AI patch**\n\nNew content would be inserted here if accepted." }
          }
        });
      }
    }
    return ranges;
  });

  state.studio.aiPatchDecorations = state.studio.editor.deltaDecorations(
    Array.isArray(state.studio.aiPatchDecorations) ? state.studio.aiPatchDecorations : [],
    decorations
  );
}

function revealStudioCheckNote(line, column = 1) {
  if (!line || state.studio.activeTab !== "editor") {
    state.studio.activeTab = "editor";
    renderStudio();
    remountStudioEditorIfNeeded();
  }

  requestAnimationFrame(() => {
    if (state.studio.editorKind === "monaco" && state.studio.editor?.revealLineInCenter) {
      const model = state.studio.editor.getModel();
      const targetLine = model ? clampEditorLine(model, line) : line;
      state.studio.editor.revealLineInCenter(targetLine);
      state.studio.editor.setPosition({ lineNumber: targetLine, column: Math.max(1, column) });
      state.studio.editor.focus();
      return;
    }

    if (state.studio.editorKind === "textarea" && state.studio.editor) {
      const offset = offsetForLineColumn(state.studio.editor.value, line, column);
      state.studio.editor.focus();
      state.studio.editor.setSelectionRange(offset, offset);
    }
  });
}

function monacoSeverity(monaco, severity) {
  if (severity === "error") {
    return monaco.MarkerSeverity.Error;
  }
  if (severity === "warning") {
    return monaco.MarkerSeverity.Warning;
  }
  return monaco.MarkerSeverity.Info;
}

function clampEditorLine(model, line) {
  return Math.max(1, Math.min(model.getLineCount(), Number(line) || 1));
}

function offsetForLineColumn(value, line, column) {
  const lines = value.split("\n");
  const targetLine = Math.max(1, Math.min(lines.length, Number(line) || 1));
  const targetColumn = Math.max(1, Number(column) || 1);
  let offset = 0;
  for (let index = 0; index < targetLine - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  return Math.min(value.length, offset + targetColumn - 1);
}

function formatStudioFindingMessage(finding) {
  const code = finding.code ? `[${finding.code}] ` : "";
  return `${code}${finding.message}`;
}

function formatStudioFindingMarkdown(finding) {
  const location = finding.line ? `Line ${finding.line}${finding.column ? `:${finding.column}` : ""}` : "File";
  return `**${escapeMarkdown(finding.code ?? finding.severity)}** (${location})\n\n${escapeMarkdown(finding.message)}`;
}

function getStudioEditorValue() {
  if (state.studio.editorKind === "monaco" && state.studio.editor?.getValue) {
    return state.studio.editor.getValue();
  }
  if (state.studio.editorKind === "monaco-diff") {
    return state.studio.fileContent;
  }
  if (state.studio.editorKind === "textarea-diff") {
    return state.studio.fileContent;
  }
  if (state.studio.editorKind === "textarea" && state.studio.editor) {
    return state.studio.editor.value;
  }
  return state.studio.draftContent ?? state.studio.fileContent;
}

function ensureMonaco() {
  if (window.monaco) {
    return Promise.resolve(window.monaco);
  }
  if (monacoPromise) {
    return monacoPromise;
  }

  monacoPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.min.js";
    script.onload = () => {
      window.require.config({
        paths: {
          vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs"
        }
      });
      window.require(["vs/editor/editor.main"], () => resolve(window.monaco), reject);
    };
    script.onerror = () => reject(new Error("Could not load Monaco Editor."));
    document.head.appendChild(script);
  });

  return monacoPromise;
}

function languageForPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map = {
    css: "css",
    html: "html",
    htm: "html",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    php: "php",
    scss: "scss",
    sass: "scss",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml"
  };
  return map[ext] ?? "plaintext";
}

function studioFileIcon(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "php") return "dashicons-media-code";
  if (["js", "jsx", "ts", "tsx"].includes(ext)) return "dashicons-editor-code";
  if (["css", "scss", "sass"].includes(ext)) return "dashicons-admin-appearance";
  if (["md", "txt"].includes(ext) || filePath.toLowerCase() === "readme.txt") return "dashicons-media-text";
  return "dashicons-media-default";
}

function renderDashboard() {
  if (!els.dashboard) {
    return;
  }
  els.dashboard.removeAttribute("aria-busy");
  const activityBox = document.getElementById("activity-box");
  if (activityBox) {
    activityBox.hidden = !state.settings?.debugMode;
  }
  els.dashboard.innerHTML = `
    <header class="ps-page-header ps-dashboard-titlebar">
      <h1 class="wp-heading-inline">Dashboard</h1>
    </header>
    <hr class="wp-header-end" />

    <section class="welcome-panel ps-welcome-panel" aria-label="Pressship overview">
      <div class="welcome-panel-content">
        <div class="welcome-panel-header-wrap">
          <div class="welcome-panel-header">
            <span class="ps-welcome-kicker">
              <span class="dashicons dashicons-admin-site-alt3" aria-hidden="true"></span>
              Pressship Studio
            </span>
            <h2>${escapeHtml(dashboardGreeting())}</h2>
            <p>${escapeHtml(dashboardSubtitle())}</p>
          </div>
        </div>
        <div class="welcome-panel-column-container">
          ${renderWelcomePanelColumn({
            icon: "dashicons-editor-code",
            title: "Work in Studio",
            copy: "Open a local or cloned plugin, edit files, run checks, and preview changes from one admin-style workspace.",
            actions: `
              <button class="button button-primary" type="button" data-view-button="studio">
                <span class="dashicons dashicons-editor-code" aria-hidden="true"></span>
                Open Studio
              </button>
              <button class="button" type="button" data-view-button="local">Local Library</button>
            `
          })}
          ${renderWelcomePanelColumn({
            icon: "dashicons-open-folder",
            title: "Add plugins",
            copy: "Choose a local plugin folder, or browse plugins attached to your WordPress.org account.",
            actions: `
              <button class="button" type="button" data-action="choose-local-folder">
                <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
                Choose Folder
              </button>
              <button class="button" type="button" data-view-button="remote">WordPress.org</button>
            `
          })}
          ${renderWelcomePanelColumn({
            icon: "dashicons-yes-alt",
            title: "Prepare releases",
            copy: "Check version state, run Plugin Check, and review publish actions before anything ships.",
            actions: `
              <button class="button" type="button" data-view-button="local">Review Local Plugins</button>
              <button class="button button-ghost" type="button" data-view-button="settings">Settings</button>
            `
          })}
        </div>
      </div>
    </section>

    <div id="dashboard-widgets-wrap" class="ps-dashboard-widgets-wrap">
      <div id="dashboard-widgets" class="metabox-holder columns-2">
        <div id="postbox-container-1" class="postbox-container">
          <div class="meta-box-sortables">
            ${renderDashboardLocalWidget()}
            ${renderDashboardAiCard()}
          </div>
        </div>
        <div id="postbox-container-2" class="postbox-container">
          <div class="meta-box-sortables">
            ${renderDashboardAtGlanceWidget()}
            ${renderDashboardPlaygroundsCard()}
            ${renderDashboardAccountCard()}
          </div>
        </div>
      </div>
    </div>
  `;
}

function dashboardGreeting() {
  const hour = new Date().getHours();
  const part = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const account = state.bootstrap?.account?.username;
  return account ? `${part}, ${account}` : `${part}`;
}

function dashboardSubtitle() {
  if (!state.bootstrap?.loggedIn) {
    return "You're not signed in to WordPress.org yet. Run \"pressship login\" in a terminal to clone, submit, or release plugins.";
  }
  if (state.localLoading && state.remoteLoading) {
    return "Loading your plugins…";
  }
  const local = state.local.length;
  const remote = state.remote.length;
  if (!local && !remote) {
    return "Add a local folder or clone a plugin from WordPress.org to get started.";
  }
  return `Watching ${local} local plugin${local === 1 ? "" : "s"} and ${remote} on WordPress.org.`;
}

function renderWelcomePanelColumn({ icon, title, copy, actions }) {
  return `
    <div class="welcome-panel-column">
      <span class="ps-welcome-icon" aria-hidden="true">
        <span class="dashicons ${escapeAttr(icon)}"></span>
      </span>
      <div class="ps-welcome-column-content">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(copy)}</p>
        <div class="ps-welcome-actions">${actions}</div>
      </div>
    </div>
  `;
}

function renderDashboardPostbox({ id, title, icon, body, actions = "", className = "" }) {
  const actionMarkup = actions ? `<div class="ps-postbox-actions">${actions}</div>` : "";
  return `
    <section id="${escapeAttr(id)}" class="postbox ps-dashboard-postbox${className ? ` ${escapeAttr(className)}` : ""}">
      <div class="postbox-header">
        <h2 class="hndle">
          <span class="dashicons ${escapeAttr(icon)}" aria-hidden="true"></span>
          <span>${escapeHtml(title)}</span>
        </h2>
        ${actionMarkup}
      </div>
      <div class="inside">
        ${body}
      </div>
    </section>
  `;
}

function renderDashboardLocalWidget() {
  return renderDashboardPostbox({
    id: "dashboard-local-plugins",
    title: "Local plugins",
    icon: "dashicons-download",
    className: "ps-dashboard-main",
    actions: `
      <button class="button button-ghost button-small" type="button" data-view-button="local">
        Open Library
        <span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span>
      </button>
    `,
    body: `
      <p class="ps-widget-intro">Open a plugin in Studio, run Plugin Check, or launch a Playground.</p>
      ${renderDashboardLocalList()}
    `
  });
}

function renderDashboardAtGlanceWidget() {
  const localLabel = state.local.length === 1 ? "local plugin" : "local plugins";
  const remoteLabel = state.remote.length === 1 ? "WordPress.org plugin" : "WordPress.org plugins";
  const playgroundLabel = state.playgrounds.length === 1 ? "Playground running" : "Playgrounds running";
  const account = state.bootstrap?.account?.username;
  const accountLabel = account ? `Signed in as ${account}` : "WordPress.org not connected";

  return renderDashboardPostbox({
    id: "dashboard-at-a-glance",
    title: "At a glance",
    icon: "dashicons-dashboard",
    body: `
      <ul class="ps-glance-list">
        ${renderDashboardGlanceItem({
          icon: "dashicons-download",
          value: state.localLoading ? "..." : String(state.local.length),
          label: localLabel,
          view: "local",
          loading: state.localLoading
        })}
        ${renderDashboardGlanceItem({
          icon: "dashicons-admin-plugins",
          value: state.remoteLoading ? "..." : String(state.remote.length),
          label: remoteLabel,
          view: "remote",
          loading: state.remoteLoading
        })}
        ${renderDashboardGlanceItem({
          icon: "dashicons-controls-play",
          value: String(state.playgrounds.length),
          label: playgroundLabel,
          view: "studio"
        })}
      </ul>
      <div class="ps-dashboard-status">
        <span class="dashicons ${account ? "dashicons-yes-alt" : "dashicons-warning"}" aria-hidden="true"></span>
        <span>${escapeHtml(accountLabel)}</span>
      </div>
    `
  });
}

function renderDashboardGlanceItem({ icon, value, label, view, loading }) {
  return `
    <li class="ps-glance-item${loading ? " is-loading" : ""}">
      <button class="ps-glance-link" type="button" data-view-button="${escapeAttr(view)}">
        <span class="dashicons ${escapeAttr(icon)}" aria-hidden="true"></span>
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </button>
    </li>
  `;
}

function renderDashboardLocalList() {
  if (state.localLoading && !state.local.length) {
    return renderDashboardSkeletonRows(3);
  }
  if (state.localError && !state.local.length) {
    return emptyState({
      title: "Could not load local plugins.",
      message: state.localError,
      icon: "dashicons-warning"
    });
  }
  if (!state.local.length) {
    return `
      <div class="ps-empty-card">
        <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
        <strong>No local plugins yet</strong>
        <p>Add a folder you're working on, or clone one from your WordPress.org account.</p>
        <div class="ps-empty-card-actions">
          <button class="button button-primary" type="button" data-action="choose-local-folder">
            <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
            Choose Folder
          </button>
          <button class="button" type="button" data-view-button="remote">
            <span class="dashicons dashicons-admin-network" aria-hidden="true"></span>
            Browse WordPress.org
          </button>
        </div>
      </div>
    `;
  }

  const items = state.local.slice(0, 6).map((plugin) => dashboardLocalRow(plugin)).join("");
  const overflow = state.local.length > 6
    ? `<div class="ps-widget-footer"><button class="button button-ghost button-small" type="button" data-view-button="local">See all ${state.local.length} plugins<span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span></button></div>`
    : "";
  return `<ul class="ps-plugin-list">${items}</ul>${overflow}`;
}

function dashboardLocalRow(plugin) {
  const versionState = state.versionStates.get(plugin.id);
  const versionLabel = versionState?.localVersion
    ? `v${versionState.localVersion}`
    : versionState?.error
      ? "version unknown"
      : "—";
  const stableLabel = versionState?.readmeStableTag
    ? `stable ${versionState.readmeStableTag}`
    : "";
  const status = versionState?.statuses?.[0];
  const statusBadge = status ? badge(status, statusBadgeTone(status)) : "";
  return `
    <li class="ps-plugin-row">
      <button class="ps-plugin-main" type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}" title="Open in Studio">
        <span class="ps-plugin-icon" aria-hidden="true">
          <span class="dashicons dashicons-editor-code"></span>
        </span>
        <span class="ps-plugin-text">
          <strong>${escapeHtml(plugin.name || plugin.slug || plugin.id)}</strong>
          <small>${escapeHtml(plugin.slug || plugin.path || "local")}</small>
        </span>
      </button>
      <span class="ps-plugin-meta">
        <span class="ps-plugin-version">${escapeHtml(versionLabel)}${stableLabel ? ` <em>· ${escapeHtml(stableLabel)}</em>` : ""}</span>
        ${statusBadge}
      </span>
      <span class="ps-plugin-actions">
        <button class="button button-small" type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}">
          <span class="dashicons dashicons-editor-code" aria-hidden="true"></span>
          Studio
        </button>
      </span>
    </li>
  `;
}

function renderDashboardSkeletonRows(count) {
  const rows = Array.from({ length: count }, () => `
    <li class="ps-plugin-row ps-skeleton-row">
      <span class="ps-skeleton ps-skeleton-icon"></span>
      <span class="ps-skeleton ps-skeleton-line"></span>
      <span class="ps-skeleton ps-skeleton-line short"></span>
      <span class="ps-skeleton ps-skeleton-button"></span>
    </li>
  `).join("");
  return `<ul class="ps-plugin-list">${rows}</ul>`;
}

function renderDashboardPlaygroundsCard() {
  const items = state.playgrounds.length
    ? state.playgrounds
        .map(
          (playground) => {
            let portLabel = "";
            try {
              const port = new URL(playground.url).port;
              portLabel = port ? `:${port}` : playground.url;
            } catch {
              portLabel = playground.url ?? "";
            }
            return `
              <li class="ps-side-row">
                <button class="ps-side-row-main" type="button" data-action="open-playground" data-id="${escapeAttr(playground.id)}" title="Open in Studio">
                  <span class="ps-side-row-icon" aria-hidden="true">
                    <span class="dashicons dashicons-controls-play"></span>
                  </span>
                  <span class="ps-side-row-text">
                    <strong>${escapeHtml(playground.name)}</strong>
                    <small>${escapeHtml(portLabel)}</small>
                  </span>
                </button>
                <button class="ps-side-row-close" type="button" data-action="stop-playground" data-id="${escapeAttr(playground.id)}" aria-label="Stop ${escapeAttr(playground.name)}" title="Stop Playground">
                  <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
                </button>
              </li>
            `;
          }
        )
        .join("")
    : `
        <li class="ps-side-empty">
          <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
          <span>No Playgrounds running.</span>
        </li>
      `;

  return `
    ${renderDashboardPostbox({
      id: "dashboard-playgrounds",
      title: "Playgrounds",
      icon: "dashicons-controls-play",
      actions: `<span class="ps-count-pill">${state.playgrounds.length}</span>`,
      body: `<ul class="ps-side-list">${items}</ul>`
    })}
  `;
}

function renderDashboardAccountCard() {
  const account = state.bootstrap?.account?.username;
  const loggedIn = Boolean(state.bootstrap?.loggedIn);
  const tone = loggedIn ? "success" : "warning";
  const label = loggedIn ? "Signed in" : "Not signed in";
  return renderDashboardPostbox({
    id: "dashboard-wordpress-org",
    title: "WordPress.org",
    icon: "dashicons-admin-users",
    actions: badge(label, tone),
    body: `
      <div class="ps-account-body">
        <div class="ps-account-row">
          <span class="ps-account-icon" aria-hidden="true">
            <span class="dashicons dashicons-admin-users"></span>
          </span>
          <span class="ps-account-text">
            <strong>${escapeHtml(account ?? "not logged in")}</strong>
            <small>${escapeHtml(loggedIn ? "Used for clone, submit, and release." : "Run pressship login in a terminal to connect.")}</small>
          </span>
        </div>
        <div class="ps-widget-footer">
          <button class="button button-ghost button-small" type="button" data-view-button="settings">
            Settings
            <span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    `
  });
}

function renderDashboardAiCard() {
  const selected = state.settings?.aiAssistant ?? "none";
  const providers = aiAssistanceProviders();
  const ready = providers.filter((p) => p.status === "ready");
  const installed = providers.filter((p) => p.status === "installed" || p.status === "ready");
  const active = providers.find((p) => p.id === selected);

  let tone = "info";
  let label = "Disabled";
  if (selected === "none") {
    tone = "warning";
    label = "Disabled";
  } else if (active?.status === "ready") {
    tone = "success";
    label = "Ready";
  } else if (active?.status === "not_authenticated") {
    tone = "warning";
    label = "Needs login";
  } else if (active?.status === "not_installed") {
    tone = "error";
    label = "Not installed";
  }

  const chips = providers
    .map((provider) => {
      const isSelected = provider.id === selected && selected !== "none";
      return `
        <span class="ps-ai-chip ps-ai-chip-${escapeAttr(provider.status)}${isSelected ? " is-selected" : ""}" title="${escapeAttr(provider.detail)}">
          <span class="ps-ai-chip-dot" aria-hidden="true"></span>
          ${escapeHtml(provider.label)}
        </span>
      `;
    })
    .join("");

  const hint =
    selected === "none"
      ? "Pick an assistant in Settings to enable AI inside Studio."
      : active?.status === "ready"
        ? `${active.label} is ready in Studio.`
        : active?.status === "not_authenticated"
          ? `${active.label} is installed but not signed in.`
          : `${active?.label ?? "Assistant"} ${active?.status === "not_installed" ? "is not on PATH." : "needs attention."}`;

  return renderDashboardPostbox({
    id: "dashboard-ai-assistance",
    title: "AI Assistance",
    icon: "dashicons-superhero",
    actions: badge(label, tone),
    body: `
        <div class="ps-ai-chips">${chips}</div>
        <p class="ps-widget-hint">${escapeHtml(hint)}</p>
        <div class="ps-widget-footer">
          <button class="button button-ghost button-small" type="button" data-action="refresh-ai-assistance">
            <span class="dashicons dashicons-update" aria-hidden="true"></span>
            Refresh
          </button>
          <button class="button button-ghost button-small" type="button" data-view-button="settings">
            Configure
            <span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span>
          </button>
        </div>
        <small class="ps-widget-meta">${installed.length} installed · ${ready.length} ready</small>
    `
  });
}

function renderPlaygroundsMenu() {
  if (!els.playgroundsSection || !els.playgroundsMenu) {
    return;
  }

  const hasPlaygrounds = state.playgrounds.length > 0;
  els.playgroundsSection.hidden = !hasPlaygrounds;
  els.playgroundsMenu.hidden = !hasPlaygrounds;
  if (!hasPlaygrounds) {
    els.playgroundsMenu.innerHTML = "";
    return;
  }

  els.playgroundsMenu.innerHTML = `
    <ul class="wp-submenu ps-playground-list">
      ${state.playgrounds
        .map(
          (playground) => `
            <li class="ps-playground-item">
              <div class="ps-playground-row">
                <button type="button" class="ps-playground-open" data-action="open-playground" data-id="${escapeAttr(playground.id)}">
                  <span class="wp-menu-image" aria-hidden="true">
                    <span class="dashicons dashicons-controls-play"></span>
                  </span>
                  <span class="wp-menu-name">
                    <strong>${escapeHtml(playground.name)}</strong>
                    <small>${escapeHtml(new URL(playground.url).port ? `:${new URL(playground.url).port}` : playground.url)}</small>
                  </span>
                </button>
                <button type="button" class="ps-playground-stop" data-action="stop-playground" data-id="${escapeAttr(playground.id)}" aria-label="Stop ${escapeAttr(playground.name)}">
                  <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
                </button>
              </div>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function localRow(plugin, versionState, defaultPublish, defaultBump) {
  const stateBadges = versionState?.statuses
    ? versionState.statuses.map((status) => badge(status, statusBadgeTone(status))).join(" ")
    : badge("unknown", "warning");
  const versionText = versionState?.localVersion
    ? `${escapeHtml(versionState.localVersion)} <span class="plugin-slug">/ stable ${escapeHtml(
        versionState.readmeStableTag ?? "missing"
      )}</span>`
    : escapeHtml(versionState?.error ?? "unknown");

  const bumpButton = (level) =>
    `<button class="button button-small ps-inline-button${level === defaultBump ? " button-primary" : ""}" type="button" data-action="bump-version" data-id="${escapeAttr(
      plugin.id
    )}" data-bump="${level}">${capitalize(level)}</button>`;

  const publishButton = (action, label, isPrimary) =>
    `<button class="button button-small ps-inline-button${isPrimary ? " button-primary" : ""}" type="button" data-action="dry-run-publish" data-id="${escapeAttr(
      plugin.id
    )}" data-publish-action="${action}">${escapeHtml(label)}</button>`;

  return `
    <tr class="ps-list-table-row${plugin.exists === false ? " is-missing" : ""}">
      <td class="plugin-title column-primary" data-colname="Plugin">
        <strong class="ps-table-plugin-name">
          <button type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}">${escapeHtml(plugin.name)}</button>
        </strong>
        <span class="plugin-slug">${escapeHtml(plugin.slug)}</span>
        <div class="row-actions">
          <span><button type="button" data-action="details" data-scope="local" data-id="${escapeAttr(plugin.id)}">Details</button></span>
          <span class="sep">·</span>
          <span><button type="button" data-action="version-state" data-id="${escapeAttr(plugin.id)}">Versions</button></span>
          <span class="sep">·</span>
          <span><button type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}">Studio</button></span>
          <span class="sep">·</span>
          <span class="delete"><button type="button" data-action="remove-local" data-id="${escapeAttr(plugin.id)}">Remove</button></span>
        </div>
      </td>
      <td class="column-version-state" data-colname="Version state">
        <div class="ps-status-badges">${stateBadges}</div>
        <div class="version-line">${versionText}</div>
        <div class="actions ps-bump-actions">
          ${bumpButton("patch")}
          ${bumpButton("minor")}
          ${bumpButton("major")}
        </div>
      </td>
      <td class="column-path" data-colname="Path"><code class="ps-path-code" title="${escapeAttr(plugin.path)}">${escapeHtml(plugin.path)}</code></td>
      <td class="column-publish" data-colname="Publish">
        <div class="actions ps-publish-actions">
          ${publishButton(defaultPublish, defaultPublishLabel(defaultPublish), true)}
          ${defaultPublish !== "submit" ? publishButton("submit", "Submit", false) : ""}
          ${defaultPublish !== "release" ? publishButton("release", "Release", false) : ""}
        </div>
      </td>
    </tr>
  `;
}

function defaultPublishLabel(action) {
  if (action === "submit") return "Dry-run submit";
  if (action === "release") return "Dry-run release";
  return "Auto dry-run";
}

/* ===================================================================
 * Detail panel
 * =================================================================== */

async function showDetails(scope, id) {
  els.detail.classList.add("is-open");
  els.detail.setAttribute("aria-hidden", "false");
  els.detail.innerHTML = `
    ${detailHeader("Loading…")}
    <div class="detail-body">${loadingShell("Fetching plugin details…")}</div>
  `;
  try {
    const detail = await api(`/api/plugins/${scope}/${encodeURIComponent(id)}`);
    const info = detail.info ?? {};
    els.detail.innerHTML = `
      ${detailHeader(info.name ?? detail.plugin?.name ?? id)}
      <div class="detail-body">
        <div class="postbox">
          <h2><span class="dashicons dashicons-admin-plugins"></span>Overview</h2>
          <div class="inside">${detailGrid(info)}</div>
        </div>
        <div class="postbox">
          <h2><span class="dashicons dashicons-media-text"></span>Readme</h2>
          <div class="inside">
            ${detail.readme
              ? `<pre class="readme">${escapeHtml(detail.readme)}</pre>`
              : `<p class="description">No readme content available.</p>`}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    els.detail.innerHTML = `
      ${detailHeader("Details")}
      <div class="detail-body">${emptyState({
        title: "Could not load details.",
        message: error.message,
        icon: "dashicons-warning"
      })}</div>
    `;
  }
}

async function showVersionState(id) {
  els.detail.classList.add("is-open");
  els.detail.setAttribute("aria-hidden", "false");
  els.detail.innerHTML = `
    ${detailHeader("Version state")}
    <div class="detail-body">${loadingShell("Calculating version state…")}</div>
  `;
  try {
    const versionState = await api(`/api/plugins/local/${encodeURIComponent(id)}/version-state`);
    state.versionStates.set(id, versionState);
    els.detail.innerHTML = `
      ${detailHeader(`Version state — ${versionState.name}`)}
      <div class="detail-body">
        <div class="postbox">
          <h2><span class="dashicons dashicons-update"></span>${escapeHtml(versionState.name)}</h2>
          <div class="inside">
            ${detailGrid(versionState)}
            <h3>Messages</h3>
            <ul class="ul-disc">
              ${versionState.messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}
            </ul>
            <h3>SVN tags</h3>
            <pre class="readme">${escapeHtml(
              (versionState.svnTags ?? []).join("\n") || "No tags available."
            )}</pre>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    els.detail.innerHTML = `
      ${detailHeader("Version state")}
      <div class="detail-body">${emptyState({
        title: "Could not load version state.",
        message: error.message,
        icon: "dashicons-warning"
      })}</div>
    `;
  }
}

function detailHeader(title) {
  return `
    <div class="detail-header">
      <h2>${escapeHtml(title)}</h2>
      <button class="button button-ghost" type="button" data-action="close-detail" aria-label="Close">
        <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
        Close
      </button>
    </div>
  `;
}

function closeDetail() {
  els.detail.classList.remove("is-open");
  els.detail.setAttribute("aria-hidden", "true");
  els.detail.innerHTML = "";
}

/* ===================================================================
 * Jobs
 * =================================================================== */

async function createJob(body) {
  const job = await api("/api/jobs", { method: "POST", body });
  upsertJob(job);
  subscribeJob(job.id);
  return job;
}

function upsertJob(job) {
  const existing = state.jobs.get(job.id);
  state.jobs.set(job.id, { ...existing, ...job });
  renderJobs();
  renderJobsCounter();
  if (job.status === "queued" || job.status === "running") {
    subscribeJob(job.id);
  }
}

function subscribeJob(id) {
  if (state.jobSources.has(id)) {
    return;
  }
  const source = new EventSource(
    `/api/jobs/${encodeURIComponent(id)}/events?token=${encodeURIComponent(token)}`
  );
  state.jobSources.set(id, source);

  const receive = (event) => {
    if (!event.data) {
      return;
    }
    const payload = JSON.parse(event.data);
    const current = state.jobs.get(id);
    if (!current) {
      return;
    }
    current.events = mergeEvents(current.events ?? [], payload);
    if (payload.type === "done") {
      current.status = payload.data.status;
      source.close();
      state.jobSources.delete(id);
      void loadLocal();
    } else if (payload.type === "result") {
      handleJobResult(id, payload.data);
    }
    handleStudioJobEvent(id, payload);
    renderJobs();
    renderJobsCounter();
  };

  for (const type of ["status", "log", "result", "job-error", "done"]) {
    source.addEventListener(type, receive);
  }
  source.onerror = () => {
    source.close();
    state.jobSources.delete(id);
  };
}

function handleJobResult(id, result) {
  if (state.studio.aiJobId === id && result?.assistant) {
    void handleStudioAiResult(result);
    return;
  }

  if (state.studio.checkJobId === id && result?.summary) {
    handleStudioCheckResult(result);
    return;
  }

  if (result?.playground) {
    state.playgrounds = [
      ...state.playgrounds.filter((playground) => playground.id !== result.playground.id),
      result.playground
    ];
    renderPlaygroundsMenu();
    renderDashboard();
  }

  if (!result?.url) {
    return;
  }

  if (!handleStudioPlaygroundResult(id, result)) {
    notice(`Playground is ready: ${result.url}`, "success");
  }
}

function handleStudioCheckResult(result) {
  state.studio.checking = false;
  state.studio.checkFindings = result.findings ?? [];
  state.studio.checkSummary = result.summary ?? null;
  state.studio.checkRanAt = result.checkedAt ?? new Date().toISOString();

  const summary = state.studio.checkSummary;
  const tone = summary?.error ? "error" : summary?.warning ? "status" : "success";
  appendStudioTerminal(`Plugin Check: ${formatCheckCounts(summary ?? { error: 0, warning: 0, info: 0, total: 0 })}.`, tone);
  const firstFileFinding = state.studio.checkFindings.find((finding) => finding.file && studioFindingLine(finding));

  if (firstFileFinding && firstFileFinding.file !== state.studio.selectedFile?.path) {
    void selectStudioFile(firstFileFinding.file).then(() => {
      revealStudioCheckNote(studioFindingLine(firstFileFinding), studioFindingColumn(firstFileFinding));
    });
  } else {
    state.studio.activeTab = "editor";
    renderStudio();
    remountStudioEditorIfNeeded();
    revealStudioCheckNote(studioFindingLine(firstFileFinding), studioFindingColumn(firstFileFinding));
  }
  updateStudioControls();
}

function renderJobs() {
  const activityBox = document.getElementById("activity-box");
  if (activityBox) {
    activityBox.hidden = !state.settings?.debugMode;
  }
  if (!els.jobs) {
    return;
  }
  if (!state.settings?.debugMode) {
    els.jobs.innerHTML = "";
    return;
  }

  const jobs = Array.from(state.jobs.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  if (!jobs.length) {
    els.jobs.innerHTML = emptyState({
      title: "No activity yet.",
      message: "Start a clone, Playground, dry-run, publish, or release action to see live output here.",
      icon: "dashicons-update"
    });
    return;
  }
  els.jobs.innerHTML = jobs.map(jobCard).join("");
}

function renderJobsCounter() {
  if (!els.jobsCounter) {
    renderDashboard();
    return;
  }
  const active = Array.from(state.jobs.values()).filter(
    (job) => job.status === "running" || job.status === "queued"
  ).length;
  if (active > 0) {
    els.jobsCounter.textContent = String(active);
    els.jobsCounter.hidden = false;
  } else {
    els.jobsCounter.hidden = true;
    els.jobsCounter.textContent = "0";
  }
  renderDashboard();
  renderJobs();
}

function clearFinishedJobs() {
  let cleared = 0;
  for (const [id, job] of state.jobs.entries()) {
    if (job.status !== "running" && job.status !== "queued") {
      state.jobs.delete(id);
      cleared += 1;
    }
  }
  if (cleared) {
    notice(`Cleared ${cleared} finished activit${cleared === 1 ? "y" : "ies"}.`, "info");
  }
  renderJobs();
  renderJobsCounter();
}

function jobCard(job) {
  const events = job.events ?? [];
  const result = [...events].reverse().find((event) => event.type === "result")?.data;
  const statusTone =
    job.status === "failed"
      ? "error"
      : job.status === "succeeded"
        ? "success"
        : job.status === "cancelled"
          ? "warning"
          : "info";

  return `
    <article class="job-card">
      <header>
        <h2>
          <span class="dashicons ${jobIcon(job.type)}" aria-hidden="true"></span>
          ${escapeHtml(job.title)}
          ${badge(job.status, statusTone)}
        </h2>
        <div class="actions">
          <span class="job-meta">${escapeHtml(formatTime(job.createdAt))}</span>
          ${job.status === "running" || job.status === "queued"
            ? `<button class="button button-small button-danger" data-action="cancel-job" data-id="${escapeAttr(
                job.id
              )}">Cancel</button>`
            : ""}
        </div>
      </header>
      <div class="job-events">
        ${events.length ? events.map(eventLine).join("") : `<p class="event-line"><span class="event-tag">…</span>Waiting for output.</p>`}
        ${result?.approvalId
          ? `<p style="margin-top:10px">
              <button class="button button-primary" data-action="confirm-publish"
                data-approval-id="${escapeAttr(result.approvalId)}"
                data-overview="${escapeAttr(result.package?.topLevelFolder ?? "")}">
                <span class="dashicons dashicons-yes" aria-hidden="true"></span>
                Confirm ${escapeHtml(result.route?.action ?? "publish")}
              </button>
            </p>`
          : ""}
      </div>
    </article>
  `;
}

function jobIcon(type) {
  switch (type) {
    case "clone":
      return "dashicons-download";
    case "play":
      return "dashicons-controls-play";
    case "check":
      return "dashicons-yes-alt";
    case "dry-run-publish":
      return "dashicons-search";
    case "confirm-publish":
      return "dashicons-yes";
    default:
      return "dashicons-update";
  }
}

function eventLine(event) {
  const text =
    event.type === "status" || event.type === "log" || event.type === "error"
      ? event.data?.message ?? event.data
      : JSON.stringify(event.data, null, 2);
  return `<p class="event-line event-${escapeAttr(event.type)}">
    <span class="event-tag">${escapeHtml(event.type)}</span>${escapeHtml(String(text))}
  </p>`;
}

/* ===================================================================
 * Settings
 * =================================================================== */

function renderSettings() {
  const settings = state.settings ?? {};
  const account = state.bootstrap?.account?.username ?? "not logged in";
  const selectedAssistant = settings.aiAssistant ?? "none";

  els.settings.innerHTML = `
    <div class="postbox">
      <h2><span class="dashicons dashicons-admin-users"></span>Account & environment</h2>
      <div class="inside">
        <dl class="settings-grid">
          <dt>WordPress.org account</dt>
          <dd><strong>${escapeHtml(account)}</strong></dd>
          <dt>Config directory</dt>
          <dd><code>${escapeHtml(state.bootstrap?.configDir ?? "")}</code></dd>
          <dt>Working directory</dt>
          <dd><code>${escapeHtml(state.bootstrap?.cwd ?? "")}</code></dd>
        </dl>
      </div>
    </div>

    <div class="postbox">
      <h2><span class="dashicons dashicons-admin-generic"></span>Defaults</h2>
      <div class="inside">
        <form class="ps-settings-form" id="settings-form" autocomplete="off">
          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Default checkout directory
              <small>Where Pressship places SVN checkouts when cloning plugins. Defaults to <code>~/.pressship/plugins/</code>.</small>
            </div>
            <div>
              <input type="text" id="setting-defaultCheckoutDir"
                value="${escapeAttr(settings.defaultCheckoutDir ?? "")}"
                placeholder="~/.pressship/plugins/" />
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              AI Assistance
              <small>Choose the assistant Studio should use for AI-assisted edits and review flows.</small>
            </div>
            <div>
              <select id="setting-aiAssistant">
                ${aiAssistantOption("none", "Disabled", selectedAssistant)}
                ${renderAiAssistantOptions(selectedAssistant)}
              </select>
              <button class="button button-secondary button-small" type="button" data-action="refresh-ai-assistance">
                <span class="dashicons dashicons-update" aria-hidden="true"></span>
                Refresh
              </button>
              ${renderAiAssistanceStatus()}
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Default publish action
              <small>The button highlighted as primary on each local plugin row.</small>
            </div>
            <div>
              <select id="setting-defaultPublishAction">
                ${publishOption("auto", settings.defaultPublishAction)}
                ${publishOption("submit", settings.defaultPublishAction)}
                ${publishOption("release", settings.defaultPublishAction)}
              </select>
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Default version bump
              <small>The bump level highlighted on each plugin row.</small>
            </div>
            <div>
              <select id="setting-defaultBumpLevel">
                ${bumpOption("patch", settings.defaultBumpLevel)}
                ${bumpOption("minor", settings.defaultBumpLevel)}
                ${bumpOption("major", settings.defaultBumpLevel)}
              </select>
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Playground port range
              <small>Range used for Playground demos. Pressship picks the first free port.</small>
            </div>
            <div class="port-range">
              <input type="number" id="setting-playgroundPortStart" min="1024" max="65535"
                value="${escapeAttr(String(settings.playgroundPortStart ?? 9500))}" />
              <span>—</span>
              <input type="number" id="setting-playgroundPortEnd" min="1024" max="65535"
                value="${escapeAttr(String(settings.playgroundPortEnd ?? 9599))}" />
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Auto-refresh
              <small>Reload My Plugins and Local Plugins every N seconds (0 disables).</small>
            </div>
            <div>
              <input type="number" id="setting-autoRefreshSeconds" min="0" max="3600"
                value="${escapeAttr(String(settings.autoRefreshSeconds ?? 0))}" />
              <span class="field-help">Seconds between refreshes. Set to 0 to disable.</span>
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Confirm destructive actions
              <small>Prompt before removing local plugins or running release flows.</small>
            </div>
            <div>
              <label style="display:inline-flex;align-items:center;gap:8px;font-weight:400">
                <input type="checkbox" id="setting-confirmDestructiveActions"
                  ${settings.confirmDestructiveActions ? "checked" : ""} />
                Show a confirm dialog
              </label>
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Debug mode
              <small>Show the Activity panel with live internal job output.</small>
            </div>
            <div>
              <label style="display:inline-flex;align-items:center;gap:8px;font-weight:400">
                <input type="checkbox" id="setting-debugMode"
                  ${settings.debugMode ? "checked" : ""} />
                Show Activity and job logs on the Dashboard
              </label>
            </div>
          </div>

          <div class="ps-settings-actions">
            <button class="button button-primary" type="button" data-action="save-settings">
              <span class="dashicons dashicons-yes" aria-hidden="true"></span>
              Save changes
            </button>
            <button class="button" type="button" data-action="reset-settings">
              Reset to bootstrap
            </button>
            <span class="ps-settings-status" id="settings-status"></span>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById("settings-form");
  form?.addEventListener("input", () => {
    state.settingsDirty = true;
    updateSettingsStatus("Unsaved changes…");
  });
}

function publishOption(value, current) {
  const label = value === "auto" ? "Auto-detect" : capitalize(value);
  return `<option value="${value}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function bumpOption(value, current) {
  return `<option value="${value}"${current === value ? " selected" : ""}>${capitalize(value)}</option>`;
}

function renderAiAssistantOptions(current) {
  const providers = aiAssistanceProviders();
  return providers
    .map((provider) =>
      aiAssistantOption(provider.id, `${provider.label} — ${aiAssistantStatusLabel(provider)}`, current, {
        disabled: provider.status === "not_installed"
      })
    )
    .join("");
}

function aiAssistantOption(value, label, current, options = {}) {
  return `<option value="${escapeAttr(value)}"${current === value ? " selected" : ""}${options.disabled ? " disabled" : ""}>${escapeHtml(label)}</option>`;
}

function renderAiAssistanceStatus() {
  const providers = aiAssistanceProviders();
  if (state.aiAssistance.loading) {
    return `
      <div class="ps-ai-status-grid">
        <div class="ps-ai-status-card is-loading">
          <span class="dashicons dashicons-update" aria-hidden="true"></span>
          <strong>Detecting AI assistants…</strong>
          <small>Checking local Harness providers on PATH.</small>
        </div>
      </div>
    `;
  }

  return `
    <div class="ps-ai-status-grid">
      ${providers
        .map(
          (provider) => `
            <div class="ps-ai-status-card ps-ai-status-${escapeAttr(provider.status)}">
              <div>
                <strong>${escapeHtml(provider.label)}</strong>
                ${badge(aiAssistantStatusLabel(provider), aiAssistantBadgeTone(provider.status))}
              </div>
              <code>${escapeHtml(provider.checkedCommand ?? `${provider.command} status`)}</code>
              <small>${escapeHtml(provider.detail)}</small>
            </div>
          `
        )
        .join("")}
    </div>
    ${
      state.aiAssistance.detectedAt
        ? `<span class="field-help">Last checked ${escapeHtml(formatTime(state.aiAssistance.detectedAt))}.</span>`
        : `<span class="field-help">Detection runs locally and never sends CLI output to a remote service.</span>`
    }
  `;
}

function aiAssistanceProviders() {
  const detected = new Map((state.aiAssistance.providers ?? []).map((provider) => [provider.id, provider]));
  return [
    fallbackAiProvider("codex", "Codex", "codex --version"),
    fallbackAiProvider("claude", "Claude", "claude --version"),
    fallbackAiProvider("copilot", "Copilot", "copilot --version"),
    fallbackAiProvider("gemini", "Gemini", "gemini --version"),
    fallbackAiProvider("wp-studio", "WP Studio", "npx --version")
  ].map((provider) => detected.get(provider.id) ?? provider);
}

function fallbackAiProvider(id, label, checkedCommand) {
  return {
    id,
    label,
    command: id,
    installed: false,
    status: "not_installed",
    detail: "Not checked yet.",
    checkedCommand
  };
}

function aiAssistantStatusLabel(provider) {
  if (provider.status === "ready") return "Ready";
  if (provider.status === "installed") return "Installed";
  if (provider.status === "not_authenticated") return "Needs login";
  if (provider.status === "not_installed") return "Not installed";
  return "Check failed";
}

function aiAssistantBadgeTone(status) {
  if (status === "ready") return "success";
  if (status === "installed") return "info";
  if (status === "not_authenticated") return "warning";
  return "error";
}

function updateSettingsStatus(text, tone) {
  const node = document.getElementById("settings-status");
  if (!node) return;
  node.textContent = text;
  node.style.color = tone === "success" ? "var(--wp-success)" : "";
}

async function saveSettings() {
  const body = {
    defaultCheckoutDir:
      document.getElementById("setting-defaultCheckoutDir").value.trim() ||
      state.bootstrap?.cwd ||
      ".",
    aiAssistant: document.getElementById("setting-aiAssistant").value,
    defaultPublishAction: document.getElementById("setting-defaultPublishAction").value,
    defaultBumpLevel: document.getElementById("setting-defaultBumpLevel").value,
    playgroundPortStart: Number(document.getElementById("setting-playgroundPortStart").value),
    playgroundPortEnd: Number(document.getElementById("setting-playgroundPortEnd").value),
    autoRefreshSeconds: Number(document.getElementById("setting-autoRefreshSeconds").value),
    confirmDestructiveActions: document.getElementById("setting-confirmDestructiveActions").checked,
    debugMode: document.getElementById("setting-debugMode").checked
  };

  try {
    const saved = await api("/api/settings", { method: "PUT", body });
    state.settings = saved;
    state.settingsDirty = false;
    if (state.bootstrap) {
      state.bootstrap.settings = saved;
      state.bootstrap.defaultCheckoutDir = saved.defaultCheckoutDir;
      state.bootstrap.playgroundPortRange = [saved.playgroundPortStart, saved.playgroundPortEnd];
    }
    updateSettingsStatus("Saved.", "success");
    notice("Settings saved.", "success");
    renderLocal();
    renderDashboard();
    renderJobs();
    updateStudioAiSidebar();
    configureAutoRefresh();
  } catch (error) {
    updateSettingsStatus(error.message);
    notice(error.message, "error");
  }
}

function resetSettings() {
  state.settings = state.bootstrap?.settings ?? state.settings;
  state.settingsDirty = false;
  renderSettings();
}

async function loadAiAssistance(options = {}) {
  state.aiAssistance.loading = true;
  renderSettings();
  try {
    const result = await api("/api/ai-assistance");
    state.aiAssistance = {
      loading: false,
      detectedAt: result.detectedAt,
      providers: result.providers ?? []
    };
    renderSettings();
    if (options.notify) {
      notice("AI assistance status refreshed.", "success");
    }
  } catch (error) {
    state.aiAssistance.loading = false;
    renderSettings();
    notice(error.message, "error");
  }
}

/* ===================================================================
 * Auto-refresh
 * =================================================================== */

let autoRefreshTimer = null;

function configureAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  const seconds = Number(state.settings?.autoRefreshSeconds ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    void Promise.all([
      state.activeView === "remote" ? loadRemote() : Promise.resolve(),
      state.activeView === "local" ? loadLocal() : Promise.resolve()
    ]);
  }, seconds * 1000);
}

/* ===================================================================
 * View switching with view-transitions
 * =================================================================== */

function showView(view) {
  if (state.activeView === view) {
    return;
  }
  const apply = () => {
    state.activeView = view;
    document.body.dataset.activeView = view;
    document.querySelectorAll(".view").forEach((node) => node.classList.remove("is-active"));
    document.getElementById(`view-${view}`)?.classList.add("is-active");
    document
      .querySelectorAll("#adminmenu li")
      .forEach((node) => node.classList.remove("wp-has-current-submenu"));
    document
      .querySelector(`#adminmenu li[data-view="${view}"]`)
      ?.classList.add("wp-has-current-submenu");
    closeDetail();
  };

  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

/* ===================================================================
 * Command palette
 * =================================================================== */

function commandItems() {
  const base = [
    {
      id: "view:dashboard",
      title: "Go to Dashboard",
      subtitle: "Overview and recent activity",
      icon: "dashicons-dashboard",
      run: () => showView("dashboard")
    },
    {
      id: "view:studio",
      title: "Go to Studio",
      subtitle: "Code editor, terminal, and Playground preview",
      icon: "dashicons-editor-code",
      run: () => showView("studio")
    },
    {
      id: "view:remote",
      title: "Go to WordPress.org Plugins",
      subtitle: "WordPress.org plugins for the saved account",
      icon: "dashicons-admin-plugins",
      run: () => showView("remote")
    },
    {
      id: "view:local",
      title: "Go to Local Plugins",
      subtitle: "Plugin folders Pressship tracks locally",
      icon: "dashicons-download",
      run: () => showView("local")
    },
    {
      id: "view:settings",
      title: "Go to Settings",
      subtitle: "Edit defaults for Pressship Studio",
      icon: "dashicons-admin-generic",
      run: () => showView("settings")
    },
    {
      id: "action:refresh-remote",
      title: "Refresh My Plugins",
      icon: "dashicons-update-alt",
      run: () => {
        void loadRemote();
      }
    },
    {
      id: "action:refresh-local",
      title: "Refresh Local Plugins",
      icon: "dashicons-update-alt",
      run: () => {
        void loadLocal();
      }
    },
    {
      id: "action:clear-jobs",
      title: "Clear finished activity",
      icon: "dashicons-trash",
      run: () => {
        if (state.settings?.debugMode) {
          clearFinishedJobs();
        } else {
          notice("Enable Debug mode in Settings to view or clear Activity.", "info");
        }
      }
    },
    {
      id: "action:choose-local-folder",
      title: "Choose local plugin folder",
      icon: "dashicons-open-folder",
      run: () => void chooseLocalFolder()
    }
  ];

  for (const plugin of state.local) {
    base.push({
      id: `local:${plugin.id}`,
      title: `Studio • ${plugin.name}`,
      subtitle: plugin.path,
      icon: "dashicons-editor-code",
      run: () => {
        void openStudio("local", plugin.id);
      }
    });
  }

  for (const plugin of state.remote) {
    base.push({
      id: `remote:${plugin.slug}`,
      title: `Studio • ${plugin.name}`,
      subtitle: plugin.slug,
      icon: "dashicons-editor-code",
      run: () => {
        void openStudio("remote", plugin.slug);
      }
    });
  }

  for (const playground of state.playgrounds) {
    base.push({
      id: `playground:${playground.id}`,
      title: `Playground • ${playground.name}`,
      subtitle: playground.url,
      icon: "dashicons-controls-play",
      run: () => {
        void openPlaygroundInStudio(playground.id);
      }
    });
  }

  return base;
}

function filterCommandItems(items, query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items.slice(0, 20);
  return items
    .filter((item) => {
      const hay = `${item.title} ${item.subtitle ?? ""}`.toLowerCase();
      return hay.includes(trimmed);
    })
    .slice(0, 20);
}

function openCommandPalette() {
  state.command.open = true;
  state.command.activeIndex = 0;
  els.command.hidden = false;
  els.commandInput.value = "";
  state.command.query = "";
  renderCommandPalette();
  setTimeout(() => els.commandInput.focus(), 0);
}

function closeCommandPalette() {
  state.command.open = false;
  els.command.hidden = true;
}

function moveCommandSelection(delta) {
  if (!state.command.items.length) return;
  const next =
    (state.command.activeIndex + delta + state.command.items.length) %
    state.command.items.length;
  state.command.activeIndex = next;
  renderCommandPalette({ keepFocus: true });
  const active = els.commandList.querySelector(".ps-command-item.is-active");
  active?.scrollIntoView({ block: "nearest" });
}

function runCommandAtCursor() {
  const item = state.command.items[state.command.activeIndex];
  if (!item) return;
  closeCommandPalette();
  try {
    item.run();
  } catch (error) {
    notice(error.message, "error");
  }
}

function renderCommandPalette({ keepFocus } = {}) {
  const filtered = filterCommandItems(commandItems(), state.command.query);
  state.command.items = filtered;
  if (state.command.activeIndex >= filtered.length) {
    state.command.activeIndex = Math.max(0, filtered.length - 1);
  }
  if (!filtered.length) {
    els.commandList.innerHTML = `<li class="ps-command-empty">No matches.</li>`;
    return;
  }
  els.commandList.innerHTML = filtered
    .map(
      (item, index) => `
        <li class="ps-command-item${index === state.command.activeIndex ? " is-active" : ""}"
            data-command-index="${index}" role="option"
            aria-selected="${index === state.command.activeIndex ? "true" : "false"}">
          <span class="dashicons ${item.icon} ps-command-item-icon" aria-hidden="true"></span>
          <span class="ps-command-item-body">
            <strong>${escapeHtml(item.title)}</strong>
            ${item.subtitle ? `<small>${escapeHtml(item.subtitle)}</small>` : ""}
          </span>
          <span class="ps-command-item-hint">${item.hint ?? ""}</span>
        </li>
      `
    )
    .join("");

  els.commandList.querySelectorAll(".ps-command-item").forEach((node) => {
    node.addEventListener("mouseenter", () => {
      const index = Number(node.dataset.commandIndex);
      if (Number.isFinite(index)) {
        state.command.activeIndex = index;
        els.commandList
          .querySelectorAll(".ps-command-item")
          .forEach((other) => other.classList.toggle("is-active", other === node));
      }
    });
    node.addEventListener("click", () => {
      const index = Number(node.dataset.commandIndex);
      state.command.activeIndex = Number.isFinite(index) ? index : 0;
      runCommandAtCursor();
    });
  });

  if (!keepFocus) {
    els.commandInput.focus();
  }
}

/* ===================================================================
 * API helper, formatting helpers
 * =================================================================== */

async function api(path, options = {}) {
  return requestApi(path, options, true);
}

async function requestApi(path, options = {}, allowTokenRefresh = true) {
  const headers = { Accept: "application/json", ...(options.headers ?? {}) };
  if (options.method && options.method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-Pressship-Token"] = token;
  }
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: { message: text } };
    }
  }
  if (!response.ok) {
    if (
      response.status === 403 &&
      body.error?.code === "invalid_token" &&
      allowTokenRefresh &&
      options.method &&
      options.method !== "GET" &&
      (await refreshPressshipToken())
    ) {
      return requestApi(path, options, false);
    }
    throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  }
  return body;
}

async function refreshPressshipToken() {
  try {
    const bootstrap = await requestApi("/api/bootstrap", {}, false);
    refreshTokenFromBootstrap(bootstrap);
    if (state.bootstrap) {
      state.bootstrap = { ...state.bootstrap, ...bootstrap };
    } else {
      state.bootstrap = bootstrap;
    }
    notice("Studio session refreshed. Retrying request…", "info");
    return true;
  } catch {
    return false;
  }
}

function refreshTokenFromBootstrap(bootstrap) {
  if (!bootstrap?.token || bootstrap.token === token) {
    return;
  }

  token = bootstrap.token;
  document.querySelector('meta[name="pressship-token"]')?.setAttribute("content", token);
}

function detailGrid(value) {
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && typeof item !== "object")
    .slice(0, 24);
  if (!entries.length) {
    return `<p class="description">No fields to show.</p>`;
  }
  return `<dl class="detail-grid">${entries
    .map(([key, item]) => `<dt>${escapeHtml(labelize(key))}</dt><dd>${escapeHtml(String(item))}</dd>`)
    .join("")}</dl>`;
}

function notice(message, type = "info") {
  const iconClass = {
    success: "dashicons-yes",
    warning: "dashicons-warning",
    error: "dashicons-warning",
    info: "dashicons-info"
  }[type] ?? "dashicons-info";
  const node = document.createElement("div");
  node.className = `notice notice-${type}`;
  node.innerHTML = `
    <span class="dashicons ${iconClass}" aria-hidden="true"></span>
    <p>${escapeHtml(message)}</p>
  `;
  els.notices.append(node);
  setTimeout(() => node.remove(), 7000);
}

function loadingShell(message) {
  return `
    <div class="empty-state">
      <span class="dashicons dashicons-update" aria-hidden="true" style="animation: ps-spin 1.2s linear infinite"></span>
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;
}

function emptyState({ title, message, icon = "dashicons-info" }) {
  return `
    <div class="empty-state">
      <span class="dashicons ${icon}" aria-hidden="true"></span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function badge(text, tone = "info") {
  const cleaned = String(text).replaceAll("_", " ");
  return `<span class="badge badge-${escapeAttr(tone)}">${escapeHtml(cleaned)}</span>`;
}

function statusBadgeTone(status) {
  if (status.includes("blocked") || status.includes("mismatch") || status.includes("missing")) {
    return "error";
  }
  if (status.includes("unknown") || status.includes("newer")) {
    return "warning";
  }
  return "success";
}

function mergeEvents(events, event) {
  if (events.some((item) => item.id === event.id)) {
    return events;
  }
  return [...events, event];
}

function labelize(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
