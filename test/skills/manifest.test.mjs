import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', '..', 'src', 'skills');
const EXPECTED_COUNT = 33;

const SUPERPOWERS_SKILLS = [
  'brainstorming',
  'dispatching-parallel-agents',
  'executing-plans',
  'finishing-a-development-branch',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
];

/** Parse YAML frontmatter from a SKILL.md string. Returns { name, description } or null. */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = match[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m);
  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : null,
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : null,
  };
}

describe('skills manifest', () => {
  it('src/skills/ directory exists', () => {
    assert.ok(fs.existsSync(SKILLS_DIR), `Expected ${SKILLS_DIR} to exist`);
  });

  it(`contains exactly ${EXPECTED_COUNT} skill subdirectories`, () => {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    assert.equal(
      entries.length,
      EXPECTED_COUNT,
      `Expected ${EXPECTED_COUNT} skill dirs, got ${entries.length}: ${entries.sort().join(', ')}`,
    );
  });

  describe('every skill directory', () => {
    let skillDirs;
    try {
      skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      skillDirs = [];
    }

    for (const skill of skillDirs) {
      const skillPath = path.join(SKILLS_DIR, skill);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      it(`${skill} — has SKILL.md`, () => {
        assert.ok(fs.existsSync(skillMdPath), `Missing SKILL.md in ${skill}`);
      });

      it(`${skill} — SKILL.md has name: frontmatter`, () => {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const fm = parseFrontmatter(content);
        assert.ok(fm, `${skill}/SKILL.md missing YAML frontmatter`);
        assert.ok(fm.name, `${skill}/SKILL.md missing name: field`);
      });

      it(`${skill} — SKILL.md has description: frontmatter ≤200 chars`, () => {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const fm = parseFrontmatter(content);
        assert.ok(fm, `${skill}/SKILL.md missing YAML frontmatter`);
        assert.ok(fm.description, `${skill}/SKILL.md missing description: field`);
        assert.ok(
          fm.description.length <= 200,
          `${skill}/SKILL.md description too long (${fm.description.length} chars): "${fm.description}"`,
        );
      });

      it(`${skill} — SKILL.md has ## When to use section`, () => {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        assert.match(
          content,
          /^##\s+when to use/im,
          `${skill}/SKILL.md missing ## When to use section`,
        );
      });
    }
  });

  describe('superpowers skills present', () => {
    for (const skill of SUPERPOWERS_SKILLS) {
      it(`${skill} skill exists`, () => {
        const skillPath = path.join(SKILLS_DIR, skill);
        assert.ok(fs.existsSync(skillPath), `Expected superpowers skill ${skill} to exist`);
        assert.ok(fs.statSync(skillPath).isDirectory(), `${skill} should be a directory`);
      });
    }
  });
});
