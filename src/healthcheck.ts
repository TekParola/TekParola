#!/usr/bin/env node

import http from 'http';
import { config } from './config/env';

const options = {
  hostname: 'localhost',
  port: config.port,
  path: '/health',
  method: 'GET',
  timeout: 2000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();