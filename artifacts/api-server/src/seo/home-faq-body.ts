import { resolveHomeFaqContent } from '@workspace/seo-shared/faq-schema';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderHomeFaqBody(language: string, translations: Record<string, string>, faqHref: string): string {
  const copy = resolveHomeFaqContent(language, translations);
  return `<section class="container relative pb-12 pt-8 text-white" lang="${escapeHtml(copy.language)}" dir="${copy.direction}" aria-labelledby="home-faq-title" data-testid="home-faq">
    <h2 id="home-faq-title" class="section-header pb-4">${escapeHtml(copy.title)}</h2>
    <p class="mb-6 max-w-3xl text-sm leading-relaxed text-gray-400 md:text-base">${escapeHtml(copy.intro)}</p>
    <div class="border-t border-white/10">${copy.items.map(item => `
      <details id="home-${item.id}" class="group scroll-mt-24 border-b border-white/10">
        <summary class="cursor-pointer rounded-sm py-4 text-start text-gray-200 hover:text-[#FF4199] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199] marker:text-gray-400">
          <h3 class="inline break-words text-sm font-medium md:text-base">${escapeHtml(item.question)}</h3>
        </summary>
        <p class="max-w-4xl pb-5 text-sm leading-relaxed text-gray-400 [overflow-wrap:anywhere] md:text-base">${escapeHtml(item.answer)}</p>
      </details>`).join('')}
    </div>
    <a href="${escapeHtml(faqHref)}" class="mt-6 inline-block text-sm text-gray-300 underline underline-offset-4 hover:text-[#FF4199] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199]">${escapeHtml(copy.linkLabel)}</a>
  </section>`;
}
