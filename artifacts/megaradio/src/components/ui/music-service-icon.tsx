/** Original 26px Figma artwork shared by the mini player and station details. */
export default function MusicServiceIcon({ service }: { service: 'youtube' | 'spotify' | 'deezer' }) {
  if (service === 'deezer') {
    return <span className="relative block h-[26px] w-[26px]">
      <img src="/icons/mini-player/deezer-background.svg" alt="Deezer" />
      <img className="absolute left-[5px] top-[7px]" src="/icons/mini-player/deezer-mark.svg" alt="" aria-hidden="true" />
    </span>;
  }

  return <img src={`/icons/mini-player/${service}.svg`} alt={service === 'youtube' ? 'YouTube' : 'Spotify'} />;
}
