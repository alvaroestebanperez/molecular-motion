// The player of the static pages. A page arrives with the figure of one step already drawn; this
// replaces it with the interactive player of the same mechanism, opened on the same step.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { MechanismDefinition } from '@molecular-motion/core';
import { MolecularMechanism } from '@molecular-motion/react';

for (const host of document.querySelectorAll<HTMLElement>('[data-player]')) {
  const data = host.querySelector('script[type="application/json"]')?.textContent;
  if (!data) continue;
  const definition = JSON.parse(data) as MechanismDefinition;
  createRoot(host).render(<StrictMode><MolecularMechanism definition={definition} initialStep={host.dataset.step} controls /></StrictMode>);
}
