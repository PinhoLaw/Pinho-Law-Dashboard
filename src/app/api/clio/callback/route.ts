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

    // Auto-save tokens to Vercel env vars
    const vercelToken = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID || 'prj_2iWSbUTIO4gunWAdv4Q117ymiJFh';
    const teamId = process.env.VERCEL_TEAM_ID || 'team_qg96of57kJvRgm9pTh8wpDor';
    let savedToVercel = false;

    if (vercelToken) {
      try {
        // Save access token
        await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'CLIO_ACCESS_TOKEN', value: token.access_token, type: 'encrypted', target: ['production', 'preview'] }),
        });
        // Save refresh token
        await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'CLIO_REFRESH_TOKEN', value: token.refresh_token, type: 'encrypted', target: ['production', 'preview'] }),
        });
        savedToVercel = true;
      } catch { /* ignore auto-save errors */ }
    }

    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:700px;margin:0 auto;background:#FAFAFA">
        <div style="background:white;border:1px solid #E5E5EA;border-radius:16px;padding:32px">
          <h1 style="color:#34C759;margin-top:0">&#10003; Clio Connected!</h1>
          <p style="color:#6E6E73">Your Clio account has been authorized successfully.</p>

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

          ${savedToVercel ? '<div style="background:#E8F5E9;border-radius:12px;padding:16px;margin-top:24px"><p style="margin:0;font-size:13px;color:#2E7D32"><strong>&#10003; Tokens auto-saved to Vercel!</strong> Redeploy to activate.</p></div>' : ''}

          <div style="background:#F5F5F7;border-radius:12px;padding:16px;margin-top:24px">
            <p style="margin:0;font-size:13px;color:#6E6E73">
              <strong>Next steps:</strong><br>
              1. Copy the tokens above<br>
              2. Set CLIO_ACCESS_TOKEN and CLIO_REFRESH_TOKEN in Vercel env vars<br>
              3. Redeploy the dashboard<br>
              4. Visit <a href="/api/clio/sync?dry_run=true">/api/clio/sync?dry_run=true</a> to preview sync
            </p>
          </div>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Show full diagnostic info for debugging
    const clientIdPrefix = process.env.CLIO_CLIENT_ID ? process.env.CLIO_CLIENT_ID.substring(0, 8) + '...' : 'NOT SET';
    const secretSet = process.env.CLIO_CLIENT_SECRET ? 'SET (' + process.env.CLIO_CLIENT_SECRET.length + ' chars)' : 'NOT SET';
    const redirectUri = process.env.CLIO_REDIRECT_URI || 'NOT SET';

    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:700px;margin:0 auto">
        <h1 style="color:#FF3B30">Token Exchange Failed</h1>
        <div style="font-family:monospace;font-size:12px;background:#F5F5F7;padding:16px;border-radius:8px;margin:16px 0;word-break:break-all">${message}</div>

        <h3 style="margin-top:24px;color:#6E6E73">Diagnostics</h3>
        <table style="font-size:13px;border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#98989D">Client ID</td><td style="padding:4px 0">${clientIdPrefix}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#98989D">Client Secret</td><td style="padding:4px 0">${secretSet}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#98989D">Redirect URI</td><td style="padding:4px 0">${redirectUri}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#98989D">Code received</td><td style="padding:4px 0">${code.substring(0, 10)}... (${code.length} chars)</td></tr>
        </table>

        <div style="margin-top:24px">
          <a href="/api/clio/status" style="display:inline-block;padding:10px 24px;background:#007AFF;color:white;border-radius:8px;text-decoration:none;font-weight:600">Try Again</a>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
