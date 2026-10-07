import { Module } from '@nestjs/common';
import { MailTemplateService } from './mail-template.service';
import { MailService } from './mail.service';
import { mailTransportProvider } from './mail.transport';

@Module({
  providers: [mailTransportProvider, MailTemplateService, MailService],
  exports: [MailService],
})
export class MailModule {}
