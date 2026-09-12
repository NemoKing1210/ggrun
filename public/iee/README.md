# Item and effect artwork

Drop-in artwork for the IEE catalog. **Adding art is a code change**, not an
admin action — the full recipe is `AGENTS.md` §5.

    public/iee/items/<item_key>.webp
    public/iee/effects/<effect_key>.webp

The file name **is** the catalog key. Two steps:

```bash
# 1. save <key>.webp in the folder for its kind
# 2. regenerate the manifest the app reads
pnpm iee:art
```

Square `.webp`, 256×256 (512 px ceiling), ≤ 24 KB.

Nothing here is discovered at runtime — a browser cannot ask whether a file
exists — so `components/iee/art-manifest.ts` is generated from this folder by
`scripts/iee-art.ts`. Never edit it by hand;
`components/iee/IeeArt.test.tsx` fails while it and this folder disagree, in
either direction, and every failure message names the fix.

An entry with no artwork renders its `heroIcon` glyph instead, so the catalog
is never half-drawn while art is in progress.
