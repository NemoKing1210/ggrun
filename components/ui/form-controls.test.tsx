import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

describe("Input", () => {
  it("renders an input carrying the HUD base styling", () => {
    const html = renderToStaticMarkup(<Input />);
    expect(html).toContain("<input");
    expect(html).toContain("hud-input");
  });

  it("paints the danger border only when invalid", () => {
    expect(renderToStaticMarkup(<Input invalid />)).toContain("border-danger");
    expect(renderToStaticMarkup(<Input />)).not.toContain("border-danger");
  });

  it("forwards native id, required, disabled and aria-invalid", () => {
    const html = renderToStaticMarkup(
      <Input id="email" required disabled aria-invalid />,
    );
    expect(html).toContain('id="email"');
    expect(html).toContain(" required");
    expect(html).toContain(" disabled");
    expect(html).toContain('aria-invalid="true"');
  });

  it("merges a caller className on top of the base classes", () => {
    const html = renderToStaticMarkup(<Input className="my-field" />);
    expect(html).toContain("my-field");
    expect(html).toContain("hud-input");
  });
});

describe("Select", () => {
  it("renders a select and its option children", () => {
    const html = renderToStaticMarkup(
      <Select defaultValue="b">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    );
    expect(html).toContain("<select");
    expect(html).toContain("Alpha");
    expect(html).toContain('value="b"');
  });

  it("appends the danger border only when invalid", () => {
    const plain = renderToStaticMarkup(
      <Select>
        <option>a</option>
      </Select>,
    );
    const invalid = renderToStaticMarkup(
      <Select invalid>
        <option>a</option>
      </Select>,
    );
    expect(plain).not.toContain("border-danger");
    expect(invalid).toContain("border-danger");
  });

  it("forwards id, name, disabled and required", () => {
    const html = renderToStaticMarkup(
      <Select id="s" name="kind" required disabled>
        <option>a</option>
      </Select>,
    );
    expect(html).toContain('id="s"');
    expect(html).toContain('name="kind"');
    expect(html).toContain(" required");
    expect(html).toContain(" disabled");
  });
});

describe("Textarea", () => {
  it("renders a textarea with the HUD base styling", () => {
    const html = renderToStaticMarkup(<Textarea />);
    expect(html).toContain("<textarea");
    expect(html).toContain("hud-textarea");
  });

  it("paints the danger border only when invalid", () => {
    expect(renderToStaticMarkup(<Textarea invalid />)).toContain("border-danger");
    expect(renderToStaticMarkup(<Textarea />)).not.toContain("border-danger");
  });

  it("forwards id, required, disabled and aria-invalid", () => {
    const html = renderToStaticMarkup(
      <Textarea id="note" required disabled aria-invalid />,
    );
    expect(html).toContain('id="note"');
    expect(html).toContain(" required");
    expect(html).toContain(" disabled");
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("Field", () => {
  it("wraps its control in a label so the control is labelled", () => {
    const html = renderToStaticMarkup(
      <Field label="Email">
        <Input id="email" />
      </Field>,
    );
    expect(html).toContain("<label");
    expect(html).toContain("Email");
    expect(html).toContain('id="email"');
    // label opens before the control it names
    expect(html.indexOf("Email")).toBeLessThan(html.indexOf("<input"));
  });

  it("shows the hint while there is no error", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" hint="We never share it">
        <Input />
      </Field>,
    );
    expect(html).toContain("We never share it");
  });

  it("swaps the hint for the error message once an error exists", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" hint="We never share it" error="Required">
        <Input />
      </Field>,
    );
    expect(html).toContain("Required");
    expect(html).not.toContain("We never share it");
  });

  it("renders neither hint nor error when both are absent", () => {
    const html = renderToStaticMarkup(
      <Field label="Email">
        <Input />
      </Field>,
    );
    expect(html).not.toContain("text-danger");
  });
});
