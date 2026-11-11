import { Link } from 'wouter';
import { useTranslation } from '@/hooks/useTranslation';
import { useSeoRouting } from '@/hooks/useSeoRouting';
import { resolveHomeFaqContent } from '@workspace/seo-shared/faq-schema';

export default function HomeFaq() {
  const { localeTranslations = {} } = useTranslation();
  const { currentLanguage, getLocalizedUrl } = useSeoRouting();
  const copy = resolveHomeFaqContent(currentLanguage, localeTranslations);

  return (
    <section className="container relative pb-12 pt-8 text-white" lang={copy.language} dir={copy.direction}
      aria-labelledby="home-faq-title" data-testid="home-faq">
      <h2 id="home-faq-title" className="section-header pb-4">{copy.title}</h2>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-gray-400 md:text-base">{copy.intro}</p>
      <div className="border-t border-white/10">
        {copy.items.map(item => (
          <details key={item.id} id={`home-${item.id}`} className="group scroll-mt-24 border-b border-white/10">
            <summary className="cursor-pointer rounded-sm py-4 text-start text-gray-200 hover:text-[#FF4199] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199] marker:text-gray-400">
              <h3 className="inline break-words text-sm font-medium md:text-base">{item.question}</h3>
            </summary>
            <p className="max-w-4xl pb-5 text-sm leading-relaxed text-gray-400 [overflow-wrap:anywhere] md:text-base">{item.answer}</p>
          </details>
        ))}
      </div>
      <Link href={getLocalizedUrl('/faq')} className="mt-6 inline-block text-sm text-gray-300 underline underline-offset-4 hover:text-[#FF4199] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199]">
        {copy.linkLabel}
      </Link>
    </section>
  );
}
