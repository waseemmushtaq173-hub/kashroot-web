@AGENTS.md

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback). Use ~/.claude/skills/gstack/... for gstack file paths.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- QA/testing site behavior → invoke /qa
- Code review/diff check → invoke /review
- Ship/deploy/PR → invoke /ship

Do not suggest or auto-invoke other gstack skills: they run when the user types them, or when a running skill hands off to them (`gstack-config set proactive all` routes every skill).
