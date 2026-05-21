import { useState, type ReactNode } from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBoxArchive,
  faCheck,
  faCodeBranch,
  faCloudArrowUp,
  faCopy,
  faMagnifyingGlassChart,
  faPlay,
  faRobot,
  faRocket,
  faShieldHalved,
  faTerminal,
  faVialCircleCheck
} from "@fortawesome/free-solid-svg-icons";

import styles from "./index.module.css";

type Block = {
  command: string;
  output: ReactNode;
};

const session: Block[] = [
  {
    command: "npx pressship status ./my-plugin",
    output: (
      <>
        <span className={styles.muted}>slug</span>
        {"        "}my-plugin
        {"\n"}
        <span className={styles.muted}>state</span>
        {"       "}<span className={styles.warn}>Pending review</span>
        {"\n"}
        <span className={styles.muted}>reupload</span>
        {"    "}<span className={styles.ok}>available</span>
      </>
    )
  },
  {
    command: "npx pressship pack ./my-plugin",
    output: (
      <>
        <span className={styles.muted}>readme.txt</span>
        {"        "}<span className={styles.ok}>valid</span>
        {"\n"}
        <span className={styles.muted}>plugin-check</span>
        {"      "}<span className={styles.ok}>passed</span>
        {"\n"}
        <span className={styles.muted}>archive</span>
        {"           "}my-plugin.zip <span className={styles.muted}>· 52 files</span>
      </>
    )
  },
  {
    command: "npx pressship publish ./my-plugin",
    output: (
      <>
        <span className={styles.muted}>Detected</span>
        {"   "}my-plugin <span className={styles.muted}>v1.4.0</span>
        {"\n"}
        <span className={styles.muted}>Route</span>
        {"      "}WordPress.org SVN <span className={styles.ok}>release</span>
        {"\n"}
        <span className={styles.muted}>svn</span>
        {"        "}available
      </>
    )
  }
];

const workflow = [
  {
    icon: faMagnifyingGlassChart,
    title: "Inspect",
    description: "Read local plugin metadata and WordPress.org review state at a glance.",
    command: "npx pressship info ./my-plugin"
  },
  {
    icon: faBoxArchive,
    title: "Package",
    description: "Validate readme.txt, run Plugin Check, build an installable zip.",
    command: "npx pressship pack ./my-plugin"
  },
  {
    icon: faCloudArrowUp,
    title: "Publish",
    description: "Route to new submission, pending reupload, or SVN release with setup checks.",
    command: "npx pressship publish ./my-plugin"
  },
  {
    icon: faPlay,
    title: "Demo",
    description: "Boot the plugin in WordPress Playground using its own requirements.",
    command: "npx pressship demo ./my-plugin"
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

const commands = [
  { name: "login", description: "Open WordPress.org login in a browser and save the session." },
  { name: "whoami", description: "Show the active WordPress.org account." },
  { name: "info", description: "Inspect local plugin metadata or hosted plugin info." },
  { name: "ls", description: "List profile plugins and saved-account SVN committer plugins." },
  { name: "get", description: "Checkout or update SVN, with Subversion setup help." },
  { name: "status", description: "Read submission state from the developer dashboard." },
  { name: "pack", description: "Validate, run Plugin Check, and write an installable zip." },
  { name: "publish", description: "Route to submit or release based on current state." },
  { name: "submit", description: "Upload a zip to WordPress.org review or reupload." },
  { name: "release", description: "Push an approved release through SVN trunk and tags." },
  { name: "demo", description: "Open the plugin in WordPress Playground." },
  { name: "version", description: "Bump plugin and readme version together." }
];

const skillCommand = "npx skills add f/pressship --skill wordpress-plugin-publish -a codex";

function commandDocPath(name: string): string {
  if (name === "login" || name === "whoami") {
    return "auth";
  }
  if (name === "ls") {
    return "list";
  }
  return name;
}

export default function Home(): ReactNode {
  const logoUrl = useBaseUrl("/img/pressship-square.png");
  const logoDarkUrl = useBaseUrl("/img/pressship-square-dark.png");
  const filigranLogoUrl = useBaseUrl("/img/pressship-square-dark.png");
  const [copied, setCopied] = useState(false);

  const copySkill = async () => {
    try {
      await navigator.clipboard.writeText(skillCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <Layout
      title="WordPress.org plugin publishing from the terminal"
      description="Pressship validates, packages, submits, releases, inspects, and demos WordPress.org plugins from the command line.">
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
              {/* Skill install promoted to the top */}
              <div className={styles.heroSkill}>
                <div className={styles.heroSkillLabel}>
                  <FontAwesomeIcon icon={faRobot} />
                  <span>Install the agent skill</span>
                </div>
                <div className={styles.heroSkillBar}>
                  <span className={styles.heroSkillPrompt}>$</span>
                  <code className={styles.heroSkillCommand}>{skillCommand}</code>
                  <button
                    type="button"
                    className={styles.heroSkillCopy}
                    onClick={copySkill}
                    aria-label="Copy install command">
                    <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <Heading as="h1" className={styles.heroTitle}>
                WordPress.org plugin publishing,
                <br />
                <span className={styles.heroTitleAccent}>from the terminal.</span>
              </Heading>

              <p className={styles.heroSubtitle}>
                Pressship validates, packages, submits, releases, inspects, and demos WordPress.org plugins —
                with review, SVN, and local setup steps kept explicit while the chores stay quiet.
              </p>

              <div className={styles.heroActions}>
                <Link className="button button--primary button--lg" to="/docs/getting-started">
                  Get started
                </Link>
                <Link className="button button--secondary button--lg" to="https://github.com/f/pressship">
                  GitHub
                  <FontAwesomeIcon icon={faArrowRight} style={{ marginLeft: "0.45rem", width: "0.85rem", height: "0.85rem" }} />
                </Link>
              </div>

              {/* ─────────── TERMINAL (no tabs, sequential session) ─────────── */}
              <div className={styles.terminal} aria-label="Pressship terminal session">
                <div className={styles.terminalChrome}>
                  <span className={styles.dotR} />
                  <span className={styles.dotY} />
                  <span className={styles.dotG} />
                  <div className={styles.terminalCaption}>~ /my-plugin · pressship</div>
                </div>

                <div className={styles.terminalBody}>
                  {session.map((block, index) => (
                    <div key={block.command} className={styles.terminalBlock}>
                      <div className={styles.terminalLine}>
                        <span className={styles.prompt}>$</span>
                        <span className={styles.cmd}>{block.command}</span>
                      </div>
                      <pre className={styles.terminalOut}>{block.output}</pre>
                      {index < session.length - 1 && <div className={styles.terminalDivider} />}
                    </div>
                  ))}
                </div>
              </div>

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
              {workflow.map((step, index) => (
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
                  <code className={styles.commandName}>pressship {command.name}</code>
                  <span className={styles.commandDesc}>{command.description}</span>
                  <FontAwesomeIcon icon={faArrowRight} className={styles.commandArrow} />
                </Link>
              ))}
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
                <Link className="button button--secondary button--lg" to="https://github.com/f/pressship">
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
