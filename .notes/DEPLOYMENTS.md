# Deployments

- Prototype artifact: https://claude.ai/artifact/Qk9ZtcTPESBnJp8v6hJBho (source: design/prototype.html, republish same path). Marks in its db: round 1 → collection `feedback`, round 2 → `feedback2` (doc id = pin key; fields v, note, label, at). Read with ArtifactData list.

## Production (live since 2026-11-24)
- Host: Cloudflare, Worker `dolist` (static assets) at https://dolist.gratis.sh (zone gratis.sh)
- Deploys only via GitHub Actions on actuallymentor/gratis-dolist; secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (set by remote Cloudflare agent)
- Verify: `gh run list -R actuallymentor/gratis-dolist`; first deploy run 45460911388 ok. Unknown paths → index.html (SPA fallback).
