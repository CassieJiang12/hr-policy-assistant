import { Controller, Get } from '@nestjs/common';
import {
  getAskMode,
  hasRealApiConfig,
  readOpenAiSettings,
} from '../config/app-config.js';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    const mode = getAskMode();
    const configured = hasRealApiConfig();
    return {
      status: 'ok',
      mode,
      real_configured: configured,
      model: configured ? readOpenAiSettings().model : null,
    };
  }
}
