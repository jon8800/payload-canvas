---
status: awaiting_human_verify
trigger: "Admin panel crashes with Maximum call stack size exceeded when accessing /admin due to recursive block schema"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - circular blockReferences caused infinite schema expansion
test: TypeScript compiles cleanly (npx tsc --noEmit passes)
expecting: Admin panel loads without stack overflow at /admin
next_action: Awaiting human verification that /admin loads correctly

## Symptoms

expected: Admin panel loads at /admin and block fields render correctly. All 14 atomic blocks can be added to layout fields with nesting support.
actual: RangeError: Maximum call stack size exceeded when compiling /admin/[[...segments]]. The page returns 500 error.
errors: |
  Compiling /admin/[[...segments]] ...
  RangeError: Maximum call stack size exceeded
  GET /admin 500 in 7.1s
reproduction: Run pnpm dev, navigate to localhost:3000/admin
started: When all 14 blocks were given a `children` blocks field with `blockReferences` referencing all block slugs including themselves.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-15T00:01:00Z
  checked: shared.ts childrenField definition
  found: Uses `blockReferences: [...atomicBlockSlugs]` which includes all 14 block slugs. Every block config imports and uses this field, creating circular self-references.
  implication: Payload resolves blockReferences at schema build time, expanding each referenced block's fields recursively. Since every block references every block (including itself), this creates infinite expansion.

- timestamp: 2026-03-15T00:02:00Z
  checked: All 14 block config files
  found: Every single block imports childrenField from shared.ts and includes it in its fields. Even leaf-type blocks like Spacer and Divider have children.
  implication: The recursion is universal across all blocks. Fix must address all 14 blocks.

## Resolution

root_cause: `childrenField` in shared.ts uses `blockReferences` to all 14 atomic block slugs. Since all 14 blocks include this field, Payload encounters infinite recursion when resolving the schema tree at admin build time. blockReferences creates a circular dependency: each block references itself through children.
fix: |
  1. Created generateBlocks.ts utility implementing the DrMint finite tree-like block generation pattern.
  2. Converted all 14 block configs from static Block objects to RecursiveBlock factory functions that accept an optional children field parameter.
  3. Updated registry.ts to call generateBlocks() which produces depth-limited copies (max 8 levels). Each depth gets unique slug/interfaceName suffixes (e.g. heading_1, heading_2).
  4. Removed childrenField from shared.ts (no longer needed).
  5. Updated RenderBlocks.tsx to strip depth suffixes via getBaseBlockSlug() for component lookup.
verification: TypeScript compiles cleanly (npx tsc --noEmit - zero errors)
files_changed:
  - src/blocks/generateBlocks.ts (NEW)
  - src/blocks/shared.ts (removed childrenField)
  - src/blocks/registry.ts (uses generateBlocks)
  - src/blocks/RenderBlocks.tsx (strips depth suffix)
  - src/blocks/Heading/config.ts (factory function)
  - src/blocks/Paragraph/config.ts (factory function)
  - src/blocks/List/config.ts (factory function)
  - src/blocks/Blockquote/config.ts (factory function)
  - src/blocks/Image/config.ts (factory function)
  - src/blocks/Video/config.ts (factory function)
  - src/blocks/Icon/config.ts (factory function)
  - src/blocks/Button/config.ts (factory function)
  - src/blocks/Link/config.ts (factory function)
  - src/blocks/FormEmbed/config.ts (factory function)
  - src/blocks/Container/config.ts (factory function)
  - src/blocks/Grid/config.ts (factory function)
  - src/blocks/Spacer/config.ts (factory function)
  - src/blocks/Divider/config.ts (factory function)
