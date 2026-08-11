export const DEFAULT_BASE_URL = 'https://prioritas.xl.co.id';
export const DEFAULT_API_URL = 'https://jupiter-ms-webprio-v2.ext.dp.xl.co.id';
export const DEFAULT_PAGE_PATH = '/hyfe-apply/esim-trial';
export const DEFAULT_CHANNEL_ID = '7c93208a-6a17-462d-933b-73492818ce01';

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getHyfeConfig(): { baseUrl: string; apiUrl: string; pageUrl: string } {
  const baseUrl = withoutTrailingSlash(process.env.HYFE_BASE_URL || DEFAULT_BASE_URL);
  const apiUrl = withoutTrailingSlash(process.env.HYFE_API_URL || DEFAULT_API_URL);
  return { baseUrl, apiUrl, pageUrl: `${baseUrl}${DEFAULT_PAGE_PATH}` };
}
