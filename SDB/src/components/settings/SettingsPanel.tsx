import { useEffect, useRef, useState } from 'react';

import styles from '@/components/settings/SettingsPanel.module.css';
import { CloseIcon } from '@/components/ui/icons';
import { useFocusTrap, useScrollLock } from '@/hooks/useFocusTrap';
import { cx } from '@/lib/cx';
import {
  FONT_FAMILY_OPTIONS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  FONT_WEIGHT_OPTIONS,
  READING_COLOR_PALETTE,
  useReadingPrefs,
  type ReadingPrefs,
} from '@/state/readingPrefsContext';

interface SettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export const SettingsPanel = ({ open, onClose }: SettingsPanelProps): React.JSX.Element | null => {
  const { prefs, previewPrefs, commitPrefs } = useReadingPrefs();
  const [draft, setDraft] = useState<ReadingPrefs>(prefs);
  const panelRef = useRef<HTMLDivElement>(null);

  /** Seed the draft from the saved baseline each time the panel opens. */
  useEffect(() => {
    if (open) setDraft(prefs);
    // Only re-seed when the panel transitions open; `prefs` changes on Save,
    // which would otherwise clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (next: ReadingPrefs): void => {
    setDraft(next);
    previewPrefs(next);
  };

  const cancel = (): void => {
    previewPrefs(prefs);
    onClose();
  };

  const save = (): void => {
    commitPrefs(draft);
    onClose();
  };

  useFocusTrap(panelRef, open, cancel);
  useScrollLock(open);

  if (!open) return null;

  const fontSizePercent = Math.round(draft.fontScale * 100);

  return (
    <>
      <button type="button" className={styles.overlay} onClick={cancel} aria-label="Close settings" tabIndex={-1} />
      <div
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Reading settings"
      >
        <div className={styles.header}>
          <span className={styles.title}>Reading settings</span>
          <button type="button" className={styles.closeButton} onClick={cancel} aria-label="Close settings">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Font size</span>
            <div className={styles.fontSizeRow}>
              <button
                type="button"
                className={styles.stepButton}
                onClick={() => {
                  update({ ...draft, fontScale: Math.max(FONT_SCALE_MIN, +(draft.fontScale - FONT_SCALE_STEP).toFixed(2)) });
                }}
                disabled={draft.fontScale <= FONT_SCALE_MIN}
                aria-label="Decrease font size"
              >
                A−
              </button>
              <span className={styles.fontSizeValue}>{fontSizePercent}%</span>
              <button
                type="button"
                className={styles.stepButton}
                onClick={() => {
                  update({ ...draft, fontScale: Math.min(FONT_SCALE_MAX, +(draft.fontScale + FONT_SCALE_STEP).toFixed(2)) });
                }}
                disabled={draft.fontScale >= FONT_SCALE_MAX}
                aria-label="Increase font size"
              >
                A+
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionLabel}>Font family</span>
            <div className={styles.choiceGroup} role="radiogroup" aria-label="Font family">
              {FONT_FAMILY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.fontFamily === option.id}
                  className={cx(styles.choiceButton, draft.fontFamily === option.id && styles.choiceButtonActive)}
                  style={{ fontFamily: option.cssValue }}
                  onClick={() => {
                    update({ ...draft, fontFamily: option.id });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionLabel}>Font weight</span>
            <div className={styles.choiceGroup} role="radiogroup" aria-label="Font weight">
              {FONT_WEIGHT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.fontWeight === option.id}
                  className={cx(styles.choiceButton, draft.fontWeight === option.id && styles.choiceButtonActive)}
                  onClick={() => {
                    update({ ...draft, fontWeight: option.id });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionLabel}>Text color</span>
            <div className={styles.swatchGrid} role="radiogroup" aria-label="Text color">
              <button
                type="button"
                role="radio"
                aria-checked={draft.textColor === null}
                aria-label="Default color"
                title="Default"
                className={cx(
                  styles.swatch,
                  styles.swatchDefault,
                  draft.textColor === null && styles.swatchActive,
                )}
                onClick={() => {
                  update({ ...draft, textColor: null });
                }}
              >
                <CloseIcon size={14} />
              </button>
              {READING_COLOR_PALETTE.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.textColor === color.value}
                  aria-label={color.label}
                  title={color.label}
                  className={cx(styles.swatch, draft.textColor === color.value && styles.swatchActive)}
                  style={{ background: color.value }}
                  onClick={() => {
                    update({ ...draft, textColor: color.value });
                  }}
                />
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <span className={styles.sectionLabel}>Preview</span>
            <div className={styles.preview}>
              <p className={styles.previewText}>
                The quick brown fox jumps over the lazy dog while designing distributed systems.
              </p>
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={cancel}>
            Cancel
          </button>
          <button type="button" className={styles.saveButton} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </>
  );
};
