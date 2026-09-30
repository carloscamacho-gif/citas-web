import type { User } from '../types';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const AUTH_PATH = '/api/v1/auth';
const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
};

const REFRESH_STORAGE_KEY = 'portal_citas_refresh';
const USER_STORAGE_KEY = 'portal_citas_user';

export interface Registration {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  password: string;
  insurancePlanId?: number;
}

// Contrato real de citas-api: el registro no devuelve la contraseña; roles es un arreglo.
interface RegistrationResponse {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  roles?: string[];
}

// Contrato real de citas-api: login devuelve accessToken + refreshToken en el cuerpo;
// /refresh devuelve refreshToken en null (no hay rotación en esta versión).
interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  tokenType: 'Bearer';
}

interface AccessClaims {
  sub: string;
  roles?: string[];
}

export class AuthApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AuthApiError';
  }
}

let accessToken: string | null = null;
let restorePromise: Promise<User | null> | null = null;

function decodeClaims(token: string): AccessClaims {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)) as AccessClaims;
  } catch {
    throw new AuthApiError(401, 'La sesión recibida no es válida.');
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${AUTH_PATH}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...REQUEST_HEADERS, ...init.headers },
    });
  } catch {
    throw new AuthApiError(0, 'No fue posible conectar con el servicio de citas.');
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string } | null;
    throw new AuthApiError(response.status, problem?.message ?? 'No fue posible completar la solicitud.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function acceptTokens(result: TokenResponse, remember: boolean): AccessClaims {
  accessToken = result.accessToken;
  // /login entrega el refresh token; /refresh lo devuelve en null y no debe pisar el almacenado.
  if (result.refreshToken) saveRefreshToken(result.refreshToken, remember);
  return decodeClaims(result.accessToken);
}

function saveRefreshToken(token: string, remember: boolean): void {
  const primary = remember ? localStorage : sessionStorage;
  const secondary = remember ? sessionStorage : localStorage;
  primary.setItem(REFRESH_STORAGE_KEY, token);
  secondary.removeItem(REFRESH_STORAGE_KEY);
}

function storedRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_STORAGE_KEY) ?? localStorage.getItem(REFRESH_STORAGE_KEY);
}

function clearRefreshToken(): void {
  sessionStorage.removeItem(REFRESH_STORAGE_KEY);
  localStorage.removeItem(REFRESH_STORAGE_KEY);
}

function rememberedSession(): boolean {
  return localStorage.getItem(REFRESH_STORAGE_KEY) !== null || localStorage.getItem(USER_STORAGE_KEY) !== null;
}

function displayName(email: string): string {
  const value = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return value ? value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : 'Usuario';
}

function cachedUser(): User | null {
  const raw = sessionStorage.getItem(USER_STORAGE_KEY) ?? localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    sessionStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function saveUser(user: User, remember: boolean): void {
  const primary = remember ? localStorage : sessionStorage;
  const secondary = remember ? sessionStorage : localStorage;
  primary.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  secondary.removeItem(USER_STORAGE_KEY);
}

function clearUser(): void {
  sessionStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export async function login(email: string, password: string, remember = true): Promise<User> {
  const result = await request<TokenResponse>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const claims = acceptTokens(result, remember);
  const previous = cachedUser();
  const user: User = {
    id: claims.sub,
    name: previous?.email.toLowerCase() === email.trim().toLowerCase() ? previous.name : displayName(email),
    email: email.trim().toLowerCase(),
    phone: previous?.phone,
    roles: claims.roles ?? [],
  };
  saveUser(user, remember);
  return user;
}

export async function register(registration: Registration): Promise<User> {
  const account = await request<RegistrationResponse>('/register', {
    method: 'POST',
    body: JSON.stringify(registration),
  });
  const user: User = {
    id: String(account.id),
    name: `${account.firstName} ${account.lastName}`.trim(),
    email: account.email,
    phone: registration.phone,
    roles: account.roles ?? [],
  };
  saveUser(user, true);
  return login(registration.email, registration.password, true);
}

export function restoreSession(): Promise<User | null> {
  if (restorePromise) return restorePromise;
  const refreshToken = storedRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  const remember = rememberedSession();
  restorePromise = request<TokenResponse>('/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  })
    .then((result) => {
      const claims = acceptTokens(result, remember);
      const previous = cachedUser();
      if (!previous) return { id: claims.sub, name: 'Usuario', email: '', roles: claims.roles ?? [] };
      const user = { ...previous, id: claims.sub, roles: claims.roles ?? previous.roles };
      saveUser(user, remember);
      return user;
    })
    .catch((error: unknown) => {
      accessToken = null;
      if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
        clearRefreshToken();
        clearUser();
      }
      return null;
    })
    .finally(() => { restorePromise = null; });
  return restorePromise;
}

export async function logout(): Promise<void> {
  const refreshToken = storedRefreshToken();
  try {
    if (refreshToken) {
      await request<void>('/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    }
  } finally {
    accessToken = null;
    clearRefreshToken();
    clearUser();
  }
}

export interface PasswordResetTicket {
  message: string;
  devToken: string | null;
}

/** HU-003: solicita la recuperación. La respuesta es igual exista o no la cuenta; `devToken` solo llega en laboratorio. */
export async function requestPasswordReset(email: string): Promise<PasswordResetTicket> {
  return request<PasswordResetTicket>('/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** HU-003: cambia la contraseña con el token recibido. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await request<void>('/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof AuthApiError)) return 'Ocurrió un error inesperado.';
  if (error.status === 400) return 'Revisa los datos ingresados e inténtalo nuevamente.';
  if (error.status === 401) return 'El correo, la contraseña o la sesión no son válidos.';
  if (error.status === 409) return 'El correo o el documento ya se encuentran registrados.';
  if (error.status === 403) return 'La solicitud fue rechazada por la configuración de seguridad.';
  return error.message;
}
