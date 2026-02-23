import { NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/clio';

/**
 * Clio connection status — shows whether Clio is connected
 * and provides authorization link if not
 */
export async function GET() {
  const hasRefreshToken = !!process.env.CLIO_REFRESH_TOKEN;
  const authUrl = getAuthorizationUrl();

  if (hasRefreshToken) {
    // Try a test API call
    try {
      const { clioGet } = await import('@/lib/clio');
      const data = await clioGet('/matters', { limit: '1', status: 'Open' }) as { meta?: { records?: number } };
      const count = data.meta?.records || 0;

      return new NextResponse(
        `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto;background:#FAFAFA">
          <div style="background:white;border:1px solid #E5E5EA;border-radius:16px;padding:32px">
            <h1 style="color:#34C759;margin-top:0">&#10003; Clio Connected</h1>
            <p style="color:#6E6E73">Clio API is working. Found ${count} open matters.</p>
            <div style="margin-top:20px">
              <a href="/api/clio/sync" style="display:inline-block;background:#1D1D1F;color:white;padding:10px 20px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600">Run Sync Now</a>
              <a href="${authUrl}" style="display:inline-block;margin-left:12px;background:#F5F5F7;color:#6E6E73;padding:10px 20px;border-radius:10px;text-decoration:none;font-size:13px">Re-authorize</a>
            </div>
          </div>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return new NextResponse(
        `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto;background:#FAFAFA">
          <div style="background:white;border:1px solid #E5E5EA;border-radius:16px;padding:32px">
            <h1 style="color:#FF9500;margin-top:0">&#9888; Clio Token Expired</h1>
            <p style="color:#6E6E73">Token needs to be refreshed. Error: ${message}</p>
            <a href="${authUrl}" style="display:inline-block;background:#1D1D1F;color:white;padding:10px 20px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;margin-top:12px">Re-authorize Clio</a>
          </div>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
  }

  // Not connected
  return new NextResponse(
    `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto;background:#FAFAFA">
      <div style="background:white;border:1px solid #E5E5EA;border-radius:16px;padding:32px">
        <h1 style="color:#FF3B30;margin-top:0">Clio Not Connected</h1>
        <p style="color:#6E6E73">Click below to authorize PinhoLaw Mission Control to access your Clio data.</p>
        <a href="${authUrl}" style="display:inline-block;background:#1D1D1F;color:white;padding:10px 20px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;margin-top:12px">Connect Clio</a>
      </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
