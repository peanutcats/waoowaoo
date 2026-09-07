import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lookup } from 'node:dns/promises'
import { fetchSafeProviderRequest } from '@/lib/media/outbound-fetch'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(Response.json({ data: [] }))
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
})
afterEach(() => vi.unstubAllGlobals())

describe('custom credential destination security', () => {
  it.each(['https://localhost/v1', 'https://127.0.0.1/v1', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/v1', 'http://public.example/v1'])('rejects %s before sending credentials', async (url) => {
    await expect(fetchSafeProviderRequest(url, { headers: { authorization: 'Bearer unit-test' } })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects a public hostname resolving to a private address', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as never)
    await expect(fetchSafeProviderRequest('https://public.example/v1')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('pins safe DNS lookup and forbids redirects even if a caller asks to follow them', async () => {
    await fetchSafeProviderRequest('https://public.example/v1', { method: 'POST', body: '{}', redirect: 'follow', headers: { authorization: 'Bearer unit-test' } })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}', redirect: 'error', dispatcher: expect.any(Object) })
  })
  it('redacts an echoed key before an SDK can put it in an exception', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'invalid test-private-value' } }, { status: 401 }))
    const result = await fetchSafeProviderRequest('https://public.example/v1', { headers: { 'x-api-key': 'test-private-value' } })
    expect(result.status).toBe(401)
    expect(await result.text()).toContain('[redacted]')
  })
})
