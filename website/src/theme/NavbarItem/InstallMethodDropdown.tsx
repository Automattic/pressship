import React from 'react';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import { useInstallMethod, type InstallMethod } from '@site/src/theme/Root';

export default function InstallMethodDropdown(props: any) {
  const { method, setMethod } = useInstallMethod();

  const items = [
    {
      label: 'npx',
      isNavLink: true,
      to: '#',
      onClick: (e: React.MouseEvent) => { e.preventDefault(); setMethod('npx'); },
      className: method === 'npx' ? 'dropdown__link--active' : '',
    },
    {
      label: 'npm',
      isNavLink: true,
      to: '#',
      onClick: (e: React.MouseEvent) => { e.preventDefault(); setMethod('npm'); },
      className: method === 'npm' ? 'dropdown__link--active' : '',
    },
    {
      label: 'wp-cli',
      isNavLink: true,
      to: '#',
      onClick: (e: React.MouseEvent) => { e.preventDefault(); setMethod('wp-cli'); },
      className: method === 'wp-cli' ? 'dropdown__link--active' : '',
    },
  ];

  return (
    <DropdownNavbarItem
      {...props}
      label={`Examples for: ${method}`}
      items={items}
    />
  );
}
