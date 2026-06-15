import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AgentKind, Skill } from '../contract.js';
import type { AnchorPaths } from '../paths.js';
import { readJson } from './atomic-file.js';

/** Built-in skills seeded on first run so the app is useful out of the box. */
const SEED: readonly Skill[] = [
  { id: 'plain', label: 'Plain', target: 'any', template: '{{body}}' },
  {
    id: 'code-review',
    label: 'Code review',
    target: 'claude',
    template: '/code-review\n\n{{body}}',
  },
  {
    id: 'commit',
    label: 'Commit',
    target: 'claude',
    template: 'Commit the current changes.\n\n{{body}}',
  },
];

export class SkillStore {
  constructor(private readonly paths: AnchorPaths) {}

  async ensureSeeded(): Promise<void> {
    await fs.mkdir(this.paths.skills, { recursive: true });
    const existing = await this.listFiles();
    if (existing.length > 0) return;
    await Promise.all(
      SEED.map((skill) =>
        fs.writeFile(
          join(this.paths.skills, `${skill.id}.json`),
          `${JSON.stringify(skill, null, 2)}\n`,
          'utf8',
        ),
      ),
    );
  }

  async list(): Promise<Skill[]> {
    const files = await this.listFiles();
    const skills = await Promise.all(
      files.map((file) => readJson<Skill>(join(this.paths.skills, file))),
    );
    return skills.filter(isValidSkill);
  }

  private async listFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.paths.skills);
      return entries.filter((name) => name.endsWith('.json'));
    } catch {
      return [];
    }
  }
}

const AGENT_KINDS: readonly AgentKind[] = ['claude', 'codex'];

function isValidSkill(value: Skill | null): value is Skill {
  if (value === null) return false;
  const targetOk = value.target === 'any' || AGENT_KINDS.includes(value.target);
  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.template === 'string' &&
    value.template.includes('{{body}}') &&
    targetOk
  );
}
