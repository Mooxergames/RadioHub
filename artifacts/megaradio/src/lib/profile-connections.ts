import type { CommunityProfile } from './community-profile';

export type ConnectionDirection = 'followers' | 'following';
export interface ConnectionPerson extends CommunityProfile { followersCount?: number }
export interface ConnectionPage {
  people: ConnectionPerson[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
export function connectionPage(value: unknown, direction: ConnectionDirection): ConnectionPage {
  const result = value as Record<string, any> | null;
  if (!result || !Array.isArray(result[direction]) || !result.pagination
    || !['page', 'limit', 'total', 'pages'].every(key => Number.isSafeInteger(result.pagination[key]) && result.pagination[key] >= 0)
    || result.pagination.page < 1 || result.pagination.limit < 1) throw new Error('Invalid connections response');
  return { people: result[direction].flatMap((entry: any) => typeof entry?.user?._id === 'string' && entry.user._id ? [entry.user] : []), pagination: result.pagination };
}

const keys = ['loading', 'error', 'emptyFollowers', 'emptyFollowing', 'more', 'remove', 'removed'] as const;
const rows: Record<string, string[]> = {
  en: ['Loading listeners…', 'Could not load listeners. Please try again.', 'No followers yet.', 'You are not following anyone yet.', 'See more', 'Remove', 'Follower removed.'],
  tr: ['Dinleyiciler yükleniyor…', 'Dinleyiciler yüklenemedi. Lütfen tekrar dene.', 'Henüz takipçin yok.', 'Henüz kimseyi takip etmiyorsun.', 'Daha fazla göster', 'Kaldır', 'Takipçi kaldırıldı.'],
  de: ['Hörer werden geladen…', 'Die Hörer konnten nicht geladen werden. Bitte versuche es erneut.', 'Noch keine Follower.', 'Du folgst noch niemandem.', 'Mehr anzeigen', 'Entfernen', 'Follower entfernt.'],
  es: ['Cargando oyentes…', 'No se pudieron cargar los oyentes. Inténtalo de nuevo.', 'Aún no tienes seguidores.', 'Aún no sigues a nadie.', 'Ver más', 'Eliminar', 'Seguidor eliminado.'],
  fr: ['Chargement des auditeurs…', 'Impossible de charger les auditeurs. Réessayez.', 'Vous n’avez pas encore d’abonnés.', 'Vous ne suivez encore personne.', 'Voir plus', 'Retirer', 'Abonné retiré.'],
  pt: ['Carregando ouvintes…', 'Não foi possível carregar os ouvintes. Tente novamente.', 'Você ainda não tem seguidores.', 'Você ainda não segue ninguém.', 'Ver mais', 'Remover', 'Seguidor removido.'],
  it: ['Caricamento degli ascoltatori…', 'Impossibile caricare gli ascoltatori. Riprova.', 'Non hai ancora follower.', 'Non segui ancora nessuno.', 'Mostra altro', 'Rimuovi', 'Follower rimosso.'],
  ru: ['Загрузка слушателей…', 'Не удалось загрузить слушателей. Попробуйте снова.', 'У вас пока нет подписчиков.', 'Вы пока ни на кого не подписаны.', 'Показать ещё', 'Удалить', 'Подписчик удалён.'],
  ar: ['جارٍ تحميل المستمعين…', 'تعذر تحميل المستمعين. حاول مرة أخرى.', 'ليس لديك متابعون بعد.', 'لا تتابع أي شخص بعد.', 'عرض المزيد', 'إزالة', 'تمت إزالة المتابع.'],
  zh: ['正在加载听众…', '无法加载听众，请重试。', '还没有关注者。', '你还没有关注任何人。', '显示更多', '移除', '已移除关注者。'],
  ja: ['リスナーを読み込み中…', 'リスナーを読み込めませんでした。もう一度お試しください。', 'まだフォロワーはいません。', 'まだ誰もフォローしていません。', 'もっと見る', '削除', 'フォロワーを削除しました。'],
  ko: ['청취자 불러오는 중…', '청취자를 불러올 수 없습니다. 다시 시도해 주세요.', '아직 팔로워가 없습니다.', '아직 아무도 팔로우하지 않습니다.', '더 보기', '삭제', '팔로워를 삭제했습니다.'],
  hi: ['श्रोता लोड हो रहे हैं…', 'श्रोता लोड नहीं हो सके। फिर से कोशिश करें।', 'अभी कोई फ़ॉलोअर नहीं है।', 'आप अभी किसी को फ़ॉलो नहीं करते।', 'और देखें', 'हटाएँ', 'फ़ॉलोअर हटा दिया गया।'],
  he: ['טוען מאזינים…', 'לא ניתן לטעון מאזינים. נסו שוב.', 'עדיין אין לך עוקבים.', 'עדיין אינך עוקב אחרי אף אחד.', 'הצגת עוד', 'הסרה', 'העוקב הוסר.'],
};
export function profileConnectionsCopy(language: string, translations?: Readonly<Record<string, string>>) {
  const locale = language.split('-')[0];
  const row = rows[locale] || rows.en;
  return Object.fromEntries(keys.map((key, index) => {
    const value = translations?.[`profile_connections_${key}`]?.trim();
    return [key, value && !(locale !== 'en' && value === rows.en[index]) ? value : row[index]];
  })) as Record<typeof keys[number], string>;
}
