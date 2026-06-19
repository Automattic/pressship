/* Pressship Studio — WordPress 7.0 "Modern" admin theme client */

let token = document.querySelector('meta[name="pressship-token"]').content;

let markdownParser = basicMarkdownToHtml;
let studioPackageSizePollTimer = null;
let monacoConfigured = false;

const STUDIO_CLI_PREFIX = "npx pressship";

void import("/vendor/marked.esm.js")
  .then(({ marked }) => {
    marked.use({
      gfm: true,
      breaks: true
    });
    markdownParser = (markdown) => marked.parse(markdown, { async: false });
    refreshStudioAiMarkdownIfReady();
  })
  .catch(() => {
    markdownParser = basicMarkdownToHtml;
    refreshStudioAiMarkdownIfReady();
  });

const MARKDOWN_ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul"
]);

const MARKDOWN_ALLOWED_ATTRIBUTES = {
  a: new Set(["href", "title"]),
  code: new Set(["class"])
};

const HARNESS_ICON = {
  color: "/harness-sdk-icon.svg",
  mono: "/harness-sdk-icon-mono.svg",
  providers: {
    claude: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/claude.svg",
    codex: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
    copilot: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/githubcopilot.svg",
    cursor: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/cursor.svg",
    gemini: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlegemini.svg",
    opencode: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/opencode.svg",
    "wp-studio": "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/wordpress.svg"
  }
};

/* ===================================================================
 * Studio layout — resizable panels
 * =================================================================== */

const STUDIO_LAYOUT_STORAGE_KEY = "pressship.studio.layout.v1";

const STUDIO_LAYOUT_DEFAULTS = {
  files: 220,
  ai: 330,
  terminal: 190,
  checkNotes: 152
};

const STUDIO_LAYOUT_LIMITS = {
  files: { min: 160, max: 440 },
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

const STUDIO_SIDEBAR_TAB_KEY = "pressship.studio.sidebar.tab.v1";
const STUDIO_PANEL_STORAGE_KEY = "pressship.studio.panels.v1";
const STUDIO_THEME_STORAGE_KEY = "pressship.studio.theme.v1";

function loadStudioSidebarTab(pluginKey) {
  if (!pluginKey) {
    return "ai";
  }
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STUDIO_SIDEBAR_TAB_KEY) : null;
    if (!raw) return "ai";
    const parsed = JSON.parse(raw);
    return parsed?.[pluginKey] === "release" ? "release" : "ai";
  } catch {
    return "ai";
  }
}

function saveStudioSidebarTab(pluginKey, tab) {
  if (!pluginKey) return;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STUDIO_SIDEBAR_TAB_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[pluginKey] = tab === "release" ? "release" : "ai";
    localStorage.setItem(STUDIO_SIDEBAR_TAB_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

function loadStudioPanelState() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STUDIO_PANEL_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeStudioPanelState(parsed);
  } catch {
    return normalizeStudioPanelState();
  }
}

function normalizeStudioPanelState(value = {}) {
  return {
    files: value.files !== false,
    sidebar: value.sidebar !== false
  };
}

function saveStudioPanelState(panels) {
  try {
    localStorage.setItem(STUDIO_PANEL_STORAGE_KEY, JSON.stringify(normalizeStudioPanelState(panels)));
  } catch {
    // ignore
  }
}

function normalizeStudioTheme(value) {
  return value === "light" ? "light" : "dark";
}

function loadStudioTheme() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STUDIO_THEME_STORAGE_KEY) : null;
    return normalizeStudioTheme(raw);
  } catch {
    return "dark";
  }
}

function saveStudioTheme(theme) {
  try {
    localStorage.setItem(STUDIO_THEME_STORAGE_KEY, normalizeStudioTheme(theme));
  } catch {
    // ignore
  }
}

function studioTheme() {
  return normalizeStudioTheme(state.studio.theme);
}

function studioMonacoTheme() {
  return studioTheme() === "light" ? "pressship-studio-light" : "pressship-studio-dark";
}

function createInitialStudioRelease() {
  return {
    tags: null,
    tagsLoading: false,
    tagsError: "",
    tagsLoadedAt: null,
    newTagDraft: "",
    newTagError: "",
    customVersionDraft: "",
    customVersionError: "",
    skipReadmeValidation: false,
    bumpInFlight: null,
    bumpSuccess: null,
    bumpError: "",
    dryRun: null,
    dryRunRunning: false,
    dryRunJobId: null,
    publishing: false,
    publishJobId: null,
    switchingTag: "",
    switchingResolution: "",
    switchJobId: null,
    switchConflict: null,
    switchError: "",
    ignoredCollapsed: true
  };
}

function createInitialStudioIgnoreState() {
  return {
    ignorePath: "",
    patterns: [],
    ignoredFiles: []
  };
}

function createInitialStudioPackageSize() {
  return {
    loading: false,
    error: "",
    sizeBytes: null,
    maxSizeBytes: 10 * 1024 * 1024,
    overLimit: false,
    fileCount: 0,
    topLevelFolder: "",
    largestFiles: [],
    calculatedAt: null,
    stale: false
  };
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
  pluginCheckSummaries: {},
  latestWordPressVersion: "",
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
    directories: [],
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
    openFiles: [],
    terminalOpen: true,
    collapsedFolders: new Set(),
    expandedIgnoredFolders: new Set(),
    loadingFolders: new Set(),
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
    layout: loadStudioLayout(),
    panels: loadStudioPanelState(),
    theme: loadStudioTheme(),
    sidebarTab: "ai",
    playgroundVersionModal: null,
    release: createInitialStudioRelease(),
    ignoreState: createInitialStudioIgnoreState(),
    packageSize: createInitialStudioPackageSize(),
    ignoreLoading: false,
    ignoreError: "",
    ignoreBusyPattern: "",
    ignoreBusyPath: "",
    pendingConfirms: new Map()
  },
  activeView: "dashboard",
  releaseBoard: {
    plugins: [],
    loading: false,
    error: ""
  },
  settings: null,
  settingsDirty: false,
  aiAssistance: {
    loading: false,
    detectedAt: null,
    harnesses: [],
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
  release: document.getElementById("release-content"),
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
const VIEW_ROUTE_PATHS = {
  dashboard: "/dashboard",
  studio: "/studio",
  remote: "/wordpress.org",
  local: "/local",
  release: "/release",
  settings: "/settings"
};
const ROUTE_VIEW_ALIASES = {
  "": "dashboard",
  dashboard: "dashboard",
  studio: "studio",
  "wordpress.org": "remote",
  remote: "remote",
  local: "local",
  release: "release",
  settings: "settings"
};
let applyingLocationRoute = false;
let initialRouteLoaderVisible = false;
let studioFileSyncInFlight = false;
let studioLastExternalSyncAt = 0;
let studioLastDiskConflictKey = "";

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

  if (state.studio.playgroundVersionModal) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeStudioPlaygroundVersionModal();
      return;
    }

    if (event.key === "Tab") {
      const choices = Array.from(document.querySelectorAll(".studio-playground-version-choice:not(:disabled)"));
      if (choices.length) {
        event.preventDefault();
        const activeIndex = choices.indexOf(document.activeElement);
        const nextIndex = event.shiftKey
          ? (activeIndex <= 0 ? choices.length : activeIndex) - 1
          : (activeIndex + 1) % choices.length;
        choices[nextIndex]?.focus();
      }
      return;
    }
  }

  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && event.key.toLowerCase() === "k" && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if (mod && event.key.toLowerCase() === "s" && !event.shiftKey && !event.altKey && state.activeView === "studio") {
    event.preventDefault();
    if (canSaveStudioFile()) {
      void saveStudioFile();
    }
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
  if (event.target?.id === "studio-skip-readme-validation") {
    state.studio.release.skipReadmeValidation = Boolean(event.target.checked);
    updateStudioSidebar();
    return;
  }

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

window.addEventListener("popstate", () => {
  void applyLocationRoute({ replaceRoute: true });
});

window.addEventListener("focus", () => {
  syncSelectedStudioFileOnResume();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncSelectedStudioFileOnResume();
  }
});

function normalizeViewId(view) {
  return Object.prototype.hasOwnProperty.call(VIEW_ROUTE_PATHS, view) ? view : "dashboard";
}

function normalizeBrowserPath(pathname = window.location.pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function shouldShowInitialRouteLoader() {
  const path = normalizeBrowserPath();
  return path !== "/" && path !== VIEW_ROUTE_PATHS.dashboard;
}

function showInitialRouteLoader() {
  if (!shouldShowInitialRouteLoader() || initialRouteLoaderVisible) {
    return;
  }
  initialRouteLoaderVisible = true;
  document.body.classList.add("is-initial-route-loading");
  const loader = document.createElement("div");
  loader.id = "initial-route-loader";
  loader.className = "ps-initial-route-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-label", "Loading Pressship Studio");
  loader.innerHTML = `
    <div class="ps-initial-route-loader-card">
      ${pressshipStudioLoaderSvg()}
    </div>
  `;
  document.body.append(loader);
}

function pressshipStudioLoaderSvg() {
  return `
    <svg class="ps-studio-loader-logo" viewBox="0 0 277 312" role="img" aria-label="Pressship Studio loading">
      <image class="ps-studio-loader-symbol" href="/brand/pressship-symbol-shell.png" x="0" y="0" width="277" height="312" preserveAspectRatio="xMidYMid meet" />
      <g class="ps-studio-loader-prompt">
        <path d="M95 96l39 39-39 39" />
        <path d="M95 214h62" />
      </g>
    </svg>
  `;
}

function hideInitialRouteLoader() {
  if (!initialRouteLoaderVisible) {
    return;
  }
  initialRouteLoaderVisible = false;
  document.body.classList.remove("is-initial-route-loading");
  document.getElementById("initial-route-loader")?.remove();
}

function decodeRouteSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodeRouteSegments(value) {
  return String(value ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseLocationRoute(pathname = window.location.pathname) {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeRouteSegment(segment));
  const head = segments[0] ?? "";

  if (head === "studio") {
    return {
      view: "studio",
      studio: {
        project: segments[1] ?? "",
        filePath: segments.slice(2).join("/")
      }
    };
  }

  return {
    view: ROUTE_VIEW_ALIASES[head] ?? "dashboard"
  };
}

function applyActiveViewShell(view) {
  const nextView = normalizeViewId(view);
  state.activeView = nextView;
  document.body.dataset.activeView = nextView;
  document.querySelectorAll(".view").forEach((node) => node.classList.remove("is-active"));
  document.getElementById(`view-${nextView}`)?.classList.add("is-active");
  document
    .querySelectorAll("#adminmenu li")
    .forEach((node) => node.classList.remove("wp-has-current-submenu"));
  document
    .querySelector(`#adminmenu li[data-view="${nextView}"]`)
    ?.classList.add("wp-has-current-submenu");
  return nextView;
}

function primeInitialRouteState(route) {
  const nextView = applyActiveViewShell(route.view);
  if (nextView !== "studio" || !route.studio?.project || state.studio.id) {
    return;
  }

  const filePath = route.studio.filePath;
  state.studio = {
    ...state.studio,
    scope: null,
    id: route.studio.project,
    plugin: { slug: route.studio.project, name: route.studio.project },
    files: [],
    directories: [],
    selectedFile: filePath
      ? {
          path: filePath,
          name: filePath.split("/").pop() ?? filePath,
          directory: filePath.includes("/") ? filePath.split("/").slice(0, -1).join("/") : "",
          size: 0
        }
      : null,
    fileContent: "",
    draftContent: "",
    readOnly: true,
    dirty: false,
    loading: true,
    running: false,
    checking: false,
    jobId: null,
    checkJobId: null,
    activeTab: "editor",
    openFiles: filePath ? [filePath] : [],
    terminal: [
      `Opening ${route.studio.project} from URL...`,
      { message: `$ ${studioOpenCliCommand()}`, tone: "command" }
    ],
    collapsedFolders: new Set(),
    expandedIgnoredFolders: new Set(),
    loadingFolders: new Set(),
    pendingConfirms: new Map()
  };
}

function studioProjectRouteSegment() {
  const plugin = state.studio.plugin;
  const localPlugin = state.local.find((item) => item.id === state.studio.id);
  return plugin?.slug || localPlugin?.slug || plugin?.name || state.studio.id || "";
}

function studioRoutePathForState() {
  if (!state.studio.id) {
    return VIEW_ROUTE_PATHS.studio;
  }
  const project = studioProjectRouteSegment();
  if (!project) {
    return VIEW_ROUTE_PATHS.studio;
  }
  const filePath =
    state.studio.activeTab === "editor" && state.studio.selectedFile?.path
      ? encodeRouteSegments(state.studio.selectedFile.path)
      : "";
  const projectPath = encodeURIComponent(project);
  return filePath ? `/studio/${projectPath}/${filePath}` : `/studio/${projectPath}`;
}

function routePathForState() {
  const view = normalizeViewId(state.activeView);
  return view === "studio" ? studioRoutePathForState() : VIEW_ROUTE_PATHS[view];
}

function updateRouteFromState(options = {}) {
  if (applyingLocationRoute && !options.force) {
    return;
  }
  const nextPath = routePathForState();
  if (normalizeBrowserPath(nextPath) === normalizeBrowserPath()) {
    return;
  }
  const method = options.replace ? "replaceState" : "pushState";
  history[method]({ pressshipView: state.activeView }, "", nextPath);
}

function resolveStudioRouteProject(project) {
  if (!project) {
    return null;
  }
  const normalizedProject = project.toLowerCase();
  const matchesProject = (candidate) => {
    if (!candidate) {
      return false;
    }
    return candidate === project || candidate.toLowerCase() === normalizedProject;
  };
  const localPlugin = state.local.find((plugin) =>
    [plugin.slug, plugin.id, plugin.name].some((candidate) => matchesProject(candidate))
  );
  if (localPlugin) {
    return { scope: "local", id: localPlugin.id };
  }

  const remotePlugin = state.remote.find((plugin) =>
    [plugin.slug, plugin.name].some((candidate) => matchesProject(candidate))
  );
  return { scope: "remote", id: remotePlugin?.slug || project };
}

async function applyLocationRoute(options = {}) {
  const route = parseLocationRoute();
  applyingLocationRoute = true;
  try {
    if (route.view === "studio") {
      if (route.studio?.project) {
        const target = resolveStudioRouteProject(route.studio.project);
        if (target) {
          await openStudio(target.scope, target.id, {
            filePath: route.studio.filePath,
            updateRoute: false
          });
        } else {
          await showView("studio", { updateRoute: false });
          renderStudio();
        }
      } else {
        await showView("studio", { updateRoute: false });
        renderStudio();
      }
    } else {
      await showView(route.view, { updateRoute: false });
    }
  } finally {
    applyingLocationRoute = false;
  }

  if (options.replaceRoute !== false) {
    updateRouteFromState({ replace: true, force: true });
  }
}

showInitialRouteLoader();
void boot();

async function boot() {
  try {
    state.bootstrap = await api("/api/bootstrap");
    refreshTokenFromBootstrap(state.bootstrap);
  } catch (error) {
    hideInitialRouteLoader();
    notice(`Could not load bootstrap state: ${error.message}`, "error");
    return;
  }
  state.settings = state.bootstrap.settings ?? null;
  state.playgrounds = state.bootstrap.playgrounds ?? [];
  state.aiAssistance.harnesses = state.bootstrap.aiHarnesses ?? [];
  state.pluginCheckSummaries = state.bootstrap.pluginCheckSummaries ?? {};
  state.latestWordPressVersion = state.bootstrap.latestWordPressVersion ?? "";
  const initialRoute = parseLocationRoute();
  primeInitialRouteState(initialRoute);
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
  if (state.activeView === "release") {
    void loadReleaseBoard();
  }
  void loadAiAssistance();
  try {
    await Promise.all([loadRemote(), loadLocal()]);
    await applyLocationRoute({ replaceRoute: true });
  } finally {
    hideInitialRouteLoader();
  }
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

      case "studio-ignore-file":
        await addStudioIgnoreRule(studioFileIgnorePattern(element.dataset.path), {
          path: element.dataset.path,
          label: element.dataset.path
        });
        return;

      case "studio-ignore-folder":
        await addStudioIgnoreRule(studioFolderIgnorePattern(element.dataset.path), {
          path: element.dataset.path,
          label: `${element.dataset.path}/`
        });
        return;

      case "studio-unignore-rule":
        await removeStudioIgnoreRule(element.dataset.pattern);
        return;

      case "studio-close-file-tab":
        await closeStudioFileTab(element.dataset.path);
        return;

      case "studio-toggle-folder":
        await toggleStudioFolder(element.dataset.folder);
        return;

      case "studio-toggle-terminal":
        toggleStudioTerminal();
        return;

      case "studio-toggle-files":
        toggleStudioPanel("files");
        return;

      case "studio-toggle-sidebar":
        toggleStudioPanel("sidebar");
        return;

      case "studio-open-sidebar-tab":
        openStudioSidebarTab(element.dataset.tab);
        return;

      case "studio-save":
        await saveStudioFile();
        return;

      case "studio-check":
        await runStudioCheck();
        return;

      case "studio-package-size":
        await refreshStudioPackageSize({ force: true, notify: true });
        return;

      case "studio-toggle-theme":
        toggleStudioTheme();
        return;

      case "studio-check-note":
        revealStudioCheckNote(Number(element.dataset.line || 1), Number(element.dataset.column || 1));
        return;

      case "studio-run":
        await runStudioPlay();
        return;

      case "studio-playground-version":
        await runStudioPlayWithVersionChoice(element.dataset.choice);
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
        await bumpStudioReleaseVersion(element.dataset.id, element.dataset.bump);
        return;

      case "set-custom-version":
        await setStudioCustomReleaseVersion(element.dataset.id);
        return;

      case "dry-run-publish":
        await createReleaseDryRunJob(element.dataset.id, element.dataset.publishAction);
        return;

      case "open-in-library":
        await openInLibrary(element.dataset.slug);
        return;

      case "manage-release":
        await openStudio("local", element.dataset.id, { sidebarTab: "release" });
        return;

      case "refresh-release-board":
        await loadReleaseBoard({ notify: true });
        return;

      case "studio-sidebar-tab":
        setStudioSidebarTab(element.dataset.tab);
        return;

      case "studio-release-refresh":
        await Promise.all([
          loadStudioReleaseTags({ force: true }),
          refreshStudioIgnoreState({ files: true })
        ]);
        return;

      case "studio-release-toggle-ignored":
        toggleStudioReleaseIgnored();
        return;

      case "studio-release-switch":
        await switchStudioReleaseTag(element.dataset.tag, element.dataset.resolution);
        return;

      case "studio-release-create":
        await createStudioReleaseTag();
        return;

      case "studio-release-delete":
        await deleteStudioReleaseTag(element);
        return;

      case "studio-release-publish":
        await confirmStudioRelease(element);
        return;

      case "toggle-kebab":
        toggleKebabMenu(element.dataset.kebabId, element);
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
  if (!els.remote) {
    return;
  }
  if (!state.remote.length) {
    els.remote.innerHTML = emptyState({
      title: "No plugins found.",
      message: "The saved WordPress.org account did not return any plugins.",
      icon: "dashicons-admin-plugins"
    });
    return;
  }

  const cards = state.remote.map(remoteCard).join("");
  els.remote.innerHTML = `
    <div class="ps-card-toolbar" role="region" aria-label="WordPress.org plugin count">
      <span class="ps-card-toolbar-count">
        <span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span>
        ${escapeHtml(
          `${state.remote.length} plugin${state.remote.length === 1 ? "" : "s"} for ${state.remoteUsername || "account"}`
        )}
      </span>
    </div>
    <div class="ps-plugin-card-grid ps-plugin-card-grid-remote">${cards}</div>
  `;
}

function remoteCard(plugin) {
  const localState = remotePluginLocalState(plugin);
  const inLibrary = localState.entry;
  const primaryLabel = inLibrary ? "Open in Studio" : "Clone to Local";
  const primaryAction = inLibrary
    ? `data-action="studio" data-scope="local" data-id="${escapeAttr(inLibrary.id)}"`
    : `data-action="open-in-library" data-slug="${escapeAttr(plugin.slug)}"`;
  const roleBadges = remoteRoleChips(plugin.roles);
  const initials = pluginInitials(plugin.name || plugin.slug);
  const description = plugin.author ? `By ${plugin.author}` : "WordPress.org plugin";

  return `
    <article class="ps-plugin-card${inLibrary ? " is-in-library" : " is-not-cloned"}" data-slug="${escapeAttr(plugin.slug)}">
      <header class="ps-plugin-card-header">
        <span class="ps-plugin-card-icon" aria-hidden="true">${escapeHtml(initials)}</span>
        <div class="ps-plugin-card-title">
          <h2>
            <button type="button" class="ps-plugin-card-link" data-action="details" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">${escapeHtml(plugin.name)}</button>
          </h2>
          <p class="ps-plugin-card-byline">${escapeHtml(description)}</p>
        </div>
      </header>
      <dl class="ps-plugin-card-meta">
        <div>
          <dt>Active installs</dt>
          <dd>${escapeHtml(plugin.activeInstalls ?? "unknown")}</dd>
        </div>
        <div>
          <dt>Tested up to</dt>
          <dd>${escapeHtml(plugin.testedWith ?? "unknown")}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>${roleBadges}</dd>
        </div>
      </dl>
      <div class="ps-plugin-card-status ps-plugin-card-local-state" title="${escapeAttr(localState.title)}">
        <span class="badge badge-${escapeAttr(localState.tone)}">
          <span class="dashicons ${escapeAttr(localState.icon)}" aria-hidden="true"></span>
          ${escapeHtml(localState.label)}
        </span>
        <small>${escapeHtml(localState.note)}</small>
      </div>
      <footer class="ps-plugin-card-footer">
        <button type="button" class="button button-primary ps-plugin-card-primary" ${primaryAction}>
          <span class="dashicons ${inLibrary ? "dashicons-editor-code" : "dashicons-download"}" aria-hidden="true"></span>
          ${escapeHtml(primaryLabel)}
        </button>
        <button type="button" class="ps-plugin-card-secondary" data-action="details" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">
          Details
        </button>
      </footer>
    </article>
  `;
}

function remotePluginLocalState(plugin) {
  const matches = state.local.filter((entry) => entry.slug === plugin.slug);
  const cloned = matches.find((entry) => entry.source === "clone" && entry.exists !== false);
  const tracked = matches.find((entry) => entry.exists !== false);
  const missing = matches.find((entry) => entry.exists === false);

  if (cloned) {
    return {
      entry: cloned,
      label: "Cloned locally",
      note: cloned.path || "SVN checkout is tracked in Studio.",
      title: cloned.path || "This WordPress.org plugin has a local SVN checkout.",
      tone: "soft-success",
      icon: "dashicons-yes-alt"
    };
  }

  if (tracked) {
    return {
      entry: tracked,
      label: "Tracked locally",
      note: tracked.path || "Matching local folder is tracked in Studio.",
      title: tracked.path || "A matching local plugin folder is tracked in Studio.",
      tone: "soft-success",
      icon: "dashicons-admin-site-alt3"
    };
  }

  if (missing) {
    return {
      entry: null,
      label: "Local path missing",
      note: "Clone to recreate the local checkout.",
      title: missing.path || "The previous local folder is no longer available.",
      tone: "soft-warning",
      icon: "dashicons-warning"
    };
  }

  return {
    entry: null,
    label: "Not cloned",
    note: "Clone this WordPress.org plugin to work on it locally.",
    title: "This WordPress.org plugin is not cloned into the local library.",
    tone: "soft-warning",
    icon: "dashicons-download"
  };
}

function remoteRoleChips(roles = []) {
  const safeRoles = Array.isArray(roles) ? roles : [];
  if (!safeRoles.length) {
    return `<span class="ps-plugin-card-muted">unknown</span>`;
  }
  return `<span class="ps-role-list">${safeRoles
    .map((role) => `<span class="ps-role-badge">${escapeHtml(role)}</span>`)
    .join("")}</span>`;
}

function pluginInitials(value) {
  const text = String(value || "").trim();
  if (!text) return "?";
  const words = text.split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? words[words.length - 1][0] : words[0][1] ?? "";
  return `${first}${second}`.toUpperCase();
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
    if (!state.remoteLoading && state.remote.length) {
      renderRemote();
    }
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
  if (!els.local) {
    return;
  }
  if (!state.local.length) {
    els.local.innerHTML = emptyState({
      title: "No local plugins yet.",
      message: "Add a folder, or open one from WordPress.org to clone it into your library.",
      icon: "dashicons-download"
    });
    return;
  }

  const cards = state.local
    .map((plugin) => localCard(plugin, state.versionStates.get(plugin.id)))
    .join("");

  els.local.innerHTML = `
    <div class="ps-card-toolbar" role="region" aria-label="Local plugin count">
      <span class="ps-card-toolbar-count">
        <span class="dashicons dashicons-download" aria-hidden="true"></span>
        ${escapeHtml(`${state.local.length} local plugin${state.local.length === 1 ? "" : "s"}`)}
      </span>
      <button class="button button-secondary" type="button" data-action="choose-local-folder">
        <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
        Add folder
      </button>
    </div>
    <div class="ps-plugin-card-grid ps-plugin-card-grid-local">${cards}</div>
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

async function openStudio(scope, id, options = {}) {
  disposeStudioEditor();
  const pluginKey = `${scope}:${id}`;
  const sidebarTab = options.sidebarTab === "release" || options.sidebarTab === "ai"
    ? options.sidebarTab
    : loadStudioSidebarTab(pluginKey);
  state.studio = {
    scope,
    id,
    plugin: null,
    files: [],
    directories: [],
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
    openFiles: [],
    terminalOpen: true,
    collapsedFolders: new Set(),
    expandedIgnoredFolders: new Set(),
    loadingFolders: new Set(),
    terminal: [
      `Pressship Studio opened for ${scope === "local" ? "local plugin" : "WordPress.org plugin"} ${id}.`,
      { message: `$ ${studioOpenCliCommand()}`, tone: "command" }
    ],
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
    layout: state.studio.layout ?? loadStudioLayout(),
    panels: normalizeStudioPanelState(state.studio.panels ?? loadStudioPanelState()),
    theme: normalizeStudioTheme(state.studio.theme ?? loadStudioTheme()),
    sidebarTab,
    playgroundVersionModal: null,
    release: createInitialStudioRelease(),
    ignoreState: createInitialStudioIgnoreState(),
    packageSize: createInitialStudioPackageSize(),
    ignoreLoading: false,
    ignoreError: "",
    ignoreBusyPattern: "",
    ignoreBusyPath: "",
    pendingConfirms: new Map()
  };
  saveStudioSidebarTab(pluginKey, sidebarTab);
  await showView("studio", { updateRoute: false });
  renderStudio();
  if (scope === "local" && sidebarTab === "release") {
    void loadStudioReleaseTags();
  }

  try {
    const detail = await api(`/api/plugins/${scope}/${encodeURIComponent(id)}`);
    applyStudioPluginDetail(scope, id, detail);
    state.studio.loading = false;

    if (scope === "local") {
      const [result, checkState, ignoreState] = await Promise.all([
        api(`/api/plugins/local/${encodeURIComponent(id)}/files`),
        api(`/api/plugins/local/${encodeURIComponent(id)}/check-state`).catch(() => ({ state: null })),
        api(`/api/plugins/local/${encodeURIComponent(id)}/ignore-state`).catch(() => createInitialStudioIgnoreState())
      ]);
      state.studio.files = result.files ?? [];
      state.studio.directories = result.directories ?? [];
      applyStudioCheckState(checkState.state);
      applyStudioIgnoreState(ignoreState);
      renderStudio();
      const requestedFile = options.filePath
        ? state.studio.files.find((file) => file.path === options.filePath)
        : null;
      if (options.filePath && !requestedFile) {
        appendStudioTerminal(`Route file not found: ${options.filePath}`, "warning");
      }
      const initialFile = requestedFile ?? chooseInitialStudioFile(state.studio.files, state.studio.plugin?.slug);
      if (initialFile) {
        await selectStudioFile(initialFile.path, {
          updateRoute: options.updateRoute,
          replaceRoute: options.replaceRoute
        });
      } else {
        state.studio.draftContent = "";
        remountStudioEditorIfNeeded();
        if (options.updateRoute !== false) {
          updateRouteFromState({ replace: options.replaceRoute });
        }
      }
      void refreshStudioPackageSize({ render: true });
    } else {
      state.studio.files = [{ path: "readme.txt", name: "readme.txt", directory: "", size: detail.readme?.length ?? 0 }];
      state.studio.selectedFile = state.studio.files[0];
      state.studio.openFiles = ["readme.txt"];
      state.studio.fileContent = detail.readme ?? "No hosted readme.txt could be loaded.";
      state.studio.draftContent = state.studio.fileContent;
      state.studio.readOnly = true;
      renderStudio();
      remountStudioEditorIfNeeded();
      if (options.updateRoute !== false) {
        updateRouteFromState({ replace: options.replaceRoute });
      }
    }
  } catch (error) {
    state.studio.loading = false;
    appendStudioTerminal(error.message, "error");
    renderStudio();
    if (options.updateRoute !== false) {
      updateRouteFromState({ replace: options.replaceRoute });
    }
  }
}

function applyStudioPluginDetail(scope, id, detail) {
  state.studio.plugin = scope === "local"
    ? { ...detail.plugin, info: detail.info }
    : { id, slug: id, name: detail.info?.name ?? id, info: detail.info };

  if (state.studio.playgroundVersionModal) {
    const testedUpTo = studioTestedUpToVersion();
    state.studio.playgroundVersionModal = testedUpTo ? { testedUpTo } : null;
  }
}

async function selectStudioFile(relativePath, options = {}) {
  if (!state.studio.id || state.studio.scope !== "local" || !relativePath) {
    return;
  }
  if (state.studio.dirty && !options.force && !confirm("Discard unsaved changes in the current file?")) {
    return;
  }

  ensureStudioFileTab(relativePath);
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
  if (options.updateRoute !== false) {
    updateRouteFromState({ replace: options.replaceRoute });
  }

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
    state.studio.fileContent = `Cannot open ${relativePath}.\n\n${error.message}`;
    state.studio.draftContent = state.studio.fileContent;
    state.studio.dirty = false;
    renderStudio();
    remountStudioEditorIfNeeded();
  }
}

function syncSelectedStudioFileOnResume() {
  if (Date.now() - studioLastExternalSyncAt < 1200) {
    return;
  }
  studioLastExternalSyncAt = Date.now();
  void syncSelectedStudioFileFromDisk({ reason: "external" });
}

async function syncSelectedStudioFileFromDisk(options = {}) {
  if (
    studioFileSyncInFlight ||
    state.studio.scope !== "local" ||
    !state.studio.id ||
    !state.studio.selectedFile?.path ||
    state.studio.activeTab !== "editor" ||
    state.studio.loading ||
    state.studio.readOnly ||
    studioAiChangedFile(state.studio.selectedFile.path)
  ) {
    return false;
  }

  const selectedPath = state.studio.selectedFile.path;
  studioFileSyncInFlight = true;
  captureStudioEditorValue();

  try {
    const result = await api(
      `/api/plugins/local/${encodeURIComponent(state.studio.id)}/files/content?path=${encodeURIComponent(selectedPath)}`
    );
    if (state.studio.selectedFile?.path !== selectedPath) {
      return false;
    }

    const diskContent = result.content ?? "";
    if (diskContent === state.studio.fileContent) {
      return false;
    }

    if (state.studio.dirty && state.studio.draftContent !== diskContent) {
      const conflictKey = `${selectedPath}:${diskContent.length}:${diskContent.slice(0, 80)}`;
      if (studioLastDiskConflictKey !== conflictKey) {
        studioLastDiskConflictKey = conflictKey;
        appendStudioTerminal(
          `${selectedPath} changed on disk. Your unsaved editor changes were kept.`,
          "warning"
        );
        notice(`${selectedPath} changed on disk. Unsaved editor changes were kept.`, "warning");
      }
      return false;
    }

    studioLastDiskConflictKey = "";
    state.studio.selectedFile =
      state.studio.files.find((file) => file.path === result.path) ?? state.studio.selectedFile;
    state.studio.fileContent = diskContent;
    state.studio.draftContent = diskContent;
    state.studio.dirty = false;
    renderStudio();
    remountStudioEditorIfNeeded();
    updateStudioControls();
    if (options.reason === "ignore-rule") {
      appendStudioTerminal(`Reloaded ${selectedPath} after ignore rules changed.`, "success");
    } else if (options.reason === "external") {
      appendStudioTerminal(`Reloaded ${selectedPath} from disk.`, "status");
    }
    return true;
  } catch (error) {
    if (options.reportErrors) {
      appendStudioTerminal(`Could not refresh ${selectedPath}: ${error.message}`, "error");
    }
    return false;
  } finally {
    studioFileSyncInFlight = false;
  }
}

function ensureStudioFileTab(relativePath) {
  if (!relativePath) {
    return;
  }
  const openFiles = Array.isArray(state.studio.openFiles) ? state.studio.openFiles : [];
  if (!openFiles.includes(relativePath)) {
    openFiles.push(relativePath);
  }
  state.studio.openFiles = openFiles;
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
    markStudioPackageSizeStale();
    if (state.studio.selectedFile.path === ".pressshipignore") {
      await refreshStudioIgnoreState({ files: true, render: false });
    }
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

  const testedUpTo = studioTestedUpToVersion();
  if (testedUpTo) {
    openStudioPlaygroundVersionModal(testedUpTo);
    return;
  }

  await startStudioPlaygroundWithVersion({
    label: "latest",
    terminalLabel: "latest WordPress"
  });
}

async function startStudioPlaygroundWithVersion(wpChoice) {
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
  appendStudioTerminal(`Starting WordPress Playground with ${wpChoice.terminalLabel}…`, "status");
  renderStudio();
  updateStudioControls();

  const input = { type: "play", scope: state.studio.scope, id: state.studio.id };
  if (wpChoice.wpVersion) {
    input.wpVersion = wpChoice.wpVersion;
  }
  const job = await createJob(input);
  state.studio.jobId = job.id;
  updateStudioControls();
}

function openStudioPlaygroundVersionModal(testedUpTo) {
  captureStudioEditorValue();
  state.studio.playgroundVersionModal = { testedUpTo };
  renderStudio();
  remountStudioEditorIfNeeded();
  setTimeout(() => document.querySelector(".studio-playground-version-choice.is-primary")?.focus(), 0);
}

function closeStudioPlaygroundVersionModal() {
  if (!state.studio.playgroundVersionModal) {
    return;
  }
  captureStudioEditorValue();
  state.studio.playgroundVersionModal = null;
  renderStudio();
  remountStudioEditorIfNeeded();
}

async function runStudioPlayWithVersionChoice(choice) {
  const testedUpTo = state.studio.playgroundVersionModal?.testedUpTo;
  state.studio.playgroundVersionModal = null;
  if (choice === "tested" && testedUpTo) {
    const limitation = studioPlaygroundRuntimeLimitation(testedUpTo);
    if (limitation) {
      appendStudioTerminal(limitation, "error");
      notice("This WordPress version cannot run in Playground.", "warning");
      renderStudio();
      remountStudioEditorIfNeeded();
      return;
    }
    await startStudioPlaygroundWithVersion({
      label: `Tested up to ${testedUpTo}`,
      terminalLabel: `WordPress ${testedUpTo} (Tested up to)`,
      wpVersion: testedUpTo
    });
    return;
  }

  await startStudioPlaygroundWithVersion({
    label: "latest",
    terminalLabel: "latest WordPress"
  });
}

function studioTestedUpToVersion() {
  const info = state.studio.plugin?.info ?? {};
  return normalizeStudioPlaygroundVersion(
    info.readme?.testedUpTo ?? info.tested ?? state.studio.plugin?.testedWith
  );
}

function normalizeStudioPlaygroundVersion(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const match = text.match(/\d+(?:\.\d+){0,2}/);
  return match?.[0] ?? "";
}

async function runStudioCheck() {
  if (state.studio.scope !== "local" || !state.studio.id) {
    notice("Verify is available for local plugins.", "warning");
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
  captureStudioEditorValue();
  appendStudioTerminal(
    state.studio.release.skipReadmeValidation
      ? "Running verify with readme validator skipped…"
      : "Running verify with readme validation and Plugin Check…",
    "status"
  );
  applyStudioCheckMarkers();
  renderStudio();
  remountStudioEditorIfNeeded();
  updateStudioControls();

  const job = await createJob({
    type: "check",
    localId: state.studio.id,
    skipReadmeValidator: Boolean(state.studio.release.skipReadmeValidation)
  });
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
  updateRouteFromState();
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
    state.studio.directories = result.directories ?? state.studio.directories;
    if (change.path === ".pressshipignore") {
      await refreshStudioIgnoreState({ files: true, render: false });
    }
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

  if (state.studio.loading && !state.studio.scope && state.studio.id) {
    els.studio.innerHTML = `
      <div class="studio-root studio-empty-root studio-logo-loading-root">
        <div class="studio-logo-loading-shell" role="status" aria-live="polite" aria-label="Opening ${escapeAttr(title)} in Pressship Studio">
          ${pressshipStudioLoaderSvg()}
        </div>
      </div>
    `;
    updateStudioControls();
    return;
  }

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

  const hasExplorerEntries = state.studio.files.length || state.studio.directories.length;
  const fileList = hasExplorerEntries
    ? renderStudioFileTree(buildStudioFileTree(state.studio.files, state.studio.directories))
    : `<p class="studio-muted">No editable text files found.</p>`;
  const playgroundPort = state.studio.playgroundUrl ? new URL(state.studio.playgroundUrl).port : "";
  const panels = normalizeStudioPanelState(state.studio.panels);

  els.studio.innerHTML = `
    <div class="studio-root${state.studio.terminalOpen ? " has-terminal" : ""}${panels.files ? " has-files" : " is-files-collapsed"}${panels.sidebar ? " has-secondary-sidebar" : " is-secondary-sidebar-collapsed"}" data-theme="${escapeAttr(studioTheme())}">
      <header class="studio-titlebar">
        <div class="studio-title">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(source)}</span>
        </div>
        <div class="studio-title-actions">
          <div class="studio-toolbar-group studio-toolbar-layout" aria-label="Workbench layout">
            <button class="studio-layout-button${panels.files ? " is-active" : ""}" type="button" data-action="studio-toggle-files" aria-pressed="${panels.files ? "true" : "false"}" aria-label="${panels.files ? "Hide Explorer" : "Show Explorer"}" title="${panels.files ? "Hide Explorer" : "Show Explorer"}">
              <span class="dashicons dashicons-align-left" aria-hidden="true"></span>
            </button>
            <button class="studio-icon-button studio-compact-button" type="button" data-action="studio-toggle-terminal" aria-pressed="${state.studio.terminalOpen ? "true" : "false"}" aria-label="${state.studio.terminalOpen ? "Hide Terminal" : "Show Terminal"}" title="${state.studio.terminalOpen ? "Hide Terminal" : "Show Terminal"}">
              <span class="dashicons dashicons-editor-kitchensink" aria-hidden="true"></span>
              <span>Terminal</span>
            </button>
            <button class="studio-layout-button${panels.sidebar ? " is-active" : ""}" type="button" data-action="studio-toggle-sidebar" aria-pressed="${panels.sidebar ? "true" : "false"}" aria-label="${panels.sidebar ? "Hide Secondary Side Bar" : "Show Secondary Side Bar"}" title="${panels.sidebar ? "Hide Secondary Side Bar" : "Show Secondary Side Bar"}">
              <span class="dashicons dashicons-align-right" aria-hidden="true"></span>
            </button>
          </div>
          <div class="studio-toolbar-group studio-toolbar-run" aria-label="Playground">
            ${renderStudioPlayButton()}
            <span class="studio-preview-state${state.studio.running ? " is-loading" : state.studio.playgroundUrl ? " is-ready" : ""}" title="${escapeAttr(studioPreviewStateTitle())}">
              <span aria-hidden="true"></span>
              <em>${escapeHtml(studioPreviewStateLabel())}</em>
            </span>
          </div>
          <div class="studio-toolbar-group studio-toolbar-actions" aria-label="Editor actions">
            <button class="studio-action-button studio-compact-button" type="button" data-action="studio-save" id="studio-save-button" aria-label="${escapeAttr(`Save ${studioSaveShortcutLabel()}`)}" aria-keyshortcuts="${escapeAttr(studioSaveAriaShortcut())}" title="${escapeAttr(`Save ${studioSaveShortcutLabel()}`)}" disabled>
              <span class="dashicons dashicons-saved" aria-hidden="true"></span>
              <span>Save</span>
            </button>
            <button class="studio-action-button studio-compact-button" type="button" data-action="studio-check" id="studio-check-button" aria-label="Run Verify" title="Run Verify" disabled>
              <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
              <span>Verify</span>
            </button>
            ${renderStudioPackageSizeButton()}
            ${renderStudioThemeToggle()}
          </div>
        </div>
      </header>
      <div class="studio-main">
        ${renderStudioActivityBar(panels)}
        ${
          panels.files
            ? `<aside class="studio-files" aria-label="Explorer">
                <header class="studio-pane-header">
                  <strong>Explorer</strong>
                  <button class="studio-pane-action" type="button" data-action="studio-toggle-files" aria-label="Hide Explorer" title="Hide Explorer">
                    <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
                  </button>
                </header>
                <div class="studio-file-list">${fileList}</div>
              </aside>
              ${renderStudioResizer("files", "h", { label: "Explorer" })}`
            : ""
        }
        <section class="studio-workbench" aria-label="Studio editor">
          <div class="studio-tabs" aria-label="Studio tabs and Playground controls">
            <div class="studio-tablist" role="tablist" aria-label="Studio tabs">
              ${renderStudioPinnedPreviewTabs(playgroundPort)}
              ${renderStudioFileTabs()}
            </div>
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
        ${
          panels.sidebar
            ? `${renderStudioResizer("ai", "h", { invert: true, label: "Secondary Side Bar" })}
              <aside class="studio-ai" id="studio-ai" aria-label="Secondary Side Bar">
                ${renderStudioAiSidebar()}
              </aside>`
            : ""
        }
      </div>
      ${renderStudioStatusBar()}
      ${renderStudioPlaygroundVersionModal()}
    </div>
  `;
  applyStudioLayout(els.studio.querySelector(".studio-root"));
  bindStudioResizers();
  scrollActiveStudioFileTabIntoView();
  updateStudioControls();
}

function renderStudioActivityBar(panels) {
  const tab = state.studio.sidebarTab === "release" ? "release" : "ai";
  const activityButton = ({ action, icon, label, active, tab: targetTab }) => `
    <button class="studio-activity-button${active ? " is-active" : ""}" type="button" data-action="${escapeAttr(action)}"${targetTab ? ` data-tab="${escapeAttr(targetTab)}"` : ""} aria-pressed="${active ? "true" : "false"}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">
      <span class="dashicons ${escapeAttr(icon)}" aria-hidden="true"></span>
    </button>
  `;

  return `
    <nav class="studio-activitybar" aria-label="Studio workbench views">
      <div class="studio-activitybar-primary">
        ${activityButton({
          action: "studio-toggle-files",
          icon: "dashicons-open-folder",
          label: panels.files ? "Hide Explorer" : "Show Explorer",
          active: panels.files
        })}
        ${activityButton({
          action: "studio-tab",
          icon: "dashicons-editor-code",
          label: "Editor",
          active: state.studio.activeTab === "editor",
          tab: "editor"
        })}
        ${activityButton({
          action: "studio-tab",
          icon: "dashicons-admin-home",
          label: "Playground Home",
          active: state.studio.activeTab === "home",
          tab: "home"
        })}
      </div>
      <div class="studio-activitybar-secondary">
        ${activityButton({
          action: "studio-open-sidebar-tab",
          icon: "dashicons-format-chat",
          label: "AI Helper",
          active: panels.sidebar && tab === "ai",
          tab: "ai"
        })}
        ${activityButton({
          action: "studio-open-sidebar-tab",
          icon: "ps-icon-rocket",
          label: "Release",
          active: panels.sidebar && tab === "release",
          tab: "release"
        })}
        ${activityButton({
          action: "studio-toggle-terminal",
          icon: "dashicons-editor-kitchensink",
          label: state.studio.terminalOpen ? "Hide Terminal" : "Show Terminal",
          active: state.studio.terminalOpen
        })}
      </div>
    </nav>
  `;
}

function renderStudioStatusBar() {
  const plugin = state.studio.plugin;
  const file = state.studio.selectedFile?.path ?? "No file selected";
  const check = state.studio.checkSummary
    ? `${state.studio.checkSummary.error || 0} errors, ${state.studio.checkSummary.warning || 0} warnings`
    : "Verify idle";
  const assistant = selectedStudioAiAssistant();
  return `
    <footer class="studio-statusbar" aria-label="Studio status">
      <span><span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span>${escapeHtml(plugin?.slug ?? state.studio.id ?? "Studio")}</span>
      <span>${escapeHtml(file)}</span>
      <span>${escapeHtml(check)}</span>
      <span class="studio-statusbar-spacer"></span>
      <span>${escapeHtml(assistant === "none" ? "AI disabled" : assistantLabel(assistant))}</span>
      <span>${escapeHtml(state.studio.readOnly ? "Read-only" : "Writable")}</span>
    </footer>
  `;
}

function renderStudioPinnedPreviewTabs(playgroundPort) {
  return `
    <span class="studio-pinned-tabs" aria-label="Pinned preview tabs">
      <button type="button" role="tab" aria-selected="${state.studio.activeTab === "home" ? "true" : "false"}" class="studio-tab-button studio-tab-pinned studio-preview-tab${state.studio.activeTab === "home" ? " is-active" : ""}" data-action="studio-tab" data-tab="home" title="Home">
        <span class="dashicons dashicons-admin-home" aria-hidden="true"></span>
        <span>Home</span>
        ${playgroundPort ? `<small>${escapeHtml(`:${playgroundPort}`)}</small>` : ""}
      </button>
      <button type="button" role="tab" aria-selected="${state.studio.activeTab === "admin" ? "true" : "false"}" class="studio-tab-button studio-tab-pinned studio-preview-tab${state.studio.activeTab === "admin" ? " is-active" : ""}" data-action="studio-tab" data-tab="admin" title="WP Admin">
        <span class="dashicons dashicons-admin-site-alt3" aria-hidden="true"></span>
        <span>WP Admin</span>
        ${state.studio.playgroundUrl ? `<small>admin/password</small>` : ""}
      </button>
    </span>
  `;
}

function renderStudioFileTabs() {
  const openFiles = studioOpenFileTabs();
  if (!openFiles.length) {
    return `<span class="studio-file-tabs-empty">Open a file from Explorer</span>`;
  }
  return `
    <span class="studio-file-tabs" aria-label="Open files">
      ${openFiles.map((file) => renderStudioFileTab(file)).join("")}
    </span>
  `;
}

function studioOpenFileTabs() {
  const knownFiles = new Map(state.studio.files.map((file) => [file.path, file]));
  const selectedPath = state.studio.selectedFile?.path;
  const paths = Array.isArray(state.studio.openFiles) ? [...state.studio.openFiles] : [];
  if (selectedPath && !paths.includes(selectedPath)) {
    paths.push(selectedPath);
  }
  state.studio.openFiles = paths;
  return paths.map((path) => knownFiles.get(path) ?? {
    path,
    name: path.split("/").pop() ?? path,
    directory: path.includes("/") ? path.split("/").slice(0, -1).join("/") : "",
    size: 0
  });
}

function renderStudioFileTab(file) {
  const current = state.studio.activeTab === "editor" && file.path === state.studio.selectedFile?.path;
  const dirty = current && state.studio.dirty;
  return `
    <span class="studio-file-tab-wrap">
      <button type="button" role="tab" aria-selected="${current ? "true" : "false"}" class="studio-tab-button studio-editor-tab${current ? " is-active" : ""}" data-action="studio-file" data-path="${escapeAttr(file.path)}" title="${escapeAttr(file.path)}">
        <span class="dashicons ${studioFileIcon(file.path)}" aria-hidden="true"></span>
        <span>${escapeHtml(file.name ?? file.path)}</span>
        ${dirty ? `<em aria-label="Unsaved changes"></em>` : ""}
      </button>
      <button type="button" class="studio-tab-close" data-action="studio-close-file-tab" data-path="${escapeAttr(file.path)}" aria-label="Close ${escapeAttr(file.name ?? file.path)}" title="Close">
        <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
      </button>
    </span>
  `;
}

function scrollActiveStudioFileTabIntoView() {
  if (state.studio.activeTab !== "editor" || !state.studio.selectedFile?.path) {
    return;
  }
  requestAnimationFrame(() => {
    const container = document.querySelector(".studio-file-tabs");
    if (!container) {
      return;
    }
    const selectedPath = state.studio.selectedFile?.path;
    const activeTab = Array.from(container.querySelectorAll(".studio-tab-button[data-path]")).find(
      (button) => button.dataset.path === selectedPath
    );
    const target = activeTab?.closest(".studio-file-tab-wrap") ?? activeTab;
    if (!target) {
      return;
    }

    const padding = 12;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetLeft = targetRect.left - containerRect.left + container.scrollLeft;
    const targetRight = targetLeft + targetRect.width;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;

    if (targetLeft < visibleLeft + padding) {
      container.scrollLeft = Math.max(0, targetLeft - padding);
    } else if (targetRight > visibleRight - padding) {
      container.scrollLeft = targetRight - container.clientWidth + padding;
    }
  });
}

function renderStudioPlaygroundVersionModal() {
  const modal = state.studio.playgroundVersionModal;
  if (!modal) {
    return "";
  }

  const testedUpTo = modal.testedUpTo;
  const pluginName = state.studio.plugin?.name ?? "Plugin";
  const testedLabel = isLegacyStudioPlaygroundVersion(testedUpTo) ? "Not supported by Playground" : "Tested up to";
  return `
    <div class="studio-playground-version-backdrop" role="presentation">
      <section class="studio-playground-version-modal" role="dialog" aria-modal="true" aria-labelledby="studio-playground-version-title">
        <header class="studio-playground-version-header">
          <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
          <div>
            <strong id="studio-playground-version-title">Playground WordPress version</strong>
            <span>${escapeHtml(pluginName)}</span>
          </div>
        </header>
        <div class="studio-playground-version-options">
          <button class="studio-playground-version-choice is-primary" type="button" data-action="studio-playground-version" data-choice="latest">
            <span class="dashicons dashicons-update-alt" aria-hidden="true"></span>
            <strong>Latest</strong>
            <small>WordPress default</small>
          </button>
          <button class="studio-playground-version-choice" type="button" data-action="studio-playground-version" data-choice="tested">
            <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
            <strong>${escapeHtml(testedUpTo)}</strong>
            <small>${escapeHtml(testedLabel)}</small>
          </button>
        </div>
      </section>
    </div>
  `;
}

function isLegacyStudioPlaygroundVersion(version) {
  const match = String(version ?? "").trim().match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major < 4 || (major === 4 && minor < 7);
}

function studioPlaygroundRuntimeLimitation(version) {
  if (!isLegacyStudioPlaygroundVersion(version)) {
    return "";
  }

  return (
    `WordPress Playground cannot run WordPress ${version} with its matching legacy PHP runtime. ` +
    "Use Latest or WordPress 4.7+ in Playground, or test this version in a local PHP/MySQL environment outside Playground."
  );
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

function studioSaveShortcutLabel() {
  return isMac ? "(⌘S)" : "(Ctrl+S)";
}

function studioSaveAriaShortcut() {
  return isMac ? "Meta+S" : "Control+S";
}

function renderStudioPackageSizeButton() {
  if (state.studio.scope !== "local") {
    return "";
  }
  const packageSize = state.studio.packageSize ?? createInitialStudioPackageSize();
  const hasSize = Number.isFinite(packageSize.sizeBytes);
  const label = packageSize.loading
    ? "Sizing"
    : hasSize
      ? formatStudioBytes(packageSize.sizeBytes)
      : "Size";
  const icon = packageSize.loading
    ? "dashicons-update"
    : packageSize.error
      ? "dashicons-warning"
      : "dashicons-archive";
  const className = [
    "studio-action-button",
    "studio-compact-button",
    "studio-package-size-button",
    packageSize.loading ? "is-loading" : "",
    packageSize.overLimit ? "is-over-limit" : "",
    packageSize.stale ? "is-stale" : "",
    packageSize.error ? "has-error" : ""
  ].filter(Boolean).join(" ");

  return `
    <button class="${escapeAttr(className)}" type="button" data-action="studio-package-size" id="studio-package-size-button" title="${escapeAttr(studioPackageSizeTitle(packageSize))}" ${packageSize.loading ? "disabled aria-busy=\"true\"" : ""}>
      <span class="dashicons ${escapeAttr(icon)}" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function studioPackageSizeTitle(packageSize) {
  if (packageSize.loading) {
    return "Calculating package size";
  }
  if (packageSize.error) {
    return `Package size failed: ${packageSize.error}`;
  }
  if (!Number.isFinite(packageSize.sizeBytes)) {
    return "Calculate package size";
  }
  const limit = formatStudioBytes(packageSize.maxSizeBytes || 10 * 1024 * 1024);
  const status = packageSize.overLimit ? `Over the ${limit} WordPress.org limit` : `Under the ${limit} WordPress.org limit`;
  const stale = packageSize.stale ? " Stale: recalculate after recent file or ignore changes." : "";
  const largest = (packageSize.largestFiles ?? []).slice(0, 3);
  const largestText = largest.length
    ? ` Largest: ${largest.map((file) => `${file.path} (${formatStudioBytes(file.sizeBytes)})`).join(", ")}.`
    : "";
  return `${formatStudioBytes(packageSize.sizeBytes)} across ${packageSize.fileCount ?? 0} packaged files. ${status}.${largestText}${stale}`;
}

function renderStudioThemeToggle() {
  const theme = studioTheme();
  const isLight = theme === "light";
  const nextTheme = isLight ? "dark" : "light";
  return `
    <button class="studio-theme-switch" type="button" role="switch" aria-checked="${isLight ? "true" : "false"}" data-action="studio-toggle-theme" title="${escapeAttr(`Switch to ${nextTheme} mode`)}">
      <span class="dashicons dashicons-admin-appearance" aria-hidden="true"></span>
      <span class="studio-theme-switch-track" aria-hidden="true">
        <span></span>
      </span>
      <span class="studio-theme-switch-label">${escapeHtml(isLight ? "Light" : "Dark")}</span>
    </button>
  `;
}

function studioPreviewStateLabel() {
  if (state.studio.running) {
    return "Starting";
  }
  if (state.studio.playgroundUrl) {
    return "Ready";
  }
  return "Idle";
}

function studioPreviewStateTitle() {
  if (state.studio.running) {
    return "Starting Playground";
  }
  if (state.studio.playgroundUrl) {
    return "Playground ready";
  }
  return "Playground not started";
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
  const discardingDirtyEditor =
    state.studio.activeTab === "editor" &&
    tab !== "editor" &&
    state.studio.dirty;
  if (discardingDirtyEditor) {
    if (!confirm("Discard unsaved changes in the current file?")) {
      return;
    }
    state.studio.draftContent = state.studio.fileContent;
    state.studio.dirty = false;
  } else {
    captureStudioEditorValue();
  }
  state.studio.activeTab = tab;
  renderStudio();
  remountStudioEditorIfNeeded();
  updateRouteFromState();
}

async function closeStudioFileTab(relativePath) {
  if (!relativePath) {
    return;
  }
  const openFiles = Array.isArray(state.studio.openFiles) ? state.studio.openFiles : [];
  const index = openFiles.indexOf(relativePath);
  if (index === -1) {
    return;
  }
  const isCurrent = relativePath === state.studio.selectedFile?.path;
  if (isCurrent && state.studio.dirty && !confirm("Discard unsaved changes in the current file?")) {
    return;
  }

  captureStudioEditorValue();
  const nextOpenFiles = openFiles.filter((path) => path !== relativePath);
  state.studio.openFiles = nextOpenFiles;

  if (!isCurrent) {
    renderStudio();
    remountStudioEditorIfNeeded();
    return;
  }

  state.studio.dirty = false;
  const nextPath = nextOpenFiles[Math.min(index, nextOpenFiles.length - 1)];
  if (nextPath) {
    await selectStudioFile(nextPath, { force: true });
    return;
  }

  state.studio.selectedFile = null;
  state.studio.fileContent = "";
  state.studio.draftContent = "";
  state.studio.activeTab = "home";
  renderStudio();
  updateRouteFromState();
}

function toggleStudioTerminal() {
  captureStudioEditorValue();
  state.studio.terminalOpen = !state.studio.terminalOpen;
  renderStudio();
  remountStudioEditorIfNeeded();
}

function toggleStudioPanel(panel) {
  if (!["files", "sidebar"].includes(panel)) {
    return;
  }
  captureStudioEditorValue();
  state.studio.panels = normalizeStudioPanelState(state.studio.panels);
  state.studio.panels[panel] = !state.studio.panels[panel];
  saveStudioPanelState(state.studio.panels);
  renderStudio();
  remountStudioEditorIfNeeded();
  requestAnimationFrame(() => state.studio.editor?.layout?.());
}

function openStudioSidebarTab(tab) {
  captureStudioEditorValue();
  state.studio.panels = normalizeStudioPanelState(state.studio.panels);
  state.studio.panels.sidebar = true;
  saveStudioPanelState(state.studio.panels);
  setStudioSidebarTab(tab);
  renderStudio();
  remountStudioEditorIfNeeded();
  requestAnimationFrame(() => state.studio.editor?.layout?.());
}

function toggleStudioTheme() {
  captureStudioEditorValue();
  state.studio.theme = studioTheme() === "light" ? "dark" : "light";
  saveStudioTheme(state.studio.theme);
  renderStudio();
  remountStudioEditorIfNeeded();
  requestAnimationFrame(() => state.studio.editor?.layout?.());
}

async function toggleStudioFolder(folderPath) {
  if (!folderPath) {
    return;
  }
  const normalized = String(folderPath ?? "").replace(/\/+$/, "");
  captureStudioEditorValue();
  const directory = state.studio.directories?.find((entry) => entry.path === normalized);
  if (directory?.deferred) {
    const loaded = await loadStudioDirectory(normalized);
    if (!loaded) {
      renderStudio();
      remountStudioEditorIfNeeded();
      return;
    }
    if (studioFolderIsIgnored(normalized)) {
      state.studio.expandedIgnoredFolders.add(normalized);
    } else {
      state.studio.collapsedFolders.delete(normalized);
    }
    renderStudio();
    remountStudioEditorIfNeeded();
    return;
  }

  if (studioFolderIsIgnored(normalized)) {
    if (state.studio.expandedIgnoredFolders.has(normalized)) {
      state.studio.expandedIgnoredFolders.delete(normalized);
    } else {
      state.studio.expandedIgnoredFolders.add(normalized);
    }
    renderStudio();
    remountStudioEditorIfNeeded();
    return;
  }

  if (state.studio.collapsedFolders.has(normalized)) {
    state.studio.collapsedFolders.delete(normalized);
  } else {
    state.studio.collapsedFolders.add(normalized);
  }
  renderStudio();
  remountStudioEditorIfNeeded();
}

async function loadStudioDirectory(folderPath) {
  const normalized = String(folderPath ?? "").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!normalized || state.studio.scope !== "local" || !state.studio.id) {
    return false;
  }
  if (state.studio.loadingFolders.has(normalized)) {
    return false;
  }

  state.studio.loadingFolders.add(normalized);
  renderStudio();
  remountStudioEditorIfNeeded();
  try {
    const result = await api(
      `/api/plugins/local/${encodeURIComponent(state.studio.id)}/files/directory?path=${encodeURIComponent(normalized)}`
    );
    mergeStudioExplorerEntries(result.files ?? [], result.directories ?? []);
    const directory = state.studio.directories.find((entry) => entry.path === normalized);
    if (directory) {
      directory.deferred = false;
    }
    return true;
  } catch (error) {
    appendStudioTerminal(`Folder load failed for ${normalized}: ${error.message}`, "error");
    notice(error.message, "error");
    return false;
  } finally {
    state.studio.loadingFolders.delete(normalized);
  }
}

function mergeStudioExplorerEntries(files, directories) {
  state.studio.files = mergeStudioEntriesByPath(state.studio.files, files);
  state.studio.directories = mergeStudioEntriesByPath(state.studio.directories, directories);
}

function mergeStudioEntriesByPath(existingEntries = [], incomingEntries = []) {
  const merged = new Map((existingEntries ?? []).map((entry) => [entry.path, entry]));
  for (const entry of incomingEntries ?? []) {
    if (!entry?.path) {
      continue;
    }
    merged.set(entry.path, {
      ...(merged.get(entry.path) ?? {}),
      ...entry
    });
  }
  return Array.from(merged.values());
}

function studioFolderIsIgnored(folderPath) {
  const normalized = String(folderPath ?? "").replace(/\/+$/, "");
  if (!normalized) {
    return false;
  }
  const directory = state.studio.directories?.find((entry) => entry.path === normalized);
  return Boolean(directory?.ignored || studioIgnoredFilesForPrefix(normalized).length);
}

function buildStudioFileTree(files, directories = []) {
  const root = { type: "folder", name: "", path: "", children: new Map() };
  for (const directory of directories) {
    const parts = directory.path.split("/").filter(Boolean);
    let node = root;
    let currentPath = "";
    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
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
    node.deferred = Boolean(directory.deferred);
    node.ignored = Boolean(directory.ignored);
    node.ignoredBy = directory.ignoredBy ?? "";
    node.hardIgnored = Boolean(directory.hardIgnored);
  }

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
    const deferred = Boolean(node.deferred);
    const loadingFolder = state.studio.loadingFolders?.has(node.path);
    const nodeIgnored = Boolean(node.ignored);
    const containsCurrent = Boolean(
      state.studio.selectedFile?.path && state.studio.selectedFile.path.startsWith(`${node.path}/`)
    );
    const containsAiChange = studioAiChangedFilesForPrefix(node.path).length > 0;
    const ignoredCount = studioIgnoredFilesForPrefix(node.path).length;
    const ignoredFolder = nodeIgnored || ignoredCount > 0;
    const collapsed = deferred ||
      (ignoredFolder && !state.studio.expandedIgnoredFolders.has(node.path)) ||
      state.studio.collapsedFolders.has(node.path);
    const ignorePattern = studioFolderIgnorePattern(node.path);
    const hasExactIgnore = studioHasIgnorePattern(ignorePattern);
    const busy = state.studio.ignoreBusyPattern === ignorePattern;
    const ignoredTitle = node.ignoredBy
      ? `Ignored by ${node.ignoredBy}`
      : ignoredCount
        ? `${ignoredCount} ignored file${ignoredCount === 1 ? "" : "s"} inside`
        : "Ignored";
    return `
      <div class="studio-tree-folder${containsCurrent ? " has-current" : ""}${containsAiChange ? " has-ai-changes" : ""}${ignoredFolder ? " is-ignored" : ""}" role="treeitem" aria-expanded="${collapsed ? "false" : "true"}">
        <div class="studio-tree-row studio-tree-folder-row${ignoredFolder ? " has-ignored" : ""}${loadingFolder ? " is-loading" : ""}" style="--depth:${depth}">
          <button type="button" class="studio-tree-main" data-action="studio-toggle-folder" data-folder="${escapeAttr(node.path)}" ${loadingFolder ? "aria-busy=\"true\"" : ""}>
            <span class="dashicons ${loadingFolder ? "dashicons-update" : collapsed ? "dashicons-arrow-right-alt2" : "dashicons-arrow-down-alt2"} studio-tree-arrow" aria-hidden="true"></span>
            <span class="dashicons ${deferred || collapsed ? "dashicons-category" : "dashicons-open-folder"} studio-tree-icon" aria-hidden="true"></span>
            <span class="studio-tree-label">${escapeHtml(node.name)}</span>
          </button>
          <span class="studio-tree-badges">
            ${containsAiChange ? `<span class="studio-tree-ai-badge" title="AI patches inside this folder">AI</span>` : ""}
          </span>
          ${node.hardIgnored || (nodeIgnored && !hasExactIgnore)
            ? renderStudioReadonlyIgnoreAction(node.ignoredBy ?? ignoredTitle)
            : renderStudioIgnoreAction({
                action: hasExactIgnore ? "studio-unignore-rule" : "studio-ignore-folder",
                label: hasExactIgnore ? "Unignore folder" : "Ignore folder",
                icon: hasExactIgnore ? "dashicons-hidden" : "dashicons-visibility",
                path: node.path,
                pattern: ignorePattern,
                busy
              })}
        </div>
        ${collapsed ? "" : `<div role="group">${renderStudioTreeChildren(node.children, depth + 1)}</div>`}
      </div>
    `;
  }

  const current = node.path === state.studio.selectedFile?.path;
  const checkCounts = studioCheckCountsForPath(node.path);
  const aiChange = studioAiChangedFile(node.path);
  const ignored = Boolean(node.file?.ignored);
  const ignoredBy = node.file?.ignoredBy;
  const hardIgnored = Boolean(node.file?.hardIgnored);
  const exactPattern = studioFileIgnorePattern(node.path);
  const hasExactIgnore = studioHasIgnorePattern(exactPattern);
  const busy = state.studio.ignoreBusyPattern === exactPattern;
  const checkBadge = checkCounts.total
    ? `<span class="studio-tree-check-badge${checkCounts.error ? " has-errors" : ""}" title="${escapeAttr(formatCheckCounts(checkCounts))}">${escapeHtml(String(checkCounts.total))}</span>`
    : "";
  const aiBadge = aiChange
    ? `<span class="studio-tree-ai-badge" title="${escapeAttr(`AI proposed ${aiChange.status} patch`)}">AI</span>`
    : "";
  return `
    <div role="treeitem" class="studio-tree-row studio-tree-file-row${current ? " is-current" : ""}${checkCounts.error ? " has-check-errors" : ""}${aiChange ? " has-ai-changes" : ""}${ignored ? " is-ignored" : ""}" style="--depth:${depth}">
      <button type="button" class="studio-tree-main" data-action="studio-file" data-path="${escapeAttr(node.path)}">
        <span class="studio-tree-indent" aria-hidden="true"></span>
        <span class="dashicons ${studioFileIcon(node.path)} studio-tree-icon" aria-hidden="true"></span>
        <span class="studio-tree-label">${escapeHtml(node.name)}</span>
      </button>
      <span class="studio-tree-badges">${aiBadge}${checkBadge}</span>
      ${hardIgnored || (ignored && !hasExactIgnore)
        ? renderStudioReadonlyIgnoreAction(ignoredBy ?? "Pressship package rules")
        : renderStudioIgnoreAction({
            action: hasExactIgnore ? "studio-unignore-rule" : "studio-ignore-file",
            label: hasExactIgnore ? "Unignore file" : "Ignore file",
            icon: hasExactIgnore ? "dashicons-hidden" : "dashicons-visibility",
            path: node.path,
            pattern: exactPattern,
            busy
          })}
    </div>
  `;
}

function renderStudioReadonlyIgnoreAction(reason) {
  const title = reason ? `Ignored by ${reason}` : "Ignored";
  return `
    <span class="studio-tree-action is-readonly" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">
      <span class="dashicons dashicons-hidden" aria-hidden="true"></span>
    </span>
  `;
}

function renderStudioIgnoreAction({ action, label, icon, path, pattern, busy }) {
  if (!pattern || path === ".pressshipignore" || state.studio.scope !== "local") {
    return "";
  }
  return `
    <button type="button" class="studio-tree-action${busy ? " is-busy" : ""}" data-action="${escapeAttr(action)}" data-path="${escapeAttr(path ?? "")}" data-pattern="${escapeAttr(pattern)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" ${busy ? "disabled aria-busy=\"true\"" : ""}>
      <span class="dashicons ${busy ? "dashicons-update" : icon}" aria-hidden="true"></span>
    </button>
  `;
}

function renderStudioAiSidebar() {
  const tab = state.studio.sidebarTab === "release" ? "release" : "ai";
  return `
    ${renderStudioSidebarTabs(tab)}
    <div class="studio-sidebar-pane" data-pane="${escapeAttr(tab)}">
      ${tab === "release" ? renderStudioReleasePane() : renderStudioAiPane()}
    </div>
  `;
}

function renderStudioSidebarTabs(activeTab) {
  return `
    <header class="studio-secondary-header">
      <strong>${activeTab === "release" ? "Release" : "AI Helper"}</strong>
      <button class="studio-pane-action" type="button" data-action="studio-toggle-sidebar" aria-label="Hide Secondary Side Bar" title="Hide Secondary Side Bar">
        <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
      </button>
    </header>
    <div class="studio-sidebar-tabs ps-segmented" role="tablist" aria-label="Studio sidebar">
      <button class="ps-segmented-option${activeTab === "ai" ? " is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "ai"}" data-action="studio-sidebar-tab" data-tab="ai">
        <span class="dashicons dashicons-format-chat" aria-hidden="true"></span>
        AI Helper
      </button>
      <button class="ps-segmented-option${activeTab === "release" ? " is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "release"}" data-action="studio-sidebar-tab" data-tab="release">
        <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
        Release
      </button>
    </div>
  `;
}

function renderStudioAiPane() {
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
        <span class="studio-ai-avatar is-harness" aria-hidden="true">
          ${renderHarnessIcon({ className: "studio-ai-avatar-icon", provider: assistant })}
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
        <span class="studio-ai-avatar studio-ai-avatar-lg is-harness" aria-hidden="true">
          ${renderHarnessIcon({ className: "studio-ai-avatar-icon", provider: assistant })}
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
                <div class="studio-ai-markdown">${renderStudioAiMarkdown(message.text)}</div>
              </div>
            </article>
          `
            : `
            <article class="studio-ai-message studio-ai-message-assistant studio-ai-message-${escapeAttr(message.tone ?? "muted")}">
              <span class="studio-ai-avatar is-harness" aria-hidden="true">
                ${renderHarnessIcon({ className: "studio-ai-avatar-icon", provider: message.assistant ?? state.studio.aiActiveAssistant ?? selectedStudioAiAssistant() })}
              </span>
              <div class="studio-ai-reply">
                <header>
                  <span>${escapeHtml(aiMessageRoleLabel(message))}</span>
                  <time>${escapeHtml(formatTime(message.createdAt))}</time>
                </header>
                <div class="studio-ai-markdown">${renderStudioAiMarkdown(message.text)}</div>
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
      <span class="studio-ai-avatar is-harness" aria-hidden="true">
        ${renderHarnessIcon({ className: "studio-ai-avatar-icon", provider: state.studio.aiActiveAssistant || selectedStudioAiAssistant() })}
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
        <span class="studio-ai-change-main">
          <span class="studio-ai-change-path">${escapeHtml(change.path)}</span>
          <small>${escapeHtml(studioAiPatchSummary(change))}</small>
        </span>
      </button>
      <div class="studio-ai-change-actions" aria-label="${escapeAttr(`Review ${change.path}`)}">
        <button type="button" class="studio-ai-change-action is-accept" data-action="studio-ai-accept" data-path="${escapeAttr(change.path)}" title="Accept patch" aria-label="${escapeAttr(`Accept patch for ${change.path}`)}">
          <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
          <span>Accept</span>
        </button>
        <button type="button" class="studio-ai-change-action is-reject" data-action="studio-ai-reject" data-path="${escapeAttr(change.path)}" title="Reject patch" aria-label="${escapeAttr(`Reject patch for ${change.path}`)}">
          <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
          <span>Reject</span>
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
      <aside class="studio-check-notes" aria-label="Validation notes">
        <div class="studio-check-note studio-check-note-status">
          <span class="dashicons dashicons-update" aria-hidden="true"></span>
          <span>Verify is running…</span>
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
      <aside class="studio-check-notes" aria-label="Validation notes">
        <div class="studio-check-note studio-check-note-${total ? "info" : "success"}">
          <span class="dashicons ${total ? "dashicons-info-outline" : "dashicons-yes-alt"}" aria-hidden="true"></span>
          <span>${escapeHtml(total ? `${formatCheckCounts(state.studio.checkSummary)} in other files.` : "Verify reported no findings.")}</span>
        </div>
      </aside>
    `;
  }

  return `
    <aside class="studio-check-notes" aria-label="Validation notes">
      <header>
        <strong>Validation</strong>
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

function appendStudioCliCommand(command) {
  if (state.activeView !== "studio" || !command || !Array.isArray(state.studio.terminal)) {
    return;
  }
  state.studio.terminalOpen = true;
  appendStudioTerminal(`$ ${command}`, "command");
}

function quoteCliArg(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "''";
  }
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text)
    ? text
    : `'${text.replace(/'/g, "'\\''")}'`;
}

function studioCliCommand(parts) {
  return [STUDIO_CLI_PREFIX, ...parts].filter(Boolean).join(" ");
}

function studioOpenCliCommand() {
  const parts = ["studio"];
  const host = window.location.hostname;
  const port = window.location.port;
  if (host && !["127.0.0.1", "localhost"].includes(host)) {
    parts.push("--host", quoteCliArg(host));
  }
  if (port && port !== "9477") {
    parts.push("--port", quoteCliArg(port));
  }
  return studioCliCommand(parts);
}

function localPluginForCli(localId = state.studio.id) {
  return state.local.find((plugin) => plugin.id === localId) ??
    (state.studio.scope === "local" && state.studio.id === localId ? state.studio.plugin : null);
}

function localPluginCliTarget(localId = state.studio.id) {
  const plugin = localPluginForCli(localId);
  return quoteCliArg(plugin?.path || plugin?.slug || localId || ".");
}

function studioCliIgnoreFlags(localId = state.studio.id) {
  if (localId !== state.studio.id) {
    return [];
  }
  return studioIgnorePatterns().flatMap((pattern) => ["--ignore", quoteCliArg(pattern)]);
}

function studioPublishCliCommand(localId, action, options = {}) {
  const normalizedAction = ["submit", "release"].includes(action) ? action : "auto";
  const parts = ["publish", localPluginCliTarget(localId)];
  if (normalizedAction !== "auto") {
    parts.push(`--${normalizedAction}`);
  }
  if (options.dryRun) {
    parts.push("--dry-run");
  }
  parts.push(...studioCliIgnoreFlags(localId), "--yes");
  return studioCliCommand(parts);
}

function studioPlaygroundCliCommand(input) {
  const target = input.scope === "local" ? localPluginCliTarget(input.id) : quoteCliArg(input.id);
  const settings = state.settings ?? {};
  const parts = ["demo", target, "--reset", "--skip-browser"];
  if (input.wpVersion && input.wpVersion !== "latest") {
    parts.push("--wp", quoteCliArg(input.wpVersion));
  }
  if (settings.playgroundDatabaseMode && settings.playgroundDatabaseMode !== "auto") {
    parts.push("--database", quoteCliArg(settings.playgroundDatabaseMode));
  }
  if (settings.playgroundDatabaseMode === "mysql") {
    parts.push(
      "--mysql-host",
      quoteCliArg(settings.playgroundMysqlHost ?? "127.0.0.1"),
      "--mysql-port",
      quoteCliArg(settings.playgroundMysqlPort ?? 3306),
      "--mysql-user",
      quoteCliArg(settings.playgroundMysqlUser ?? "root"),
      "--mysql-database-prefix",
      quoteCliArg(settings.playgroundMysqlDatabasePrefix ?? "pressship_playground")
    );
    if (settings.playgroundMysqlPassword) {
      parts.push("--mysql-password", quoteCliArg(settings.playgroundMysqlPassword));
    }
  }
  return studioCliCommand(parts);
}

function studioCliCommandForJob(input) {
  if (state.activeView !== "studio") {
    return "";
  }
  switch (input?.type) {
    case "clone": {
      const parts = ["get", quoteCliArg(input.slug)];
      if (input.destination) {
        parts.push(quoteCliArg(input.destination));
      }
      return studioCliCommand(parts);
    }
    case "play":
      return studioPlaygroundCliCommand(input);
    case "check":
      return studioCliCommand([
        "verify",
        localPluginCliTarget(input.localId),
        ...(input.skipReadmeValidator ? ["--skip-readme-validator"] : []),
        ...studioCliIgnoreFlags(input.localId)
      ]);
    case "dry-run-publish":
      return studioPublishCliCommand(input.localId, input.action, { dryRun: true });
    case "confirm-publish": {
      const dryRun = state.studio.release?.dryRun;
      if (!dryRun?.approvalId || dryRun.approvalId !== input.approvalId) {
        return "";
      }
      const action = dryRun?.route?.action ?? "auto";
      return state.studio.id ? studioPublishCliCommand(state.studio.id, action) : "";
    }
    default:
      return "";
  }
}

function selectedStudioAiAssistant() {
  return state.settings?.aiAssistant ?? "none";
}

function assistantLabel(id) {
  const provider = aiAssistanceProviders().find((item) => item.id === id);
  if (provider) {
    return provider.label;
  }

  const labels = {
    none: "AI",
    claude: "Claude Code",
    codex: "Codex CLI",
    copilot: "GitHub Copilot CLI",
    cursor: "Cursor",
    gemini: "Gemini CLI",
    opencode: "OpenCode",
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

  if (state.studio.id && state.studio.scope === "local" && checkState.summary) {
    state.pluginCheckSummaries[state.studio.id] = {
      slug: checkState.slug ?? state.studio.plugin?.slug,
      name: checkState.name ?? state.studio.plugin?.name,
      checkedAt: checkState.checkedAt,
      skipped: checkState.skipped ?? false,
      available: checkState.available ?? true,
      summary: checkState.summary
    };
    renderDashboard();
  }
}

function applyStudioIgnoreState(ignoreState) {
  state.studio.ignoreState = {
    ...createInitialStudioIgnoreState(),
    ...(ignoreState ?? {})
  };
}

function applyStudioPackageSize(packageSize) {
  if (packageSize?.status === "calculating") {
    state.studio.packageSize = {
      ...(state.studio.packageSize ?? createInitialStudioPackageSize()),
      loading: true,
      error: "",
      stale: false
    };
    scheduleStudioPackageSizePoll();
    return;
  }
  if (packageSize?.status === "error") {
    state.studio.packageSize = {
      ...(state.studio.packageSize ?? createInitialStudioPackageSize()),
      loading: false,
      error: packageSize.error ?? "Package size could not be calculated.",
      calculatedAt: packageSize.calculatedAt ?? new Date().toISOString(),
      stale: false
    };
    return;
  }

  state.studio.packageSize = {
    ...createInitialStudioPackageSize(),
    ...(packageSize ?? {}),
    loading: false,
    error: "",
    calculatedAt: packageSize?.calculatedAt ?? new Date().toISOString(),
    stale: false
  };
}

function markStudioPackageSizeStale() {
  const packageSize = state.studio.packageSize;
  if (!packageSize || !packageSize.calculatedAt) {
    return;
  }
  state.studio.packageSize = {
    ...packageSize,
    stale: true
  };
}

async function refreshStudioPackageSize(options = {}) {
  if (state.studio.scope !== "local" || !state.studio.id) {
    return;
  }
  if (state.studio.packageSize?.loading && !options.poll) {
    return;
  }
  if (!options.force && state.studio.packageSize?.calculatedAt) {
    return;
  }

  const localId = state.studio.id;
  if (options.notify) {
    appendStudioCliCommand(studioCliCommand([
      "pack",
      localPluginCliTarget(localId),
      "--no-verify",
      ...studioCliIgnoreFlags(localId),
      "--json"
    ]));
  }
  state.studio.packageSize = {
    ...(state.studio.packageSize ?? createInitialStudioPackageSize()),
    loading: true,
    error: ""
  };
  if (options.render !== false) {
    renderStudio();
    remountStudioEditorIfNeeded();
  }

  try {
    const packageSize = await api(`/api/plugins/local/${encodeURIComponent(localId)}/package-size`);
    if (state.studio.id !== localId) {
      return;
    }
    applyStudioPackageSize(packageSize);
    if (options.notify && packageSize.status !== "calculating") {
      if (packageSize.status === "error") {
        notice(packageSize.error ?? "Package size could not be calculated.", "error");
      } else {
        notice(
          packageSize.overLimit
            ? `Package is ${formatStudioBytes(packageSize.sizeBytes)}, over the WordPress.org 10 MB limit.`
            : `Package is ${formatStudioBytes(packageSize.sizeBytes)}.`,
          packageSize.overLimit ? "warning" : "success"
        );
      }
    }
  } catch (error) {
    if (state.studio.id !== localId) {
      return;
    }
    state.studio.packageSize = {
      ...(state.studio.packageSize ?? createInitialStudioPackageSize()),
      loading: false,
      error: error.message
    };
    if (options.notify) {
      notice(error.message, "error");
    }
  } finally {
    if (state.studio.id === localId && options.render !== false) {
      renderStudio();
      remountStudioEditorIfNeeded();
      updateStudioControls();
    }
  }
}

function scheduleStudioPackageSizePoll() {
  if (studioPackageSizePollTimer) {
    return;
  }
  studioPackageSizePollTimer = window.setTimeout(() => {
    studioPackageSizePollTimer = null;
    void refreshStudioPackageSize({ force: true, render: true, poll: true });
  }, 1200);
}

async function refreshStudioIgnoreState(options = {}) {
  if (state.studio.scope !== "local" || !state.studio.id) {
    return;
  }

  const localId = state.studio.id;
  state.studio.ignoreLoading = true;
  state.studio.ignoreError = "";
  if (options.render !== false) {
    updateStudioSidebar();
  }
  try {
    const requests = [
      api(`/api/plugins/local/${encodeURIComponent(localId)}/ignore-state`)
    ];
    if (options.files) {
      requests.push(api(`/api/plugins/local/${encodeURIComponent(localId)}/files`));
    }
    const [ignoreState, filesResult] = await Promise.all(requests);
    applyStudioIgnoreState(ignoreState);
    if (filesResult) {
        state.studio.files = filesResult.files ?? state.studio.files;
        state.studio.directories = filesResult.directories ?? state.studio.directories;
    }
  } catch (error) {
    state.studio.ignoreError = error.message;
  } finally {
    state.studio.ignoreLoading = false;
    state.studio.ignoreBusyPattern = "";
    state.studio.ignoreBusyPath = "";
    if (options.render !== false) {
      renderStudio();
      remountStudioEditorIfNeeded();
      updateStudioSidebar();
      updateStudioControls();
    }
  }
}

function studioIgnorePatterns() {
  return state.studio.ignoreState?.patterns ?? [];
}

function studioHasIgnorePattern(pattern) {
  return studioIgnorePatterns().includes(pattern);
}

function studioFileIgnorePattern(filePath) {
  return String(filePath ?? "").replace(/^\.\/+/, "");
}

function studioFolderIgnorePattern(folderPath) {
  const normalized = String(folderPath ?? "").replace(/^\.\/+/, "").replace(/\/+$/, "");
  return normalized ? `${normalized}/**` : "";
}

function studioIgnoredFilesForPrefix(prefix) {
  const normalized = String(prefix ?? "").replace(/\/+$/, "");
  if (!normalized) {
    return [];
  }

  const files = [];
  const seen = new Set();
  const addFile = (file) => {
    const filePath = String(file?.path ?? "");
    if (!filePath || seen.has(filePath)) {
      return;
    }
    if (filePath === normalized || filePath.startsWith(`${normalized}/`)) {
      seen.add(filePath);
      files.push(file);
    }
  };

  for (const file of state.studio.ignoreState?.ignoredFiles ?? []) {
    addFile(file);
  }
  for (const file of state.studio.files ?? []) {
    if (file?.ignored) {
      addFile(file);
    }
  }

  return files;
}

async function addStudioIgnoreRule(pattern, options = {}) {
  if (!pattern || state.studio.scope !== "local" || !state.studio.id) {
    return;
  }

  state.studio.ignoreBusyPattern = pattern;
  state.studio.ignoreBusyPath = options.path ?? "";
  updateStudioSidebar();
  try {
    const ignoreState = await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/ignore-rules`, {
      method: "POST",
      body: { pattern }
    });
    applyStudioIgnoreState(ignoreState);
    markStudioPackageSizeStale();
    await refreshStudioIgnoreState({ files: true, render: false });
    if (state.studio.selectedFile?.path === ".pressshipignore") {
      await syncSelectedStudioFileFromDisk({ reason: "ignore-rule", reportErrors: true });
    }
    appendStudioTerminal(`Ignored ${options.label ?? pattern}.`, "success");
  } catch (error) {
    appendStudioTerminal(error.message, "error");
    notice(error.message, "error");
  } finally {
    state.studio.ignoreBusyPattern = "";
    state.studio.ignoreBusyPath = "";
    renderStudio();
    remountStudioEditorIfNeeded();
    updateStudioSidebar();
    updateStudioControls();
  }
}

async function removeStudioIgnoreRule(pattern) {
  if (!pattern || state.studio.scope !== "local" || !state.studio.id) {
    return;
  }

  state.studio.ignoreBusyPattern = pattern;
  updateStudioSidebar();
  try {
    const ignoreState = await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/ignore-rules`, {
      method: "DELETE",
      body: { pattern }
    });
    applyStudioIgnoreState(ignoreState);
    markStudioPackageSizeStale();
    await refreshStudioIgnoreState({ files: true, render: false });
    if (state.studio.selectedFile?.path === ".pressshipignore") {
      await syncSelectedStudioFileFromDisk({ reason: "ignore-rule", reportErrors: true });
    }
    appendStudioTerminal(`Removed ignore rule ${pattern}.`, "success");
  } catch (error) {
    appendStudioTerminal(error.message, "error");
    notice(error.message, "error");
  } finally {
    state.studio.ignoreBusyPattern = "";
    renderStudio();
    remountStudioEditorIfNeeded();
    updateStudioSidebar();
    updateStudioControls();
  }
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
  updateStudioAiMessageList();
}

function updateStudioAiSidebar() {
  const node = document.getElementById("studio-ai");
  if (!node) {
    return;
  }

  node.innerHTML = renderStudioAiSidebar();
  const messages = document.getElementById("studio-ai-messages");
  if (messages) {
    scrollStudioAiMessagesToBottom(messages);
  }
  updateStudioAiControls();
}

function updateStudioAiMessageList(options = {}) {
  const messages = document.getElementById("studio-ai-messages");
  if (!messages) {
    updateStudioAiSidebar();
    return;
  }

  const shouldStick = options.forceScroll || isStudioAiMessagesNearBottom(messages);
  messages.innerHTML = renderStudioAiMessages();
  if (shouldStick) {
    scrollStudioAiMessagesToBottom(messages);
  }
  updateStudioAiControls();
}

function isStudioAiMessagesNearBottom(messages) {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
}

function scrollStudioAiMessagesToBottom(messages) {
  const previousScrollBehavior = messages.style.scrollBehavior;
  messages.style.scrollBehavior = "auto";
  messages.scrollTop = messages.scrollHeight;
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
    messages.style.scrollBehavior = previousScrollBehavior;
  });
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
  const isSwitchJob = state.studio.release?.switchJobId === id;
  const isDryRunJob = state.studio.release?.dryRunJobId === id;
  if (isSwitchJob) {
    handleStudioSwitchJobEvent(id, payload);
    return;
  }
  if (isDryRunJob) {
    handleStudioDryRunJobEvent(id, payload);
    return;
  }
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
      const aiLogData = payload.data?.data;
      if (aiLogData?.changedFiles) {
        mergeStudioAiChangedFiles(payload.data.data.changedFiles);
        updateStudioAiSidebar();
        renderStudio();
        remountStudioEditorIfNeeded();
      } else if (aiLogData?.proposedChanges) {
        return;
      } else {
        appendStudioAiOutput(payload.data?.message ?? payload.data, "log");
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
  if (result.plan?.database?.mode === "mysql") {
    const database = result.plan.database;
    const databaseLabel = database.server === "managed-docker" ? "Managed MariaDB" : "MySQL";
    appendStudioTerminal(
      `Database: ${databaseLabel} ${database.user}@${database.host}:${database.port}/${database.database}.`,
      "status"
    );
  }
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

function canSaveStudioFile() {
  return Boolean(
    state.studio.scope === "local" &&
      state.studio.id &&
      !state.studio.readOnly &&
      state.studio.selectedFile &&
      state.studio.dirty
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
    studioCheck.setAttribute("aria-label", state.studio.checkSummary ? "Re-run Verify" : "Run Verify");
    studioCheck.title = state.studio.checkSummary ? "Re-run Verify" : "Run Verify";
    studioCheck.innerHTML = state.studio.checking
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span><span>Verifying</span>`
      : `<span class="dashicons dashicons-yes-alt" aria-hidden="true"></span><span>${state.studio.checkSummary ? "Re-verify" : "Verify"}</span>`;
  }
  if (studioSave) {
    studioSave.disabled = !canSaveStudioFile();
    studioSave.title = `Save ${studioSaveShortcutLabel()}`;
    studioSave.setAttribute("aria-label", `Save ${studioSaveShortcutLabel()}`);
    studioSave.setAttribute("aria-keyshortcuts", studioSaveAriaShortcut());
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
        theme: studioMonacoTheme(),
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
      revealStudioAiPatchChange(aiPatch);
      return;
    }

    state.studio.editor = monaco.editor.create(container, {
      value: content,
      language: languageForPath(state.studio.selectedFile?.path ?? ""),
      theme: studioMonacoTheme(),
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
    state.studio.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (canSaveStudioFile()) {
        void saveStudioFile();
      }
    });
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

function firstStudioAiPatchLocation(change) {
  const hunks = change?.hunks?.length
    ? change.hunks
    : change
      ? buildStudioAiPatchHunks(change.beforeContent ?? "", change.afterContent ?? "")
      : [];

  for (const hunk of hunks) {
    let oldLine = Number(hunk.oldStart) || 1;
    let newLine = Number(hunk.newStart) || 1;

    for (const line of hunk.lines ?? []) {
      if (line.type === "add" || line.type === "delete") {
        return {
          oldLine: Math.max(1, oldLine),
          newLine: Math.max(1, newLine)
        };
      }
      if (line.type === "context") {
        oldLine += 1;
        newLine += 1;
      } else if (line.type === "add") {
        newLine += 1;
      } else if (line.type === "delete") {
        oldLine += 1;
      }
    }
  }

  return null;
}

function revealStudioAiPatchChange(change) {
  const location = firstStudioAiPatchLocation(change);
  if (!location) {
    return;
  }

  requestAnimationFrame(() => {
    if (state.studio.editorKind === "monaco-diff" && state.studio.editor) {
      const originalEditor = state.studio.editor.getOriginalEditor?.();
      const modifiedEditor = state.studio.editor.getModifiedEditor?.();
      const originalModel = originalEditor?.getModel?.();
      const modifiedModel = modifiedEditor?.getModel?.();
      const oldLine = originalModel ? clampEditorLine(originalModel, location.oldLine) : location.oldLine;
      const newLine = modifiedModel ? clampEditorLine(modifiedModel, location.newLine) : location.newLine;

      originalEditor?.revealLineInCenter?.(oldLine);
      modifiedEditor?.revealLineInCenter?.(newLine);
      originalEditor?.setPosition?.({ lineNumber: oldLine, column: 1 });
      modifiedEditor?.setPosition?.({ lineNumber: newLine, column: 1 });
      modifiedEditor?.focus?.();
      return;
    }

    if (state.studio.editorKind === "textarea-diff" && state.studio.editor) {
      const offset = offsetForLineColumn(state.studio.editor.value, location.oldLine, 1);
      state.studio.editor.focus();
      state.studio.editor.setSelectionRange(offset, offset);
    }
  });
}

function revealStudioCheckNote(line, column = 1) {
  if (!line) {
    return;
  }
  if (state.studio.activeTab !== "editor") {
    captureStudioEditorValue();
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
    configurePressshipMonaco(window.monaco);
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
      window.require(["vs/editor/editor.main"], () => {
        configurePressshipMonaco(window.monaco);
        resolve(window.monaco);
      }, reject);
    };
    script.onerror = () => reject(new Error("Could not load Monaco Editor."));
    document.head.appendChild(script);
  });

  return monacoPromise;
}

function configurePressshipMonaco(monaco) {
  if (!monaco || monacoConfigured) {
    return;
  }
  monacoConfigured = true;
  registerWordPressReadmeLanguage(monaco);
  definePressshipMonacoThemes(monaco);
}

function registerWordPressReadmeLanguage(monaco) {
  const languageId = "wordpress-readme";
  if (!monaco.languages.getLanguages().some((language) => language.id === languageId)) {
    monaco.languages.register({
      id: languageId,
      aliases: ["WordPress Readme", "wordpress-readme"],
      extensions: [".txt"],
      filenames: ["readme.txt"]
    });
  }

  monaco.languages.setLanguageConfiguration(languageId, {
    brackets: [
      ["[", "]"],
      ["(", ")"],
      ["`", "`"]
    ],
    autoClosingPairs: [
      { open: "`", close: "`" },
      { open: "[", close: "]" },
      { open: "(", close: ")" }
    ],
    surroundingPairs: [
      { open: "`", close: "`" },
      { open: "*", close: "*" },
      { open: "[", close: "]" },
      { open: "(", close: ")" }
    ],
    wordPattern: /(-?\d+(?:\.\d+)*)|([^\s`~!@#$%^&*()=+[{\]}\\|;:'",.<>/?]+)/g
  });

  monaco.languages.setMonarchTokensProvider(languageId, {
    defaultToken: "wp-readme.text",
    tokenizer: {
      root: [
        [/^\s*={3}\s*.*?\s*={3}\s*$/, "wp-readme.title"],
        [/^\s*={2}\s*.*?\s*={2}\s*$/, "wp-readme.section"],
        [/^\s*=\s*.*?\s*=\s*$/, "wp-readme.subsection"],
        [/^(\s*)([*+-])(\s+)/, ["wp-readme.whitespace", "wp-readme.listMarker", "wp-readme.whitespace"]],
        [/^(\s*)(\d+\.)(\s+)/, ["wp-readme.whitespace", "wp-readme.listMarker", "wp-readme.whitespace"]],
        [/^\s{4,}.*$/, "wp-readme.codeBlock"],
        [/^\t.*$/, "wp-readme.codeBlock"],
        [/^(\s*>)(.*)$/, ["wp-readme.quote", "wp-readme.quote"]],
        [/^([A-Za-z][A-Za-z0-9 /.-]*)(:)(.*)$/, ["wp-readme.field", "wp-readme.delimiter", "wp-readme.fieldValue"]],
        [/\[[^\]\n]+\]:\s*(?:https?:\/\/|mailto:|#)[^\s]+/, "wp-readme.link"],
        [/\[[^\]\n]+\]\([^)]+\)/, "wp-readme.link"],
        [/(?:https?:\/\/|mailto:)[^\s)]+/, "wp-readme.url"],
        [/\b(?:pressship|npx|wp|svn|npm|composer)\s+[^\n`]+/, "wp-readme.command"],
        [/`[^`\n]+`/, "wp-readme.inlineCode"],
        [/\*\*[^*\n][\s\S]*?\*\*/, "wp-readme.strong"],
        [/\*[^*\s\n][^*\n]*\*/, "wp-readme.emphasis"],
        [/\[(?:youtube|vimeo|wpvideo|playlist|audio|video)\b[^\]\n]*\]/i, "wp-readme.shortcode"],
        [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "wp-readme.url"]
      ]
    }
  });
}

function definePressshipMonacoThemes(monaco) {
  monaco.editor.defineTheme("pressship-studio-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "wp-readme.title", foreground: "f8fafc", fontStyle: "bold" },
      { token: "wp-readme.section", foreground: "7dd3fc", fontStyle: "bold" },
      { token: "wp-readme.subsection", foreground: "fbbf24", fontStyle: "bold" },
      { token: "wp-readme.field", foreground: "f78c6c", fontStyle: "bold" },
      { token: "wp-readme.fieldValue", foreground: "cbd5e1" },
      { token: "wp-readme.delimiter", foreground: "94a3b8" },
      { token: "wp-readme.listMarker", foreground: "a78bfa", fontStyle: "bold" },
      { token: "wp-readme.inlineCode", foreground: "c4b5fd" },
      { token: "wp-readme.codeBlock", foreground: "a7f3d0" },
      { token: "wp-readme.link", foreground: "93c5fd", fontStyle: "underline" },
      { token: "wp-readme.url", foreground: "67e8f9", fontStyle: "underline" },
      { token: "wp-readme.command", foreground: "fde68a" },
      { token: "wp-readme.shortcode", foreground: "f9a8d4" },
      { token: "wp-readme.quote", foreground: "9ca3af", fontStyle: "italic" },
      { token: "wp-readme.strong", foreground: "f8fafc", fontStyle: "bold" },
      { token: "wp-readme.emphasis", foreground: "e5e7eb", fontStyle: "italic" }
    ],
    colors: {
      "editor.background": "#1e1e1e"
    }
  });

  monaco.editor.defineTheme("pressship-studio-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "wp-readme.title", foreground: "1d4ed8", fontStyle: "bold" },
      { token: "wp-readme.section", foreground: "0f766e", fontStyle: "bold" },
      { token: "wp-readme.subsection", foreground: "b45309", fontStyle: "bold" },
      { token: "wp-readme.field", foreground: "be123c", fontStyle: "bold" },
      { token: "wp-readme.fieldValue", foreground: "334155" },
      { token: "wp-readme.delimiter", foreground: "64748b" },
      { token: "wp-readme.listMarker", foreground: "7c3aed", fontStyle: "bold" },
      { token: "wp-readme.inlineCode", foreground: "6d28d9" },
      { token: "wp-readme.codeBlock", foreground: "047857" },
      { token: "wp-readme.link", foreground: "0969da", fontStyle: "underline" },
      { token: "wp-readme.url", foreground: "0284c7", fontStyle: "underline" },
      { token: "wp-readme.command", foreground: "92400e" },
      { token: "wp-readme.shortcode", foreground: "be185d" },
      { token: "wp-readme.quote", foreground: "6b7280", fontStyle: "italic" },
      { token: "wp-readme.strong", foreground: "111827", fontStyle: "bold" },
      { token: "wp-readme.emphasis", foreground: "374151", fontStyle: "italic" }
    ],
    colors: {
      "editor.background": "#ffffff"
    }
  });
}

function languageForPath(filePath) {
  const fileName = String(filePath ?? "").split("/").pop()?.toLowerCase();
  if (fileName === "readme.txt") {
    return "wordpress-readme";
  }
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
            ${renderDashboardOnboardingCard()}
            ${renderDashboardLocalWidget()}
            ${renderDashboardReleaseReadinessWidget()}
            ${renderDashboardActivityWidget()}
          </div>
        </div>
        <div id="postbox-container-2" class="postbox-container">
          <div class="meta-box-sortables">
            ${renderDashboardAtGlanceWidget()}
            ${renderDashboardPluginCheckWidget()}
            ${renderDashboardCompatibilityWidget()}
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
      ${renderDashboardReleaseStatusLine()}
    `
  });
}

function renderDashboardReleaseStatusLine() {
  if (state.localLoading && !state.local.length) {
    return `
      <div class="ps-dashboard-status">
        <span class="dashicons dashicons-update" aria-hidden="true"></span>
        <span>Checking release state…</span>
      </div>
    `;
  }

  const summary = dashboardReleaseSummary();
  let tone = "info";
  let icon = "dashicons-info";
  let text = "No local plugins to release yet.";

  if (summary.total) {
    if (summary.blocked > 0) {
      tone = "error";
      icon = "dashicons-warning";
      text = `${summary.blocked} blocked from release · ${summary.ready} ready`;
    } else if (summary.behind > 0) {
      tone = "warning";
      icon = "dashicons-update";
      text = `${summary.behind} behind WordPress.org · ${summary.ready} ready`;
    } else {
      tone = "success";
      icon = "dashicons-yes-alt";
      text = `All ${summary.ready} plugin${summary.ready === 1 ? "" : "s"} ready to ship`;
    }
  }

  return `
    <button class="ps-dashboard-status ps-dashboard-status-${escapeAttr(tone)}" type="button" data-view-button="release">
      <span class="dashicons ${escapeAttr(icon)}" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
      <span class="dashicons dashicons-arrow-right-alt2 ps-dashboard-status-arrow" aria-hidden="true"></span>
    </button>
  `;
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

function dashboardRemoteSummary() {
  let cloned = 0;
  let committer = 0;
  let contributor = 0;

  for (const plugin of state.remote) {
    if (remotePluginLocalState(plugin).entry) {
      cloned += 1;
    }
    const roles = Array.isArray(plugin.roles) ? plugin.roles : [];
    if (roles.includes("committer")) {
      committer += 1;
    } else if (roles.includes("contributor")) {
      contributor += 1;
    }
  }

  const total = state.remote.length;
  return { total, cloned, notCloned: Math.max(0, total - cloned), committer, contributor };
}

function renderDashboardAccountCard() {
  const account = state.bootstrap?.account;
  const username = account?.username;
  const displayName = account?.displayName;
  const profileUrl = account?.profileUrl;
  const loggedIn = Boolean(state.bootstrap?.loggedIn);
  const tone = loggedIn ? "success" : "warning";
  const label = loggedIn ? "Signed in" : "Not signed in";

  if (!loggedIn) {
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
              <strong>Not connected</strong>
              <small>Run <code>pressship login</code> in a terminal to clone, submit, and release.</small>
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

  const summary = dashboardRemoteSummary();
  const remoteValue = state.remoteLoading ? "…" : String(summary.total);
  const clonedValue = state.remoteLoading ? "…" : String(summary.cloned);

  const reach = dashboardReachSummary();
  const reachBlock = !state.remoteLoading && reach.known
    ? `<div class="ps-account-reach">
         <span class="ps-account-reach-value">${escapeHtml(formatInstallCount(reach.total))}${reach.plus ? "+" : ""}</span>
         <span class="ps-account-reach-label">combined active installs${reach.topName ? ` · ${escapeHtml(reach.topName)} leads` : ""}</span>
       </div>`
    : "";

  const roleParts = [];
  if (summary.committer) {
    roleParts.push(`Committer on ${summary.committer}`);
  }
  if (summary.contributor) {
    roleParts.push(`Contributor on ${summary.contributor}`);
  }
  const roleLine = !state.remoteLoading && roleParts.length
    ? `<div class="ps-account-roles"><span class="dashicons dashicons-groups" aria-hidden="true"></span><span>${escapeHtml(roleParts.join(" · "))}</span></div>`
    : "";

  const profileLink = profileUrl
    ? `<a class="button button-ghost button-small" href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">
         <span class="dashicons dashicons-external" aria-hidden="true"></span>
         View profile
       </a>`
    : "";

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
            <strong>${escapeHtml(displayName || username || "WordPress.org account")}</strong>
            <small>${escapeHtml(username ? `@${username}` : "Used for clone, submit, and release.")}</small>
          </span>
        </div>
        ${reachBlock}
        <ul class="ps-account-stats">
          <li>
            <button class="ps-account-stat" type="button" data-view-button="remote">
              <strong>${escapeHtml(remoteValue)}</strong>
              <span>on WordPress.org</span>
            </button>
          </li>
          <li>
            <button class="ps-account-stat" type="button" data-view-button="local">
              <strong>${escapeHtml(clonedValue)}</strong>
              <span>cloned locally</span>
            </button>
          </li>
        </ul>
        ${roleLine}
        <div class="ps-widget-footer">
          ${profileLink}
          <button class="button button-ghost button-small" type="button" data-view-button="settings">
            Settings
            <span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    `
  });
}

const VERSION_STATUS_META = {
  missing_version: { label: "Missing version", tone: "error", icon: "dashicons-warning", action: "manage-release", actionLabel: "Fix" },
  header_readme_mismatch: { label: "Version mismatch", tone: "error", icon: "dashicons-randomize", action: "manage-release", actionLabel: "Fix" },
  duplicate_tag_blocked: { label: "Tag already shipped", tone: "error", icon: "dashicons-tag", action: "manage-release", actionLabel: "Bump" },
  remote_newer: { label: "Behind WordPress.org", tone: "warning", icon: "dashicons-update", action: "version-state", actionLabel: "Details" },
  unknown_svn_state: { label: "SVN state unknown", tone: "warning", icon: "dashicons-editor-help", action: "version-state", actionLabel: "Details" },
  ready: { label: "Ready", tone: "success", icon: "dashicons-yes-alt", action: "manage-release", actionLabel: "Release" }
};

const BLOCKING_STATUS_ORDER = ["missing_version", "header_readme_mismatch", "duplicate_tag_blocked"];

function versionStatusMeta(status) {
  return VERSION_STATUS_META[status] ?? { label: labelize(status), tone: "info", icon: "dashicons-info", action: "version-state", actionLabel: "Details" };
}

function primaryVersionIssue(versionState) {
  const statuses = versionState?.statuses ?? [];
  const status =
    BLOCKING_STATUS_ORDER.find((candidate) => statuses.includes(candidate)) ??
    (statuses.includes("remote_newer") ? "remote_newer" : statuses.find((candidate) => candidate !== "ready"));
  if (!status) {
    return null;
  }
  const meta = versionStatusMeta(status);
  const messageIndex = statuses.indexOf(status);
  const message = versionState.messages?.[messageIndex] ?? versionState.messages?.[0] ?? meta.label;
  return { status, message, ...meta };
}

function dashboardReleaseSummary() {
  let ready = 0;
  let blocked = 0;
  let behind = 0;
  let unknown = 0;
  const attention = [];

  for (const plugin of state.local) {
    const versionState = state.versionStates.get(plugin.id);
    if (!versionState || versionState.error || !Array.isArray(versionState.statuses)) {
      unknown += 1;
      continue;
    }

    const isBehind = versionState.statuses.includes("remote_newer");
    if (versionState.releaseBlocked) {
      blocked += 1;
    } else if (isBehind) {
      behind += 1;
    } else {
      ready += 1;
    }

    if (versionState.releaseBlocked || isBehind) {
      const issue = primaryVersionIssue(versionState);
      if (issue) {
        attention.push({ plugin, versionState, issue });
      }
    }
  }

  attention.sort((left, right) => issueWeight(right.issue) - issueWeight(left.issue));
  return { total: state.local.length, ready, blocked, behind, unknown, attention };
}

function issueWeight(issue) {
  if (issue.tone === "error") return 2;
  if (issue.tone === "warning") return 1;
  return 0;
}

function renderDashboardReleaseReadinessWidget() {
  const loading = state.localLoading && !state.local.length;
  const summary = dashboardReleaseSummary();

  let tone = "info";
  let label = "—";
  if (!loading) {
    if (!summary.total) {
      tone = "info";
      label = "No plugins";
    } else if (summary.blocked > 0) {
      tone = "error";
      label = `${summary.blocked} blocked`;
    } else if (summary.behind > 0) {
      tone = "warning";
      label = `${summary.behind} behind`;
    } else {
      tone = "success";
      label = "All ready";
    }
  }

  return renderDashboardPostbox({
    id: "dashboard-release-readiness",
    title: "Release readiness",
    icon: "ps-icon-rocket",
    className: "ps-dashboard-main",
    actions: loading ? "" : badge(label, tone),
    body: renderDashboardReadinessBody(summary, loading)
  });
}

function renderDashboardReadinessBody(summary, loading) {
  if (loading) {
    return `
      <p class="ps-widget-intro">Checking version and release state for every local plugin…</p>
      ${renderDashboardSkeletonRows(2)}
    `;
  }

  if (!summary.total) {
    return `
      <div class="ps-empty-card">
        <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
        <strong>Nothing to release yet</strong>
        <p>Add a local plugin folder, then Pressship flags version mismatches and duplicate tags before you publish.</p>
        <div class="ps-empty-card-actions">
          <button class="button button-primary" type="button" data-action="choose-local-folder">
            <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
            Choose Folder
          </button>
        </div>
      </div>
    `;
  }

  if (!summary.attention.length) {
    return `
      <div class="ps-readiness-clear">
        <span class="ps-readiness-clear-icon" aria-hidden="true">
          <span class="dashicons dashicons-yes-alt"></span>
        </span>
        <div class="ps-readiness-clear-text">
          <strong>Everything looks release-ready</strong>
          <p>${escapeHtml(`All ${summary.ready} plugin${summary.ready === 1 ? "" : "s"} pass version checks. Open Release Management to ship.`)}</p>
        </div>
        <button class="button button-primary button-small" type="button" data-view-button="release">
          <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
          Release Management
        </button>
      </div>
    `;
  }

  const visible = summary.attention.slice(0, 5);
  const rows = visible.map(dashboardReadinessRow).join("");
  const overflow = summary.attention.length > visible.length
    ? `<div class="ps-widget-footer"><button class="button button-ghost button-small" type="button" data-view-button="release">See all ${summary.attention.length} flagged plugins<span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span></button></div>`
    : "";

  const blockedNote = summary.blocked
    ? `${summary.blocked} blocked from release`
    : `${summary.behind} behind WordPress.org`;

  return `
    <p class="ps-widget-intro">${escapeHtml(`${summary.attention.length} plugin${summary.attention.length === 1 ? "" : "s"} need a fix before release — ${blockedNote}.`)}</p>
    <ul class="ps-attention-list">${rows}</ul>
    ${overflow}
  `;
}

function dashboardReadinessRow({ plugin, issue }) {
  const name = plugin.name || plugin.slug || plugin.id;
  return `
    <li class="ps-attention-row ps-attention-${escapeAttr(issue.tone)}">
      <span class="ps-attention-icon" aria-hidden="true">
        <span class="dashicons ${escapeAttr(issue.icon)}"></span>
      </span>
      <button class="ps-attention-main" type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}" title="Open ${escapeAttr(name)} in Studio">
        <span class="ps-attention-text">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(issue.message)}</small>
        </span>
      </button>
      <span class="ps-attention-action">
        ${badge(issue.label, issue.tone)}
        <button class="button button-small" type="button" data-action="${escapeAttr(issue.action)}" data-id="${escapeAttr(plugin.id)}">${escapeHtml(issue.actionLabel)}</button>
      </span>
    </li>
  `;
}

/* ===================================================================
 * Dashboard: Recent activity
 * =================================================================== */

function renderDashboardActivityWidget() {
  const jobs = Array.from(state.jobs.values()).sort((left, right) =>
    String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""))
  );
  const running = jobs.filter((job) => job.status === "running" || job.status === "queued").length;

  const body = jobs.length
    ? `<ul class="ps-activity-list">${jobs.slice(0, 5).map(dashboardActivityRow).join("")}</ul>`
    : `
        <div class="ps-side-empty ps-activity-empty">
          <span class="dashicons dashicons-clock" aria-hidden="true"></span>
          <span>No recent activity yet. Clone, check, dry-run, or release a plugin to see it here.</span>
        </div>
      `;

  return renderDashboardPostbox({
    id: "dashboard-activity",
    title: "Recent activity",
    icon: "dashicons-backup",
    className: "ps-dashboard-main",
    actions: running ? `<span class="ps-count-pill">${running} active</span>` : "",
    body
  });
}

function dashboardActivityRow(job) {
  const tone =
    job.status === "failed"
      ? "error"
      : job.status === "succeeded"
        ? "success"
        : job.status === "cancelled"
          ? "warning"
          : "info";
  return `
    <li class="ps-activity-row">
      <span class="ps-activity-icon ps-activity-${escapeAttr(tone)}" aria-hidden="true">
        <span class="dashicons ${jobIcon(job.type)}"></span>
      </span>
      <span class="ps-activity-text">
        <strong>${escapeHtml(job.title || jobTypeLabel(job.type))}</strong>
        <small>${escapeHtml(formatRelativeTime(job.createdAt))}</small>
      </span>
      ${badge(job.status, tone)}
    </li>
  `;
}

function jobTypeLabel(type) {
  switch (type) {
    case "clone":
      return "Clone plugin";
    case "play":
      return "Launch Playground";
    case "check":
      return "Verify plugin";
    case "dry-run-publish":
      return "Dry-run publish";
    case "confirm-publish":
      return "Publish";
    default:
      return "Task";
  }
}

function formatRelativeTime(iso) {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return String(iso);
  }
  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 45) {
    return "just now";
  }
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  try {
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return String(iso);
  }
}

/* ===================================================================
 * Dashboard: Validation health
 * =================================================================== */

function dashboardPluginCheckSummary() {
  let checked = 0;
  let errors = 0;
  let warnings = 0;
  let clean = 0;
  const flagged = [];

  for (const plugin of state.local) {
    const entry = state.pluginCheckSummaries?.[plugin.id];
    if (!entry || !entry.summary) {
      continue;
    }
    checked += 1;
    const summary = entry.summary;
    if (summary.error > 0) {
      errors += 1;
      flagged.push({ plugin, entry, tone: "error" });
    } else if (summary.warning > 0) {
      warnings += 1;
      flagged.push({ plugin, entry, tone: "warning" });
    } else {
      clean += 1;
    }
  }

  flagged.sort(
    (left, right) =>
      right.entry.summary.error - left.entry.summary.error ||
      right.entry.summary.warning - left.entry.summary.warning
  );

  return { checked, errors, warnings, clean, unchecked: state.local.length - checked, flagged };
}

function renderDashboardPluginCheckWidget() {
  if (!state.local.length) {
    return "";
  }

  const summary = dashboardPluginCheckSummary();

  let tone = "info";
  let label = "Not run";
  if (summary.checked > 0) {
    if (summary.errors > 0) {
      tone = "error";
      label = `${summary.errors} with errors`;
    } else if (summary.warnings > 0) {
      tone = "warning";
      label = `${summary.warnings} with warnings`;
    } else {
      tone = "success";
      label = "All clean";
    }
  }

  let body;
  if (summary.checked === 0) {
    body = `
      <div class="ps-side-empty">
        <span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
        <span>No Verify results yet. Open a plugin in Studio and run Verify.</span>
      </div>
    `;
  } else if (!summary.flagged.length) {
    body = `
      <div class="ps-readiness-clear">
        <span class="ps-readiness-clear-icon" aria-hidden="true">
          <span class="dashicons dashicons-yes-alt"></span>
        </span>
        <div class="ps-readiness-clear-text">
          <strong>No findings</strong>
          <p>${escapeHtml(`All ${summary.checked} checked plugin${summary.checked === 1 ? "" : "s"} passed Verify.`)}</p>
        </div>
      </div>
      ${dashboardPluginCheckFooter(summary)}
    `;
  } else {
    const rows = summary.flagged.slice(0, 4).map(dashboardPluginCheckRow).join("");
    body = `
      <ul class="ps-attention-list">${rows}</ul>
      ${dashboardPluginCheckFooter(summary)}
    `;
  }

  return renderDashboardPostbox({
    id: "dashboard-plugin-check",
    title: "Validation health",
    icon: "dashicons-shield",
    actions: badge(label, tone),
    body
  });
}

function dashboardPluginCheckFooter(summary) {
  return `
    <small class="ps-widget-meta">${escapeHtml(
      `${summary.checked} of ${state.local.length} checked · ${summary.clean} clean${summary.unchecked ? ` · ${summary.unchecked} not run` : ""}`
    )}</small>
  `;
}

function dashboardPluginCheckRow({ plugin, entry, tone }) {
  const name = entry.name || plugin.name || plugin.slug || plugin.id;
  const counts = [];
  if (entry.summary.error) {
    counts.push(`${entry.summary.error} error${entry.summary.error === 1 ? "" : "s"}`);
  }
  if (entry.summary.warning) {
    counts.push(`${entry.summary.warning} warning${entry.summary.warning === 1 ? "" : "s"}`);
  }
  const detail = `${counts.join(" · ")}${entry.checkedAt ? ` · ${formatRelativeTime(entry.checkedAt)}` : ""}`;
  return `
    <li class="ps-attention-row ps-attention-${escapeAttr(tone)}">
      <span class="ps-attention-icon" aria-hidden="true">
        <span class="dashicons ${tone === "error" ? "dashicons-warning" : "dashicons-flag"}"></span>
      </span>
      <button class="ps-attention-main" type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}" title="Open ${escapeAttr(name)} in Studio">
        <span class="ps-attention-text">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(detail)}</small>
        </span>
      </button>
      <span class="ps-attention-action">
        <button class="button button-small" type="button" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}">Open</button>
      </span>
    </li>
  `;
}

/* ===================================================================
 * Dashboard: Compatibility watch
 * =================================================================== */

function dashboardCompatibilitySummary() {
  const latest = state.latestWordPressVersion || "";
  const latestBranch = latest ? versionBranch(latest) : "";
  let behind = 0;
  let current = 0;
  let unknown = 0;
  const outdated = [];

  for (const plugin of state.remote) {
    const tested = parseTestedWith(plugin.testedWith);
    if (!tested) {
      unknown += 1;
      continue;
    }
    if (latestBranch && compareVersionStrings(versionBranch(tested), latestBranch) < 0) {
      behind += 1;
      outdated.push({ plugin, tested });
    } else {
      current += 1;
    }
  }

  outdated.sort((left, right) => compareVersionStrings(left.tested, right.tested));
  return { latest, latestBranch, behind, current, unknown, outdated };
}

function renderDashboardCompatibilityWidget() {
  if (!state.bootstrap?.loggedIn || (!state.remote.length && !state.remoteLoading)) {
    return "";
  }

  const summary = dashboardCompatibilitySummary();
  const latestLabel = summary.latest ? `WP ${summary.latest}` : "WordPress";

  let tone = "info";
  let label = summary.latestBranch ? "Up to date" : "Unknown";
  if (summary.behind > 0) {
    tone = "warning";
    label = `${summary.behind} behind`;
  } else if (summary.latestBranch && summary.current > 0) {
    tone = "success";
    label = "Up to date";
  }

  let body;
  if (state.remoteLoading) {
    body = `<div class="ps-side-empty"><span class="dashicons dashicons-update" aria-hidden="true"></span><span>Loading WordPress.org plugins…</span></div>`;
  } else if (!summary.latestBranch) {
    body = `<div class="ps-side-empty"><span class="dashicons dashicons-editor-help" aria-hidden="true"></span><span>Could not determine the latest WordPress version right now.</span></div>`;
  } else if (!summary.outdated.length) {
    body = `
      <div class="ps-readiness-clear">
        <span class="ps-readiness-clear-icon" aria-hidden="true">
          <span class="dashicons dashicons-yes-alt"></span>
        </span>
        <div class="ps-readiness-clear-text">
          <strong>${escapeHtml(`Tested with ${latestLabel}`)}</strong>
          <p>${escapeHtml(`All ${summary.current} plugin${summary.current === 1 ? "" : "s"} declare compatibility with the latest WordPress.`)}</p>
        </div>
      </div>
    `;
  } else {
    const rows = summary.outdated.slice(0, 4).map((item) => dashboardCompatibilityRow(item, summary)).join("");
    body = `
      <p class="ps-widget-intro">${escapeHtml(`Latest WordPress is ${summary.latest}. Bump "Tested up to" so users keep installing.`)}</p>
      <ul class="ps-attention-list">${rows}</ul>
    `;
  }

  return renderDashboardPostbox({
    id: "dashboard-compatibility",
    title: "Compatibility watch",
    icon: "dashicons-wordpress",
    actions: badge(label, tone),
    body
  });
}

function dashboardCompatibilityRow({ plugin, tested }, summary) {
  return `
    <li class="ps-attention-row ps-attention-warning">
      <span class="ps-attention-icon" aria-hidden="true">
        <span class="dashicons dashicons-wordpress"></span>
      </span>
      <button class="ps-attention-main" type="button" data-action="details" data-scope="remote" data-id="${escapeAttr(plugin.slug)}" title="View ${escapeAttr(plugin.name || plugin.slug)}">
        <span class="ps-attention-text">
          <strong>${escapeHtml(plugin.name || plugin.slug)}</strong>
          <small>${escapeHtml(`Tested up to ${tested} · WordPress is ${summary.latest}`)}</small>
        </span>
      </button>
      <span class="ps-attention-action">
        ${badge(`${tested}`, "warning")}
      </span>
    </li>
  `;
}

function parseTestedWith(value) {
  const match = String(value ?? "").match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : "";
}

function versionBranch(value) {
  const parts = String(value ?? "").split(".");
  return `${parts[0] ?? "0"}.${parts[1] ?? "0"}`;
}

function compareVersionStrings(left, right) {
  const leftParts = String(left).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

/* ===================================================================
 * Dashboard: WordPress.org reach
 * =================================================================== */

function dashboardReachSummary() {
  let total = 0;
  let known = false;
  let plus = false;
  let topName = "";
  let topCount = -1;

  for (const plugin of state.remote) {
    const parsed = parseActiveInstalls(plugin.activeInstalls);
    if (!parsed.known) {
      continue;
    }
    known = true;
    total += parsed.count;
    if (parsed.plus) {
      plus = true;
    }
    if (parsed.count > topCount) {
      topCount = parsed.count;
      topName = plugin.name || plugin.slug || "";
    }
  }

  return { total, known, plus, topName: total > 0 ? topName : "" };
}

function parseActiveInstalls(value) {
  const text = String(value ?? "").replace(/,/g, "");
  const match = text.match(/(\d+)/);
  if (!match) {
    return { count: 0, plus: false, known: false };
  }
  return { count: Number.parseInt(match[1], 10), plus: /\+/.test(text), known: true };
}

function formatInstallCount(value) {
  try {
    return Number(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/* ===================================================================
 * Dashboard: Getting-started checklist
 * =================================================================== */

function dashboardOnboardingSteps() {
  const loggedIn = Boolean(state.bootstrap?.loggedIn);
  const hasLocal = state.local.length > 0;
  const ranCheck = Object.values(state.pluginCheckSummaries ?? {}).some((entry) => entry?.summary);
  const released =
    state.local.some((plugin) => state.versionStates.get(plugin.id)?.remoteVersion) ||
    Array.from(state.jobs.values()).some(
      (job) => job.type === "confirm-publish" && job.status === "succeeded"
    );

  return [
    {
      id: "login",
      done: loggedIn,
      label: "Connect your WordPress.org account",
      hint: "Run pressship login in a terminal, then refresh.",
      actionAttrs: 'data-view-button="settings"',
      actionLabel: "Settings"
    },
    {
      id: "add",
      done: hasLocal,
      label: "Add a local plugin",
      hint: "Point Pressship at a plugin folder you're working on.",
      actionAttrs: 'data-action="choose-local-folder"',
      actionLabel: "Choose Folder"
    },
    {
      id: "check",
      done: ranCheck,
      label: "Run Verify on a plugin",
      hint: "Open a plugin in Studio and run Verify.",
      actionAttrs: 'data-view-button="local"',
      actionLabel: "Open Library"
    },
    {
      id: "release",
      done: released,
      label: "Prepare or ship a release",
      hint: "Review version state and walk the publish funnel.",
      actionAttrs: 'data-view-button="release"',
      actionLabel: "Release"
    }
  ];
}

function renderDashboardOnboardingCard() {
  if (state.localLoading && !state.local.length) {
    return "";
  }

  const steps = dashboardOnboardingSteps();
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) {
    return "";
  }

  return renderDashboardPostbox({
    id: "dashboard-getting-started",
    title: "Getting started",
    icon: "dashicons-flag",
    className: "ps-dashboard-main ps-onboarding-card",
    actions: `<span class="ps-count-pill">${done}/${steps.length}</span>`,
    body: `<ol class="ps-onboarding-list">${steps.map(dashboardOnboardingRow).join("")}</ol>`
  });
}

function dashboardOnboardingRow(step) {
  const action = step.done
    ? ""
    : `<button class="button button-small" type="button" ${step.actionAttrs}>${escapeHtml(step.actionLabel)}</button>`;
  return `
    <li class="ps-onboarding-row${step.done ? " is-done" : ""}">
      <span class="ps-onboarding-check" aria-hidden="true">
        <span class="dashicons ${step.done ? "dashicons-yes-alt" : "dashicons-marker"}"></span>
      </span>
      <span class="ps-onboarding-label">
        <strong>${escapeHtml(step.label)}</strong>
        ${step.hint && !step.done ? `<small>${escapeHtml(step.hint)}</small>` : ""}
      </span>
      ${action}
    </li>
  `;
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

function localCard(plugin, versionState) {
  const stateBadges = versionState?.statuses
    ? versionState.statuses.map((status) => badge(status, statusBadgeTone(status))).join("")
    : badge("unknown", "warning");
  const localVersion = versionState?.localVersion ?? plugin.info?.version ?? "—";
  const stableTag = versionState?.readmeStableTag ?? "—";
  const remoteVersion = versionState?.remoteVersion ?? "—";
  const initials = pluginInitials(plugin.name || plugin.slug);
  const missing = plugin.exists === false;
  const path = plugin.path ?? "";
  const kebabId = `ps-kebab-${plugin.id}`;

  return `
    <article class="ps-plugin-card ps-plugin-card-local${missing ? " is-missing" : ""}" data-id="${escapeAttr(plugin.id)}">
      <header class="ps-plugin-card-header">
        <span class="ps-plugin-card-icon" aria-hidden="true">${escapeHtml(initials)}</span>
        <div class="ps-plugin-card-title">
          <h2>
            <button type="button" class="ps-plugin-card-link" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}">${escapeHtml(plugin.name)}</button>
          </h2>
          <p class="ps-plugin-card-byline">${escapeHtml(plugin.slug)}</p>
        </div>
        <div class="ps-kebab-wrap">
          <button type="button" class="ps-kebab-button" data-action="toggle-kebab" data-kebab-id="${escapeAttr(kebabId)}" aria-haspopup="true" aria-expanded="false" aria-label="More actions" title="More actions">
            <span class="dashicons dashicons-ellipsis" aria-hidden="true"></span>
          </button>
          <div class="ps-kebab-menu" id="${escapeAttr(kebabId)}" role="menu" hidden>
            <button type="button" role="menuitem" data-action="details" data-scope="local" data-id="${escapeAttr(plugin.id)}">
              <span class="dashicons dashicons-info" aria-hidden="true"></span>
              Details
            </button>
            <button type="button" role="menuitem" data-action="manage-release" data-id="${escapeAttr(plugin.id)}">
              <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
              Manage release
            </button>
            <button type="button" role="menuitem" data-action="version-state" data-id="${escapeAttr(plugin.id)}">
              <span class="dashicons dashicons-tag" aria-hidden="true"></span>
              Version state
            </button>
            <button type="button" role="menuitem" class="ps-kebab-menu-danger" data-action="remove-local" data-id="${escapeAttr(plugin.id)}">
              <span class="dashicons dashicons-trash" aria-hidden="true"></span>
              Remove from library
            </button>
          </div>
        </div>
      </header>
      <div class="ps-plugin-card-status">${stateBadges}</div>
      <dl class="ps-plugin-card-meta">
        <div>
          <dt>Header</dt>
          <dd>${escapeHtml(String(localVersion))}</dd>
        </div>
        <div>
          <dt>Stable tag</dt>
          <dd>${escapeHtml(String(stableTag))}</dd>
        </div>
        <div>
          <dt>WordPress.org</dt>
          <dd>${escapeHtml(String(remoteVersion))}</dd>
        </div>
      </dl>
      <code class="ps-plugin-card-path" title="${escapeAttr(path)}">${escapeHtml(path)}</code>
      <footer class="ps-plugin-card-footer">
        <button type="button" class="button button-primary ps-plugin-card-primary" data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}" ${missing ? "disabled" : ""}>
          <span class="dashicons dashicons-editor-code" aria-hidden="true"></span>
          Open in Studio
        </button>
        <button type="button" class="ps-plugin-card-secondary" data-action="manage-release" data-id="${escapeAttr(plugin.id)}" ${missing ? "disabled" : ""}>
          <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
          Manage release
        </button>
      </footer>
    </article>
  `;
}

/* ===================================================================
 * Detail panel
 * =================================================================== */

async function showDetails(scope, id) {
  if (state.activeView === "studio") {
    appendStudioCliCommand(studioCliCommand([
      "info",
      scope === "local" ? localPluginCliTarget(id) : quoteCliArg(id)
    ]));
  }
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
  appendStudioCliCommand(studioCliCommandForJob(body));
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

  if (state.studio.release.dryRunJobId === id && (result?.route || result?.canConfirm !== undefined)) {
    handleStudioReleaseJobResult(id, result);
    return;
  }

  if (result?.ref || result?.slug) {
    handleStudioReleaseJobResult(id, result);
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
  // Preserve the in-flight editor draft before any renderStudio() rebuilds the
  // DOM and forces the Monaco editor to remount from state.
  captureStudioEditorValue();
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
    if (firstFileFinding) {
      revealStudioCheckNote(studioFindingLine(firstFileFinding), studioFindingColumn(firstFileFinding));
    }
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
              Playground database
              <small>Auto uses MySQL for legacy WordPress versions and SQLite otherwise.</small>
            </div>
            <div>
              <select id="setting-playgroundDatabaseMode">
                ${playgroundDatabaseOption("auto", settings.playgroundDatabaseMode)}
                ${playgroundDatabaseOption("sqlite", settings.playgroundDatabaseMode)}
                ${playgroundDatabaseOption("mysql", settings.playgroundDatabaseMode)}
              </select>
            </div>
          </div>

          <div class="ps-settings-row">
            <div class="ps-settings-label">
              Playground MySQL
              <small>Used when the selected Playground database mode resolves to MySQL. Auto can start managed MariaDB with Docker or OrbStack.</small>
            </div>
            <div class="ps-mysql-settings">
              <label>
                <span>Host</span>
                <input type="text" id="setting-playgroundMysqlHost"
                  value="${escapeAttr(settings.playgroundMysqlHost ?? "127.0.0.1")}" />
              </label>
              <label>
                <span>Port</span>
                <input type="number" id="setting-playgroundMysqlPort" min="1" max="65535"
                  value="${escapeAttr(String(settings.playgroundMysqlPort ?? 3306))}" />
              </label>
              <label>
                <span>User</span>
                <input type="text" id="setting-playgroundMysqlUser"
                  value="${escapeAttr(settings.playgroundMysqlUser ?? "root")}" />
              </label>
              <label>
                <span>Password</span>
                <input type="password" id="setting-playgroundMysqlPassword"
                  value="${escapeAttr(settings.playgroundMysqlPassword ?? "")}" />
              </label>
              <label class="is-wide">
                <span>Database prefix</span>
                <input type="text" id="setting-playgroundMysqlDatabasePrefix"
                  value="${escapeAttr(settings.playgroundMysqlDatabasePrefix ?? "pressship_playground")}" />
              </label>
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

function playgroundDatabaseOption(value, current) {
  const labels = {
    auto: "Auto",
    sqlite: "SQLite",
    mysql: "MySQL"
  };
  return `<option value="${value}"${(current ?? "auto") === value ? " selected" : ""}>${labels[value]}</option>`;
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

function renderHarnessIcon(options = {}) {
  const className = options.className ? ` ${options.className}` : "";
  const providerSrc = options.provider ? HARNESS_ICON.providers[options.provider] : "";
  const providerClass = providerSrc ? " is-provider-icon" : "";
  const src = providerSrc || (options.mono ? HARNESS_ICON.mono : HARNESS_ICON.color);
  return `<img class="ps-harness-icon${className}${providerClass}" src="${escapeAttr(src)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
}

function renderAiAssistanceStatus() {
  const providers = aiAssistanceProviders();
  if (state.aiAssistance.loading) {
    return `
      <div class="ps-ai-status-grid">
        <div class="ps-ai-status-card is-loading">
          <div class="ps-ai-status-card-header">
            ${renderHarnessIcon({ className: "ps-ai-status-icon" })}
            <div class="ps-ai-status-title">
              <strong>Detecting AI assistants…</strong>
              <small>Checking local Harness providers on PATH.</small>
            </div>
            <span class="dashicons dashicons-update ps-ai-status-spinner" aria-hidden="true"></span>
          </div>
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
              <div class="ps-ai-status-card-header">
                ${renderHarnessIcon({ className: "ps-ai-status-icon", provider: provider.id })}
                <div class="ps-ai-status-title">
                  <strong>${escapeHtml(provider.label)}</strong>
                  ${badge(aiAssistantStatusLabel(provider), aiAssistantBadgeTone(provider.status))}
                </div>
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
  const harnesses = aiAssistantHarnesses();
  const providers = harnesses.map((harness) => detected.get(harness.id) ?? fallbackAiProvider(harness));

  for (const provider of detected.values()) {
    if (!providers.some((item) => item.id === provider.id)) {
      providers.push(provider);
    }
  }

  return providers;
}

function aiAssistantHarnesses() {
  const harnesses = state.aiAssistance.harnesses?.length
    ? state.aiAssistance.harnesses
    : state.bootstrap?.aiHarnesses;

  return harnesses?.length
    ? harnesses
    : [
        fallbackAiHarness("claude", "Claude Code", "@anthropic-ai/claude-agent-sdk"),
        fallbackAiHarness("codex", "Codex CLI", "@openai/codex-sdk"),
        fallbackAiHarness("copilot", "GitHub Copilot CLI", "@github/copilot-sdk"),
        fallbackAiHarness("cursor", "Cursor", "@cursor/sdk"),
        fallbackAiHarness("gemini", "Gemini CLI", "gemini --version", "gemini"),
        fallbackAiHarness("opencode", "OpenCode", "@opencode-ai/sdk"),
        fallbackAiHarness("wp-studio", "WP Studio", "npx --version", "npx")
      ];
}

function fallbackAiHarness(id, label, checkedCommand, command = checkedCommand) {
  return {
    id,
    label,
    command,
    checkedCommand
  };
}

function fallbackAiProvider(harness) {
  return {
    id: harness.id,
    label: harness.label,
    command: harness.command,
    installed: false,
    status: "not_installed",
    detail: "Not checked yet.",
    checkedCommand: harness.checkedCommand
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
    playgroundDatabaseMode: document.getElementById("setting-playgroundDatabaseMode").value,
    playgroundMysqlHost: document.getElementById("setting-playgroundMysqlHost").value.trim(),
    playgroundMysqlPort: Number(document.getElementById("setting-playgroundMysqlPort").value),
    playgroundMysqlUser: document.getElementById("setting-playgroundMysqlUser").value.trim(),
    playgroundMysqlPassword: document.getElementById("setting-playgroundMysqlPassword").value,
    playgroundMysqlDatabasePrefix: document.getElementById("setting-playgroundMysqlDatabasePrefix").value.trim(),
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
      harnesses: result.harnesses ?? state.aiAssistance.harnesses ?? [],
      providers: result.providers ?? []
    };
    if (state.bootstrap && result.harnesses) {
      state.bootstrap.aiHarnesses = result.harnesses;
    }
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
      state.activeView === "local" ? loadLocal() : Promise.resolve(),
      state.activeView === "release" ? loadReleaseBoard() : Promise.resolve()
    ]);
  }, seconds * 1000);
}

/* ===================================================================
 * View switching with view-transitions
 * =================================================================== */

function showView(view, options = {}) {
  const nextView = normalizeViewId(view);
  if (state.activeView === nextView) {
    if (options.updateRoute !== false) {
      updateRouteFromState({ replace: options.replaceRoute });
    }
    return Promise.resolve();
  }
  const apply = () => {
    applyActiveViewShell(nextView);
    closeDetail();
    if (nextView === "release") {
      if (!state.releaseBoard.loading && !state.releaseBoard.plugins.length) {
        void loadReleaseBoard();
      } else {
        renderReleaseBoard();
      }
    }
    if (options.updateRoute !== false) {
      updateRouteFromState({ replace: options.replaceRoute });
    }
  };

  if (typeof document.startViewTransition === "function") {
    const transition = document.startViewTransition(apply);
    return transition.updateCallbackDone?.catch(() => {}) ?? Promise.resolve();
  }
  apply();
  return Promise.resolve();
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
      id: "view:release",
      title: "Go to Release Management",
      subtitle: "Release status for every local plugin",
      icon: "ps-icon-rocket",
      run: () => showView("release")
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
    base.push({
      id: `release:${plugin.id}`,
      title: `Manage release • ${plugin.name}`,
      subtitle: plugin.slug,
      icon: "ps-icon-rocket",
      run: () => {
        void openStudio("local", plugin.id, { sidebarTab: "release" });
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

function renderStudioAiMarkdown(value) {
  const markdown = String(value ?? "");
  if (!markdown.trim()) {
    return "";
  }

  try {
    return sanitizeMarkdownHtml(markdownParser(markdown));
  } catch {
    return `<p>${escapeHtml(markdown)}</p>`;
  }
}

function refreshStudioAiMarkdownIfReady() {
  try {
    if ((state.studio.aiMessages ?? []).some((message) => message.role === "assistant")) {
      updateStudioAiMessageList();
    }
  } catch {
    // The markdown parser can finish loading before Studio state exists.
  }
}

function basicMarkdownToHtml(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let quoteLines = [];
  let codeLanguage = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    blocks.push(`<p>${parseBasicInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) {
      return;
    }

    blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listType = "";
    listItems = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) {
      return;
    }

    blocks.push(`<blockquote>${basicMarkdownToHtml(quoteLines.join("\n"))}</blockquote>`);
    quoteLines = [];
  };

  const flushOpenBlocks = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (codeLanguage || codeLines.length) {
      if (fence) {
        blocks.push(renderBasicCodeBlock(codeLines.join("\n"), codeLanguage));
        codeLanguage = "";
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (fence) {
      flushOpenBlocks();
      codeLanguage = fence[1] || "plain";
      codeLines = [];
      continue;
    }

    if (!line.trim()) {
      flushOpenBlocks();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushOpenBlocks();
      const level = heading[1].length;
      blocks.push(`<h${level}>${parseBasicInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${parseBasicInlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${parseBasicInlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushOpenBlocks();
  if (codeLanguage || codeLines.length) {
    blocks.push(renderBasicCodeBlock(codeLines.join("\n"), codeLanguage || "plain"));
  }

  return blocks.join("");
}

function renderBasicCodeBlock(code, language) {
  const languageClass = markdownLanguageClass(language);
  return `<pre><code${languageClass ? ` class="${escapeAttr(languageClass)}"` : ""}>${escapeHtml(code)}</code></pre>`;
}

function parseBasicInlineMarkdown(value) {
  return String(value ?? "")
    .split(/(`[^`]*`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }

      return escapeHtml(part)
        .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_match, label, href, title) =>
          basicMarkdownLink(label, href, title)
        )
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/_([^_]+)_/g, "<em>$1</em>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>");
    })
    .join("");
}

function basicMarkdownLink(label, href, title) {
  if (!isSafeMarkdownHref(href)) {
    return label;
  }

  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  return `<a href="${escapeAttr(href)}"${titleAttr}>${label}</a>`;
}

function markdownLanguageClass(language) {
  const normalized = String(language ?? "").trim().toLowerCase();
  return normalized && /^[\w-]+$/.test(normalized) && normalized !== "plain" ? `language-${normalized}` : "";
}

function sanitizeMarkdownHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  sanitizeMarkdownChildren(template.content);
  return template.innerHTML;
}

function sanitizeMarkdownChildren(parent) {
  for (const child of Array.from(parent.childNodes)) {
    sanitizeMarkdownNode(child);
  }
}

function sanitizeMarkdownNode(node) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.remove();
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node;
  const tag = element.tagName.toLowerCase();

  if (["script", "style", "iframe", "object", "embed", "svg", "math", "link", "meta"].includes(tag)) {
    element.remove();
    return;
  }

  sanitizeMarkdownChildren(element);

  if (!MARKDOWN_ALLOWED_TAGS.has(tag)) {
    element.replaceWith(...Array.from(element.childNodes));
    return;
  }

  sanitizeMarkdownAttributes(element, tag);
}

function sanitizeMarkdownAttributes(element, tag) {
  const allowedAttributes = MARKDOWN_ALLOWED_ATTRIBUTES[tag] ?? new Set();

  for (const attribute of Array.from(element.attributes)) {
    if (!allowedAttributes.has(attribute.name)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "a" && attribute.name === "href" && !isSafeMarkdownHref(attribute.value)) {
      element.removeAttribute(attribute.name);
    }

    if (tag === "code" && attribute.name === "class" && !/^language-[\w-]+$/.test(attribute.value)) {
      element.removeAttribute(attribute.name);
    }
  }

  if (tag === "a" && element.hasAttribute("href")) {
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }
}

function isSafeMarkdownHref(value) {
  const href = String(value ?? "").trim();
  if (!href) {
    return false;
  }

  if (href.startsWith("#")) {
    return true;
  }

  try {
    const url = new URL(href, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function formatStudioBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
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

/* ===================================================================
 * Clone to Local — clones from WordPress.org SVN or jumps to existing
 * =================================================================== */

async function openInLibrary(slug) {
  if (!slug) {
    return;
  }
  const existing = remotePluginLocalState({ slug }).entry;
  if (existing) {
    await openStudio("local", existing.id);
    return;
  }
  await createJob({ type: "clone", slug });
  notice(`Cloning ${slug} into your local library…`, "info");
}

/* ===================================================================
 * Card kebab menus
 * =================================================================== */

function toggleKebabMenu(menuId, button) {
  if (!menuId) return;
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const open = menu.hidden;
  document.querySelectorAll(".ps-kebab-menu").forEach((node) => {
    if (node !== menu) {
      node.hidden = true;
      const opener = document.querySelector(`[data-kebab-id="${node.id}"]`);
      opener?.setAttribute("aria-expanded", "false");
    }
  });
  menu.hidden = !open;
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

document.addEventListener("click", (event) => {
  const inside = event.target.closest(".ps-kebab-wrap, .ps-kebab-menu");
  if (!inside) {
    document.querySelectorAll(".ps-kebab-menu").forEach((node) => {
      if (!node.hidden) {
        node.hidden = true;
        const opener = document.querySelector(`[data-kebab-id="${node.id}"]`);
        opener?.setAttribute("aria-expanded", "false");
      }
    });
  }
});

/* ===================================================================
 * Release Management board (top-level view)
 * =================================================================== */

async function loadReleaseBoard(options = {}) {
  if (!els.release) {
    return;
  }
  state.releaseBoard.loading = true;
  state.releaseBoard.error = "";
  renderReleaseBoard();
  try {
    const result = await api("/api/release-board");
    state.releaseBoard.plugins = result.plugins ?? [];
    if (options.notify) {
      notice("Release board refreshed.", "info");
    }
  } catch (error) {
    state.releaseBoard.error = error.message;
  } finally {
    state.releaseBoard.loading = false;
    renderReleaseBoard();
  }
}

function renderReleaseBoard() {
  if (!els.release) {
    return;
  }
  if (state.releaseBoard.loading && !state.releaseBoard.plugins.length) {
    els.release.innerHTML = loadingShell("Reading release state for every local plugin…");
    return;
  }
  if (state.releaseBoard.error) {
    els.release.innerHTML = emptyState({
      title: "Could not load release board.",
      message: state.releaseBoard.error,
      icon: "dashicons-warning"
    });
    return;
  }
  if (!state.releaseBoard.plugins.length) {
    els.release.innerHTML = emptyState({
      title: "No local plugins to release.",
      message: "Add a plugin folder to your Local Library, then come back here.",
      icon: "ps-icon-rocket"
    });
    return;
  }

  const rows = state.releaseBoard.plugins.map(releaseBoardCard).join("");
  els.release.innerHTML = `
    <div class="ps-card-toolbar" role="region" aria-label="Release board summary">
      <span class="ps-card-toolbar-count">
        <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
        ${escapeHtml(
          `${state.releaseBoard.plugins.length} plugin${state.releaseBoard.plugins.length === 1 ? "" : "s"} tracked`
        )}
      </span>
      <span class="ps-card-toolbar-hint">Tap "Manage release" to open the Studio funnel.</span>
    </div>
    <div class="ps-release-board">${rows}</div>
  `;
}

function releaseBoardCard(entry) {
  const statuses = entry.statuses && entry.statuses.length
    ? entry.statuses.map((status) => badge(status, statusBadgeTone(status))).join("")
    : badge("unknown", "warning");
  const versionLine = (label, value) =>
    `<div class="ps-release-board-meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? "—")}</dd></div>`;
  const initials = pluginInitials(entry.name || entry.slug);
  const blockedClass = entry.releaseBlocked ? " is-blocked" : "";

  return `
    <article class="ps-release-board-card${blockedClass}${entry.exists === false ? " is-missing" : ""}">
      <header class="ps-release-board-card-header">
        <span class="ps-plugin-card-icon" aria-hidden="true">${escapeHtml(initials)}</span>
        <div class="ps-release-board-title">
          <h2>${escapeHtml(entry.name)}</h2>
          <p class="ps-plugin-card-byline">${escapeHtml(entry.slug)}</p>
        </div>
        <div class="ps-release-board-status">${statuses}</div>
      </header>
      <dl class="ps-release-board-meta">
        ${versionLine("Header", entry.localVersion)}
        ${versionLine("Stable tag", entry.readmeStableTag)}
        ${versionLine("WordPress.org", entry.remoteVersion)}
        ${versionLine("Latest SVN tag", entry.latestSvnTag)}
      </dl>
      ${entry.messages && entry.messages.length
        ? `<ul class="ps-release-board-messages">${entry.messages
            .map((message) => `<li>${escapeHtml(message)}</li>`)
            .join("")}</ul>`
        : ""}
      <footer class="ps-release-board-card-footer">
        <button type="button" class="button button-primary" data-action="manage-release" data-id="${escapeAttr(entry.id)}" ${entry.exists === false ? "disabled" : ""}>
          <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
          Manage release
        </button>
        <button type="button" class="ps-plugin-card-secondary" data-action="version-state" data-id="${escapeAttr(entry.id)}" ${entry.exists === false ? "disabled" : ""}>
          <span class="dashicons dashicons-tag" aria-hidden="true"></span>
          Version state
        </button>
      </footer>
    </article>
  `;
}

/* ===================================================================
 * Studio sidebar tab toggle + per-plugin persistence
 * =================================================================== */

function studioPluginKey() {
  if (!state.studio?.scope || !state.studio?.id) {
    return "";
  }
  return `${state.studio.scope}:${state.studio.id}`;
}

function setStudioSidebarTab(tab) {
  const next = tab === "release" ? "release" : "ai";
  state.studio.sidebarTab = next;
  saveStudioSidebarTab(studioPluginKey(), next);
  updateStudioSidebar();
  if (next === "release" && state.studio.scope === "local" && !state.studio.release.tags) {
    void loadStudioReleaseTags();
  }
  if (next === "release" && state.studio.scope === "local") {
    void refreshStudioIgnoreState({ files: true });
  }
}

function updateStudioSidebar() {
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

/* ===================================================================
 * Studio Release pane — the funnel UI
 * =================================================================== */

function renderStudioReleasePane() {
  if (state.studio.scope !== "local") {
    return `
      <div class="studio-release-pane">
        <div class="studio-release-empty">
          <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
          <strong>Release management is local-only</strong>
          <p>Open a local plugin to manage its release lifecycle.</p>
        </div>
      </div>
    `;
  }
  if (!state.studio.id) {
    return `
      <div class="studio-release-pane">
        <div class="studio-release-empty">
          <span class="dashicons ps-icon-rocket" aria-hidden="true"></span>
          <strong>Open a plugin to start</strong>
        </div>
      </div>
    `;
  }

  const versionState = state.versionStates.get(state.studio.id);
  const release = state.studio.release;
  return `
    <div class="studio-release-pane">
      <header class="studio-release-header">
        <div class="studio-release-title">
          <strong>Release funnel</strong>
          <small>${escapeHtml(state.studio.plugin?.slug ?? state.studio.id ?? "")}</small>
        </div>
        <button class="studio-ai-icon-button" type="button" data-action="studio-release-refresh" aria-label="Refresh release state" title="Refresh release state">
          <span class="dashicons dashicons-update-alt" aria-hidden="true"></span>
        </button>
      </header>
      <ol class="ps-release-funnel">
        ${renderStudioReleaseStepVersion(versionState, release)}
        ${renderStudioReleaseStepTags(versionState, release)}
        ${renderStudioReleaseStepValidate(versionState, release)}
        ${renderStudioReleaseStepIgnored()}
        ${renderStudioReleaseStepPublish(versionState, release)}
      </ol>
    </div>
  `;
}

function renderStudioReleaseStepShell(number, title, summary, body) {
  return `
    <li class="ps-release-step">
      <span class="ps-release-step-connector" aria-hidden="true"></span>
      <header class="ps-release-step-header">
        <span class="ps-release-step-marker">${escapeHtml(String(number))}</span>
        <div class="ps-release-step-heading">
          <strong>${escapeHtml(title)}</strong>
          ${summary ? `<small>${summary}</small>` : ""}
        </div>
      </header>
      <div class="ps-release-step-body">${body}</div>
    </li>
  `;
}

function toggleStudioReleaseIgnored() {
  state.studio.release = {
    ...state.studio.release,
    ignoredCollapsed: !(state.studio.release?.ignoredCollapsed ?? true)
  };
  renderStudio();
  remountStudioEditorIfNeeded();
  updateStudioControls();
}

function renderStudioReleaseStepVersion(versionState, release) {
  const localVersion = versionState?.localVersion ?? "—";
  const stable = versionState?.readmeStableTag ?? "—";
  const remote = versionState?.remoteVersion ?? "—";
  const latestTag = versionState?.latestSvnTag ?? "—";
  const customDraft = release?.customVersionDraft ?? "";

  const summary = `Header ${escapeHtml(String(localVersion))} · readme ${escapeHtml(String(stable))}`;

  const bumpButton = (level, label) => {
    const inFlight = release.bumpInFlight === level;
    const success = release.bumpSuccess === level;
    const anyBusy = Boolean(release.bumpInFlight);
    const icon = inFlight
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span>`
      : success
        ? `<span class="dashicons dashicons-yes" aria-hidden="true"></span>`
        : "";
    return `<button class="button button-secondary ps-release-bump-button${inFlight ? " is-busy" : ""}${success ? " is-success" : ""}" type="button" data-action="bump-version" data-id="${escapeAttr(state.studio.id)}" data-bump="${level}" ${anyBusy ? "disabled aria-disabled=\"true\" aria-busy=\"true\"" : ""}>${icon}${escapeHtml(label)}</button>`;
  };
  const customBusy = release.bumpInFlight === "custom";
  const customSuccess = release.bumpSuccess === "custom";
  const anyBumpBusy = Boolean(release.bumpInFlight);
  const customIcon = customBusy
    ? `<span class="dashicons dashicons-update" aria-hidden="true"></span>`
    : customSuccess
      ? `<span class="dashicons dashicons-yes" aria-hidden="true"></span>`
      : "";

  const body = `
    <dl class="ps-release-step-grid">
      <div><dt>Current header</dt><dd>${escapeHtml(String(localVersion))}</dd></div>
      <div><dt>Readme stable tag</dt><dd>${escapeHtml(String(stable))}</dd></div>
      <div><dt>WordPress.org</dt><dd>${escapeHtml(String(remote))}</dd></div>
      <div><dt>Latest SVN tag</dt><dd>${escapeHtml(String(latestTag))}</dd></div>
    </dl>
    <div class="ps-release-step-bumps">
      ${bumpButton("patch", "Bump patch")}
      ${bumpButton("minor", "Bump minor")}
      ${bumpButton("major", "Bump major")}
    </div>
    <div class="ps-release-step-custom">
      <label>
        <span>Set custom version</span>
        <input type="text" id="studio-release-custom-version" value="${escapeAttr(customDraft)}" placeholder="1.2.3" ${customBusy ? "disabled" : ""} />
      </label>
      <button class="button ps-release-bump-button${customBusy ? " is-busy" : ""}${customSuccess ? " is-success" : ""}" type="button" data-action="set-custom-version" data-id="${escapeAttr(state.studio.id)}" ${anyBumpBusy ? "disabled aria-disabled=\"true\" aria-busy=\"true\"" : ""}>${customIcon}Set</button>
    </div>
    ${release.bumpError ? `<p class="ps-release-inline-error" role="alert"><span class="dashicons dashicons-warning" aria-hidden="true"></span>${escapeHtml(release.bumpError)}</p>` : ""}
  `;

  return renderStudioReleaseStepShell(1, "Version state", summary, body);
}

function releaseTagDraftValue(versionState, release) {
  return release.newTagDraft || versionState?.localVersion || "";
}

function renderStudioReleaseStepTags(versionState, release) {
  let body;
  if (release.tagsLoading && !release.tags) {
    body = loadingShell("Reading SVN tags…");
  } else if (release.tagsError) {
    body = `<p class="ps-release-step-error">${escapeHtml(release.tagsError)}</p>`;
  } else if (!release.tags) {
    body = `<p class="ps-release-step-muted">Tag information will load when you open the Release pane.</p>`;
  } else {
    const list = release.tags;
    const trunkRow = list.trunk
      ? renderStudioReleaseTagRow({
          name: "trunk",
          isCurrent: Boolean(list.trunk.isCurrent),
          isUncommitted: false,
          isTrunk: true
        })
      : "";
    const tagRows = (list.tags ?? [])
      .map((tag) => renderStudioReleaseTagRow(tag))
      .join("");
    const newTagValue = releaseTagDraftValue(versionState, release);
    const currentVersionTag = versionState?.localVersion
      ? (list.tags ?? []).find((tag) => tag.name === versionState.localVersion)
      : null;
    const newTagControl = currentVersionTag
      ? currentVersionTag.isUncommitted
        ? `<p class="ps-release-tag-ready"><span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>${escapeHtml(`Tag ${versionState.localVersion} is ready. Run a dry-run release next.`)}</p>`
        : `<p class="ps-release-tag-ready is-blocked"><span class="dashicons dashicons-warning" aria-hidden="true"></span>${escapeHtml(`Tag ${versionState.localVersion} already exists on WordPress.org SVN. Bump the version before creating a new tag.`)}</p>`
      : `<div class="ps-release-step-newtag">
          <label>
            <span>Create tag from current version</span>
            <input type="text" id="studio-release-new-tag" value="${escapeAttr(newTagValue)}" placeholder="1.2.3" />
          </label>
          <button class="button button-secondary" type="button" data-action="studio-release-create">
            <span class="dashicons dashicons-plus-alt2" aria-hidden="true"></span>
            Create tag
          </button>
        </div>`;
    body = `
      <ul class="ps-release-tag-list">
        ${trunkRow}
        ${tagRows || `<li class="ps-release-tag-empty">No tags yet.</li>`}
      </ul>
      ${renderStudioReleaseSwitchConflict(release)}
      ${newTagControl}
      ${release.newTagError ? `<p class="ps-release-inline-error"><span class="dashicons dashicons-warning" aria-hidden="true"></span>${escapeHtml(release.newTagError)}</p>` : ""}
    `;
  }

  return renderStudioReleaseStepShell(
    2,
    "Tags",
    release.tags?.currentRef ? `Tracking ${escapeHtml(release.tags.currentRef)}` : "",
    body
  );
}

function renderStudioReleaseSwitchConflict(release) {
  if (release.switchConflict) {
    const conflict = release.switchConflict;
    const tag = conflict.ref ?? release.switchingTag;
    const target = tag === "trunk" ? "trunk" : `tags/${tag}`;
    const anySwitching = Boolean(release.switchingTag);
    return `
      <div class="ps-release-switch-conflict" role="alert">
        <p><span class="dashicons dashicons-warning" aria-hidden="true"></span>${escapeHtml(`SVN conflict while switching to ${target}.`)}</p>
        <div class="ps-release-conflict-actions">
          <button class="button button-small" type="button" data-action="studio-release-switch" data-tag="${escapeAttr(tag)}" data-resolution="override" ${anySwitching ? "disabled aria-disabled=\"true\"" : ""}>
            <span class="dashicons dashicons-yes" aria-hidden="true"></span>
            Override conflicts
          </button>
          <button class="button button-small button-link-delete" type="button" data-action="studio-release-switch" data-tag="${escapeAttr(tag)}" data-resolution="revert" ${anySwitching ? "disabled aria-disabled=\"true\"" : ""}>
            <span class="dashicons dashicons-undo" aria-hidden="true"></span>
            Revert & switch
          </button>
        </div>
      </div>
    `;
  }

  return release.switchError
    ? `<p class="ps-release-inline-error"><span class="dashicons dashicons-warning" aria-hidden="true"></span>${escapeHtml(`Switch failed: ${release.switchError}`)}</p>`
    : "";
}

function renderStudioReleaseTagRow(tag) {
  const release = state.studio.release;
  const isCurrent = tag.isCurrent ? `<span class="ps-release-tag-current">current</span>` : "";
  const isUncommitted = tag.isUncommitted
    ? `<span class="ps-release-tag-uncommitted">uncommitted</span>`
    : "";
  const switching = release.switchingTag === tag.name;
  const anySwitching = Boolean(release.switchingTag);
  const switchingLabel = release.switchingResolution === "override" || release.switchingResolution === "revert"
    ? "Resolving…"
    : "Switching…";
  const switchButton = tag.isUncommitted
    ? `<span class="ps-release-tag-local-note" title="This tag exists locally and will be published by the release step.">Ready for release</span>`
    : tag.isCurrent
      ? ""
      : `<button class="button button-small${switching ? " is-busy" : ""}" type="button" data-action="studio-release-switch" data-tag="${escapeAttr(tag.name)}" ${anySwitching ? "disabled aria-disabled=\"true\"" : ""} ${switching ? "aria-busy=\"true\"" : ""}>${switching ? `<span class="dashicons dashicons-update" aria-hidden="true"></span>${switchingLabel}` : "Switch"}</button>`;
  const confirmKey = `delete-tag:${tag.name}`;
  const pendingConfirm = state.studio.pendingConfirms?.get(confirmKey);
  const deleteButton = tag.isUncommitted
    ? `<button class="button button-small ${pendingConfirm ? "is-confirming" : ""}" type="button" data-action="studio-release-delete" data-tag="${escapeAttr(tag.name)}" aria-label="Delete tag ${escapeAttr(tag.name)}" ${anySwitching ? "disabled" : ""}>
        ${pendingConfirm ? "Click again to confirm" : `<span class="dashicons dashicons-trash" aria-hidden="true"></span><span class="screen-reader-text">Delete</span>`}
      </button>`
    : "";

  return `
    <li class="ps-release-tag-row${tag.isCurrent ? " is-current" : ""}${tag.isUncommitted ? " is-uncommitted" : ""}${switching ? " is-switching" : ""}" data-tag-name="${escapeAttr(tag.name)}">
      <span class="ps-release-tag-name">
        <span class="dashicons ${tag.isTrunk ? "dashicons-networking" : "dashicons-tag"}" aria-hidden="true"></span>
        ${escapeHtml(tag.name)}
        ${isCurrent}
        ${isUncommitted}
      </span>
      <span class="ps-release-tag-actions">
        ${switchButton}
        ${deleteButton}
      </span>
    </li>
  `;
}

function renderStudioReleaseStepValidate(versionState, release) {
  const summary = state.studio.checkSummary;
  const summaryLine = summary
    ? `Verify: ${escapeHtml(String(summary.error || 0))} errors, ${escapeHtml(String(summary.warning || 0))} warnings`
    : "Verify has not been run yet.";
  const validationBlocked = release.dryRun?.validationBlocked;
  const body = `
    <ul class="ps-release-validate-list">
      <li>
        <span><span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>Readme + Plugin Check</span>
        <span class="ps-release-validate-state">${escapeHtml(summary ? "Ran" : "Pending")}</span>
        <button class="button button-small" type="button" data-action="studio-check">${summary ? "Re-run" : "Run"}</button>
      </li>
      <li>
        <span><span class="dashicons dashicons-media-text" aria-hidden="true"></span>Readme stable tag</span>
        <span class="ps-release-validate-state">${escapeHtml(versionState?.readmeStableTag ? "Detected" : "Missing")}</span>
        <button class="button button-small" type="button" data-action="version-state" data-id="${escapeAttr(state.studio.id)}">View</button>
      </li>
      <li>
        <span><span class="dashicons dashicons-archive" aria-hidden="true"></span>Package</span>
        <span class="ps-release-validate-state">${escapeHtml(release.dryRun?.package?.file ? "Ready" : "Build on dry-run")}</span>
      </li>
    </ul>
    <label class="ps-release-skip-readme">
      <input type="checkbox" id="studio-skip-readme-validation" ${release.skipReadmeValidation ? "checked" : ""} ${state.studio.checking ? "disabled" : ""} />
      <span>skip readme validation</span>
    </label>
    ${validationBlocked
      ? `<p class="ps-release-step-error">Validation reported blocking findings. Fix them before publishing.</p>`
      : ""}
  `;
  return renderStudioReleaseStepShell(3, "Validate", summaryLine, body);
}

function renderStudioReleaseStepIgnored() {
  const ignoreState = state.studio.ignoreState ?? createInitialStudioIgnoreState();
  const patterns = ignoreState.patterns ?? [];
  const ignoredFiles = ignoreState.ignoredFiles ?? [];
  const collapsed = state.studio.release?.ignoredCollapsed ?? true;
  const summary = patterns.length
    ? `${patterns.length} pattern${patterns.length === 1 ? "" : "s"} · ${ignoredFiles.length} file${ignoredFiles.length === 1 ? "" : "s"}`
    : "No project ignore rules yet.";

  let body;
  if (state.studio.ignoreLoading) {
    body = loadingShell("Reading ignored files…");
  } else if (state.studio.ignoreError) {
    body = `<p class="ps-release-step-error">${escapeHtml(state.studio.ignoreError)}</p>`;
  } else if (!patterns.length) {
    body = `<p class="ps-release-step-muted">No project ignore rules yet.</p>`;
  } else {
    body = `
      <ul class="ps-release-ignore-patterns">
        ${patterns.map((pattern) => renderStudioIgnorePatternRow(pattern)).join("")}
      </ul>
      ${ignoredFiles.length
        ? `<ul class="ps-release-ignored-files">
            ${ignoredFiles.slice(0, 8).map((file) => `
              <li>
                <span class="dashicons ${studioFileIcon(file.path)}" aria-hidden="true"></span>
                <span title="${escapeAttr(file.path)}">${escapeHtml(file.path)}</span>
                <small>${escapeHtml(file.ignoredBy ?? "")}</small>
              </li>
            `).join("")}
          </ul>
          ${ignoredFiles.length > 8 ? `<p class="ps-release-step-muted">${escapeHtml(`${ignoredFiles.length - 8} more ignored file${ignoredFiles.length - 8 === 1 ? "" : "s"}.`)}</p>` : ""}`
        : `<p class="ps-release-step-muted">The patterns do not match any visible project files.</p>`}
    `;
  }

  return `
    <li class="ps-release-step ps-release-step-collapsible${collapsed ? " is-collapsed" : ""}">
      <span class="ps-release-step-connector" aria-hidden="true"></span>
      <header class="ps-release-step-header">
        <button class="ps-release-step-toggle" type="button" data-action="studio-release-toggle-ignored" aria-expanded="${collapsed ? "false" : "true"}">
          <span class="ps-release-step-marker">4</span>
          <span class="ps-release-step-heading">
            <strong>Ignored files</strong>
            <small>${escapeHtml(summary)}</small>
          </span>
          <span class="dashicons ${collapsed ? "dashicons-arrow-right-alt2" : "dashicons-arrow-down-alt2"} ps-release-step-toggle-icon" aria-hidden="true"></span>
        </button>
      </header>
      ${collapsed ? "" : `<div class="ps-release-step-body">${body}</div>`}
    </li>
  `;
}

function renderStudioIgnorePatternRow(pattern) {
  const busy = state.studio.ignoreBusyPattern === pattern;
  return `
    <li>
      <code>${escapeHtml(pattern)}</code>
      <button class="button button-small ps-release-ignore-remove" type="button" data-action="studio-unignore-rule" data-pattern="${escapeAttr(pattern)}" title="${escapeAttr(`Remove ${pattern}`)}" aria-label="${escapeAttr(`Remove ${pattern}`)}" ${busy ? "disabled aria-busy=\"true\"" : ""}>
        <span class="dashicons ${busy ? "dashicons-update" : "dashicons-no-alt"}" aria-hidden="true"></span>
      </button>
    </li>
  `;
}

function studioPublishRouteDetails(action) {
  switch (action) {
    case "submit":
      return {
        label: "Submit new plugin",
        shortLabel: "submit",
        icon: "dashicons-upload",
        description: "Use this for a first WordPress.org review. Pressship builds a package and uploads it to the plugin submission flow after confirmation.",
        dryRunLabel: "Dry-run submit",
        confirmLabel: "Confirm submit",
        resultLabel: "WordPress.org submission"
      };
    case "release":
      return {
        label: "Release update",
        shortLabel: "release",
        icon: "ps-icon-rocket",
        description: "Use this for an approved plugin that already has an SVN repository. Pressship validates the package and publishes the current version after confirmation.",
        dryRunLabel: "Dry-run release",
        confirmLabel: "Confirm release",
        resultLabel: "SVN release"
      };
    default:
      return {
        label: "Auto decide",
        shortLabel: "auto",
        icon: "dashicons-controls-play",
        description: "Best default. Pressship checks WordPress.org and SVN, then chooses submit for first-time review or release for an existing plugin.",
        dryRunLabel: "Dry-run auto",
        confirmLabel: "Confirm publish",
        resultLabel: "publish route"
      };
  }
}

function renderStudioReleasePublishOption(action, options = {}) {
  const details = studioPublishRouteDetails(action);
  const active = options.activeAction === action;
  const chosen = options.detectedRoute === action;
  const isDefault = options.defaultAction === action;
  const recommended = action === "auto";
  const disabled = options.running ? "disabled aria-disabled=\"true\"" : "";
  const badges = [
    recommended ? "Recommended" : "",
    isDefault ? "Default" : "",
    chosen ? "Selected" : ""
  ].filter(Boolean);

  return `
    <button class="ps-release-publish-option${active ? " is-active" : ""}${chosen ? " is-selected" : ""}" type="button" data-action="dry-run-publish" data-id="${escapeAttr(state.studio.id)}" data-publish-action="${escapeAttr(action)}" ${disabled}>
      <span class="ps-release-option-icon dashicons ${escapeAttr(details.icon)}" aria-hidden="true"></span>
      <span class="ps-release-option-content">
        <span class="ps-release-option-title">
          <strong>${escapeHtml(details.label)}</strong>
          ${badges.map((badge) => `<em>${escapeHtml(badge)}</em>`).join("")}
        </span>
        <span class="ps-release-option-copy">${escapeHtml(details.description)}</span>
      </span>
      <span class="ps-release-option-action">${escapeHtml(details.dryRunLabel)}</span>
    </button>
  `;
}

function renderStudioReleasePublishSummary(dryRun, pendingConfirm, running) {
  if (running) {
    return `
      <div class="ps-release-publish-summary is-running" role="status">
        <span class="dashicons dashicons-update" aria-hidden="true"></span>
        <p>
          <strong>Previewing publish route</strong>
          <small>Validating the package and checking which path is safe to confirm.</small>
        </p>
      </div>
    `;
  }

  if (!dryRun) {
    return `
      <p class="ps-release-step-muted">
        Pick a dry-run path above. A dry-run validates the package and shows exactly what will happen; nothing is uploaded or committed until you confirm.
      </p>
    `;
  }

  const routeAction = dryRun.route?.action ?? "publish";
  const details = studioPublishRouteDetails(routeAction);
  const packageSummary = dryRun.package?.fileCount
    ? `${dryRun.package.fileCount} packaged files`
    : dryRun.package?.topLevelFolder
      ? `Package folder: ${dryRun.package.topLevelFolder}`
      : "";

  return `
    <div class="ps-release-publish-summary">
      <div class="ps-release-publish-result">
        <span class="dashicons ${escapeAttr(details.icon)}" aria-hidden="true"></span>
        <p>
          <strong>${escapeHtml(details.label)}</strong>
          <small>${escapeHtml(dryRun.route?.reason ?? `Ready to preview ${details.resultLabel}.`)}</small>
          ${packageSummary ? `<small>${escapeHtml(packageSummary)}</small>` : ""}
        </p>
      </div>
      ${dryRun.canConfirm && dryRun.approvalId
        ? `<button class="button button-primary ps-release-confirm-button${pendingConfirm ? " is-confirming" : ""}" type="button" data-action="studio-release-publish" data-approval-id="${escapeAttr(dryRun.approvalId)}" data-action-label="${escapeAttr(routeAction)}">
            ${pendingConfirm ? "Click again to confirm" : escapeHtml(details.confirmLabel)}
          </button>`
        : `<p class="ps-release-step-muted">Dry-run did not pass. Fix validation or version findings before publishing.</p>`}
    </div>
  `;
}

function renderStudioReleaseStepPublish(versionState, release) {
  const defaultAction = state.settings?.defaultPublishAction ?? "auto";
  const dryRun = release.dryRun;
  const running = release.dryRunRunning;
  const publishConfirmKey = "publish";
  const pendingConfirm = state.studio.pendingConfirms?.get(publishConfirmKey);
  const detectedRoute = dryRun?.route?.action;
  const activeAction = detectedRoute ?? defaultAction;

  const body = `
    <div class="ps-release-publish-guide">
      <strong>Dry-run first, confirm second.</strong>
      <span>Choose the route you want to preview. The dry-run is safe; the later confirm button performs the upload or SVN publish.</span>
    </div>
    <div class="ps-release-publish-options">
      ${renderStudioReleasePublishOption("auto", { activeAction, defaultAction, detectedRoute, running })}
      ${renderStudioReleasePublishOption("submit", { activeAction, defaultAction, detectedRoute, running })}
      ${renderStudioReleasePublishOption("release", { activeAction, defaultAction, detectedRoute, running })}
    </div>
    ${renderStudioReleasePublishSummary(dryRun, pendingConfirm, running)}
  `;

  const summary = dryRun
    ? `Detected route: ${escapeHtml(studioPublishRouteDetails(dryRun.route?.action).shortLabel)}`
    : versionState?.releaseBlocked
      ? "Blocked — fix version state before publishing"
      : "";

  return renderStudioReleaseStepShell(5, "Submit / Release", summary, body);
}

/* ===================================================================
 * Studio Release pane — actions
 * =================================================================== */

async function loadStudioReleaseTags(options = {}) {
  if (!state.studio.id || state.studio.scope !== "local") {
    return;
  }
  state.studio.release.tagsLoading = true;
  state.studio.release.tagsError = "";
  updateStudioSidebar();
  try {
    const list = await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/svn-tags`);
    state.studio.release.tags = list;
    state.studio.release.tagsLoadedAt = new Date().toISOString();
    if (options.notify) {
      notice("Release tags refreshed.", "info");
    }
  } catch (error) {
    state.studio.release.tagsError = error.message;
  } finally {
    state.studio.release.tagsLoading = false;
    updateStudioSidebar();
  }
}

async function refreshStudioAfterReleaseSwitch(result = {}) {
  if (!state.studio.id || state.studio.scope !== "local") {
    return;
  }

  const localId = state.studio.id;
  const selectedPath = state.studio.selectedFile?.path;
  try {
    const [detail, filesResult, checkState, versionState, ignoreState] = await Promise.all([
      api(`/api/plugins/local/${encodeURIComponent(localId)}`),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/files`),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/check-state`).catch(() => ({ state: null })),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/version-state`).catch(() => null),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/ignore-state`).catch(() => createInitialStudioIgnoreState())
    ]);

    applyStudioPluginDetail("local", localId, detail);
    state.studio.files = filesResult.files ?? [];
    state.studio.directories = filesResult.directories ?? [];
    applyStudioCheckState(checkState.state);
    applyStudioIgnoreState(ignoreState);
    if (versionState) {
      state.versionStates.set(localId, versionState);
      renderLocal();
    }

    const selectedStillExists = selectedPath && state.studio.files.some((file) => file.path === selectedPath);
    const nextFile = selectedStillExists
      ? selectedPath
      : chooseInitialStudioFile(state.studio.files, state.studio.plugin?.slug)?.path;

    if (nextFile) {
      await selectStudioFile(nextFile, { force: true });
    } else {
      state.studio.selectedFile = null;
      state.studio.fileContent = "";
      state.studio.draftContent = "";
      state.studio.dirty = false;
      renderStudio();
      remountStudioEditorIfNeeded();
    }

    const ref = result.ref === "trunk" ? "trunk" : result.ref ? `tags/${result.ref}` : "the selected ref";
    appendStudioTerminal(`Studio files reloaded from ${ref}.`, "success");
    updateStudioControls();
  } catch (error) {
    appendStudioTerminal(`Studio reload after switch failed: ${error.message}`, "error");
    renderStudio();
  }
}

async function refreshStudioAfterVersionChange(localId) {
  if (!localId || state.studio.id !== localId || state.studio.scope !== "local") {
    return;
  }

  const selectedPath = state.studio.selectedFile?.path;
  try {
    const [detail, filesResult, checkState, versionState, ignoreState] = await Promise.all([
      api(`/api/plugins/local/${encodeURIComponent(localId)}`),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/files`),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/check-state`).catch(() => ({ state: null })),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/version-state`).catch(() => null),
      api(`/api/plugins/local/${encodeURIComponent(localId)}/ignore-state`).catch(() => createInitialStudioIgnoreState())
    ]);

    applyStudioPluginDetail("local", localId, detail);
    state.studio.files = filesResult.files ?? [];
    state.studio.directories = filesResult.directories ?? [];
    applyStudioCheckState(checkState.state);
    applyStudioIgnoreState(ignoreState);
    if (versionState) {
      state.versionStates.set(localId, versionState);
      if (!state.studio.release.newTagDraft || state.studio.release.newTagDraft === versionState.latestSvnTag) {
        state.studio.release.newTagDraft = versionState.localVersion ?? "";
      }
    }

    const selectedStillExists = selectedPath && state.studio.files.some((file) => file.path === selectedPath);
    if (selectedStillExists) {
      await selectStudioFile(selectedPath, { force: true });
    } else {
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    updateStudioSidebar();
    updateStudioControls();
  } catch (error) {
    appendStudioTerminal(`Studio reload after version change failed: ${error.message}`, "error");
    renderStudio();
    updateStudioSidebar();
  }
}

async function createStudioReleaseTag() {
  if (!state.studio.id) return;
  const input = document.getElementById("studio-release-new-tag");
  const versionState = state.versionStates.get(state.studio.id);
  const name = (input?.value ?? releaseTagDraftValue(versionState, state.studio.release)).trim();
  if (!name) {
    state.studio.release.newTagError = "Enter a tag name first.";
    updateStudioSidebar();
    return;
  }
  state.studio.release.newTagDraft = name;
  state.studio.release.newTagError = "";
  try {
    await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/svn-tags`, {
      method: "POST",
      body: { name }
    });
    state.studio.release.newTagDraft = "";
    notice(`Created tag ${name}.`, "success");
    await loadStudioReleaseTags();
  } catch (error) {
    state.studio.release.newTagError = error.message;
    updateStudioSidebar();
  }
}

async function deleteStudioReleaseTag(element) {
  if (!state.studio.id) return;
  const tag = element?.dataset?.tag;
  if (!tag) return;
  const key = `delete-tag:${tag}`;
  if (state.settings?.confirmDestructiveActions === false || armStudioReleaseConfirm(key)) {
    try {
      await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/svn-tags/${encodeURIComponent(tag)}`, {
        method: "DELETE"
      });
      notice(`Deleted local tag ${tag}.`, "success");
      await loadStudioReleaseTags();
    } catch (error) {
      notice(error.message, "error");
    }
    clearStudioReleaseConfirm(key);
  }
}

async function switchStudioReleaseTag(tag, resolution) {
  if (!state.studio.id || !tag) return;
  if (state.studio.release.switchingTag) {
    return;
  }
  const conflictResolution = ["override", "revert"].includes(resolution) ? resolution : undefined;
  state.studio.release.switchingTag = tag;
  state.studio.release.switchingResolution = conflictResolution ?? "";
  state.studio.release.switchConflict = null;
  state.studio.release.switchError = "";
  updateStudioSidebar();
  try {
    const body = { type: "svn-switch", localId: state.studio.id, tag };
    if (conflictResolution) {
      body.conflictResolution = conflictResolution;
    }
    const job = await createJob(body);
    state.studio.release.switchJobId = job.id;
    notice(`${conflictResolution ? "Resolving switch to" : "Switching to"} ${tag}…`, "info");
  } catch (error) {
    state.studio.release.switchingTag = "";
    state.studio.release.switchingResolution = "";
    state.studio.release.switchError = error.message;
    updateStudioSidebar();
    notice(error.message, "error");
  }
}

async function bumpStudioReleaseVersion(localId, bump) {
  if (!localId || !["patch", "minor", "major"].includes(bump)) return;
  appendStudioCliCommand(studioCliCommand(["version", bump, localPluginCliTarget(localId)]));
  if (state.studio.id !== localId) {
    // Outside the funnel (e.g. invoked from a command palette). Run without
    // the inline busy state — the global notice is enough feedback.
    try {
      const result = await api(`/api/plugins/local/${encodeURIComponent(localId)}/bump-version`, {
        method: "POST",
        body: { bump }
      });
      applyStudioVersionChangeResult(localId, result);
      notice(`Version bumped (${bump}).`, "success");
      await loadLocal();
    } catch (error) {
      notice(error.message, "error");
    }
    return;
  }
  if (state.studio.release.bumpInFlight) {
    return;
  }
  state.studio.release.bumpInFlight = bump;
  state.studio.release.bumpSuccess = null;
  state.studio.release.bumpError = "";
  updateStudioSidebar();
  try {
    const result = await api(`/api/plugins/local/${encodeURIComponent(localId)}/bump-version`, {
      method: "POST",
      body: { bump }
    });
    applyStudioVersionChangeResult(localId, result);
    state.studio.release.bumpInFlight = null;
    state.studio.release.bumpSuccess = bump;
    updateStudioSidebar();
    setTimeout(() => {
      if (state.studio.release.bumpSuccess === bump) {
        state.studio.release.bumpSuccess = null;
        updateStudioSidebar();
      }
    }, 1500);
    await loadLocal();
    if (state.studio.id === localId) {
      await refreshStudioAfterVersionChange(localId);
    }
  } catch (error) {
    state.studio.release.bumpInFlight = null;
    state.studio.release.bumpError = error.message;
    updateStudioSidebar();
  }
}

async function setStudioCustomReleaseVersion(localId) {
  if (!localId) return;
  if (state.studio.release.bumpInFlight) {
    return;
  }
  const input = document.getElementById("studio-release-custom-version");
  const version = (input?.value ?? state.studio.release.customVersionDraft ?? "").trim();
  if (!version) {
    state.studio.release.bumpError = "Enter a version to set.";
    updateStudioSidebar();
    return;
  }
  state.studio.release.customVersionDraft = version;
  state.studio.release.bumpInFlight = "custom";
  state.studio.release.bumpSuccess = null;
  state.studio.release.bumpError = "";
  updateStudioSidebar();
  try {
    const result = await api(`/api/plugins/local/${encodeURIComponent(localId)}/version`, {
      method: "PUT",
      body: { version }
    });
    applyStudioVersionChangeResult(localId, result);
    state.studio.release.bumpInFlight = null;
    state.studio.release.bumpSuccess = "custom";
    state.studio.release.customVersionDraft = "";
    updateStudioSidebar();
    setTimeout(() => {
      if (state.studio.release.bumpSuccess === "custom") {
        state.studio.release.bumpSuccess = null;
        updateStudioSidebar();
      }
    }, 1500);
    await loadLocal();
    if (state.studio.id === localId) {
      await refreshStudioAfterVersionChange(localId);
    }
  } catch (error) {
    state.studio.release.bumpInFlight = null;
    state.studio.release.bumpError = error.message;
    updateStudioSidebar();
  }
}

function applyStudioVersionChangeResult(localId, result) {
  if (result && typeof result === "object") {
    const { checkState, ...versionState } = result;
    state.versionStates.set(localId, versionState);
    if (state.studio.id === localId && versionState.localVersion) {
      state.studio.release.newTagDraft = versionState.localVersion;
    }
  }
  if (state.studio.id === localId && result && Object.prototype.hasOwnProperty.call(result, "checkState")) {
    applyStudioCheckState(result.checkState);
    applyStudioCheckMarkers();
    updateStudioControls();
  }
}

async function refreshStudioVersionState() {
  if (!state.studio.id) return;
  try {
    const versionState = await api(
      `/api/plugins/local/${encodeURIComponent(state.studio.id)}/version-state`
    );
    state.versionStates.set(state.studio.id, versionState);
    if (!state.studio.release.newTagDraft && versionState.localVersion) {
      state.studio.release.newTagDraft = versionState.localVersion;
    }
    updateStudioSidebar();
  } catch (error) {
    // ignore — sidebar will keep stale data and notice was already shown
  }
}

async function createReleaseDryRunJob(localId, action) {
  if (!localId) return;
  state.studio.release.dryRunRunning = true;
  state.studio.release.dryRun = null;
  updateStudioSidebar();
  try {
    const job = await createJob({
      type: "dry-run-publish",
      localId,
      action: action ?? "auto"
    });
    state.studio.release.dryRunJobId = job.id;
  } catch (error) {
    state.studio.release.dryRunRunning = false;
    notice(error.message, "error");
  } finally {
    updateStudioSidebar();
  }
}

async function confirmStudioRelease(element) {
  const approvalId = element?.dataset?.approvalId;
  if (!approvalId) return;
  const key = "publish";
  if (state.settings?.confirmDestructiveActions === false || armStudioReleaseConfirm(key)) {
    try {
      await createJob({ type: "confirm-publish", approvalId });
      notice("Publish job started.", "info");
    } catch (error) {
      notice(error.message, "error");
    }
    clearStudioReleaseConfirm(key);
  }
}

/* ===================================================================
 * Two-step confirm helper (inline pill, 6 second timeout)
 * =================================================================== */

function armStudioReleaseConfirm(key) {
  if (!state.studio.pendingConfirms) {
    state.studio.pendingConfirms = new Map();
  }
  const existing = state.studio.pendingConfirms.get(key);
  if (existing) {
    clearTimeout(existing.timeoutId);
    state.studio.pendingConfirms.delete(key);
    return true;
  }
  const timeoutId = setTimeout(() => {
    state.studio.pendingConfirms?.delete(key);
    updateStudioSidebar();
  }, 6000);
  state.studio.pendingConfirms.set(key, { timeoutId });
  updateStudioSidebar();
  return false;
}

function clearStudioReleaseConfirm(key) {
  const entry = state.studio.pendingConfirms?.get(key);
  if (entry?.timeoutId) {
    clearTimeout(entry.timeoutId);
  }
  state.studio.pendingConfirms?.delete(key);
}

/* ===================================================================
 * Studio release pane: input draft tracking
 * =================================================================== */

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!target) return;
  if (target.id === "studio-release-new-tag") {
    state.studio.release.newTagDraft = target.value;
  } else if (target.id === "studio-release-custom-version") {
    state.studio.release.customVersionDraft = target.value;
  }
});

/* ===================================================================
 * Studio release pane: handle dry-run + publish job events
 * =================================================================== */

function handleStudioReleaseJobResult(jobId, result) {
  if (!result || typeof result !== "object") return;
  if (state.studio.release.dryRunJobId === jobId && result.route) {
    state.studio.release.dryRunRunning = false;
    state.studio.release.dryRun = result;
    updateStudioSidebar();
    return;
  }
  if (state.studio.release.switchJobId === jobId && result.conflict) {
    state.studio.release.switchingTag = "";
    state.studio.release.switchingResolution = "";
    state.studio.release.switchJobId = null;
    state.studio.release.switchConflict = result;
    state.studio.release.switchError = result.message ?? "SVN switch needs a conflict resolution choice.";
    appendStudioTerminal(state.studio.release.switchError, "error");
    updateStudioSidebar();
    return;
  }
  if (state.studio.release.switchJobId === jobId && result.ref) {
    state.studio.release.switchConflict = null;
    state.studio.release.switchError = "";
    if (Object.prototype.hasOwnProperty.call(result, "checkState")) {
      applyStudioCheckState(result.checkState);
      applyStudioCheckMarkers();
      updateStudioControls();
    }
    void refreshStudioAfterReleaseSwitch(result);
    void loadStudioReleaseTags();
  }
}

function handleStudioSwitchJobEvent(id, payload) {
  if (payload.type === "status" || payload.type === "log") {
    const message = payload.data?.message ?? payload.data;
    if (message) {
      appendStudioTerminal(message, payload.type === "log" ? "log" : "status");
    }
    return;
  }
  if (payload.type === "job-error" || payload.type === "error") {
    const message = payload.data?.message ?? "Switch failed.";
    state.studio.release.switchConflict = null;
    state.studio.release.switchError = String(message);
    appendStudioTerminal(message, "error");
    return;
  }
  if (payload.type === "done") {
    const status = payload.data?.status;
    state.studio.release.switchingTag = "";
    state.studio.release.switchingResolution = "";
    state.studio.release.switchJobId = null;
    if (status === "succeeded") {
      if (state.studio.release.switchConflict) {
        updateStudioSidebar();
        return;
      }
      state.studio.release.switchError = "";
      void loadStudioReleaseTags();
    } else if (status === "failed" && !state.studio.release.switchError) {
      state.studio.release.switchError = "Switch job failed (see Activity).";
    }
    updateStudioSidebar();
  }
}

function handleStudioDryRunJobEvent(id, payload) {
  if (payload.type === "status" || payload.type === "log") {
    const message = payload.data?.message ?? payload.data;
    if (message) {
      appendStudioTerminal(message, payload.type === "log" ? "log" : "status");
    }
    return;
  }
  if (payload.type === "job-error" || payload.type === "error") {
    state.studio.release.dryRunRunning = false;
    const message = payload.data?.message ?? "Dry-run failed.";
    appendStudioTerminal(message, "error");
    updateStudioSidebar();
    return;
  }
  if (payload.type === "done") {
    if (payload.data?.status !== "succeeded") {
      state.studio.release.dryRunRunning = false;
      updateStudioSidebar();
    }
  }
}
