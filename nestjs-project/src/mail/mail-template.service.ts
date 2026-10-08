import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { compile, type TemplateDelegate } from 'handlebars';
import { join } from 'path';

const TEMPLATES_DIR = join(__dirname, 'templates');
const TEMPLATE_EXTENSION = '.hbs';

@Injectable()
export class MailTemplateService {
  private readonly compiled = new Map<string, TemplateDelegate>();

  render(template: string, context: Record<string, unknown>): string {
    return this.compileTemplate(template)(context);
  }

  /**
   * Templates are read from disk and compiled once, then reused — the same
   * caching the previous mailer adapter did.
   */
  private compileTemplate(template: string): TemplateDelegate {
    const cached = this.compiled.get(template);
    if (cached) {
      return cached;
    }

    const source = readFileSync(
      join(TEMPLATES_DIR, `${template}${TEMPLATE_EXTENSION}`),
      'utf-8',
    );
    // `strict` makes a missing context property fail loudly instead of
    // rendering an empty string into the e-mail.
    const delegate = compile(source, { strict: true });
    this.compiled.set(template, delegate);

    return delegate;
  }
}
