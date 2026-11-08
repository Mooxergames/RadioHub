import { getStationEditorial, type StationEditorialLink } from './station-editorial';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));
const link = (item: StationEditorialLink) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`;

export function renderStationEditorialHtml(station: { _id?: string; slug?: string }, language: string): string {
  const content = getStationEditorial(station, language);
  if (!content) return '';
  return `<div class="station-editorial" lang="de">
    <section><h2>${escapeHtml(content.historyHeading)}</h2><p>${escapeHtml(content.historyText)}</p><ul>${content.relatedLinks.map(item => `<li>${link(item)}</li>`).join('')}</ul></section>
    <section><h2>${escapeHtml(content.aboutHeading)}</h2>${content.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>
    <section><h2>${escapeHtml(content.programmeHeading)}</h2><p>${escapeHtml(content.programmeText)}</p><div>${link(content.programmeLink)}</div></section>
    <section><h2>${escapeHtml(content.podcastHeading)}</h2><ul>${content.podcasts.map(item =>
      `<li><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.text)}</p><div>${link(item.link)}</div></li>`).join('')}</ul><div>${link(content.podcastLink)}</div></section>
    <section><h2>${escapeHtml(content.listeningHeading)}</h2><p>${escapeHtml(content.listeningText)}</p>${content.frequencies ? `<div>
      <table><caption>${escapeHtml(content.frequencies.caption)}</caption><thead><tr>${content.frequencies.columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${content.frequencies.rows.map(row => `<tr><th scope="row">${escapeHtml(row.place)}</th><td>${escapeHtml(row.transmitter)}</td><td>${escapeHtml(row.mhz)}</td></tr>`).join('')}</tbody></table>
      <p>${escapeHtml(content.frequencies.note)}</p><div>${link(content.frequencies.source)}</div>
      <p><time datetime="${escapeHtml(content.frequencies.sourceDate)}">${escapeHtml(content.frequencies.sourceDateLabel)}</time> <time datetime="${escapeHtml(content.frequencies.checkedAt)}">${escapeHtml(content.frequencies.checkedLabel)}</time></p>
    </div>` : ''}<div>${link(content.listeningLink)}</div></section>
    <section><h2>${escapeHtml(content.faqHeading)}</h2>${content.questions.map(item =>
      `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p>${item.link ? `<div>${link(item.link)}</div>` : ''}</details>`).join('')}</section>
    <section><h2>${escapeHtml(content.sourcesHeading)}</h2><ul>${content.sources.map(item => `<li>${link(item)}</li>`).join('')}</ul><p><time datetime="${content.reviewedAt}">${escapeHtml(content.reviewedLabel)}</time></p></section>
  </div>`;
}
