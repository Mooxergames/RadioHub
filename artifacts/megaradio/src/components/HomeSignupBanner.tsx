import { Link } from 'wouter';
import { useSeoRouting } from '@/hooks/useSeoRouting';
import { useTranslation } from '@/hooks/useTranslation';
import './home-signup-banner.css';

export default function HomeSignupBanner() {
  const { t } = useTranslation();
  const { getLocalizedUrl } = useSeoRouting();

  return (
    <div className="home-signup-banner" data-testid="signup-banner">
      <div className="home-signup-banner__copy">
        <h2 className="home-signup-banner__title">{t('sign_up_for_more_features', 'Sign up for more features')}</h2>
        <p>{t('favorites_recording_statistics_and_more', 'Favorites, recording, statistics and more')}</p>
        <Link href={getLocalizedUrl('/signup')} className="home-signup-banner__button" data-testid="signup-banner-button">
          {t('sign_up', 'Sign Up')}
        </Link>
      </div>
      <picture>
        <source
          type="image/webp"
          srcSet="/images/signup-listener-420w.webp 420w, /images/signup-listener-840w.webp 840w, /images/signup-listener-1312w.webp 1312w"
          sizes="(max-width: 639px) 210px, (max-width: 767px) calc(36vw - 17.28px), (max-width: 1023px) calc(36vw - 23.04px), (max-width: 1279px) calc(30.8458vw - 29.612px), (max-width: 1511px) calc(30.8458vw - 49.353px), 372px"
        />
        <img
          src="/images/signup-listener.png"
          width={1312}
          height={1592}
          alt=""
          loading="lazy"
          decoding="async"
          className="home-signup-banner__image"
        />
      </picture>
    </div>
  );
}
