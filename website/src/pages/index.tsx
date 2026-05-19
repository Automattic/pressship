import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

const workflow = [
  { command: "pressship info ./my-plugin", output: "Version 1.4.0 · Requires WP 6.6 · Requires PHP 8.1" },
  { command: "pressship demo ./my-plugin --reset", output: "WordPress Playground ready at http://127.0.0.1:9400" },
  { command: "pressship pack ./my-plugin", output: "Created my-plugin.zip · 52 files · Plugin Check passed" },
  { command: "pressship publish ./my-plugin", output: "Detected pending review · uploading updated plugin zip" }
];

const features = [
  {
    title: "Package With Confidence",
    text: "Build installable plugin zips with readme validation, Plugin Check, and repeatable ignore rules."
  },
  {
    title: "Publish Clearly",
    text: "Use one modernized publishing command, or choose explicit submit and release flows when needed."
  },
  {
    title: "Test In Playground",
    text: "Open local or hosted plugins in WordPress Playground with runtime versions inferred from plugin metadata."
  }
];

export default function Home(): ReactNode {
  const logoUrl = useBaseUrl("/img/pressship.png");

  return (
    <Layout
      title="Modernized WordPress.org plugin publishing"
      description="Pressship validates, packages, submits, releases, inspects, and demos WordPress.org plugins from the command line.">
      <main>
        <section className={styles.hero}>
          <div className="container">
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <img className={styles.logo} src={logoUrl} alt="Pressship" />
                <Heading as="h1" className={styles.title}>
                  Modernized WordPress.org plugin publishing.
                </Heading>
                <p className={styles.subtitle}>
                  Validate, package, submit, release, inspect, and demo plugins from one focused terminal workflow.
                </p>
                <div className={styles.buttons}>
                  <Link className="button button--primary button--lg" to="/docs/getting-started">
                    Get started
                  </Link>
                  <Link className="button button--secondary button--lg" to="/docs/commands/publish">
                    Commands
                  </Link>
                </div>
              </div>

              <div className={styles.terminal} aria-label="Example Pressship command line workflow">
                <div className={styles.terminalBar}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.terminalBody}>
                  {workflow.map((step) => (
                    <div className={styles.terminalStep} key={step.command}>
                      <div>
                        <span className={styles.prompt}>$</span> {step.command}
                      </div>
                      <div className={styles.output}>{step.output}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.features}>
          <div className="container">
            <div className={styles.grid}>
              {features.map((feature) => (
                <article className={styles.feature} key={feature.title}>
                  <Heading as="h2">{feature.title}</Heading>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
