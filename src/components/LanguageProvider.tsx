"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { translations } from "@/lib/translations";

const LanguageContext = createContext({ language: "en", t: (text: string) => text });

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage: string }) {
  const [language, setLanguage] = useState(initialLanguage);
  const t = (text: string) => language === "zh" ? translations[text] ?? text : text;
  return <LanguageContext.Provider value={{ language, t }}>
    <div className="flex h-10 items-center justify-end gap-3 bg-[#f6f5f0] px-4 py-1 text-xs">
      <a href="/interview/pitch" className="underline">{t("Elevator pitch · 30–60 seconds")}</a>
      <label>{t("Interface language")} <select aria-label="Interface language" value={language} onChange={event => {
        const value = event.target.value;
        setLanguage(value);
        document.cookie = `ui-language=${value}; path=/; max-age=31536000; SameSite=Lax`;
        document.documentElement.lang = value;
      }}><option value="en">English</option><option value="zh">中文</option></select></label>
    </div>
    {children}
  </LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export function T({ children }: { children: string }) { return <>{useLanguage().t(children)}</>; }
