import net, { type LookupFunction } from 'node:net'
import { lookup } from 'node:dns/promises'
import { Agent, type Dispatcher } from 'undici'
import { createFailureRecord, type FailureRecord } from '@/lib/errors/failure'
import { EXTERNAL_OPERATION } from '@/lib/external-operation/registry'

const DEFAULT_MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const TRUSTED_DNS_JSON_ENDPOINT = 'https://cloudflare-dns.com/dns-query'
const MAX_DNS_JSON_BYTES = 64 * 1024

type RequestInitWithDispatcher = RequestInit & {
  dispatcher: Dispatcher
}

type ResolvedAddress = {
  readonly address: string
  readonly family: 4 | 6
}

export type OutboundMediaSecurityErrorCode =
  | 'OUTBOUND_MEDIA_URL_INVALID'
  | 'OUTBOUND_MEDIA_URL_UNSAFE'
  | 'OUTBOUND_MEDIA_DNS_FAILED'
  | 'OUTBOUND_MEDIA_REDIRECT_LIMIT'

export class OutboundMediaSecurityError extends Error {
  readonly code: OutboundMediaSecurityErrorCode
  readonly url: string
  override readonly cause?: unknown
  readonly failure: FailureRecord

  constructor(
    code: OutboundMediaSecurityErrorCode,
    url: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'OutboundMediaSecurityError'
    this.code = code
    this.url = url
    this.cause = cause
    this.failure = createFailureRecord('INVALID_PARAMS', message, {
      cause: {
        name: this.name,
        message,
        code,
        cause,
      },
      details: { reasonCode: code },
      context: { system: 'application', phase: 'outbound-media-policy' },
      operation: EXTERNAL_OPERATION.MEDIA_DOWNLOAD_POLICY,
    })
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const values = parts.map((part) => Number(part))
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null
  }
  return (
    ((values[0] << 24) >>> 0)
    + (values[1] << 16)
    + (values[2] << 8)
    + values[3]
  ) >>> 0
}

function isIpv4InRange(ip: string, base: string, maskBits: number): boolean {
  const ipValue = ipv4ToInt(ip)
  const baseValue = ipv4ToInt(base)
  if (ipValue === null || baseValue === null) return false
  const mask = maskBits === 0
    ? 0
    : (0xffffffff << (32 - maskBits)) >>> 0
  return (ipValue & mask) === (baseValue & mask)
}

export function isPrivateOrReservedOutboundIp(input: string): boolean {
  const ip = input.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  const family = net.isIP(ip)
  if (family === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.88.99.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
      ['255.255.255.255', 32],
    ].some(([base, maskBits]) => (
      isIpv4InRange(ip, String(base), Number(maskBits))
    ))
  }
  if (family === 6) {
    if (ip === '::' || ip === '::1') return true
    if (ip.startsWith('::ffff:')) return true
    if (/^(fc|fd)/.test(ip)) return true
    if (/^fe[89ab]/.test(ip) || ip.startsWith('fec') || ip.startsWith('fed') || ip.startsWith('fee') || ip.startsWith('fef')) {
      return true
    }
    if (ip.startsWith('ff')) return true
    if (ip.startsWith('100:')) return true
    if (ip.startsWith('2001:db8')) return true
    if (ip.startsWith('2001:2:') || ip.startsWith('2001:10:') || ip.startsWith('2001:20:')) {
      return true
    }
    return false
  }
  return true
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === 'metadata'
    || normalized === 'metadata.internal'
    || normalized === 'metadata.google.internal'
}

function parseOutboundMediaUrl(input: string | URL): URL {
  let url: URL
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input)
  } catch {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_URL_INVALID',
      String(input),
      'outbound media URL is invalid',
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_URL_INVALID',
      url.toString(),
      `outbound media URL protocol is not allowed: ${url.protocol}`,
    )
  }
  if (url.username || url.password) {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_URL_UNSAFE',
      url.toString(),
      'outbound media URL credentials are not allowed',
    )
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (isBlockedHostname(hostname) || (net.isIP(hostname) && isPrivateOrReservedOutboundIp(hostname))) {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_URL_UNSAFE',
      url.toString(),
      `outbound media URL hostname is not allowed: ${hostname}`,
    )
  }
  return url
}

function normalizeLookupAddresses(value: unknown): ResolvedAddress[] {
  const candidates = Array.isArray(value) ? value : [value]
  return candidates.flatMap((candidate): ResolvedAddress[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const record = candidate as { address?: unknown; family?: unknown }
    if (typeof record.address !== 'string') return []
    const family = record.family === 4 || record.family === 6
      ? record.family
      : net.isIP(record.address)
    if (family !== 4 && family !== 6) return []
    return [{ address: record.address, family }]
  })
}

function isTransparentProxyFakeIp(address: string): boolean {
  return net.isIP(address) === 4
    && isIpv4InRange(address, '198.18.0.0', 15)
}

async function resolveAddressesThroughTrustedDns(
  hostname: string,
  family?: number,
): Promise<ResolvedAddress[]> {
  const recordTypes = family === 4 ? ['A'] : family === 6 ? ['AAAA'] : ['A', 'AAAA']
  const results = await Promise.allSettled(recordTypes.map(async (recordType) => {
    const url = new URL(TRUSTED_DNS_JSON_ENDPOINT)
    url.searchParams.set('name', hostname)
    url.searchParams.set('type', recordType)
    const response = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      throw new Error(`trusted DNS returned ${String(response.status)}`)
    }
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DNS_JSON_BYTES) {
      throw new Error('trusted DNS response is too large')
    }
    const body = await response.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_DNS_JSON_BYTES) {
      throw new Error('trusted DNS response is too large')
    }
    const parsed = JSON.parse(body) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const answers = (parsed as { Answer?: unknown }).Answer
    if (!Array.isArray(answers)) return []
    return answers.flatMap((answer): ResolvedAddress[] => {
      if (!answer || typeof answer !== 'object') return []
      const record = answer as { type?: unknown; data?: unknown }
      if (typeof record.data !== 'string') return []
      const addressFamily = net.isIP(record.data)
      if (
        (record.type !== 1 && record.type !== 28)
        || (addressFamily !== 4 && addressFamily !== 6)
      ) {
        return []
      }
      return [{ address: record.data, family: addressFamily }]
    })
  }))
  return results.flatMap((result) => (
    result.status === 'fulfilled' ? result.value : []
  ))
}

async function resolvePublicAddresses(hostname: string, family?: number): Promise<ResolvedAddress[]> {
  let result: unknown
  try {
    result = await lookup(hostname, {
      all: true,
      verbatim: true,
      ...(family === 4 || family === 6 ? { family } : {}),
    })
  } catch (error) {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_DNS_FAILED',
      hostname,
      `outbound media DNS lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      error,
    )
  }
  let addresses = normalizeLookupAddresses(result)
  if (addresses.some((candidate) => isTransparentProxyFakeIp(candidate.address))) {
    addresses = await resolveAddressesThroughTrustedDns(hostname, family)
  }
  if (addresses.length === 0) {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_DNS_FAILED',
      hostname,
      'outbound media DNS lookup returned no addresses',
    )
  }
  const unsafe = addresses.find((candidate) => isPrivateOrReservedOutboundIp(candidate.address))
  if (unsafe) {
    throw new OutboundMediaSecurityError(
      'OUTBOUND_MEDIA_URL_UNSAFE',
      hostname,
      `outbound media URL resolved to a private or reserved address: ${unsafe.address}`,
    )
  }
  return addresses
}

export async function assertSafeOutboundMediaUrl(input: string | URL): Promise<URL> {
  const url = parseOutboundMediaUrl(input)
  const hostname = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!net.isIP(hostname)) {
    await resolvePublicAddresses(hostname)
  }
  return url
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  const family = options.family === 4 || options.family === 'IPv4'
    ? 4
    : options.family === 6 || options.family === 'IPv6'
      ? 6
      : undefined
  void resolvePublicAddresses(hostname, family).then(
    (addresses) => {
      if (options.all) {
        callback(null, addresses.map((candidate) => ({
          address: candidate.address,
          family: candidate.family,
        })))
        return
      }
      const address = addresses[0]
      callback(null, address.address, address.family)
    },
    (error: unknown) => {
      const lookupError = error instanceof Error ? error : new Error('outbound media DNS lookup failed')
      callback(lookupError as NodeJS.ErrnoException, '', 0)
    },
  )
}

const safeOutboundDispatcher = new Agent({
  connect: {
    lookup: safeLookup,
  },
})

/** Credential-bearing custom API requests never follow redirects, including 307/308. */
export const fetchSafeProviderRequest: typeof fetch = async (input, init) => {
  const url = await assertSafeOutboundMediaUrl(input instanceof Request ? input.url : input)
  if (url.protocol !== 'https:' || url.searchParams.has('key')) {
    throw new Error('CUSTOM_API_HTTPS_HEADER_AUTH_REQUIRED')
  }
  const requestInit: RequestInitWithDispatcher = {
    ...init,
    redirect: 'error',
    dispatcher: safeOutboundDispatcher,
  }
  const response = await fetch(input, requestInit)
  if (response.ok) return response
  // A third-party error page may echo credentials. Remove their exact values
  // before SDK exceptions or application failure records can retain that page.
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  const secrets = ['authorization', 'x-api-key', 'x-goog-api-key'].flatMap((name) => {
    const value = headers.get(name)
    return value ? [value, value.replace(/^Bearer\s+/i, '')] : []
  }).filter(Boolean)
  const reader = response.body?.getReader()
  let length = 0
  const chunks: Uint8Array[] = []
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        length += next.value.length
        if (length > 64 * 1024) throw new Error('CUSTOM_PROVIDER_ERROR_BODY_TOO_LARGE')
        chunks.push(next.value)
      }
    } finally { await reader.cancel().catch(() => undefined) }
  }
  const redact = (value: string) => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value)
  const safeHeaders = new Headers()
  for (const name of ['content-type', 'retry-after', 'x-request-id', 'x-oai-request-id']) {
    const value = response.headers.get(name)
    if (value) safeHeaders.set(name, redact(value))
  }
  return new Response(redact(Buffer.concat(chunks).toString('utf8')), { status: response.status, headers: safeHeaders })
}

function redirectHeaders(headers: Headers, from: URL, to: URL): Headers {
  const next = new Headers(headers)
  if (from.origin !== to.origin) {
    next.delete('authorization')
    next.delete('cookie')
    next.delete('proxy-authorization')
  }
  return next
}

export async function fetchSafeOutboundMedia(
  input: string | URL,
  options: {
    readonly headers?: HeadersInit
    readonly maxRedirects?: number
    readonly signal?: AbortSignal
  } = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new Error('OUTBOUND_MEDIA_REDIRECT_LIMIT_INVALID')
  }

  let currentUrl = await assertSafeOutboundMediaUrl(input)
  let headers = new Headers(options.headers)
  for (let redirectCount = 0; ; redirectCount += 1) {
    const requestInit: RequestInitWithDispatcher = {
      method: 'GET',
      headers,
      redirect: 'manual',
      dispatcher: safeOutboundDispatcher,
      signal: options.signal,
    }
    const response = await fetch(currentUrl, requestInit)
    if (!REDIRECT_STATUSES.has(response.status)) return response

    const location = response.headers.get('location')
    if (!location) return response
    if (redirectCount >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined)
      throw new OutboundMediaSecurityError(
        'OUTBOUND_MEDIA_REDIRECT_LIMIT',
        currentUrl.toString(),
        `outbound media redirect limit exceeded: ${String(maxRedirects)}`,
      )
    }

    const nextUrl = await assertSafeOutboundMediaUrl(new URL(location, currentUrl))
    await response.body?.cancel().catch(() => undefined)
    headers = redirectHeaders(headers, currentUrl, nextUrl)
    currentUrl = nextUrl
  }
}
