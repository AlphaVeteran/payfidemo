"use client";

import { useI18n, type Locale } from "@/lib/i18n";

const OPTIONS: Array<{ id: Locale; label: string }> = [
  { id: "zh-CN", label: "简体" },
  { id: "zh-TW", label: "繁體" },
  { id: "en", label: "EN" },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="payfi-segment">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          data-active={locale === opt.id}
          onClick={() => setLocale(opt.id)}
          aria-label={`Switch language to ${opt.label}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
