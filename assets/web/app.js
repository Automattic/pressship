/* Pressship Studio — WordPress 7.0 "Modern" admin theme client */

const token = document.querySelector('meta[name="pressship-token"]').content;

const state = {
  bootstrap: null,
  remote: [],
  remoteUsername: "",
  local: [],
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
    editor: null,
    editorKind: null
  },
  activeView: "dashboard",
  settings: null,
  settingsDirty: false,
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

  void runAction(action.dataset.action, action);
});

document.addEventListener("keydown", (event) => {
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

els.commandInput?.addEventListener("input", () => {
  state.command.query = els.commandInput.value;
  state.command.activeIndex = 0;
  renderCommandPalette();
});

void boot();

async function boot() {
  try {
    state.bootstrap = await api("/api/bootstrap");
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
  await Promise.all([loadRemote(), loadLocal()]);
}

function renderAccount() {
  const account = state.bootstrap?.account?.username;
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

      case "choose-local-folder":
        await chooseLocalFolder();
        return;

      case "open-playground":
        window.open(element.dataset.url, "_blank");
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
  els.remote.innerHTML = loadingShell("Loading WordPress.org plugins…");
  try {
    const result = await api("/api/plugins/remote");
    state.remote = result.plugins ?? [];
    state.remoteUsername = result.username ?? "";
    renderRemote();
  } catch (error) {
    els.remote.innerHTML = emptyState({
      title: "Could not load My Plugins.",
      message: state.bootstrap?.loggedIn
        ? error.message
        : "Run pressship login in a terminal, then refresh this page.",
      icon: "dashicons-admin-network"
    });
  }
}

function renderRemote() {
  renderDashboard();
  if (!state.remote.length) {
    els.remote.innerHTML = emptyState({
      title: "No plugins found.",
      message: "The saved WordPress.org account did not return any plugins.",
      icon: "dashicons-admin-plugins"
    });
    return;
  }

  els.remote.innerHTML = `
    <ul class="subsubsub">
      <li>
        <a class="current" href="#">${escapeHtml(state.remoteUsername || "account")}
          <span class="count">(${state.remote.length})</span>
        </a>
      </li>
    </ul>
    <table class="widefat fixed striped">
      <thead>
        <tr>
          <th>Plugin</th>
          <th>Role</th>
          <th>Active installs</th>
          <th>Tested up to</th>
        </tr>
      </thead>
      <tbody>
        ${state.remote.map(remoteRow).join("")}
      </tbody>
    </table>
  `;
}

function remoteRow(plugin) {
  return `
    <tr>
      <td class="plugin-title">
        <strong>${escapeHtml(plugin.name)}</strong>
        <span class="plugin-slug">${escapeHtml(plugin.slug)}</span>
        <div class="row-actions">
          <span><button data-action="details" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">Details</button></span>
          <span class="sep">·</span>
          <span><button data-action="clone" data-slug="${escapeAttr(plugin.slug)}">Clone / update</button></span>
          <span class="sep">·</span>
          <span><button data-action="studio" data-scope="remote" data-id="${escapeAttr(plugin.slug)}">Studio</button></span>
        </div>
      </td>
      <td>${escapeHtml((plugin.roles ?? []).join(", "))}</td>
      <td>${escapeHtml(plugin.activeInstalls ?? "unknown")}</td>
      <td>${escapeHtml(plugin.testedWith ?? "unknown")}</td>
    </tr>
  `;
}

/* ===================================================================
 * Local plugins
 * =================================================================== */

async function loadLocal() {
  els.local.innerHTML = loadingShell("Loading local plugins…");
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
    els.local.innerHTML = emptyState({
      title: "Could not load local plugins.",
      message: error.message,
      icon: "dashicons-warning"
    });
  }
}

function renderLocal() {
  renderDashboard();
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
    <table class="widefat fixed striped">
      <thead>
        <tr>
          <th>Plugin</th>
          <th>Version state</th>
          <th>Path</th>
          <th>Publish</th>
        </tr>
      </thead>
      <tbody>
        ${state.local
          .map((plugin) => localRow(plugin, state.versionStates.get(plugin.id), defaultPublish, defaultBump))
          .join("")}
      </tbody>
    </table>
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
    editor: null,
    editorKind: null
  };
  showView("studio");
  renderStudio();

  try {
    const detail = await api(`/api/plugins/${scope}/${encodeURIComponent(id)}`);
    const plugin = scope === "local" ? detail.plugin : { id, slug: id, name: detail.info?.name ?? id };
    state.studio.plugin = plugin;
    state.studio.loading = false;

    if (scope === "local") {
      const result = await api(`/api/plugins/local/${encodeURIComponent(id)}/files`);
      state.studio.files = result.files ?? [];
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
    await api(`/api/plugins/local/${encodeURIComponent(state.studio.id)}/files/content`, {
      method: "PUT",
      body: {
        path: state.studio.selectedFile.path,
        content
      }
    });
    state.studio.fileContent = content;
    state.studio.draftContent = content;
    state.studio.dirty = false;
    appendStudioTerminal(`Saved ${state.studio.selectedFile.path}.`, "success");
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
    els.studio.innerHTML = `
      <div class="studio-root studio-empty-root">
        <div class="studio-empty-state">
          <span class="dashicons dashicons-editor-code" aria-hidden="true"></span>
          <strong>Choose a plugin to open Studio.</strong>
          <p>Use the Studio action on a WordPress.org or local plugin row.</p>
        </div>
      </div>
    `;
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
          <button class="studio-action-button is-primary" type="button" data-action="studio-run" id="studio-play-button" disabled>
            <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
            Play
          </button>
        </div>
      </header>
      <div class="studio-main">
        <aside class="studio-files" aria-label="Plugin files">
          <header>
            <strong>Explorer</strong>
            <small>${escapeHtml(state.studio.scope === "local" ? plugin?.slug ?? "" : "read-only")}</small>
          </header>
          <div class="studio-file-list">${fileList}</div>
        </aside>
        <section class="studio-workbench" aria-label="Studio editor">
          <div class="studio-tabs" role="tablist" aria-label="Studio tabs">
            <button type="button" role="tab" aria-selected="${state.studio.activeTab === "editor" ? "true" : "false"}" class="${state.studio.activeTab === "editor" ? "is-active" : ""}" data-action="studio-tab" data-tab="editor">
              <span class="dashicons ${studioFileIcon(editorTabLabel)}" aria-hidden="true"></span>
              <span>${escapeHtml(editorTabLabel)}</span>
              ${state.studio.dirty ? `<em aria-label="Unsaved changes"></em>` : ""}
            </button>
            <button type="button" role="tab" aria-selected="${state.studio.activeTab === "home" ? "true" : "false"}" class="${state.studio.activeTab === "home" ? "is-active" : ""}" data-action="studio-tab" data-tab="home">
              <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
              <span>Home</span>
              ${playgroundPort ? `<small>${escapeHtml(`:${playgroundPort}`)}</small>` : ""}
            </button>
            <button type="button" role="tab" aria-selected="${state.studio.activeTab === "admin" ? "true" : "false"}" class="${state.studio.activeTab === "admin" ? "is-active" : ""}" data-action="studio-tab" data-tab="admin">
              <span class="dashicons dashicons-admin-site-alt3" aria-hidden="true"></span>
              <span>WP Admin</span>
              ${state.studio.playgroundUrl ? `<small>admin/password</small>` : ""}
            </button>
            <span class="studio-tab-spacer"></span>
            <span id="studio-editor-status">${state.studio.readOnly ? "Read-only" : state.studio.dirty ? "Unsaved" : "Saved"}</span>
          </div>
          <div class="studio-panel-body">
            ${renderStudioPanelContent()}
          </div>
          ${
            state.studio.terminalOpen
              ? `<section class="studio-terminal" aria-label="Terminal">
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
      </div>
    </div>
  `;
  updateStudioControls();
}

function renderStudioPanelContent() {
  if (state.studio.activeTab === "home" || state.studio.activeTab === "admin") {
    return `<div id="studio-preview" class="studio-preview">${renderStudioPreviewContent()}</div>`;
  }

  return `
    <div class="studio-editor-shell">
      <div id="studio-editor" class="studio-editor"></div>
      ${renderStudioCheckNotes()}
    </div>
  `;
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
    return `
      <div class="studio-tree-folder${containsCurrent ? " has-current" : ""}" role="treeitem" aria-expanded="${collapsed ? "false" : "true"}">
        <button type="button" class="studio-tree-row studio-tree-folder-row" data-action="studio-toggle-folder" data-folder="${escapeAttr(node.path)}" style="--depth:${depth}">
          <span class="dashicons ${collapsed ? "dashicons-arrow-right-alt2" : "dashicons-arrow-down-alt2"} studio-tree-arrow" aria-hidden="true"></span>
          <span class="dashicons ${collapsed ? "dashicons-category" : "dashicons-open-folder"} studio-tree-icon" aria-hidden="true"></span>
          <span class="studio-tree-label">${escapeHtml(node.name)}</span>
        </button>
        ${collapsed ? "" : `<div role="group">${renderStudioTreeChildren(node.children, depth + 1)}</div>`}
      </div>
    `;
  }

  const current = node.path === state.studio.selectedFile?.path;
  const checkCounts = studioCheckCountsForPath(node.path);
  const checkBadge = checkCounts.total
    ? `<span class="studio-tree-check-badge${checkCounts.error ? " has-errors" : ""}" title="${escapeAttr(formatCheckCounts(checkCounts))}">${escapeHtml(String(checkCounts.total))}</span>`
    : "";
  return `
    <button type="button" role="treeitem" class="studio-tree-row studio-tree-file-row${current ? " is-current" : ""}${checkCounts.error ? " has-check-errors" : ""}" data-action="studio-file" data-path="${escapeAttr(node.path)}" style="--depth:${depth}">
      <span class="studio-tree-indent" aria-hidden="true"></span>
      <span class="dashicons ${studioFileIcon(node.path)} studio-tree-icon" aria-hidden="true"></span>
      <span class="studio-tree-label">${escapeHtml(node.name)}</span>
      ${checkBadge}
    </button>
  `;
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
  if (!targetUrl) {
    const label = state.studio.activeTab === "admin" ? "WP Admin" : "Home";
    return `
      <div class="studio-preview-empty">
        <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
        <strong>${escapeHtml(label)} preview</strong>
        <p>Press Play to start WordPress Playground for this plugin.</p>
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

function handleStudioJobEvent(id, payload) {
  const isPlayJob = state.studio.jobId === id;
  const isCheckJob = state.studio.checkJobId === id;
  if (!isPlayJob && !isCheckJob) {
    return;
  }

  if (payload.type === "status") {
    appendStudioTerminal(payload.data?.message ?? payload.data, "status");
  } else if (payload.type === "log") {
    appendStudioTerminal(payload.data?.message ?? payload.data, "log");
  } else if (payload.type === "job-error" || payload.type === "error") {
    appendStudioTerminal(payload.data?.message ?? payload.data, "error");
    if (isPlayJob) {
      state.studio.running = false;
    }
    if (isCheckJob) {
      state.studio.checking = false;
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    updateStudioControls();
  } else if (payload.type === "done") {
    if (isPlayJob) {
      state.studio.running = payload.data?.status === "running" || payload.data?.status === "queued";
    }
    if (isCheckJob) {
      state.studio.checking = payload.data?.status === "running" || payload.data?.status === "queued";
      renderStudio();
      remountStudioEditorIfNeeded();
    }
    appendStudioTerminal(`Job ${payload.data?.status ?? "finished"}.`, payload.data?.status === "succeeded" ? "success" : "muted");
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
    studioPlay.innerHTML = state.studio.running
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span> Starting…`
      : `<span class="dashicons dashicons-controls-play" aria-hidden="true"></span> Play`;
  }
  if (studioCheck) {
    studioCheck.disabled = !canCheck;
    studioCheck.innerHTML = state.studio.checking
      ? `<span class="dashicons dashicons-update" aria-hidden="true"></span> Checking…`
      : `<span class="dashicons dashicons-yes-alt" aria-hidden="true"></span> Check`;
  }
  if (studioSave) {
    studioSave.disabled = state.studio.readOnly || !state.studio.selectedFile || !state.studio.dirty;
  }
}

function disposeStudioEditor() {
  if (state.studio?.editor?.dispose) {
    state.studio.editor.dispose();
  }
  state.studio.editor = null;
  state.studio.editorKind = null;
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

  try {
    const monaco = await ensureMonaco();
    container.innerHTML = "";
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
        status.textContent = state.studio.readOnly ? "Read-only" : state.studio.dirty ? "Unsaved" : "Saved";
      }
    });
    applyStudioCheckMarkers();
  } catch (error) {
    container.innerHTML = `<textarea id="studio-editor-fallback" class="studio-editor-fallback" spellcheck="false" ${state.studio.readOnly ? "readonly" : ""}>${escapeHtml(content)}</textarea>`;
    state.studio.editor = document.getElementById("studio-editor-fallback");
    state.studio.editorKind = "textarea";
    appendStudioTerminal(`Code editor fallback loaded. ${error.message}`, "muted");
    state.studio.editor?.addEventListener("input", () => {
      state.studio.draftContent = getStudioEditorValue();
      state.studio.dirty = state.studio.draftContent !== state.studio.fileContent;
      updateStudioControls();
    });
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
  const activeJobs = Array.from(state.jobs.values()).filter((job) =>
    ["running", "queued"].includes(job.status)
  ).length;
  const activePlaygrounds = state.playgrounds.length;
  const account = state.bootstrap?.account?.username ?? "not logged in";
  const activityBox = document.querySelector(".activity-box");
  if (activityBox) {
    activityBox.hidden = !state.settings?.debugMode;
  }
  els.dashboard.innerHTML = `
    <div class="dashboard-grid">
      <button class="dashboard-card" type="button" data-view-button="remote">
        <span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span>
        <strong>${state.remote.length}</strong>
        <span>WordPress.org plugins</span>
      </button>
      <button class="dashboard-card" type="button" data-view-button="local">
        <span class="dashicons dashicons-download" aria-hidden="true"></span>
        <strong>${state.local.length}</strong>
        <span>Local plugins</span>
      </button>
      <button class="dashboard-card" type="button" data-action="choose-local-folder">
        <span class="dashicons dashicons-open-folder" aria-hidden="true"></span>
        <strong>Choose</strong>
        <span>Add a local folder</span>
      </button>
      <div class="dashboard-card dashboard-card-static">
        <span class="dashicons dashicons-controls-play" aria-hidden="true"></span>
        <strong>${activePlaygrounds}</strong>
        <span>${activePlaygrounds === 1 ? "Active Playground" : "Active Playgrounds"}${activeJobs ? ` / ${activeJobs} starting` : ""}</span>
      </div>
    </div>
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
                <button type="button" class="ps-playground-open" data-action="open-playground" data-url="${escapeAttr(playground.url)}">
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
    `<button class="button button-small${level === defaultBump ? " button-primary" : ""}" data-action="bump-version" data-id="${escapeAttr(
      plugin.id
    )}" data-bump="${level}">${capitalize(level)}</button>`;

  const publishButton = (action, label, isPrimary) =>
    `<button class="button${isPrimary ? " button-primary" : ""}" data-action="dry-run-publish" data-id="${escapeAttr(
      plugin.id
    )}" data-publish-action="${action}">${escapeHtml(label)}</button>`;

  return `
    <tr>
      <td class="plugin-title">
        <strong>${escapeHtml(plugin.name)}</strong>
        <span class="plugin-slug">${escapeHtml(plugin.slug)}</span>
        <div class="row-actions">
          <span><button data-action="details" data-scope="local" data-id="${escapeAttr(plugin.id)}">Details</button></span>
          <span class="sep">·</span>
          <span><button data-action="version-state" data-id="${escapeAttr(plugin.id)}">Versions</button></span>
          <span class="sep">·</span>
          <span><button data-action="studio" data-scope="local" data-id="${escapeAttr(plugin.id)}">Studio</button></span>
          <span class="sep">·</span>
          <span class="delete"><button data-action="remove-local" data-id="${escapeAttr(plugin.id)}">Remove</button></span>
        </div>
      </td>
      <td>
        <div>${stateBadges}</div>
        <div class="version-line">${versionText}</div>
        <div class="actions" style="margin-top:6px">
          ${bumpButton("patch")}
          ${bumpButton("minor")}
          ${bumpButton("major")}
        </div>
      </td>
      <td><code>${escapeHtml(plugin.path)}</code></td>
      <td>
        <div class="actions">
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
  state.studio.checkRanAt = new Date().toISOString();

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
  if (!state.settings?.debugMode) {
    if (els.jobs) {
      els.jobs.innerHTML = "";
    }
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
      run: () => window.open(playground.url, "_blank")
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
    throw new Error(body.error?.message ?? `Request failed (${response.status}).`);
  }
  return body;
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
