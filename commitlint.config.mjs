/**
 * Conventional Commits, enforced at commit time by `.husky/commit-msg`.
 * `docs/DEVELOPMENT.md` § Releases documents the same rules for humans.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Release commits are `chore(release): vX.Y.Z`; allow the uppercase V.
    "subject-case": [0],
  },
};

export default config;
