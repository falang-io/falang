import { Module } from '@nestjs/common';
import { CAPTCHA_FETCH, CaptchaService } from './captcha.service.js';

@Module({
  providers: [
    {
      provide: CAPTCHA_FETCH,
      useFactory:
        () =>
        (...args: Parameters<typeof fetch>) =>
          fetch(...args),
    },
    CaptchaService,
  ],
  exports: [CaptchaService],
})
export class CaptchaModule {}
