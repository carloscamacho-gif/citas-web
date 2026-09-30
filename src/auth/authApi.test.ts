import { beforeEach, describe, expect, it, vi } from 'vitest';

function token(claims: object): string {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${encoded}.signature`;
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('authApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('conserva el access en memoria y guarda el refresh recibido en el cuerpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      accessToken: token({ sub: 'user-1', roles: ['USER'] }),
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./authApi');

    const user = await auth.login('USER@Example.com ', 'Password123*', false);

    expect(user).toMatchObject({ id: 'user-1', email: 'user@example.com', roles: ['USER'] });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/v1/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    // remember=false -> refresh en sessionStorage; el access nunca se persiste.
    expect(sessionStorage.getItem('portal_citas_refresh')).toBe('refresh-1');
    expect(localStorage.getItem('portal_citas_refresh')).toBeNull();
    expect(sessionStorage.getItem('portal_citas_user')).not.toContain('Password123*');
    expect(auth.getAccessToken()).toContain('.');
  });

  it('registra todos los campos y luego abre una sesión real', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: 'user-2', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com', roles: ['USER'],
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        accessToken: token({ sub: 'user-2', roles: ['USER'] }), refreshToken: 'refresh-2', tokenType: 'Bearer',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./authApi');
    const registration = {
      firstName: 'Ana', lastName: 'Ruiz', documentType: 'CC', documentNumber: '123',
      email: 'ana@example.com', phone: '3001234567', password: 'Password123*', insurancePlanId: 9,
    };

    const user = await auth.register(registration);

    expect(user).toMatchObject({ id: 'user-2', name: 'Ana Ruiz', phone: '3001234567', roles: ['USER'] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual(registration);
    expect(fetchMock.mock.calls[1][0]).toContain('/login');
  });

  it('presenta el mismo mensaje ante cualquier 401 sin conservar sesión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Credenciales inválidas' }, 401)));
    const auth = await import('./authApi');

    await expect(auth.login('nadie@example.com', 'incorrecta')).rejects.toMatchObject({ status: 401 });
    await auth.login('nadie@example.com', 'incorrecta').catch((error) => {
      expect(auth.authErrorMessage(error)).toBe('El correo, la contraseña o la sesión no son válidos.');
    });
    expect(auth.getAccessToken()).toBeNull();
  });

  it('deduplica la restauración concurrente reutilizando un único refresh almacenado', async () => {
    sessionStorage.setItem('portal_citas_refresh', 'refresh-3');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      accessToken: token({ sub: 'user-3', roles: ['USER'] }), refreshToken: null, tokenType: 'Bearer',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./authApi');

    const [first, second] = await Promise.all([auth.restoreSession(), auth.restoreSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: 'user-3', roles: ['USER'] });
  });

  it('no llama al servidor cuando no hay refresh almacenado', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./authApi');

    const result = await auth.restoreSession();

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cierra la sesión en servidor con el refresh y limpia el estado local', async () => {
    localStorage.setItem('portal_citas_user', '{}');
    localStorage.setItem('portal_citas_refresh', 'refresh-4');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./authApi');

    await auth.logout();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/v1/auth/logout', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ refreshToken: 'refresh-4' });
    expect(localStorage.getItem('portal_citas_user')).toBeNull();
    expect(localStorage.getItem('portal_citas_refresh')).toBeNull();
  });
});
