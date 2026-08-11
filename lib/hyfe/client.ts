import { FlowHttpError } from '@/lib/http';
import type { FlowState } from '@/lib/flow-state';
import { firstValue, findNumberCandidates, safeExcerpt } from './response';
import { DEFAULT_CHANNEL_ID, getHyfeConfig } from './config';
import type { NumberCandidate } from './types';

type Fetcher = typeof fetch;

type RequestOptions = {
  headers?: HeadersInit;
  body?: unknown;
  expectJson?: boolean;
  allowedStatuses?: number[];
  finalSubmit?: boolean;
};

export type NumberSearchInput = {
  prefix: string;
  pattern: string;
  pageSize: number;
};

export type FinalSubmitInput = {
  encryptedMsisdn: string;
  fullName: string;
  whatsapp: string;
  email: string;
  eid: string;
  otp: string;
  captcha: string;
};

type RequestResult = {
  response: Response;
  data: unknown;
};

export class HyfeClient {
  private readonly config = getHyfeConfig();

  constructor(
    private readonly state: FlowState,
    private readonly fetcher: Fetcher = fetch,
    private readonly random: () => number = Math.random,
  ) {}

  async bootstrap(): Promise<FlowState> {
    await this.request('GET', this.config.pageUrl, {
      expectJson: false,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    await this.request('POST', `${this.config.baseUrl}/hyfe-apply/api/auth`, {
      expectJson: false,
    });

    const token = this.state.upstreamCookies.token;
    if (!token) {
      throw new FlowHttpError(
        'upstream',
        "Cookie sesi layanan ('token') tidak ditemukan. Silakan mulai ulang proses.",
      );
    }

    const { data } = await this.request('GET', `${this.config.apiUrl}/hyfe/v1/session`, {
      headers: this.apiHeaders({ bearerToken: token }),
    });
    const csrf = firstValue(data, ['result', 'csrfToken'], ['result', 'data', 'csrfToken'], ['csrfToken']);
    if (typeof csrf !== 'string' || !csrf) {
      throw new FlowHttpError('upstream', 'CSRF token tidak ditemukan pada respons sesi layanan.');
    }

    this.state.token = token;
    this.state.csrf = csrf;
    return this.state;
  }

  async findNumbers(input: NumberSearchInput): Promise<{
    candidates: NumberCandidate[];
    noMatch: boolean;
    pageNo: number;
  }> {
    const { token, csrf } = this.requireState('token', 'csrf');
    const pageNo = input.pattern ? 1 : Math.floor(this.random() * 496) + 5;
    const { response, data } = await this.request(
      'POST',
      `${this.config.apiUrl}/hyfe/v1/msisdn/findResources?page=1`,
      {
        allowedStatuses: [404],
        headers: this.apiHeaders({ bearerToken: token, csrfToken: csrf }),
        body: {
          prefixNiceNumber: input.prefix,
          pattern: input.pattern,
          minPrice: '0',
          maxPrice: '0',
          count: '1',
          channel: 'webprio',
          otp: '',
          operatorId: 'webuser-thread01',
          pageNo,
          pageSize: input.pageSize,
          suggestion: false,
        },
      },
    );

    const statusCode = isRecord(data) ? data.statusCode : undefined;
    const errorCode = firstValue(data, ['result', 'errorCode']);
    const noMatch = response.status === 404 && String(statusCode) === '404' && String(errorCode) === '10';
    if (response.status === 404 && !noMatch) {
      throw new FlowHttpError('upstream', 'Endpoint pencarian mengembalikan respons 404 yang tidak dikenali.');
    }

    return { candidates: noMatch ? [] : findNumberCandidates(data), noMatch, pageNo };
  }

  async createConsent(email: string): Promise<FlowState> {
    const { token, csrf } = this.requireState('token', 'csrf');
    const { data: tncData } = await this.request('POST', `${this.config.apiUrl}/comet/v1/tnc/tncToken`, {
      headers: this.apiHeaders({ bearerToken: token, csrfToken: csrf }),
      body: {},
    });
    const tncToken = firstValue(tncData, ['result', 'data', 'access_token'], ['data', 'access_token']);
    if (typeof tncToken !== 'string' || !tncToken) {
      throw new FlowHttpError('upstream', 'Token persetujuan TNC tidak ditemukan pada respons layanan.');
    }

    const { data: optInData } = await this.request('POST', `${this.config.apiUrl}/comet/v1/tnc/optIn`, {
      headers: this.apiHeaders({ rawAuthorization: tncToken, csrfToken: csrf }),
      body: { type: 'email', channelId: DEFAULT_CHANNEL_ID, msisdn: email, status: 2 },
    });
    const consentId = firstValue(optInData, ['result', 'data', 'consentId'], ['data', 'consentId']);
    if (typeof consentId !== 'string' || !consentId) {
      throw new FlowHttpError('upstream', 'ID persetujuan tidak ditemukan pada respons layanan.');
    }

    this.state.tncToken = tncToken;
    this.state.consentId = consentId;
    return this.state;
  }

  async sendOtp(email: string, fullName: string): Promise<void> {
    const { token, csrf } = this.requireState('token', 'csrf');
    await this.request('POST', `${this.config.apiUrl}/hyfe/v1/esim/freeTrial/send-otp`, {
      headers: this.apiHeaders({ bearerToken: token, csrfToken: csrf }),
      body: { email, name: fullName },
    });
  }

  async submit(input: FinalSubmitInput): Promise<unknown> {
    const { token, csrf, tncToken, consentId } = this.requireState('token', 'csrf', 'tncToken', 'consentId');
    const { data } = await this.request('POST', `${this.config.apiUrl}/hyfe/v1/esim/freeTrial/validateAndSubmit`, {
      finalSubmit: true,
      headers: this.apiHeaders({ bearerToken: token, csrfToken: csrf, tncToken }),
      body: {
        token: input.captcha,
        otpCode: input.otp,
        consentId,
        msisdn: input.encryptedMsisdn,
        eid: input.eid,
        channel: 'EVENT',
        customerInfo: {
          title: 'Sdr.',
          firstName: input.fullName,
          middleName: '',
          lastName: '',
          contactNumber: `62${input.whatsapp}`,
          email: input.email,
        },
      },
    });
    return data;
  }

  private requireState(...keys: Array<'token' | 'csrf' | 'tncToken' | 'consentId'>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = this.state[key];
      if (!value) {
        throw new FlowHttpError('conflict', 'Sesi belum berada pada tahap yang diperlukan. Mulai ulang proses.', 409);
      }
      result[key] = value;
    }
    return result;
  }

  private apiHeaders({
    bearerToken,
    rawAuthorization,
    csrfToken,
    tncToken,
  }: {
    bearerToken?: string;
    rawAuthorization?: string;
    csrfToken?: string;
    tncToken?: string;
  }): HeadersInit {
    const headers: Record<string, string> = {
      Origin: this.config.baseUrl,
      Referer: this.config.pageUrl,
      requestid: this.state.requestId,
    };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    if (rawAuthorization) headers.Authorization = rawAuthorization;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (tncToken) headers.tokentnc = tncToken;
    return headers;
  }

  private async request(method: string, url: string, options: RequestOptions = {}): Promise<RequestResult> {
    const timeoutMs = options.finalSubmit ? 60_000 : 30_000;
    const headers = new Headers({
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'User-Agent': 'HYFE-eSIM-Web/1.0',
    });
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    const cookieHeader = Object.entries(this.state.upstreamCookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookieHeader) headers.set('Cookie', cookieHeader);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      if (timedOut && options.finalSubmit) {
        throw new FlowHttpError(
          'timeout',
          'Submit final melewati batas waktu. Permintaan tidak dicoba ulang; periksa status di layanan resmi sebelum memulai sesi baru.',
          504,
        );
      }
      if (timedOut) {
        throw new FlowHttpError('timeout', `Request ke layanan melebihi batas waktu.`, 504);
      }
      throw new FlowHttpError('upstream', 'Request ke layanan resmi gagal. Periksa koneksi lalu mulai ulang sesi.');
    }

    this.captureCookies(response.headers);
    const rawBody = await response.text();
    const allowedStatuses = new Set(options.allowedStatuses ?? []);
    if (!response.ok && !allowedStatuses.has(response.status)) {
      throw new FlowHttpError('upstream', `Layanan merespons HTTP ${response.status}. ${safeExcerpt(rawBody)}`, 502);
    }
    if (options.expectJson === false) {
      return { response, data: undefined };
    }
    try {
      return { response, data: JSON.parse(rawBody) };
    } catch {
      const contentType = response.headers.get('content-type') || 'tidak diketahui';
      throw new FlowHttpError(
        'upstream',
        `Respons dari layanan bukan JSON (Content-Type: ${contentType}). ${safeExcerpt(rawBody)}`,
      );
    }
  }

  private captureCookies(headers: Headers): void {
    const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
    const rawCookies = extendedHeaders.getSetCookie?.() ?? splitSetCookie(headers.get('set-cookie'));
    for (const rawCookie of rawCookies) {
      const [nameValue] = rawCookie.split(';');
      const separator = nameValue.indexOf('=');
      if (separator > 0) {
        this.state.upstreamCookies[nameValue.slice(0, separator).trim()] = nameValue.slice(separator + 1).trim();
      }
    }
  }
}

function splitSetCookie(header: string | null): string[] {
  if (!header) return [];
  return header.split(/,(?=[^;,]+=)/);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
