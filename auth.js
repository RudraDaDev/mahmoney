// Client-side password gate. No real security — by design.
const KEY = "mahmoney_pw_hash";

async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hasPassword() {
  return !!localStorage.getItem(KEY);
}

export async function setupPassword(pw) {
  localStorage.setItem(KEY, await sha256(pw));
}

export async function checkPassword(pw) {
  return (await sha256(pw)) === localStorage.getItem(KEY);
}

export function resetPassword() {
  localStorage.removeItem(KEY);
}

export function logout() {
  sessionStorage.removeItem("mahmoney_authed");
}

export function isAuthed() {
  return sessionStorage.getItem("mahmoney_authed") === "1";
}

export function setAuthed() {
  sessionStorage.setItem("mahmoney_authed", "1");
}
