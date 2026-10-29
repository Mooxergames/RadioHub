import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "@/hooks/useTranslation";
import { useSeoRouting } from "@/hooks/useSeoRouting";
import { SeoHead } from "@/components/SeoHead";
import { resolveFaqPageItems, resolveFaqPageText } from "@workspace/seo-shared/faq-schema";

export default function FaqPage() {
  const { localeTranslations = {} } = useTranslation();
  const { currentLanguage, getLocalizedUrl } = useSeoRouting();
  const copy = resolveFaqPageText(currentLanguage, localeTranslations);
  const items = resolveFaqPageItems(currentLanguage, (key, fallback) => localeTranslations[key] || fallback);
  const [fragment, setFragment] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const revealFragment = () => setFragment(window.location.hash.slice(1));
    window.addEventListener('hashchange', revealFragment);
    return () => window.removeEventListener('hashchange', revealFragment);
  }, []);
  useEffect(() => {
    if (items.some(item => item.id === fragment)) document.getElementById(fragment)?.scrollIntoView?.({ block: 'start' });
  }, [fragment]);

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-white" lang={currentLanguage} dir={['ar', 'he'].includes(currentLanguage) ? 'rtl' : 'ltr'}>
      <SeoHead pageType="faq" />

      <div className="container mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 break-words">{copy.h1}</h1>
        <p className="text-gray-400 text-base md:text-lg mb-10 leading-relaxed">
          {copy.intro}
        </p>

        <ul className="space-y-3" data-testid="faq-list">
          {items.map((item, idx) => {
            return (
              <li
                key={item.id}
                className="border-b border-white/10"
              >
                <details id={item.id} open={idx === 0 || item.id === fragment} className="group scroll-mt-24" data-testid={`faq-item-${item.id}`}>
                  <summary data-testid={`faq-toggle-${idx}`} className="flex list-none cursor-pointer items-center justify-between gap-4 rounded-sm py-5 text-start hover:text-[#FF4199] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199] [&::-webkit-details-marker]:hidden">
                    <h2 className="min-w-0 break-words font-semibold text-base md:text-lg">{item.question}</h2>
                    <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="pb-6 text-gray-300 leading-relaxed [overflow-wrap:anywhere]">{item.answer}</p>
                </details>
              </li>
            );
          })}
        </ul>

        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-xl font-semibold mb-3">
            {copy.helpTitle}
          </h2>
          <p className="text-gray-400 mb-4">
            {copy.helpText}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={getLocalizedUrl('/contact')}
              className="px-4 py-2 bg-[#FF4199] rounded-lg font-medium hover:opacity-90 transition-opacity"
              data-testid="link-contact"
            >
              {localeTranslations.nav_contact || copy.contact}
            </Link>
            <Link
              href={getLocalizedUrl('/about')}
              className="px-4 py-2 bg-white/10 rounded-lg font-medium hover:bg-white/20 transition-colors"
              data-testid="link-about"
            >
              {localeTranslations.nav_about || copy.about}
            </Link>
            <Link
              href={getLocalizedUrl('/search')}
              className="px-4 py-2 bg-white/10 rounded-lg font-medium hover:bg-white/20 transition-colors"
              data-testid="link-search"
            >
              {localeTranslations.nav_search || copy.search}
            </Link>
            {([['/stations', copy.stations], ['/genres', copy.genres], ['/regions', copy.regions], ['/applications', copy.applications]] as const).map(([path, label]) => (
              <Link key={path} href={getLocalizedUrl(path)} className="py-2 text-sm text-gray-300 underline underline-offset-4 hover:text-[#FF4199]">{label}</Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
