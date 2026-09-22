// Applies the auth settings of this app to the linked Supabase project via the Management API:
// invite-only, password length, site URL / redirect URLs, invite + recovery email templates.
// Usage: node scripts/configure-auth.mjs https://your-app.vercel.app [--templates]
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN in .env.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^["']|["']$/g, "")]),
);

const siteUrl = process.argv[2]?.replace(/\/$/, "");
if (!siteUrl?.startsWith("http")) {
  console.error("Usage: node scripts/configure-auth.mjs <production url>");
  process.exit(1);
}

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const template = (name) => readFileSync(new URL(`../supabase/templates/${name}.html`, import.meta.url), "utf8");

const config = {
  site_url: siteUrl,
  uri_allow_list: [...new Set([`${siteUrl}/**`, "http://localhost:3000/**"])].join(","),
  disable_signup: true,
  password_min_length: 10,
};

// Custom email templates require custom SMTP on the free plan (see README).
if (process.argv.includes("--templates")) {
  Object.assign(config, {
    mailer_subjects_invite: "Einladung / Invitation / Invito – LUPI Planer",
    mailer_templates_invite_content: template("invite"),
    mailer_subjects_recovery: "Passwort zurücksetzen / Réinitialiser le mot de passe / Reimposta la password",
    mailer_templates_recovery_content: template("recovery"),
  });
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "lupi-cli/1.0",
  },
  body: JSON.stringify(config),
});

if (!res.ok) {
  console.error(`Failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const applied = await res.json();
console.log({
  site_url: applied.site_url,
  uri_allow_list: applied.uri_allow_list,
  disable_signup: applied.disable_signup,
  password_min_length: applied.password_min_length,
  invite_subject: applied.mailer_subjects_invite,
});
