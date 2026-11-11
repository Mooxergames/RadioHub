import { apiFetch } from './queryClient';

export function confirmSitemapRebuild(result: any) {
  if (result?.built !== true || !Array.isArray(result.qualifiedLanguages) || !result.qualifiedLanguages.length ||
      result.qualifiedLanguages.some((language: unknown) => typeof language !== 'string' || !language.trim()) ||
      !Number.isInteger(result.activatedCount) || result.activatedCount < 0) {
    throw new Error(result?.skippedReason === 'build-in-progress'
      ? 'Başka bir sitemap derlemesi sürüyor. Bu istek tamamlanmadı; işlem bittikten sonra yeniden deneyin.'
      : 'Sitemap derlemesi tamamlanmadı. Mevcut sitemap korundu; daha sonra yeniden kontrol edin.');
  }
  return result;
}

export async function rebuildAdminSitemap() {
  const response = await apiFetch('/api/admin/sitemap/rebuild', { method: 'POST' });
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`Sitemap sunucusundan geçerli yanıt alınamadı (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(typeof result?.message === 'string' ? result.message : `Sitemap derlemesi başarısız (HTTP ${response.status}).`);
  return confirmSitemapRebuild(result);
}
