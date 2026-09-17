"use client";

import { useRef, useState, useTransition } from "react";
import { uploadBrandMark, removeBrandMark, updateBrandColours } from "./brand-actions.ts";
import { checkDirectionPair, isHexColour } from "@/lib/brand/colour.ts";
import type { Brand } from "@/lib/brand/settings.ts";

/** The card background the direction colours are judged against. */
const CARD_SURFACE = "#14181d";

const SWATCHES: Array<{ key: keyof Brand & ("accent" | "accentDeep" | "rising" | "falling"); label: string; hint: string }> = [
  { key: "accent", label: "Accent", hint: "The SOLD badge, “SOLD FOR”, and kickio.com" },
  { key: "accentDeep", label: "Accent (deep)", hint: "The darker step, for smaller type" },
  { key: "rising", label: "Rising", hint: "A price trend that went up" },
  { key: "falling", label: "Falling", hint: "A price trend that went down" },
];

export function BrandEditor({ brand }: { brand: Brand }) {
  const [colours, setColours] = useState({
    accent: brand.accent,
    accentDeep: brand.accentDeep,
    rising: brand.rising,
    falling: brand.falling,
  });
  const [mark, setMark] = useState(brand.markDataUri);
  const [markName, setMarkName] = useState(brand.markFilename);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Runs on every keystroke, not on save: the point is to see the consequence
  // while choosing, not to be told off afterwards.
  const checks = isHexColour(colours.rising) && isHexColour(colours.falling)
    ? checkDirectionPair(colours.rising, colours.falling, CARD_SURFACE)
    : [];

  const setColour = (key: string, value: string) =>
    setColours((prev) => ({ ...prev, [key]: value }));

  const upload = (file: File) => {
    setError(null);
    setNote(null);
    const form = new FormData();
    form.set("mark", file);
    startTransition(async () => {
      try {
        const { bytes } = await uploadBrandMark(form);
        // Read it back for the preview rather than trusting the round trip.
        const reader = new FileReader();
        reader.onload = () => setMark(String(reader.result));
        reader.readAsDataURL(file);
        setMarkName(file.name);
        setNote(`Stored as a ${Math.round(bytes / 1024)}KB PNG, 512px square.`);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  const clearMark = () => {
    setError(null);
    startTransition(async () => {
      try {
        await removeBrandMark();
        setMark(null);
        setMarkName(null);
        setNote("Cards will show the KICKIO wordmark until a logo is uploaded.");
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  const saveColours = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateBrandColours(colours);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <section className="card settings">
      <div className="card-head">
        <span className="recipe-tag">Branding</span>
        <h2>Logo and colours</h2>
        <p className="desc">
          Used on every generated card. Changes apply to the next render — existing
          drafts pick them up too, since the image is drawn on demand.
        </p>
      </div>

      <div className="row">
        <div className="field-label">Logo</div>
        <p className="hint">
          PNG or JPEG. Resized to 512px square and stored with the settings, so it needs
          no hosting. A transparent-background PNG works best on the dark cards.
        </p>

        <div className="brand-mark-row">
          <div className="brand-mark-preview">
            {mark ? (
              <img src={mark} alt="" />
            ) : (
              <span className="brand-mark-empty">KICKIO</span>
            )}
          </div>
          <div className="brand-mark-meta">
            <div>{mark ? (markName ?? "Uploaded") : "No logo — cards use the wordmark"}</div>
            <div className="brand-mark-actions">
              <button
                className="link"
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                {mark ? "Replace" : "Upload"}
              </button>
              {mark && (
                <button className="link" type="button" onClick={clearMark} disabled={busy}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="row">
        <div className="field-label">Colours</div>
        <div className="brand-swatches">
          {SWATCHES.map((swatch) => {
            const value = colours[swatch.key];
            const valid = isHexColour(value);
            return (
              <label className="brand-swatch" key={swatch.key}>
                <input
                  type="color"
                  value={valid ? value : "#000000"}
                  onChange={(e) => setColour(swatch.key, e.target.value)}
                />
                <span className="brand-swatch-text">
                  <span className="brand-swatch-label">{swatch.label}</span>
                  <input
                    type="text"
                    className={`brand-hex${valid ? "" : " invalid"}`}
                    value={value}
                    spellCheck={false}
                    onChange={(e) => setColour(swatch.key, e.target.value)}
                  />
                  <span className="hint">{swatch.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {checks.length > 0 && (
        <div className="row">
          <div className="field-label">How the trend colours read</div>
          <p className="hint">
            Rising and falling were picked so a colourblind reader can still tell them
            apart. This re-checks whatever you choose — direction is also carried by an
            arrow and a signed number, so these are warnings, not refusals.
          </p>
          {checks.map((check, i) => (
            <div className={`brand-check ${check.level}`} key={i}>
              {check.message}
            </div>
          ))}
        </div>
      )}

      {note && <div className="status-line">{note}</div>}
      {error && <div className="banner">{error}</div>}

      <div className="actions">
        <button className="btn approve" onClick={saveColours} disabled={busy}>
          {saved ? "Saved" : busy ? "Saving…" : "Save colours"}
        </button>
      </div>
    </section>
  );
}
