import React, { type ReactNode } from 'react';
import CodeBlock from '@theme-original/CodeBlock';
import type CodeBlockType from '@theme/CodeBlock';
import type { WrapperProps } from '@docusaurus/types';
import { useInstallMethod } from '@site/src/theme/Root';

type Props = WrapperProps<typeof CodeBlockType>;

export default function CodeBlockWrapper(props: Props): ReactNode {
  const { prefix } = useInstallMethod();
  
  let newProps = { ...props };
  
  if (typeof props.children === 'string' && (props.language === 'bash' || props.language === 'sh' || !props.language)) {
    let content = props.children;
    content = content.replace(/npx pressship\b/g, prefix);
    content = content.replace(/(^|\n)(\s*(?:\$\s+)?)(pressship\b)/g, `$1$2${prefix}`);
    newProps.children = content;
  }

  return (
    <>
      <CodeBlock {...newProps} />
    </>
  );
}
