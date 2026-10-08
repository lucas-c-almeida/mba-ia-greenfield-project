import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import appConfig from '../config/app.config';
import { MailTemplateService } from './mail-template.service';
import {
  MAIL_SUBJECTS,
  MAIL_TEMPLATES,
  MAIL_TRANSPORT,
} from './mail.constants';

@Injectable()
export class MailService {
  private readonly appUrl: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transporter: Transporter,
    private readonly templates: MailTemplateService,
    @Inject(appConfig.KEY) app: ConfigType<typeof appConfig>,
  ) {
    this.appUrl = app.url;
  }

  async sendConfirmationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const confirmationUrl = `${this.appUrl}/auth/confirm-email?token=${token}`;
    await this.transporter.sendMail({
      to: email,
      subject: MAIL_SUBJECTS.CONFIRMATION,
      html: this.templates.render(MAIL_TEMPLATES.CONFIRMATION, {
        name,
        confirmationUrl,
      }),
    });
  }

  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `${this.appUrl}/auth/reset-password?token=${token}`;
    await this.transporter.sendMail({
      to: email,
      subject: MAIL_SUBJECTS.PASSWORD_RESET,
      html: this.templates.render(MAIL_TEMPLATES.PASSWORD_RESET, {
        name,
        resetUrl,
      }),
    });
  }
}
