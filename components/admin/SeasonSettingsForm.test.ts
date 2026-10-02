import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "I pick API in the season settings and it switches back to Internal."
 *
 * Three things in this form produced that report, and all three were visible
 * only in a browser. They are pinned here as source rules because the form
 * needs a server action and a database to render; the behaviour itself was
 * verified in a real browser against the built app (see WORKLOG).
 */
const text = fs.readFileSync(path.join(process.cwd(), "components/admin/SeasonSettingsForm.tsx"), "utf8");

describe("the season settings form keeps the provider the admin chose", () => {
  /**
   * React 19 resets a form after an action passed as `<form action>` settles,
   * and the reset puts every <select> back on its first option in the DOM
   * while the state behind it is unchanged. The provider list used to start
   * with "Internal (catalog)", so after every save the dropdown showed Internal
   * although FreeToGame had been saved.
   */
  it("submits through onSubmit, so React never resets the form after a save", () => {
    expect(text).not.toMatch(/<form\s+action=/);
    expect(text).toMatch(/<form\s+onSubmit=\{onFormSubmit\}/);
    expect(text).toMatch(/e\.preventDefault\(\)/);
  });

  /**
   * Switching the source to API used to auto-pick `availableProviders[0]` —
   * but only if it was rawg/igdb/steam, while FreeToGame is always listed
   * first, so the pick never happened and the provider silently stayed
   * "internal". The provider is now the admin's explicit choice.
   */
  it("never picks a provider on the admin's behalf", () => {
    expect(text).not.toMatch(/availableProviders\[0\]/);
  });

  /** "internal" is how the config spells "no provider"; it is not a configured one. */
  it("does not count 'internal' as a configured provider", () => {
    expect(text).not.toMatch(/o\.value === "internal" \|\| providerConfiguredIds\.has\(o\.value\);\s*return \(\s*<option/);
    expect(text).not.toMatch(/cfg\.gamePool\.provider === "internal" \|\| providerConfiguredIds\.has/);
  });

  /**
   * The wizard used to tick the stage and open the next tab the moment the
   * button was pressed, so a save the server refused looked like a success.
   */
  it("advances the wizard only when the server accepted the save", () => {
    const submit = text.slice(text.indexOf("const handleSubmit"), text.indexOf("const onFormSubmit"));
    expect(submit.length).toBeGreaterThan(200);
    expect(submit, "handleSubmit must not confirm stages itself").not.toMatch(/setConfirmedStages|setActiveTab\(next\)/);
    expect(text).toMatch(/if \(state\.error\) return;/);
  });
});

/**
 * "Completed stages glow bright yellow and the selected one is pale — swap
 * them." Amber means "selected" across this editor (DESIGN.md §1.2), so the
 * stage you are on is the bright one, in the tab row and in the progress bar
 * alike, and stages already confirmed are pale.
 */
describe("the season wizard marks the current stage, not the finished ones, in bright amber", () => {
  // The segment's class expression, after its `data-stage-state` attribute.
  const start = text.indexOf("className=", text.indexOf("data-stage-state="));
  const segment = text.slice(start, start + 1500);

  it("fills the selected tab with solid amber", () => {
    expect(text).toMatch(/activeTab === id \? "border-amber bg-amber text-black"/);
  });

  it("paints the current segment solid and confirmed ones pale", () => {
    expect(segment.length).toBeGreaterThan(500);
    const current = segment.match(/current\s*\?\s*changed\s*\?\s*"[^"]*"\s*:\s*"([^"]*)"/);
    expect(current?.[1], "current, no unsaved edits").toBe("bg-amber");
    const done = segment.match(/:\s*done\s*\?\s*"([^"]*)"/);
    expect(done?.[1], "confirmed stage").toMatch(/^bg-amber\/\d+\b/);
  });

  it("keeps unsaved edits visible on the current stage too", () => {
    const currentChanged = segment.match(/current\s*\?\s*changed\s*\?\s*"([^"]*)"/);
    expect(currentChanged?.[1]).toMatch(/repeating-linear-gradient/);
  });
});
