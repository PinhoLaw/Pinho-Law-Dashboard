import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/clio';

/**
 * Clio OAuth2 callback handler
 * After user authorizes in Clio, they're redirected here with ?code=...
 * We exchange the code for tokens and display them for manual env var setup
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
        <h1 style="color:#FF3B30">Clio Authorization Failed</h1>
        <p>${error}</p>
        <a href="/api/clio/status">Try again</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (!code) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
        <h1 style="color:#FF3B30">Missing Authorization Code</h1>
        <p>No code received from Clio. <a href="/api/clio/status">Try again</a></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    const token = await exchangeCodeForToken(code);

    // Return HTML page showing the tokens
    // In production, you'd save these to Vercel env vars automatically
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:700px;margin:0 auto;background:#FAFAFA">
        <div style="background:white;border:1px solid #E5E5EA;border-radius:16px;padding:32px">
          <h1 style="color:#34C759;margin-top:0">&#10003; Clio Connected!</h1>
          <p style="color:#6E6E73">Your Clio account has been authorized. Copy these tokens and set them as Vercel environment variables:</p>

          <div style="margin:20px 0">
            <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#98989D;margin-bottom:4px">CLIO_ACCESS_TOKEN</label>
            <textarea readonly style="width:100%;height:60px;font-family:monospace;font-size:11px;padding:8px;border:1px solid #E5E5EA;border-radius:8px;resize:none">${token.access_token}</textarea>
          </div>

          <div style="margin:20px 0">
            <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#98989D;margin-bottom:4px">CLIO_REFRESH_TOKEN</label>
            <textarea readonly style="width:100%;height:60px;font-family:monospace;font-size:11px;padding:8px;border:1px solid #E5E5EA;border-radius:8px;resize:none">${token.refresh_token}</textarea>
          </div>

          <div style="margin:20px 0">
            <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;color:#98989D;margin-bottom:4px">Token Expires</label>
            <p style="font-family:monospace;font-size:13px">${new Date(token.expires_at).toISOString()}</p>
          </div>

          <div style="background:#F5F5F7;border-radius:12px;padding:16px;margin-top:24px">
            <p style="margin:0;font-size:13px;color:#6E6E73">
              <strong>Next steps:</strong><br>
              1. The tokens above have been received<br>
              2. Set CLIO_ACCESS_TOKEN and CLIO_REFRESH_TOKEN in Vercel env vars<br>
              3. Redeploy the dashboard<br>
              4. Visit <a href="/api/clio/sync">/api/clio/sync</a> to sync data from Clio
            </p>
          </div>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
        <h1 style="color:#FF3B30">Token Exchange Failed</h1>
        <p style="font-family:monospace;font-size:12px;background:#F5F5F7;padding:12px;border-radius:8px">${message}</p>
        <a href="/api/clio/status">Try again</a>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
