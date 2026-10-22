import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  deepLink?: string | null;
}

/** Outcome per device token. `invalid` tokens should be deleted. */
export type SendOutcome = 'sent' | 'invalid' | 'retry' | 'failed';

export interface PushSender {
  send(message: PushMessage): Promise<SendOutcome>;
}

/** Maps FCM HTTP v1 error responses to what we should do with the token. */
export function classifyFcmError(status: number, errorCode: string | undefined): SendOutcome {
  if (status === 404 || errorCode === 'UNREGISTERED') return 'invalid';
  if (status === 400 && errorCode === 'INVALID_ARGUMENT') return 'invalid';
  if (status === 429 || status >= 500 || errorCode === 'UNAVAILABLE' || errorCode === 'INTERNAL' || errorCode === 'QUOTA_EXCEEDED') return 'retry';
  return 'failed';
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Firebase Cloud Messaging HTTP v1 with a service-account OAuth token (cached for its lifetime). */
export class FcmSender implements PushSender {
  private readonly account: ServiceAccount;
  private token?: { value: string; expiresAt: number };

  constructor(serviceAccountPath: string) {
    this.account = JSON.parse(readFileSync(serviceAccountPath, 'utf8')) as ServiceAccount;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const tokenUri = this.account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(this.account.private_key, 'RS256'));
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  async send(message: PushMessage): Promise<SendOutcome> {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.deepLink ? { url: message.deepLink } : undefined,
          android: { priority: 'HIGH', notification: { channel_id: 'default' } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res) return 'retry';
    if (res.ok) return 'sent';
    let code: string | undefined;
    try {
      const err = (await res.json()) as { error?: { details?: { errorCode?: string }[]; status?: string } };
      code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status;
    } catch {
      code = undefined;
    }
    return classifyFcmError(res.status, code);
  }
}

/** Development sender: logs instead of contacting Google. */
export class LogSender implements PushSender {
  async send(message: PushMessage): Promise<SendOutcome> {
    console.log(JSON.stringify({ level: 'info', msg: 'push (dry run)', token: `${message.token.slice(0, 8)}…`, title: message.title }));
    return 'sent';
  }
}
