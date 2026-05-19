import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

const features = [
  "npm-style publish and pack commands",
  "WordPress.org review uploads and pending reuploads",
  "SVN releases for approved plugins",
  "Plugin Check and readme validation",
  "Local WordPress Playground demos",
  "Hosted and local plugin metadata lookup"
];

export default function Home(): ReactNode {
  const logoUrl = useBaseUrl("/img/pressship.png");

  return (
    <Layout
      title="WordPress.org plugin publishing from the terminal"
      description="Pressship validates, packages, submits, releases, inspects, and demos WordPress.org plugins from the command line.">
      <main>
        <section className={styles.hero}>
          <div className="container">
            <img className={styles.logo} src={logoUrl} alt="Pressship" />
            <Heading as="h1" className={styles.title}>
              WordPress.org plugin publishing, closer to npm.
            </Heading>
            <p className={styles.subtitle}>
              Pressship turns plugin packaging, validation, submission, release, inspection, and demos into one terminal workflow.
            </p>
            <div className={styles.buttons}>
              <Link className="button button--primary button--lg" to="/docs/getting-started">
                Get started
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/commands/publish">
                View commands
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.features}>
          <div className="container">
            <div className={styles.grid}>
              {features.map((feature) => (
                <div className={styles.feature} key={feature}>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
