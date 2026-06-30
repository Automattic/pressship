import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import Link from "@docusaurus/Link";
import { useInstallMethod, type InstallMethod } from "@site/src/theme/Root";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBoxArchive,
  faChevronLeft,
  faChevronRight,
  faCheck,
  faCodeBranch,
  faCloudArrowUp,
  faCopy,
  faDownload,
  faFileLines,
  faLock,
  faMagnifyingGlassChart,
  faPlay,
  faRobot,
  faRocket,
  faShieldHalved,
  faTerminal,
  faTriangleExclamation,
  faVialCircleCheck,
  faXmark
} from "@fortawesome/free-solid-svg-icons";

import styles from "./index.module.css";

type TerminalBlock = {
  command: string;
  output: ReactNode;
};

const getSession = (prefix: string): TerminalBlock[] => [
  {
    command: `${prefix} info ./my-plugin`,
    output: (
      <>
        <span className={styles.muted}>Plugin</span>
        {"     "}my-plugin <span className={styles.muted}>v1.0.3</span>
        {"\n"}
        <span className={styles.muted}>Requires</span>
        {"   "}WordPress 6.4 · PHP 7.4
        {"\n"}
        <span className={styles.muted}>Route</span>
        {"      "}approved · SVN release
      </>
    )
  },
  {
    command: `${prefix} pack ./my-plugin`,
    output: (
      <>
        <span className={styles.muted}>readme.txt</span>
        {" "} <span className={styles.ok}>valid</span>
        {"\n"}
        <span className={styles.muted}>Plugin Check</span>
        {" "}<span className={styles.warn}>5 warnings</span>
        {"\n"}
        <span className={styles.muted}>Archive</span>
        {"    "}my-plugin.zip <span className={styles.muted}>· 3.1 KB</span>
      </>
    )
  },
  {
    command: `${prefix} publish ./my-plugin --dry-run`,
    output: (
      <>
        <span className={styles.muted}>Checks</span>
        {"    "}readme · Plugin Check · SVN
        {"\n"}
        <span className={styles.muted}>Plan</span>
        {"      "}commit trunk + tag 1.0.3
        {"\n"}
        <span className={styles.muted}>dry-run</span>
        {"   "}<span className={styles.ok}>no upload</span> · add --yes when ready
      </>
    )
  }
];

const getWorkflow = (prefix: string) => [
  {
    icon: faMagnifyingGlassChart,
    title: "Inspect",
    description: "Read local plugin metadata and WordPress.org review state at a glance.",
    command: `${prefix} info ./my-plugin`
  },
  {
    icon: faTerminal,
    title: "Studio",
    description: "Open the local editor, terminal, Playground preview, AI helper, and release sidebar.",
    command: `${prefix} studio`
  },
  {
    icon: faBoxArchive,
    title: "Package",
    description: "Validate readme.txt, run Plugin Check, build an installable zip.",
    command: `${prefix} pack ./my-plugin`
  },
  {
    icon: faCloudArrowUp,
    title: "Publish",
    description: "Route to new submission, pending reupload, or SVN release with setup checks.",
    command: `${prefix} publish ./my-plugin`
  },
  {
    icon: faPlay,
    title: "Demo",
    description: "Boot the plugin in WordPress Playground using its own requirements.",
    command: `${prefix} demo ./my-plugin`
  }
];

const features = [
  {
    icon: faShieldHalved,
    title: "Validates before it uploads",
    text: "Readme parsing, WordPress.org validator, and Plugin Check all run locally before anything leaves your machine."
  },
  {
    icon: faRocket,
    title: "Smart publish routing",
    text: "Detects new submissions, pending reuploads, and approved SVN releases automatically."
  },
  {
    icon: faCodeBranch,
    title: "SVN setup helper",
    text: "For get and release flows, Pressship detects missing Subversion and offers the right install path for your OS."
  },
  {
    icon: faVialCircleCheck,
    title: "Zero-setup Plugin Check",
    text: "Managed WordPress and Plugin Check environment. No manual WP-CLI wiring."
  },
  {
    icon: faPlay,
    title: "Playground demos",
    text: "Open any local plugin path or hosted slug in WordPress Playground for instant testing."
  },
  {
    icon: faRobot,
    title: "Agent skill included",
    text: "Drop-in publishing skill keeps automated workflows dry-run-first and reviewable."
  }
];

const agentCards = [
  {
    icon: faRobot,
    title: "One endpoint, two readers",
    text: "Agents fetch pressship.org/ai and people open the same page — both follow the identical verified WordPress.org publishing flow."
  },
  {
    icon: faShieldHalved,
    title: "Dry-run before mutation",
    text: "The endpoint tells agents to inspect, verify, package, and run publish dry runs before upload, reupload, or SVN release."
  },
  {
    icon: faTerminal,
    title: "Works from any agent shell",
    text: "Codex, Claude Code, Cursor, ChatGPT, OpenCode, and anything that can fetch a URL can learn the path in plain text."
  }
];

export type RunStep = {
  title: string;
  text?: string;
  cmds?: string[];
  checkpoint?: boolean;
};

export const getRunbookSteps = (prefix: string): RunStep[] => [
  {
    title: "Identify the plugin root",
    text: "Don't assume the repository root is the plugin root when multiple plugins or build outputs exist."
  },
  {
    title: "Check the account and route",
    cmds: [`${prefix} whoami`, `${prefix} info .`, `${prefix} status .`]
  },
  {
    title: "Validate before packaging",
    cmds: [`${prefix} verify .`]
  },
  {
    title: "Package after validation",
    cmds: [`${prefix} pack .`]
  },
  {
    title: "Dry-run before any mutation",
    cmds: [`${prefix} publish . --dry-run -y`]
  },
  {
    title: "Ask before mutating remote state",
    text: "Pause before any upload, reupload, SVN commit, release tag, or git change.",
    checkpoint: true
  }
];

const commands = [
  { name: "login", description: "Open WordPress.org login in a browser and save the session." },
  { name: "whoami", description: "Show the active WordPress.org account." },
  { name: "info", description: "Inspect local plugin metadata or hosted plugin info." },
  { name: "ls", description: "List profile plugins and saved-account SVN committer plugins." },
  { name: "get", description: "Checkout or update SVN, with Subversion setup help." },
  { name: "studio", description: "Open the local editor, terminal, and Playground preview." },
  { name: "status", description: "Read submission state from the developer dashboard." },
  { name: "pack", description: "Validate, run Plugin Check, and write an installable zip." },
  { name: "publish", description: "Route to submit or release based on current state." },
  { name: "submit", description: "Upload a zip to WordPress.org review or reupload." },
  { name: "release", description: "Push an approved release through SVN trunk and tags." },
  { name: "demo", description: "Open the plugin in WordPress Playground." },
  { name: "version", description: "Bump plugin and readme version together." }
];

const installMethods = [
  { label: "npx", command: "npx pressship publish ./my-plugin" },
  { label: "npm", command: "npm install -g pressship" },
  { label: "wp-cli", command: "wp package install Automattic/pressship" }
];

const agentTargets = [
  { label: "Codex", value: "codex" },
  { label: "Claude Code", value: "claude-code" }
];
const skillCommandFor = (target: string) =>
  `npx skills add Automattic/pressship --skill wordpress-plugin-publish -a ${target}`;
const agentPrompt =
  "Fetch https://pressship.org/ai and use Pressship to prepare this WordPress plugin for publishing. Run verify and a publish dry run first. Ask before uploading, committing to SVN, or changing git.";
const claudeCodeIconUrl = "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/claude.svg";

type StudioSlideBase = {
  icon: IconDefinition;
  iconImage?: string;
  eyebrow: string;
  title?: string;
  description: string;
  actions?: "review";
};

type StudioImageSlide = StudioSlideBase & {
  kind: "image";
  image: string;
  alt: string;
};

type StudioCliSlide = StudioSlideBase & {
  kind: "cli";
};

type StudioAgentSlide = StudioSlideBase & {
  kind: "agent";
};

type StudioSlide = StudioImageSlide | StudioCliSlide | StudioAgentSlide;

const studioSlides: StudioSlide[] = [
  {
    kind: "agent",
    icon: faRobot,
    iconImage: claudeCodeIconUrl,
    eyebrow: "Agent harness",
    title: "Hand the prompt above to any agent and it runs the verified path.",
    description:
      "Your agent fetches pressship.org/ai (or installs the skill), then follows the same dry-run-first flow: inspect, validate, package, and ask before any upload or SVN commit."
  },
  {
    kind: "cli",
    icon: faTerminal,
    eyebrow: "Terminal",
    title: "Run the publishing path from the terminal first. Open Studio when you want the workspace.",
    description:
      "Pressship starts as commands: inspect the plugin, package it, dry-run the WordPress.org route, then choose when to upload or commit."
  },
  {
    kind: "image",
    image: "studio-home-workspace-full.png",
    icon: faVialCircleCheck,
    eyebrow: "Plugin Check + AI",
    title: "Fix findings where they happen — editor, Plugin Check, and AI review in one frame.",
    description:
      "Plugin Check output stays pinned to file and line context, and the AI helper proposes patches as a real diff you accept or reject.",
    alt: "Pressship Studio showing a plugin file diff, Plugin Check findings, terminal output, and the AI helper pane",
    actions: "review"
  },
  {
    kind: "image",
    image: "studio-home-release-full.png",
    icon: faCodeBranch,
    eyebrow: "SVN + release",
    title: "Manage versions, tags, trunk state, and release prep without leaving the workspace.",
    description:
      "The release pane surfaces current header/readme versions, WordPress.org data, SVN tags, and safe dry-run actions.",
    alt: "Pressship Studio with the Release pane open, showing version state and SVN tags"
  },
  {
    kind: "image",
    image: "studio-playground.png",
    icon: faPlay,
    eyebrow: "Playground",
    title: "Boot the plugin in a throwaway WordPress, right beside the editor.",
    description:
      "Preview the plugin in WordPress Playground using its own requirements, then jump back to the file or release pane.",
    alt: "Pressship Studio with the WordPress Playground preview open beside the file tree"
  }
];

// Studio section deck — Studio screenshots only, no CLI or agent slides.
const studioWorkspaceSlides: StudioSlide[] = [
  {
    kind: "image",
    image: "studio-home-workspace-full.png",
    icon: faVialCircleCheck,
    eyebrow: "Editor + Check",
    title: "Fix warnings where they happen, with the editor, terminal, and AI helper in one frame.",
    description:
      "Plugin Check findings stay pinned to file and line context. The helper can propose patches, but accepting or rejecting changes stays explicit.",
    alt: "Pressship Studio workspace showing a plugin file, Plugin Check warnings, terminal output, and the AI helper pane",
    actions: "review"
  },
  {
    kind: "image",
    image: "studio-home-release-full.png",
    icon: faCodeBranch,
    eyebrow: "Release + SVN",
    title: "Manage versions, tags, trunk state, and release prep without leaving the workspace.",
    description:
      "The release pane surfaces current header/readme versions, WordPress.org data, SVN tags, and safe dry-run actions.",
    alt: "Pressship Studio workspace with the Release pane open, showing version state and SVN tags"
  },
  {
    kind: "image",
    image: "studio-playground.png",
    icon: faPlay,
    eyebrow: "Playground",
    title: "Boot the plugin in a throwaway WordPress, right next to the editor.",
    description:
      "Preview the plugin in WordPress Playground using its own requirements, then jump back to the file or release pane.",
    alt: "Pressship Studio with the WordPress Playground preview open beside the file tree"
  }
];

const studioHighlights = [
  {
    icon: faVialCircleCheck,
    title: "Check findings become editor work",
    text: "Plugin Check output is tied back to the file tree, line markers, and terminal command that produced it."
  },
  {
    icon: faRobot,
    title: "AI changes stay reviewable",
    text: "The helper can fix, refactor, or update readme text, but file changes still move through explicit accept and reject controls."
  },
  {
    icon: faRocket,
    title: "Release decisions are visible",
    text: "Submit, reupload, release, SVN tags, ignored files, package size, and confirmation steps are kept in the right pane."
  }
];

function commandDocPath(name: string): string {
  if (name === "login" || name === "whoami") {
    return "auth";
  }
  if (name === "ls") {
    return "list";
  }
  return name;
}

function studioSlideIcon(slide: StudioSlide): ReactNode {
  return (
    <span className={styles.studioIconSlot} aria-hidden="true">
      {slide.iconImage ? (
        <img src={slide.iconImage} alt="" loading="lazy" decoding="async" />
      ) : (
        <FontAwesomeIcon icon={slide.icon} />
      )}
    </span>
  );
}

function StudioShowcaseSlider({
  compact = false,
  hideChrome = false,
  prefix,
  slides = studioSlides,
  title = "Pressship demos"
}: {
  compact?: boolean;
  hideChrome?: boolean;
  prefix: string;
  slides?: StudioSlide[];
  title?: string;
}): ReactNode {
  const imageBaseUrl = useBaseUrl("/img/studio/");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoAdvancePaused, setIsAutoAdvancePaused] = useState(false);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const safeIndex = Math.min(activeIndex, slides.length - 1);
  const activeSlide = slides[safeIndex];
  const currentSession = getSession(prefix);

  useEffect(() => {
    if (slides.length < 2 || isAutoAdvancePaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const tabListElement = tabListRef.current;
      if (tabListElement?.matches(":hover") || tabListElement?.contains(document.activeElement)) {
        return;
      }

      setActiveIndex((index) => (index + 1) % slides.length);
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [isAutoAdvancePaused, slides.length]);

  const goToPreviousSlide = () => {
    setActiveIndex((index) => (index === 0 ? slides.length - 1 : index - 1));
  };

  const goToNextSlide = () => {
    setActiveIndex((index) => (index + 1) % slides.length);
  };

  return (
    <div className={`${styles.studioSlider} ${compact ? styles.studioSliderCompact : ""}`}>
      {!hideChrome && (
        <div className={styles.studioSliderChrome}>
          <div className={styles.studioSliderDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className={styles.studioSliderTitle}>{title}</span>
          <div className={styles.studioSliderControls}>
            <button type="button" onClick={goToPreviousSlide} aria-label="Show previous Pressship demo">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <button type="button" onClick={goToNextSlide} aria-label="Show next Pressship demo">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        </div>
      )}

      <div className={styles.studioSlideStage}>
        {activeSlide.kind === "cli" ? (
          <div className={styles.studioCliSlide} aria-label="Pressship CLI session">
            <div className={styles.studioCliToolbar}>
              <span />
              <span />
              <span />
              <code>Terminal</code>
            </div>
            <div className={styles.studioCliBody}>
              {currentSession.map((block, index) => (
                <div key={block.command} className={styles.studioCliBlock}>
                  <div className={styles.terminalLine}>
                    <span className={styles.prompt}>$</span>
                    <span className={styles.cmd}>{block.command}</span>
                  </div>
                  <pre className={styles.terminalOut}>{block.output}</pre>
                  {index < currentSession.length - 1 && <div className={styles.terminalDivider} />}
                </div>
              ))}
            </div>
          </div>
        ) : activeSlide.kind === "agent" ? (
          <div className={styles.studioAgentSlide} aria-label="Agent harness example with the Pressship skill installed">
            <div className={styles.studioAgentHeader}>
              <span className={styles.studioAgentMark} aria-hidden="true">
                <img src={claudeCodeIconUrl} alt="" loading="lazy" decoding="async" />
              </span>
              <div>
                <strong>Claude Code</strong>
                <span>Pressship skill installed</span>
              </div>
              <code>wordpress-plugin-publish</code>
            </div>

            <div className={styles.studioAgentMessages}>
              <div className={`${styles.studioAgentBubble} ${styles.studioAgentBubbleUser}`}>
                {agentPrompt}
              </div>
              <div className={`${styles.studioAgentBubble} ${styles.studioAgentBubbleAssistant}`}>
                I’ll use Pressship in dry-run mode first, then report the route before anything uploads.
              </div>
              <div className={styles.studioAgentTools} aria-label="Agent tool calls">
                <div>
                  <span>tool</span>
                  <code>{prefix} pack ./my-plugin --dry-run</code>
                  <strong>readme valid · Plugin Check warnings found · zip 3.1 KB</strong>
                </div>
                <div>
                  <span>tool</span>
                  <code>{prefix} publish ./my-plugin --dry-run</code>
                  <strong>approved plugin · SVN release path · confirmation required</strong>
                </div>
              </div>
              <div className={`${styles.studioAgentBubble} ${styles.studioAgentBubbleAssistant}`}>
                It is ready after fixing the warnings. I can open Studio for the highlighted lines or continue with the release when you confirm.
              </div>
            </div>
          </div>
        ) : (
          <img
            key={activeSlide.image}
            className={styles.studioSlideImage}
            src={`${imageBaseUrl}${activeSlide.image}`}
            alt={activeSlide.alt}
          />
        )}
      </div>

      <div className={styles.studioSlideCaption} aria-live="polite">
        <div className={styles.studioSlideEyebrow}>
          {studioSlideIcon(activeSlide)}
          <span>{activeSlide.eyebrow}</span>
        </div>
        {activeSlide.title ? (
          <Heading as="h3" className={styles.studioSlideTitle}>
            {activeSlide.title}
          </Heading>
        ) : null}
        <p>{activeSlide.description}</p>
        {activeSlide.actions === "review" && (
          <div className={styles.studioReviewActions} aria-label="AI review actions">
            <span>
              <FontAwesomeIcon icon={faCheck} />
              Accept patch
            </span>
            <span>
              <FontAwesomeIcon icon={faXmark} />
              Reject
            </span>
          </div>
        )}
      </div>

      <div
        ref={tabListRef}
        className={styles.studioSlideTabs}
        role="tablist"
        aria-label={title}
        onPointerEnter={() => setIsAutoAdvancePaused(true)}
        onPointerLeave={() => setIsAutoAdvancePaused(false)}
        onMouseEnter={() => setIsAutoAdvancePaused(true)}
        onMouseLeave={() => setIsAutoAdvancePaused(false)}
        onFocus={() => setIsAutoAdvancePaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsAutoAdvancePaused(false);
          }
        }}>
        {slides.map((slide, index) => (
          <button
            key={slide.eyebrow}
            type="button"
            role="tab"
            aria-selected={safeIndex === index}
            className={`${styles.studioSlideTab} ${safeIndex === index ? styles.studioSlideTabActive : ""}`}
            onClick={() => setActiveIndex(index)}>
            {studioSlideIcon(slide)}
            <span>{slide.eyebrow}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HeroSetup(): ReactNode {
  const { method, setMethod, prefix } = useInstallMethod();
  const [mode, setMode] = useState<"agents" | "cli">("agents");
  const [agentTarget, setAgentTarget] = useState(agentTargets[0].value);
  const [copied, setCopied] = useState(false);

  const foundCli = installMethods.findIndex((m) => m.label === method);
  const activeCli = foundCli === -1 ? 0 : foundCli;
  const command = mode === "agents" ? skillCommandFor(agentTarget) : installMethods[activeCli].command;

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [command]);

  const tabs =
    mode === "agents"
      ? agentTargets.map((target) => ({
          key: target.value,
          label: target.label,
          active: target.value === agentTarget,
          onClick: () => setAgentTarget(target.value)
        }))
      : installMethods.map((installMethod) => ({
          key: installMethod.label,
          label: installMethod.label,
          active: installMethod.label === method,
          onClick: () => setMethod(installMethod.label as InstallMethod)
        }));

  return (
    <div className={styles.setup}>
      <div className={styles.setupSwitch} role="tablist" aria-label="How are you using Pressship?">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "agents"}
          className={`${styles.setupSwitchBtn} ${mode === "agents" ? styles.setupSwitchBtnActive : ""}`}
          onClick={() => setMode("agents")}>
          <FontAwesomeIcon icon={faRobot} />
          I’m using agents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cli"}
          className={`${styles.setupSwitchBtn} ${mode === "cli" ? styles.setupSwitchBtnActive : ""}`}
          onClick={() => setMode("cli")}>
          <FontAwesomeIcon icon={faTerminal} />
          I’m using the CLI
        </button>
      </div>

      <div className={styles.setupBar}>
        <div className={styles.setupBarTabs} role="tablist" aria-label={mode === "agents" ? "Agent target" : "Install method"}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.active}
              className={`${styles.setupBarTab} ${tab.active ? styles.setupBarTabActive : ""}`}
              onClick={tab.onClick}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className={styles.setupBarCommand} role="tabpanel">
          <span className={styles.installPrompt}>$</span>
          <code className={styles.setupBarCode}>{command}</code>
          <button type="button" className={styles.setupBarCopy} onClick={copyCommand} aria-label="Copy command">
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      <p className={styles.setupHint}>
        {mode === "agents" ? (
          <>Installs the dry-run-first publishing skill. No skills runtime? Just hand your agent the prompt above.</>
        ) : (
          <>
            Run any command yourself — <code>{prefix} --help</code> lists them all.
          </>
        )}
      </p>
    </div>
  );
}

export function AgentInstructionsBrowser({
  prefix,
  compact = false,
  steps
}: {
  prefix: string;
  compact?: boolean;
  steps?: RunStep[];
}): ReactNode {
  const runSteps = steps ?? getRunbookSteps(prefix);

  return (
    <div className={`${styles.aiBrowser} ${compact ? styles.aiBrowserCompact : ""}`}>
      <div className={styles.aiBrowserBar}>
        <div className={styles.aiBrowserDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className={styles.aiBrowserUrl}>
          <FontAwesomeIcon icon={faLock} />
          <span>
            pressship.org<strong>/ai</strong>
          </span>
        </span>
        <span className={styles.aiBrowserFetch}>
          <FontAwesomeIcon icon={faDownload} />
          fetchable
        </span>
      </div>
      <div className={styles.aiBrowserBody}>
        <span className={styles.aiBrowserDoc} aria-hidden="true">
          <FontAwesomeIcon icon={faFileLines} />
          Publishing runbook
        </span>
        <ol className={styles.runbook}>
          {runSteps.map((step, index) => (
            <li
              key={step.title}
              className={`${styles.runStep} ${step.checkpoint ? styles.runStepCheckpoint : ""}`}>
              <span className={styles.runIndex} aria-hidden="true">
                {index + 1}
              </span>
              <div className={styles.runMain}>
                <Heading as="h3" className={styles.runTitle}>
                  {step.title}
                </Heading>
                {step.text && <p className={styles.runText}>{step.text}</p>}
                {step.cmds && (
                  <div className={styles.runCmds}>
                    {step.cmds.map((cmd) => (
                      <span key={cmd} className={styles.runCmd}>
                        <span className={styles.prompt}>$</span>
                        {cmd}
                      </span>
                    ))}
                  </div>
                )}
                {step.checkpoint && (
                  <span className={styles.runCheckpointTag}>
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    Human approval required
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const logoUrl = useBaseUrl("/img/pressship-square.png");
  const logoDarkUrl = useBaseUrl("/img/pressship-square-dark.png");
  const filigranLogoUrl = useBaseUrl("/img/pressship-square-dark.png");
  const [copiedAgentPrompt, setCopiedAgentPrompt] = useState(false);
  const { prefix } = useInstallMethod();

  const copyAgentPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopiedAgentPrompt(true);
      setTimeout(() => setCopiedAgentPrompt(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const currentWorkflow = getWorkflow(prefix);

  return (
    <Layout
      title="Pressship for WordPress.org publishing agents"
      description="Tell an agent to fetch pressship.org/ai, then use Pressship to validate, package, dry-run, and publish WordPress.org plugins with explicit human checkpoints.">
      <main className={styles.main}>
        {/* ─────────── HERO ─────────── */}
        <section className={styles.hero}>
          <svg
            className={styles.heroWpFiligran}
            viewBox="0 0 122.5 122.5"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true">
            <path
              fill="currentColor"
              d="M8.7,61.3c0,20.8,12.1,38.7,29.6,47.3L13.3,40C10.3,46.5,8.7,53.7,8.7,61.3z M96.4,58.7c0-6.5-2.3-11-4.3-14.5c-2.7-4.3-5.2-8-5.2-12.3c0-4.8,3.7-9.3,8.9-9.3c0.2,0,0.5,0,0.7,0.1c-9.4-8.6-21.9-13.9-35.7-13.9c-18.5,0-34.8,9.5-44.3,23.9c1.2,0,2.4,0.1,3.4,0.1c5.5,0,14.1-0.7,14.1-0.7c2.9-0.2,3.2,4,0.4,4.3c0,0-2.9,0.3-6,0.5l19.1,56.9l11.5-34.5l-8.2-22.4c-2.9-0.2-5.6-0.5-5.6-0.5c-2.9-0.2-2.5-4.5,0.3-4.3c0,0,8.7,0.7,13.9,0.7c5.5,0,14.1-0.7,14.1-0.7c2.9-0.2,3.2,4,0.4,4.3c0,0-2.9,0.3-6,0.5l19,56.5l5.2-17.6C94.6,69.6,96.4,64.4,96.4,58.7z M62.2,65.9l-15.8,46c4.7,1.4,9.7,2.1,14.8,2.1c6.1,0,12-1.1,17.5-3c-0.1-0.2-0.3-0.5-0.4-0.7L62.2,65.9z M107.1,36.2c0.2,1.7,0.4,3.5,0.4,5.5c0,5.4-1,11.5-4.1,19.2L86.9,108c16.1-9.4,26.9-26.8,26.9-46.7C113.9,52,111.5,42.7,107.1,36.2z M61.3,0C27.5,0,0,27.5,0,61.3s27.5,61.3,61.3,61.3c33.8,0,61.3-27.5,61.3-61.3S95,0,61.3,0z M61.3,119.7c-32.2,0-58.4-26.2-58.4-58.4S29.1,2.9,61.3,2.9c32.2,0,58.4,26.2,58.4,58.4S93.5,119.7,61.3,119.7z"
            />
          </svg>
          <img className={styles.heroPressshipFiligran} src={filigranLogoUrl} alt="" aria-hidden="true" />
          <div className="container">
            <div className={styles.heroInner}>
              <div className={styles.heroAgentCue}>
                <FontAwesomeIcon icon={faRobot} />
                <span>Built for agents and humans</span>
              </div>

              <Heading as="h1" className={styles.heroTitle}>
                Put agents and humans on the{" "}
                <br />
                WordPress.org publishing path.
              </Heading>

              <p className={styles.heroSubtitle}>
                Pressship is one bounded source of truth your agent can fetch — or you can read: inspect the plugin,
                run the checks, dry-run the route, then confirm before anything uploads or commits.
              </p>

              <div className={styles.heroPrompt}>
                <p className={styles.heroPromptLabel}>To prepare a plugin, say this to your agent:</p>
                <button
                  type="button"
                  className={styles.heroPromptBox}
                  onClick={copyAgentPrompt}
                  aria-label="Copy Pressship agent prompt">
                  <span className={styles.heroPromptCopy}>{copiedAgentPrompt ? "Copied" : "Copy"}</span>
                  <span className={styles.heroPromptText}>{agentPrompt}</span>
                </button>
                <div className={styles.heroAgents}>
                  <span className={styles.heroAgentsLabel}>Fetchable by</span>
                  <Link to="/docs/guides/agent-skill">Codex</Link>
                  <Link to="/docs/guides/agent-skill">Claude Code</Link>
                  <Link to="/ai">ChatGPT</Link>
                  <Link to="/ai">Cursor</Link>
                  <span>anything with URL fetch</span>
                </div>
                <p className={styles.heroPromptNote}>
                  The human page is <Link to="/ai">/ai</Link>; plain-text agent instructions are also available at{" "}
                  <Link to="pathname:///ai.txt">/ai.txt</Link>.
                </p>
              </div>

              <HeroSetup />

              <div className={styles.heroActions}>
                <Link className="button button--primary button--lg" to="/ai">
                  Open the agent endpoint
                </Link>
                <Link className="button button--secondary button--lg" to="/docs/getting-started">
                  Read the docs
                  <FontAwesomeIcon icon={faArrowRight} style={{ marginLeft: "0.45rem", width: "0.85rem", height: "0.85rem" }} />
                </Link>
              </div>

              <StudioShowcaseSlider hideChrome prefix={prefix} />

              <div className={styles.heroLogos}>
                <picture>
                  <source media="(prefers-color-scheme: dark)" srcSet={logoDarkUrl} />
                  <img src={logoUrl} alt="" aria-hidden="true" />
                </picture>
                <span className={styles.heroLogosPlus}>×</span>
                <svg
                  className={styles.heroWpMark}
                  viewBox="0 0 122.5 122.5"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M8.7,61.3c0,20.8,12.1,38.7,29.6,47.3L13.3,40C10.3,46.5,8.7,53.7,8.7,61.3z M96.4,58.7c0-6.5-2.3-11-4.3-14.5c-2.7-4.3-5.2-8-5.2-12.3c0-4.8,3.7-9.3,8.9-9.3c0.2,0,0.5,0,0.7,0.1c-9.4-8.6-21.9-13.9-35.7-13.9c-18.5,0-34.8,9.5-44.3,23.9c1.2,0,2.4,0.1,3.4,0.1c5.5,0,14.1-0.7,14.1-0.7c2.9-0.2,3.2,4,0.4,4.3c0,0-2.9,0.3-6,0.5l19.1,56.9l11.5-34.5l-8.2-22.4c-2.9-0.2-5.6-0.5-5.6-0.5c-2.9-0.2-2.5-4.5,0.3-4.3c0,0,8.7,0.7,13.9,0.7c5.5,0,14.1-0.7,14.1-0.7c2.9-0.2,3.2,4,0.4,4.3c0,0-2.9,0.3-6,0.5l19,56.5l5.2-17.6C94.6,69.6,96.4,64.4,96.4,58.7z M62.2,65.9l-15.8,46c4.7,1.4,9.7,2.1,14.8,2.1c6.1,0,12-1.1,17.5-3c-0.1-0.2-0.3-0.5-0.4-0.7L62.2,65.9z M107.1,36.2c0.2,1.7,0.4,3.5,0.4,5.5c0,5.4-1,11.5-4.1,19.2L86.9,108c16.1-9.4,26.9-26.8,26.9-46.7C113.9,52,111.5,42.7,107.1,36.2z M61.3,0C27.5,0,0,27.5,0,61.3s27.5,61.3,61.3,61.3c33.8,0,61.3-27.5,61.3-61.3S95,0,61.3,0z M61.3,119.7c-32.2,0-58.4-26.2-58.4-58.4S29.1,2.9,61.3,2.9c32.2,0,58.4,26.2,58.4,58.4S93.5,119.7,61.3,119.7z"
                  />
                </svg>
                <span>
                  Built on WordPress.org review, Plugin Check, SVN, Subversion setup helpers, and WordPress Playground.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────── AGENT ENDPOINT ─────────── */}
        <section className={`${styles.section} ${styles.agentSection}`}>
          <div className="container">
            <div className={styles.agentShowcase}>
              <div className={styles.agentShowcaseCopy}>
                <span className={styles.sectionLabel}>Agents &amp; humans</span>
                <Heading as="h2" className={styles.sectionTitle}>
                  One runbook, whether you fetch it or read it.
                </Heading>
                <p className={styles.agentShowcaseLead}>
                  Agents fetch <code>pressship.org/ai</code>; people read the same page. Either way it's one bounded
                  workflow — inspect, validate, package, dry-run — the verified WordPress.org path, with no improvised
                  commands.
                </p>

                <div className={styles.agentPointList}>
                  {agentCards.map((card) => (
                    <div key={card.title} className={styles.agentPoint}>
                      <span className={styles.agentPointIcon} aria-hidden="true">
                        <FontAwesomeIcon icon={card.icon} />
                      </span>
                      <div>
                        <Heading as="h3" className={styles.agentPointTitle}>
                          {card.title}
                        </Heading>
                        <p>{card.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.agentShowcaseLinks}>
                  <Link className="button button--primary" to="/ai">
                    Open the agent endpoint
                  </Link>
                  <Link className="button button--secondary" to="pathname:///ai.txt">
                    View /ai.txt
                  </Link>
                </div>
              </div>

              <AgentInstructionsBrowser prefix={prefix} />
            </div>
          </div>
        </section>

        {/* ─────────── WORKFLOW ─────────── */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Workflow</span>
              <Heading as="h2" className={styles.sectionTitle}>
                One predictable path
              </Heading>
              <p className={styles.sectionSubtitle}>
                Run the full flow with <code>publish</code>, or step into any phase explicitly.
              </p>
            </div>

            <ol className={styles.workflowGrid}>
              {currentWorkflow.map((step, index) => (
                <li key={step.title} className={styles.workflowCard}>
                  <div className={styles.workflowHeader}>
                    <span className={styles.workflowIcon} aria-hidden="true">
                      <FontAwesomeIcon icon={step.icon} />
                    </span>
                    <span className={styles.workflowIndex}>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <Heading as="h3" className={styles.workflowTitle}>
                    {step.title}
                  </Heading>
                  <p className={styles.workflowText}>{step.description}</p>
                  <code className={styles.workflowCmd}>{step.command}</code>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─────────── FEATURES ─────────── */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>What you get</span>
              <Heading as="h2" className={styles.sectionTitle}>
                Designed for plugin authors who ship often
              </Heading>
              <p className={styles.sectionSubtitle}>
                Less yak-shaving around WordPress.org. More time on the plugin itself.
              </p>
            </div>

            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <div key={feature.title} className={styles.featureItem}>
                  <span className={styles.featureIcon} aria-hidden="true">
                    <FontAwesomeIcon icon={feature.icon} />
                  </span>
                  <Heading as="h3" className={styles.featureTitle}>
                    {feature.title}
                  </Heading>
                  <p className={styles.featureText}>{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────── COMMANDS ─────────── */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Commands</span>
              <Heading as="h2" className={styles.sectionTitle}>
                A focused command set
              </Heading>
              <p className={styles.sectionSubtitle}>
                Every command maps to a plugin author task. No nested config, no hidden global state.
              </p>
            </div>

            <div className={styles.commandsCard}>
              {commands.map((command, index) => (
                <Link
                  key={command.name}
                  to={`/docs/commands/${commandDocPath(command.name)}`}
                  className={styles.commandRow}>
                  <span className={styles.commandNum}>{String(index + 1).padStart(2, "0")}</span>
                  <code className={styles.commandName}>{prefix} {command.name}</code>
                  <span className={styles.commandDesc}>{command.description}</span>
                  <FontAwesomeIcon icon={faArrowRight} className={styles.commandArrow} />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────── STUDIO ─────────── */}
        <section className={`${styles.section} ${styles.studioSection}`}>
          <div className="container">
            <div className={styles.studioSectionGrid}>
              <div className={styles.studioSectionCopy}>
                <span className={styles.sectionLabel}>Studio</span>
                <Heading as="h2" className={styles.sectionTitle}>
                  A plugin workspace that keeps the boring parts close.
                </Heading>
                <p className={styles.sectionSubtitle}>
                  Run <code>{prefix} studio</code> and work from a VS Code-like surface where files, Playground, Plugin Check,
                  AI review, package sizing, and SVN release management all point at the same local plugin.
                </p>

                <div className={styles.studioHighlightList}>
                  {studioHighlights.map((item) => (
                    <div key={item.title} className={styles.studioHighlight}>
                      <span className={styles.studioHighlightIcon} aria-hidden="true">
                        <FontAwesomeIcon icon={item.icon} />
                      </span>
                      <div>
                        <Heading as="h3" className={styles.studioHighlightTitle}>
                          {item.title}
                        </Heading>
                        <p>{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Link className={styles.studioDocsLink} to="/docs/commands/studio">
                  Read the Studio guide
                  <FontAwesomeIcon icon={faArrowRight} />
                </Link>
              </div>

              <StudioShowcaseSlider compact prefix={prefix} slides={studioWorkspaceSlides} title="Pressship Studio" />
            </div>
          </div>
        </section>

        {/* ─────────── FINAL CTA ─────────── */}
        <section className={styles.cta}>
          <div className="container">
            <div className={styles.ctaInner}>
              <Heading as="h2" className={styles.ctaTitle}>
                Ready to ship your next plugin?
              </Heading>
              <p className={styles.ctaSubtitle}>
                Set up Pressship in under a minute and stop fighting the WordPress.org publishing dance.
              </p>
              <div className={styles.heroActions} style={{ justifyContent: "center" }}>
                <Link className="button button--primary button--lg" to="/docs/getting-started">
                  Get started
                </Link>
                <Link className="button button--secondary button--lg" to="https://github.com/Automattic/pressship">
                  Star on GitHub
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
