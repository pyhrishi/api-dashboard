# Framer Motion Modal Centering

When using Framer Motion (`motion.div`) for modals, always center them using a flexbox wrapper (e.g., `fixed inset-0 flex items-center justify-center`) instead of relying on Tailwind's transform/translate classes like `left-1/2 top-1/2 -translate-x-1/2`, as Framer Motion overrides CSS transforms.
