import { ACTIVE_SITEMAP_LANGUAGES } from "@workspace/seo-shared/seo-config";
import { Helmet } from "react-helmet-async";

export default function LLMsPage() {
  const baseUrl = "https://themegaradio.com";

  return (
    <div className="min-h-screen bg-white dark:bg-[#0E0E0E] py-12">
      <Helmet>
        <title>LLMs.txt - AI Documentation | Mega Radio</title>
        <meta name="description" content={`Mega Radio's public radio directories, canonical URL examples, and crawl preferences for ${ACTIVE_SITEMAP_LANGUAGES.length} active sitemap languages.`} />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href={`${baseUrl}/llms`} />
      </Helmet>

      <div className="container max-w-4xl mx-auto px-4">
        {/* H1 for SEO */}
        <h1 className="text-4xl font-bold mb-6 text-gray-900 dark:text-white">
          Mega Radio - Global Online Radio Platform
        </h1>

        <div className="prose dark:prose-invert max-w-none">
          <blockquote className="border-l-4 border-[#FF4199] pl-4 italic mb-8 text-lg">
            Mega Radio is a directory of FM/AM and internet radio stations.
            Its public directories use language-prefixed URLs with localized route names.
            This page summarizes those directories and the site's crawl preferences.
          </blockquote>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">Platform Overview</h2>
          <ul className="space-y-2 mb-6 text-gray-700 dark:text-gray-300">
            <li><strong>Stations:</strong> FM/AM and internet radio stations</li>
            <li><strong>Countries:</strong> Station directories organized by country and region</li>
            <li><strong>Languages:</strong> {ACTIVE_SITEMAP_LANGUAGES.length} active sitemap languages; localization varies by language</li>
            <li><strong>Genres:</strong> Music and talk radio categories</li>
            <li><strong>URL Pattern:</strong> Language codes and localized paths (e.g., /en/station/, /de/sender/, /tr/istasyon/)</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">Core Pages</h2>
          
          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-white">Main Pages</h3>
          <ul className="space-y-2 mb-6">
            <li><a href={`${baseUrl}/en`} className="text-[#FF4199] hover:underline">Homepage</a>: Radio discovery and popular stations</li>
            <li><a href={`${baseUrl}/en/stations`} className="text-[#FF4199] hover:underline">All Stations</a>: Browse the station directory</li>
            <li><a href={`${baseUrl}/en/genres`} className="text-[#FF4199] hover:underline">Genres</a>: Browse music and talk radio categories</li>
            <li><a href={`${baseUrl}/en/regions`} className="text-[#FF4199] hover:underline">Regions</a>: Browse stations by country</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-white">Information Pages</h3>
          <ul className="space-y-2 mb-6">
            <li><a href={`${baseUrl}/en/about`} className="text-[#FF4199] hover:underline">About</a>: About the platform</li>
            <li><a href={`${baseUrl}/en/contact`} className="text-[#FF4199] hover:underline">Contact</a>: Support and business inquiries</li>
            <li><a href={`${baseUrl}/en/privacy-policy`} className="text-[#FF4199] hover:underline">Privacy Policy</a>: Data protection and user privacy</li>
            <li><a href={`${baseUrl}/en/terms-and-conditions`} className="text-[#FF4199] hover:underline">Terms and Conditions</a>: Legal terms of service</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">Multilingual Architecture</h2>
          <p className="mb-4 text-gray-700 dark:text-gray-300">
            Language prefixes select a localized directory, not the station's country or broadcast language.
            These station URL patterns use a placeholder station slug:
          </p>
          <ul className="space-y-2 mb-6 text-gray-700 dark:text-gray-300">
            <li><strong>German:</strong> <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">/de/sender/station-name</code> (sender = station)</li>
            <li><strong>Turkish:</strong> <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">/tr/istasyon/station-name</code> (istasyon = station)</li>
            <li><strong>French:</strong> <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">/fr/station/station-name</code></li>
            <li><strong>Spanish:</strong> <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">/es/estacion/station-name</code> (estación = station)</li>
            <li><strong>Arabic:</strong> <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">/ar/mahta/station-name</code> (محطة = station)</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">Directory Languages</h2>
          <p className="mb-4 text-gray-700 dark:text-gray-300">
            The active sitemap language codes are:
          </p>
          <ul className="space-y-2 mb-6 text-gray-700 dark:text-gray-300">
            <li><code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">{ACTIVE_SITEMAP_LANGUAGES.join(", ")}</code></li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">Technical Details</h2>
          <ul className="space-y-2 mb-6 text-gray-700 dark:text-gray-300">
            <li><strong>Domain:</strong> themegaradio.com (canonical production domain)</li>
            <li><strong>Directories:</strong> Language-prefixed URLs with country and genre listings</li>
            <li><strong>Streaming:</strong> Browser playback; stream formats and availability depend on the broadcaster</li>
            <li><strong>Data Source:</strong> Radio-Browser API integration</li>
            <li><strong>Platform:</strong> React frontend, Node.js backend, PostgreSQL database</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">AI & Search Engine Access</h2>
          <p className="mb-4 text-gray-700 dark:text-gray-300">
            Search crawlers can access public pages subject to the site's robots.txt rules.
            The general rules include restrictions for private paths and known tracking queries.
          </p>
          <ul className="space-y-2 mb-6 text-gray-700 dark:text-gray-300">
            <li><strong>Search:</strong> OAI-SearchBot and bingbot follow the general public crawling rules.</li>
            <li><strong>Training preferences:</strong> GPTBot and Google-Extended are blocked in robots.txt.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 dark:text-white">Crawling and Content Use</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-8">
            Crawl access describes technical access only. It does not grant a content license or additional reuse rights.
            Search indexing, ranking, and citations are not guaranteed.
          </p>

          <div className="bg-gray-100 dark:bg-gray-900 p-6 rounded-lg mt-8 border border-gray-300 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Plain Text Version</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              For AI crawlers and machine-readable format:
            </p>
            <a 
              href="/llms.txt" 
              className="text-[#FF4199] hover:underline font-mono text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://themegaradio.com/llms.txt
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
