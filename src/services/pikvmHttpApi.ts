export async function checkAuth() {
  const response = await fetch("/api/auth/check", { credentials: "include" });
  if (response.ok) {
    return true;
  }
  if (response.status === 401 || response.status === 403) {
    return false;
  }
  throw new Error(`${response.status} ${response.statusText}`);
}

export async function login(user: string, passwd: string) {
  const body = new URLSearchParams({ user, passwd, expire: "0" });
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

export async function logout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

export async function printText(text: string) {
  const response = await fetch("/api/hid/print?limit=0", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "text/plain" },
    body: text,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}
