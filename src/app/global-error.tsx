'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', background: '#fff' }}>
        <h1 style={{ color: '#FF3B30', fontSize: '1.5rem' }}>Dashboard Error</h1>
        <p style={{ color: '#333', marginTop: '0.5rem' }}>
          <strong>Message:</strong> {error.message}
        </p>
        <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          <strong>Name:</strong> {error.name}
        </p>
        {error.digest && (
          <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
            <strong>Digest:</strong> {error.digest}
          </p>
        )}
        <pre style={{
          background: '#f5f5f5',
          padding: '1rem',
          borderRadius: '8px',
          marginTop: '1rem',
          fontSize: '0.75rem',
          overflow: 'auto',
          maxHeight: '300px',
          whiteSpace: 'pre-wrap',
        }}>
          {error.stack}
        </pre>
        <button
          onClick={() => reset()}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            background: '#B8860B',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
