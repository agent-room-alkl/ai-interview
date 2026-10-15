"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { translations } from "@/lib/translations";

const LanguageContext = createContext({ language: "en", t: (text: string) => text });

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage: string }) {
  const [language, setLanguage] = useState(initialLanguage);
  const t = (text: string) => language === "zh" ? translations[text] ?? text : text;
  return <LanguageContext.Provider value={{ language, t }}>
    <div className="relative z-20 isolate flex h-10 items-center justify-end border-b border-[#17201e]/15 bg-[#f6f5f0] px-4 text-sm text-[#17201e]">
      <label className="flex items-center gap-2 font-medium text-[#17201e]">{t("Interface language")} <select className="min-h-8 rounded-md border border-[#17201e]/30 bg-white px-2 text-sm font-medium text-[#17201e] shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17201e]" aria-label={t("Interface language")} value={language} onChange={event => {
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
