import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { Link } from 'wouter';
import type { StationEditorial as Editorial, StationEditorialLink } from '@workspace/seo-shared/station-editorial';

function SourceLink({ label, href }: StationEditorialLink) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-sm text-[#FF4199] underline decoration-[#FF4199]/40 underline-offset-4 hover:decoration-[#FF4199] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF4199]">
    <span className="min-w-0 break-words">{label}</span><ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
  </a>;
}

function StationEditorialIntro({ content }: { content: Editorial }) {
  return <div className="max-w-4xl space-y-3 leading-relaxed text-[#D6D6D6]" data-testid="station-editorial-intro">
    {content.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
  </div>;
}

export function StationEditorial({ content }: { content: Editorial }) {
  return <div className="container m-auto pb-8 pt-2 text-white" lang="de" data-testid="station-editorial">
    <section className="border-t border-[#313131] py-6" aria-labelledby="oe3-history">
      <h2 id="oe3-history" className="mb-4 text-lg font-bold">{content.historyHeading}</h2>
      <p className="max-w-4xl text-sm leading-relaxed text-[#BDBDBD]">{content.historyText}</p>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        {content.relatedLinks.map(item => <li key={item.href}><Link href={item.href} className="text-sm text-[#FF4199] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF4199]">{item.label}</Link></li>)}
      </ul>
    </section>
    <section className="border-t border-[#313131] py-6" aria-labelledby="oe3-about">
      <h2 id="oe3-about" className="mb-4 text-lg font-bold">{content.aboutHeading}</h2>
      <StationEditorialIntro content={content} />
    </section>
    <div className="grid gap-x-14 border-t border-[#313131] lg:grid-cols-2">
      <section className="min-w-0 py-6" aria-labelledby="oe3-programmes">
        <h2 id="oe3-programmes" className="mb-4 text-lg font-bold">{content.programmeHeading}</h2>
        <p className="text-sm leading-relaxed text-[#BDBDBD]">{content.programmeText}</p>
        <div className="mt-4"><SourceLink {...content.programmeLink} /></div>
      </section>
      <section className="min-w-0 border-t border-[#313131] py-6 lg:border-t-0" aria-labelledby="oe3-podcasts">
        <h2 id="oe3-podcasts" className="mb-4 text-lg font-bold">{content.podcastHeading}</h2>
        <ul className="space-y-4">
          {content.podcasts.map(item => <li key={item.name}>
            <h3 className="mb-1 font-medium">{item.name}</h3>
            <p className="text-sm leading-relaxed text-[#BDBDBD]">{item.text}</p>
            <div className="mt-2"><SourceLink {...item.link} /></div>
          </li>)}
        </ul>
        <div className="mt-4"><SourceLink {...content.podcastLink} /></div>
      </section>
    </div>
    <section className="border-t border-[#313131] py-6" aria-labelledby="oe3-listening">
      <h2 id="oe3-listening" className="mb-3 max-w-4xl text-lg font-bold lg:mx-auto lg:text-center">{content.listeningHeading}</h2>
      <p className="mb-3 max-w-4xl text-sm leading-relaxed text-[#BDBDBD] lg:mx-auto lg:text-center">{content.listeningText}</p>
      {content.frequencies && <div className="mb-4 w-full max-w-4xl lg:mx-auto" data-testid="station-frequencies">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="pb-3 pt-2 text-left font-medium text-[#D6D6D6]">{content.frequencies.caption}</caption>
          <colgroup><col className="w-[32%]" /><col className="w-[45%]" /><col className="w-[23%]" /></colgroup>
          <thead><tr className="border-b border-[#555] text-[#BDBDBD]">
            {content.frequencies.columns.map((column, index) => <th key={column} scope="col" className={`break-words py-3 font-medium ${index === 2 ? 'text-right' : 'pr-2'}`}>{column}</th>)}
          </tr></thead>
          <tbody>{content.frequencies.rows.map(row => <tr key={`${row.place}-${row.transmitter}`} className="border-b border-[#313131]">
            <th scope="row" className="break-words py-3 pr-2 font-medium text-[#D6D6D6]">{row.place}</th>
            <td className="break-words py-3 pr-2 text-[#BDBDBD]">{row.transmitter}</td>
            <td className="whitespace-nowrap py-3 text-right tabular-nums text-[#D6D6D6]">{row.mhz}</td>
          </tr>)}</tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-[#999]">{content.frequencies.note}</p>
        <div className="mt-3"><SourceLink {...content.frequencies.source} /></div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#999]">
          <time dateTime={content.frequencies.sourceDate}>{content.frequencies.sourceDateLabel}</time>{' '}
          <time dateTime={content.frequencies.checkedAt}>{content.frequencies.checkedLabel}</time>
        </p>
      </div>}
      <SourceLink {...content.listeningLink} />
    </section>
    <section className="border-t border-[#313131] pt-6" aria-labelledby="oe3-questions">
      <h2 id="oe3-questions" className="mb-2 text-lg font-bold">{content.faqHeading}</h2>
      {content.questions.map(item => <details key={item.question} className="group border-b border-[#313131]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF4199] [&::-webkit-details-marker]:hidden">
          <span>{item.question}</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="max-w-4xl space-y-3 pb-4 text-sm leading-relaxed text-[#BDBDBD]">
          <p>{item.answer}</p>{item.link && <SourceLink {...item.link} />}
        </div>
      </details>)}
    </section>
    <section className="pt-6" aria-labelledby="oe3-sources">
      <h2 id="oe3-sources" className="mb-3 text-sm font-medium text-[#BDBDBD]">{content.sourcesHeading}</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-3">{content.sources.map(item => <li key={item.href}><SourceLink {...item} /></li>)}</ul>
      <p className="mt-4 text-xs text-[#999]"><time dateTime={content.reviewedAt}>{content.reviewedLabel}</time></p>
    </section>
  </div>;
}
