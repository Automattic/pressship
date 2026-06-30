import { useState, type ReactNode } from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faArrowsRotate,
  faBoxArchive,
  faCircleCheck,
  faCloudArrowUp,
  faCodeBranch,
  faListCheck,
  faLock,
  faRobot,
  faRocket,
  faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import { useInstallMethod } from "@site/src/theme/Root";

import styles from "./index.module.css";
import { AgentInstructionsBrowser } from "./index";

const prompt =
  "Fetch https://pressship.org/ai and use Pressship to prepare this WordPress plugin for publishing. Run verify and a publish dry run first. Ask before uploading, committing to SVN, or changing git.";

const getRoutes = (prefix: string) => [
  {
    icon: faCloudArrowUp,
    label: "New plugin",
    command: `${prefix} publish . --dry-run -y`,
    result: "Prepares a WordPress.org submission upload."
  },
  {
    icon: faArrowsRotate,
    label: "Pending review",
    command: `${prefix} publish . --dry-run -y`,
    result: "Prepares a reupload of the review package."
  },
  {
    icon: faCodeBranch,
    label: "Approved",
    command: `${prefix} publish . --release --dry-run -y`,
    result: "Prepares an SVN release through trunk and tags."
  }
];

const checkpoints = [
  "Uploading or reuploading to WordPress.org.",
  "Committing to SVN or creating release tags.",
  "Changing git commits, branches, tags, or remotes.",
  "Using --no-verify or bypassing validation.",
  "Treating Plugin Check warnings as acceptable.",
  "Publishing from a generated build folder when the source root is unclear."
];

const report = [
  "Whether verify ran.",
  "Whether a publishing dry run ran.",
  "Plugin Check result summary.",
  "Package size and notable included or excluded files.",
  "Selected route: new submission, reupload, or SVN release.",
  "Upload or release status and slug, if mutation was approved.",
  "Whether git and SVN were left untouched or changed."
];

const docLinks = [
  {
    icon: faRobot,
    title: "Agent skill guide",
    description: "Install the dry-run-first publishing skill.",
    to: "/docs/guides/agent-skill"
  },
  {
    icon: faRocket,
    title: "Getting started",
    description: "Set up Pressship and authenticate.",
    to: "/docs/getting-started"
  },
  {
    icon: faCloudArrowUp,
    title: "Publish command",
    description: "How route detection and dry runs work.",
    to: "/docs/commands/publish"
  },
  {
    icon: faBoxArchive,
    title: "Pack command",
    description: "Validation, Plugin Check, and zip output.",
    to: "/docs/commands/pack"
  }
];

export default function AgentEndpoint(): ReactNode {
  const { prefix } = useInstallMethod();
  const [copied, setCopied] = useState(false);
  const routes = getRoutes(prefix);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <Layout
      title="Pressship for AI agents"
      description="Agent instructions for using Pressship to verify, package, dry-run, and publish WordPress.org plugins safely.">
      <main className={`${styles.main} ${styles.aiPage}`}>
        {/* ─────────── HERO ─────────── */}
        <section className={styles.aiHero}>
          <div className="container">
            <p className={styles.aiCrumb}>
              <Link to="/">Home</Link>
              <span>/</span>
              AI agents
            </p>
            <div className={styles.heroAgentCue}>
              <FontAwesomeIcon icon={faRobot} />
              <span>pressship.org/ai</span>
            </div>
            <Heading as="h1" className={styles.heroTitle}>
              The WordPress.org publishing
              <br />
              runbook — for agents and humans.
            </Heading>
            <p className={styles.heroSubtitle}>
              Agents fetch this URL; you can just read it. Same bounded runbook either way: verify, package, dry-run,
              then confirm before mutating remote state. No improvised commands.
            </p>

            <div className={styles.heroPrompt}>
              <p className={styles.heroPromptLabel}>Give this to your agent:</p>
              <button
                type="button"
                className={styles.heroPromptBox}
                onClick={copyPrompt}
                aria-label="Copy Pressship agent prompt">
                <span className={styles.heroPromptCopy}>{copied ? "Copied" : "Copy"}</span>
                <span className={styles.heroPromptText}>{prompt}</span>
              </button>
              <p className={styles.heroPromptNote}>
                Agents that prefer raw text can fetch <Link to="pathname:///ai.txt">/ai.txt</Link>. This page is the
                same runbook, made readable for people.
              </p>
            </div>

            <div className={styles.heroActions}>
              <Link className="button button--primary button--lg" to="pathname:///ai.txt">
                Open plain text
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/guides/agent-skill">
                Agent skill guide
                <FontAwesomeIcon icon={faArrowRight} style={{ marginLeft: "0.45rem", width: "0.85rem", height: "0.85rem" }} />
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────── THE RUNBOOK ─────────── */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>The runbook</span>
              <Heading as="h2" className={styles.sectionTitle}>
                The same steps, for agent or hand.
              </Heading>
              <p className={styles.sectionSubtitle}>
                One predictable order: inspect, validate, package, and dry-run before anything leaves the machine.
              </p>
            </div>

            <div style={{ maxWidth: "760px", margin: "0 auto" }}>
              <AgentInstructionsBrowser prefix={prefix} />
            </div>
          </div>
        </section>

        {/* ─────────── ROUTE SELECTION ─────────── */}
        <section className={`${styles.section} ${styles.agentSection}`}>
          <div className="container">
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Route selection</span>
              <Heading as="h2" className={styles.sectionTitle}>
                The dry run detects the route.
              </Heading>
              <p className={styles.sectionSubtitle}>
                Pressship reads the plugin's WordPress.org state and chooses the safe path automatically.
              </p>
            </div>

            <div className={styles.aiRoutes}>
              {routes.map((route) => (
                <div key={route.label} className={styles.aiRoute}>
                  <span className={styles.aiRouteBadge}>
                    <FontAwesomeIcon icon={route.icon} />
                    {route.label}
                  </span>
                  <code className={styles.aiRouteCmd}>{route.command}</code>
                  <p className={styles.aiRouteResult}>
                    <FontAwesomeIcon icon={faArrowRight} />
                    {route.result}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────── CHECKPOINTS + REPORT ─────────── */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.aiSplit}>
              <div className={`${styles.aiPanel} ${styles.aiPanelGuard}`}>
                <div className={styles.aiPanelHead}>
                  <span className={styles.aiPanelIcon} aria-hidden="true">
                    <FontAwesomeIcon icon={faLock} />
                  </span>
                  <Heading as="h2" className={styles.aiPanelTitle}>
                    Human checkpoints
                  </Heading>
                </div>
                <p className={styles.aiPanelLead}>Agents pause for approval — and you should pause too — before:</p>
                <ul className={styles.aiCheckList}>
                  {checkpoints.map((item) => (
                    <li key={item} className={`${styles.aiCheckItem} ${styles.aiCheckItemGuard}`}>
                      <FontAwesomeIcon icon={faTriangleExclamation} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.aiPanel}>
                <div className={styles.aiPanelHead}>
                  <span className={styles.aiPanelIcon} aria-hidden="true">
                    <FontAwesomeIcon icon={faListCheck} />
                  </span>
                  <Heading as="h2" className={styles.aiPanelTitle}>
                    Final report
                  </Heading>
                </div>
                <p className={styles.aiPanelLead}>When the work is done, the agent reports back:</p>
                <ul className={styles.aiCheckList}>
                  {report.map((item) => (
                    <li key={item} className={`${styles.aiCheckItem} ${styles.aiCheckItemReport}`}>
                      <FontAwesomeIcon icon={faCircleCheck} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────── USEFUL DOCS ─────────── */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Useful docs</span>
              <Heading as="h2" className={styles.sectionTitle}>
                Go deeper.
              </Heading>
              <p className={styles.sectionSubtitle}>
                The same workflow is documented for people, with command references and setup guides.
              </p>
            </div>

            <div className={styles.aiDocsGrid}>
              {docLinks.map((doc) => (
                <Link key={doc.title} to={doc.to} className={styles.aiDocLink}>
                  <span className={styles.aiDocLinkIcon} aria-hidden="true">
                    <FontAwesomeIcon icon={doc.icon} />
                  </span>
                  <span className={styles.aiDocLinkText}>
                    <strong>{doc.title}</strong>
                    <span>{doc.description}</span>
                  </span>
                  <FontAwesomeIcon icon={faArrowRight} />
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
                Follow the path, by agent or by hand.
              </Heading>
              <p className={styles.ctaSubtitle}>
                Install the skill once, hand your agent the prompt above, or simply work through the steps yourself.
              </p>
              <div className={styles.heroActions} style={{ justifyContent: "center" }}>
                <Link className="button button--primary button--lg" to="/docs/guides/agent-skill">
                  Read the skill guide
                </Link>
                <Link className="button button--secondary button--lg" to="/docs/getting-started">
                  Getting started
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
