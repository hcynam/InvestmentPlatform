import { Webhook } from 'standardwebhooks'

declare const process: { env: Record<string, string | undefined> }

interface FunctionEvent {
  httpMethod?: string
  body?: string | null
  isBase64Encoded?: boolean
  headers?: Record<string, string | undefined>
}

interface SendSmsPayload {
  user?: { phone?: unknown }
  sms?: { otp?: unknown; message?: unknown }
}

interface KavenegarResponse {
  return?: { status?: number }
  entries?: unknown[]
}

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export async function handler(event: FunctionEvent) {
  if (event.httpMethod !== 'POST') {
    return json(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are accepted.', { Allow: 'POST' })
  }

  const apiKey = process.env.KAVENEGAR_API_KEY?.trim()
  const hookSecret = process.env.SUPABASE_SMS_HOOK_SECRET?.trim()
  const sender = process.env.KAVENEGAR_SENDER?.trim()
  const missingEnv = [
    !apiKey ? 'KAVENEGAR_API_KEY' : null,
    !hookSecret ? 'SUPABASE_SMS_HOOK_SECRET' : null,
  ].filter(Boolean)
  if (missingEnv.length > 0) {
    logError('configuration', { code: 'MISSING_ENVIRONMENT_VARIABLE', missingEnv })
    return json(503, 'SMS_SERVICE_NOT_CONFIGURED', 'SMS delivery is not configured.')
  }

  const rawBody = readRawBody(event)
  if (!rawBody || rawBody.length > 64_000) {
    return json(400, 'INVALID_PAYLOAD', 'The hook payload is invalid.')
  }

  const signature = getHeader(event.headers, 'x-supabase-signature')
    ?? getHeader(event.headers, 'webhook-signature')
  const webhookId = getHeader(event.headers, 'webhook-id')
    ?? getHeader(event.headers, 'x-supabase-webhook-id')
  const webhookTimestamp = getHeader(event.headers, 'webhook-timestamp')
    ?? getHeader(event.headers, 'x-supabase-webhook-timestamp')

  let payload: SendSmsPayload
  try {
    const verifier = new Webhook(normalizeHookSecret(hookSecret))
    payload = verifier.verify(rawBody, {
      'webhook-id': webhookId ?? '',
      'webhook-timestamp': webhookTimestamp ?? '',
      'webhook-signature': signature ?? '',
    }) as SendSmsPayload
  } catch (error) {
    logError('signature', { error: errorName(error) })
    return json(401, 'INVALID_SIGNATURE', 'The hook signature is invalid.')
  }

  const receptor = normalizeIranianPhone(payload.user?.phone)
  const otp = normalizeOtp(payload.sms?.otp)
  const message = normalizeMessage(payload.sms?.message) ?? (otp ? `کد ورود به مارکت پایلوت: ${otp}` : null)
  if (!receptor || !otp || !message) {
    logError('payload', { code: 'INVALID_PHONE_OR_OTP' })
    return json(422, 'INVALID_SMS_PAYLOAD', 'The phone number or OTP is invalid.')
  }

  const url = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`)
  url.searchParams.set('receptor', receptor)
  url.searchParams.set('message', message)
  if (sender) url.searchParams.set('sender', sender)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4_000),
    })
    const providerBody = await response.json().catch(() => null) as KavenegarResponse | null
    const providerStatus = Number(providerBody?.return?.status)
    const sent = response.ok && providerStatus === 200 && Array.isArray(providerBody?.entries)

    if (!sent) {
      logError('provider', { httpStatus: response.status, providerStatus })
      return json(502, 'SMS_PROVIDER_FAILED', 'The SMS provider rejected the request.')
    }

    return { statusCode: 200, headers: responseHeaders, body: '{}' }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    logError('provider_request', { error: errorName(error), timedOut })
    return json(
      timedOut ? 504 : 502,
      timedOut ? 'SMS_PROVIDER_TIMEOUT' : 'SMS_PROVIDER_UNAVAILABLE',
      timedOut ? 'The SMS provider timed out.' : 'The SMS provider is unavailable.',
    )
  }
}

function readRawBody(event: FunctionEvent): string {
  if (!event.body) return ''
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
}

function normalizeHookSecret(value: string): string {
  return value.replace(/^v1,/, '')
}

function normalizeIranianPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  let local = digits
  if (digits.startsWith('0098')) local = `0${digits.slice(4)}`
  else if (digits.startsWith('98')) local = `0${digits.slice(2)}`
  else if (digits.length === 10 && digits.startsWith('9')) local = `0${digits}`
  return /^09\d{9}$/.test(local) ? local : null
}

function normalizeOtp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const otp = String(value).trim()
  return /^\d{4,10}$/.test(otp) ? otp : null
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const message = value.trim()
  return message && message.length <= 500 ? message : null
}

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string | null {
  if (!headers) return null
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name)
  return key ? headers[key]?.trim() || null : null
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError'
}

function logError(stage: string, details: Record<string, unknown>): void {
  console.error('MarketPilot SMS hook error', { stage, ...details })
}

function json(statusCode: number, code: string, message: string, headers: Record<string, string> = {}) {
  return {
    statusCode,
    headers: { ...responseHeaders, ...headers },
    body: JSON.stringify({ error: { http_code: statusCode, code, message } }),
  }
}
