# Fancy Network UI V4

This build keeps the original application features and backend, but replaces the public visual identity with a custom Fancy Network design system.

## Brand direction
- Deep forest / midnight base
- Emerald and lime as primary action colors
- Sky blue and warm gold as secondary accents inspired by the supplied Fancy Network crest
- Asymmetrical clipped corners, voxel-grid texture, and compact game-server status surfaces
- No Fancy Network clone and no generic purple/orange dashboard template

## Responsive behavior
- Desktop: asymmetric two-column hero and compact marketplace
- Tablet: single-column hero, 2-column cards
- Mobile: single-column cards, compact navigation, no fixed-width content

## Development reload fix
Mutable JSON data is stored one folder above the project during `next dev` (`fancy-network-runtime-data`) so ticket/order/settings writes do not trigger Next.js Fast Refresh loops.
