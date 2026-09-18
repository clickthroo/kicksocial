# Kickio Content Engine

Data-driven social content generation for Kickio (X, Instagram, TikTok).

## HARD RULE: Kickio database is READ-ONLY

The Kickio Supabase project (`rlveellvebfzgyobceru`) is **read-only** from this
project. This is not a convention — treat it as an invariant.

- **Never** issue INSERT / UPDATE / DELETE / TRUNCATE / ALTER / CREATE / DROP
  against the Kickio database, via MCP tools, migrations, or application code.
- **Never** run `apply_migration` or any DDL against `rlveellvebfzgyobceru`.
- Application code connects to Kickio using a **scoped read-only role** and the
  read-only client in `lib/kickio/` only. Do not construct a service-role
  client for Kickio anywhere.
- Content-engine state (recipes, drafts, publish log) lives in the content
  engine's **own** database — never in Kickio's tables.
- If a task appears to require writing to Kickio, **stop and ask** for explicit
  consent first. Do not infer it from context.

Reads used during development (SELECT, information_schema inspection,
`list_tables`, `list_projects`) are fine.

## Replying: always end with "In Simple Terms"

Every reply in chat ends with a short **In Simple Terms** section — one or two
paragraphs, plain English, no jargon, no table names, no code identifiers.

It is a translation of the reply, not a repeat of it: say what was done and
what it means in practice, the way you would explain it to someone who does
not work on this codebase. Keep the technical detail above it as normal —
this is added, never a replacement for it.
