import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import mailConfig from '../config/mail.config';
import { MAIL_TRANSPORT } from './mail.constants';

/**
 * Single SMTP transport shared by the whole application. The `from` address is
 * registered as a transport default, so every message inherits `MAIL_FROM`
 * without each caller having to repeat it.
 */
export const mailTransportProvider: Provider = {
  provide: MAIL_TRANSPORT,
  inject: [mailConfig.KEY],
  useFactory: (mail: ConfigType<typeof mailConfig>): Transporter =>
    createTransport({ host: mail.host, port: mail.port }, { from: mail.from }),
};
